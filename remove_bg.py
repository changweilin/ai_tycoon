#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""去背處理(背景透明化)— 保證不破壞圖片本身。

原則:**只產生 alpha 遮罩,套回原圖的 RGB**,RGB 逐位元完全保留(可比對);
原圖一次性備份到 image_backup/,隨時可還原。前後自動比對並做安全檢查。

方法依資料夾自動選擇:
  - avatars / characters:rembg(u2net 顯著物件切割,能處理綠色程式碼雨等「有設計的背景」)
  - logos:邊緣連通泛洪(flat 黑底,乾淨且完整保留 logo 內所有文字/細節)
"""
import os, glob, shutil, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

PUB = 'public/images'
BACKUP = 'image_backup/images'
METHOD = {'avatars': 'rembg', 'characters': 'rembg', 'logos': 'flood'}
CROP = {'characters': 'bbox'}   # 立繪去背後裁掉透明邊,讓人物填滿畫面(只去透明邊,不動主體)
T_LO, T_HI, FEATHER = 22, 50, 1.2
CENTER_RX, CENTER_RY = 0.24, 0.34

_sess = None
def _rembg_alpha(rgb):
    global _sess
    from rembg import remove, new_session
    if _sess is None:
        _sess = new_session('u2net')
    out = remove(rgb, session=_sess, post_process_mask=True)
    return np.asarray(out)[:, :, 3]            # 只取 alpha

def _flood_alpha(rgb):
    a = np.asarray(rgb).astype(np.int16)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(2))
    seed = np.zeros((h, w), bool)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    seed &= dist < T_LO
    bgmask = ndi.binary_propagation(seed, mask=dist < T_HI)
    fg = ndi.binary_fill_holes(~bgmask)
    yy, xx = np.ogrid[:h, :w]
    fg |= ((xx - w / 2) / (CENTER_RX * w)) ** 2 + ((yy - h / 2) / (CENTER_RY * h)) ** 2 <= 1
    return np.where(fg, 255, 0).astype(np.uint8)


def main():
    only = sys.argv[1:] or list(METHOD)
    print('== 去背處理(只產生 alpha,套回原圖 RGB;原圖備份於 image_backup/)==')
    total = 0
    for d in only:
        method = METHOD.get(d, 'flood')
        files = sorted(glob.glob(os.path.join(PUB, d, '*.png')))
        if not files:
            continue
        print(f'\n### {d}  [{method}]')
        for f in files:
            rel = os.path.relpath(f, PUB)
            bpath = os.path.join(BACKUP, rel)
            os.makedirs(os.path.dirname(bpath), exist_ok=True)
            if not os.path.exists(bpath):
                shutil.copy2(f, bpath)                       # 首次備份原圖
            src = Image.open(bpath).convert('RGB')           # 一律從原圖處理(可重跑)
            alpha = _rembg_alpha(src) if method == 'rembg' else _flood_alpha(src)
            alpha_img = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(FEATHER))
            out = src.convert('RGBA')
            out.putalpha(alpha_img)                          # RGB 來自原圖,只加 alpha

            # ---- 前後比對(保證不破壞:裁切前整張 RGB 必須完全相同)----
            rgb_same = np.array_equal(np.asarray(src), np.asarray(out)[:, :, :3])

            # 立繪:裁掉透明邊(只去除背景透明區,主體像素一個不動)
            if CROP.get(d) == 'bbox':
                ys, xs = np.where(np.asarray(alpha_img) > 30)
                if len(xs):
                    pad = round(0.03 * max(out.size))
                    x0 = max(0, xs.min() - pad); y0 = max(0, ys.min() - pad)
                    x1 = min(out.width, xs.max() + 1 + pad); y1 = min(out.height, ys.max() + 1 + pad)
                    out = out.crop((x0, y0, x1, y1))
            al = np.asarray(alpha_img)
            transp = (al < 10).mean() * 100
            feather = ((al >= 10) & (al < 245)).mean() * 100
            h, w = al.shape
            core = al[h // 3:2 * h // 3, w // 3:2 * w // 3]
            core_op = (core > 200).mean() * 100
            if not (rgb_same and transp < 95 and core_op > 30):
                print(f'  [跳過] {os.path.basename(f):24s} 安全檢查未過 '
                      f'(rgb_same={rgb_same} 透明={transp:.0f}% 核心={core_op:.0f}%)')
                continue
            out.save(f)
            total += 1
            print(f'  {os.path.basename(f):24s} 透明={transp:4.0f}% 羽化={feather:4.1f}% '
                  f'核心不透明={core_op:3.0f}% RGB完全不變={rgb_same}')
    print(f'\n完成,共處理 {total} 張(RGB 全部保持完全不變)。')


if __name__ == '__main__':
    main()
