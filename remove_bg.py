#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""影像去背 / 圓形頭像處理。原圖一次性備份到 image_backup/,可重跑、可還原。

  - avatars:rembg 去背取出角色 → 統一做成「圓形頭像」(圓盤在後、頭像在前,
    圓圈以外裁乾淨,並烙印一圈細的陣營色作為圓圈邊;之後 UI 直接用、不必再加框)。
  - characters(立繪):依需求保留原圖,不去背。
  - logos:邊緣連通泛洪去平底黑,只改 alpha、RGB 逐位元保留,完整保留 logo 文字細節。
"""
import os, glob, shutil, sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageChops
from scipy import ndimage as ndi

PUB = 'public/images'
BACKUP = 'image_backup/images'
METHOD = {'avatars': 'rembg', 'logos': 'flood'}   # characters 不處理(保留原圖)
T_LO, T_HI, FEATHER = 22, 50, 1.2

FAC_COLOR = {'US': (46, 159, 255), 'CN': (255, 59, 59), 'TW': (46, 255, 143),
             'JP': (240, 230, 255), 'KR': (255, 208, 46)}
CHAR_FAC = {'musk': 'US', 'jensen': 'US', 'zuck': 'US', 'jobs': 'US', 'google': 'US',
            'jack': 'CN', 'ren': 'CN', 'pony': 'CN', 'liang': 'CN', 'robin': 'CN',
            'tsmc': 'TW', 'toyota': 'JP', 'lee': 'KR'}

_sess = None
def _rembg_alpha(rgb):
    global _sess
    from rembg import remove, new_session
    if _sess is None:
        _sess = new_session('u2net')
    return np.asarray(remove(rgb, session=_sess, post_process_mask=True))[:, :, 3]

def _flood_alpha(rgb):
    a = np.asarray(rgb).astype(np.int16)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(2))
    seed = np.zeros((h, w), bool)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    seed &= dist < T_LO
    fg = ndi.binary_fill_holes(~ndi.binary_propagation(seed, mask=dist < T_HI))
    yy, xx = np.ogrid[:h, :w]
    fg |= ((xx - w / 2) / (0.24 * w)) ** 2 + ((yy - h / 2) / (0.34 * h)) ** 2 <= 1
    return np.where(fg, 255, 0).astype(np.uint8)


def to_circle(rgba, fac, out_size=640):
    """圓盤在後、去背頭像在前,硬裁成圓形,邊緣烙一圈細的陣營色。2x 超取樣 → 邊緣抗鋸齒。"""
    SS = 2
    D = out_size * SS
    a = np.asarray(rgba); al = a[:, :, 3]
    ys, xs = np.where(al > 20)
    subj = rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)) if len(xs) else rgba
    # 圓盤底:徑向漸層(中心亮、邊緣暗)
    yy, xx = np.ogrid[:D, :D]
    t = np.clip(np.sqrt((xx - D / 2) ** 2 + (yy - D / 2) ** 2) / (D / 2), 0, 1)[..., None]
    disc_rgb = (np.array([36, 54, 84]) * (1 - t) + np.array([10, 16, 32]) * t).astype(np.uint8)
    disc = Image.fromarray(np.dstack([disc_rgb, np.full((D, D), 255, np.uint8)]), 'RGBA')
    # 頭像縮放置中(填滿約 96% 直徑)
    sw, sh = subj.size
    sc = 0.96 * D / max(sw, sh)
    nw, nh = max(1, round(sw * sc)), max(1, round(sh * sc))
    subj = subj.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (D, D), (0, 0, 0, 0))
    canvas.alpha_composite(disc)
    canvas.alpha_composite(subj, ((D - nw) // 2, (D - nh) // 2))
    # 圓形硬遮罩(裁掉圓圈以外)
    mask = Image.new('L', (D, D), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, D - 1, D - 1), fill=255)
    canvas.putalpha(ImageChops.multiply(canvas.getchannel('A'), mask))
    # 陣營色細圓邊(圓圈本身的邊,非額外外框)
    if fac in FAC_COLOR:
        lw = max(2, round(D * 0.02))
        ImageDraw.Draw(canvas).ellipse((lw // 2, lw // 2, D - 1 - lw // 2, D - 1 - lw // 2),
                                       outline=FAC_COLOR[fac] + (255,), width=lw)
    return canvas.resize((out_size, out_size), Image.LANCZOS)


def main():
    only = sys.argv[1:] or list(METHOD)
    print('== 影像處理(原圖備份於 image_backup/,可重跑)==')
    total = 0
    for d in only:
        method = METHOD.get(d, 'flood')
        files = sorted(glob.glob(os.path.join(PUB, d, '*.png')))
        if not files:
            continue
        print(f'\n### {d}  [{method}{" + circle" if d == "avatars" else ""}]')
        for f in files:
            rel = os.path.relpath(f, PUB)
            bpath = os.path.join(BACKUP, rel)
            os.makedirs(os.path.dirname(bpath), exist_ok=True)
            if not os.path.exists(bpath):
                shutil.copy2(f, bpath)
            src = Image.open(bpath).convert('RGB')
            alpha = _rembg_alpha(src) if method == 'rembg' else _flood_alpha(src)
            alpha_img = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(FEATHER))
            out = src.convert('RGBA'); out.putalpha(alpha_img)

            if d == 'avatars':       # 去背後做成圓形頭像
                cid = os.path.basename(f)[:-len('_chibi.png')]
                out = to_circle(out, CHAR_FAC.get(cid))
                out.save(f); total += 1
                print(f'  {os.path.basename(f):24s} 圓形頭像 {out.size} 陣營={CHAR_FAC.get(cid, "-")}')
                continue

            # logos:只改 alpha,RGB 必須逐位元相同
            rgb_same = np.array_equal(np.asarray(src), np.asarray(out)[:, :, :3])
            al = np.asarray(alpha_img); transp = (al < 10).mean() * 100
            if not (rgb_same and transp < 95):
                print(f'  [跳過] {os.path.basename(f):24s} 安全檢查未過 (rgb_same={rgb_same} 透明={transp:.0f}%)')
                continue
            out.save(f); total += 1
            print(f'  {os.path.basename(f):24s} 透明={transp:4.0f}% RGB完全不變={rgb_same}')
    print(f'\n完成,共處理 {total} 張。')


if __name__ == '__main__':
    main()
