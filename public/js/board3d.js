// ============ 賽博龐克 3D 棋盤 (Three.js) ============
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { REGIONS, EDGES, EDGE_TYPES, FACTIONS, TECH_CATEGORIES, RULES, charLogo } from './data.js';

const NEON_CYAN = 0x00f0ff;
const NEON_PINK = 0xff2bd6;
const NEON_PURPLE = 0x7b2bff;
const NEON_AMBER = 0xffb000;

// 把可能偏暗/低飽和的顏色(如中立城的灰)提亮成在深色場景上清楚可讀的版本,保留色相
function legibleColor(css) {
  const c = new THREE.Color(css);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const s = hsl.s < 0.18 ? hsl.s : Math.max(hsl.s, 0.55); // 近灰的維持灰,其餘提飽和
  c.setHSL(hsl.h, s, Math.max(hsl.l, 0.66));              // 一律提到足夠亮度
  return '#' + c.getHexString();
}

// 看板字牌:深色圓角底板 + 白主標(深描邊+同色外光)+ 提亮的副標。
// 畫布寬度依文字量自動量測 → 不再截斷;sprite 依畫布長寬比設定縮放 → 文字不變形。
// opts.h = 世界座標下的字牌高度(預設 1.7)。
function makeLabelSprite(text, sub, color = '#00f0ff', opts = {}) {
  const h = opts.h ?? 1.7;
  const mainPx = 84, subPx = 40, pad = 44;
  const m = document.createElement('canvas').getContext('2d');
  m.font = `bold ${mainPx}px "Microsoft JhengHei", sans-serif`;
  const mainW = m.measureText(text).width;
  let subW = 0;
  if (sub) { m.font = `${subPx}px "Microsoft JhengHei", sans-serif`; subW = m.measureText(sub).width; }
  const contentW = Math.max(mainW, subW, 120);
  const W = Math.ceil((contentW + pad * 2) / 2) * 2, H = 200;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const cx = W / 2;
  const glow = legibleColor(color);
  // 深色半透明底板:任何背景(亮陸地/建築)上都讀得清楚
  const plateW = contentW + pad * 1.5, plateH = sub ? 172 : 110;
  ctx.fillStyle = 'rgba(6,10,22,0.6)';
  _roundRect(ctx, cx - plateW / 2, (H - plateH) / 2, plateW, plateH, 26);
  ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = glow; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // 主標:深色描邊保證亮背景仍清楚 + 白字 + 同色外光
  ctx.font = `bold ${mainPx}px "Microsoft JhengHei", sans-serif`;
  const mainY = sub ? 82 : 100;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(2,5,14,0.94)'; ctx.strokeText(text, cx, mainY);
  ctx.shadowColor = glow; ctx.shadowBlur = 14; ctx.fillStyle = '#f4ffff'; ctx.fillText(text, cx, mainY);
  ctx.shadowBlur = 0;
  if (sub) {
    ctx.font = `bold ${subPx}px "Microsoft JhengHei", sans-serif`;
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(2,5,14,0.94)'; ctx.strokeText(sub, cx, 150);
    ctx.fillStyle = glow; ctx.fillText(sub, cx, 150);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // depthTest:false → 不被陸地/建築擋住;fog:false → 北方遠處的城市/標題不被霧氣沖淡
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(h * W / H, h, 1);
  sprite.renderOrder = 8;
  return sprite;
}

// 表情符號 billboard(特效用,語意一眼可讀)
function makeEmojiSprite(ch) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '92px "Segoe UI Emoji", "Microsoft JhengHei", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
}

// 卡牌背面貼圖(牌庫只露背面):暗底 + 霓虹外框 + 斜向電路紋 + 中央菱形徽記。
// accent = 強調色(各牌庫不同),centerGlyph = 中央大字('?' 公牌 / '4' / '5')。
function makeCardBackTexture(accent = '#00f0ff', centerGlyph = '?') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 358;
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 256, 358);
  grd.addColorStop(0, '#0c1430'); grd.addColorStop(1, '#1a0c30');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 358);
  ctx.strokeStyle = accent; ctx.lineWidth = 10; ctx.strokeRect(12, 12, 232, 334);
  ctx.strokeStyle = 'rgba(255,43,214,0.35)'; ctx.lineWidth = 3;
  for (let i = -6; i < 12; i++) { ctx.beginPath(); ctx.moveTo(i * 40, 0); ctx.lineTo(i * 40 + 358, 358); ctx.stroke(); }
  ctx.save(); ctx.translate(128, 179); ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = accent; ctx.lineWidth = 8; ctx.strokeRect(-58, -58, 116, 116);
  ctx.fillStyle = 'rgba(123,43,255,0.5)'; ctx.fillRect(-34, -34, 68, 68);
  ctx.restore();
  ctx.fillStyle = '#eaffff'; ctx.textAlign = 'center';
  ctx.font = 'bold 96px "Microsoft JhengHei", sans-serif'; ctx.fillText(centerGlyph, 128, 212);
  ctx.font = 'bold 26px "Microsoft JhengHei", sans-serif'; ctx.fillStyle = accent; ctx.fillText('CTW 2049', 128, 318);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 決定性偽隨機(市中心建築佈局用,每次載入長一樣)
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 環太平洋陸塊海岸線([x, z] 多邊形,風格化) ----------
// 風格化但更貼近現實的環太平洋輪廓([x,z] 世界座標;x 正=美洲側、z 負=北/寒、z 正=南/熱)。
// 海岸線須包住 REGIONS 內對應的城市群(城市座標改動時一併重繪邊界);環太平洋以外(歐洲/印度/中東)刻意收斂不外推。
const LANDMASSES = [
  // 北美:真實輪廓 — 西岸太平洋直海岸(vancouver→seattle→sv→la)、南方經墨西哥收窄、
  // 墨西哥灣凹口 + 佛羅里達半島、東岸抵紐約、加拿大寬頂。沿岸城靠海、phoenix/austin/mexico/toronto 內陸。
  { name: 'northAmerica', coast: '#2bd6ff', biome: 'temperate', pts: [
    [7.8, -11.5], [8.0, -9.8], [9.0, -7.5], [9.8, -3.0], [11.0, 1.0],
    [12.6, 4.8], [13.8, 8.0], [14.8, 10.6], [15.6, 11.6], [17.0, 10.4],
    [17.9, 7.6], [19.1, 6.0], [20.3, 7.4], [20.5, 4.8], [19.9, 1.5],
    [19.4, -1.5], [18.8, -4.2], [19.3, -6.8], [18.0, -8.8], [15.5, -9.8],
    [12.0, -10.8], [9.5, -11.4],
  ] },
  // 歐洲:越大西洋的東北角小陸塊;london 緊貼西側海岸、amsterdam 緊貼北海東岸,與北美間留窄海峽
  { name: 'europe', coast: '#9c8cff', biome: 'temperate', pts: [
    [19.6, -7.6], [21.0, -6.6], [23.0, -7.4], [24.2, -9.2], [23.8, -10.6],
    [22.0, -11.0], [20.0, -10.2], [19.4, -8.6],
  ] },
  // 歐亞大陸:上海/深圳緊貼東海岸、hanoi/bangkok 緊貼南岸、dubai 緊貼波灣西岸;
  // 內陸城(beijing/wuhan/chengdu/bangalore)居中。東緣留海與朝鮮/台灣/日本/新加坡諸島分離。
  { name: 'eurasia', coast: '#ff7b9c', biome: 'temperate', pts: [
    [-19.5, -12.0], [-15.0, -10.2], [-11.8, -9.6], [-8.6, -8.2], [-7.8, -5.0],
    [-8.3, -2.5], [-9.4, -0.2], [-9.8, 1.5], [-10.6, 3.4], [-11.2, 5.2],
    [-12.6, 6.9], [-14.0, 7.6], [-15.6, 8.6], [-16.5, 9.6], [-18.2, 7.8],
    [-18.2, 5.4], [-19.4, 3.0], [-20.0, -1.0], [-20.0, -7.0],
  ] },
  // 朝鮮半島(含 seoul)
  { name: 'korea', coast: '#ffd02e', biome: 'cold', pts: [
    [-6.95, -9.8], [-6.3, -9.0], [-6.0, -8.0], [-5.9, -7.0], [-6.2, -6.3],
    [-6.8, -6.8], [-7.05, -8.0], [-7.0, -9.0],
  ] },
  // 日本列島弧(含 tokyo)
  { name: 'japan', coast: '#cdd6ff', biome: 'temperate', pts: [
    [-1.8, -8.6], [-2.4, -7.4], [-3.0, -6.2], [-3.5, -5.0], [-4.4, -4.0],
    [-5.0, -4.5], [-4.5, -5.7], [-3.9, -6.9], [-3.1, -8.1], [-2.4, -8.9],
  ] },
  // 台灣(含 hsinchu)
  { name: 'taiwan', coast: '#2eff8f', biome: 'tropical', pts: [
    [-5.6, -2.0], [-5.3, -1.0], [-5.5, 0.0], [-6.0, 0.7], [-6.6, 0.2],
    [-6.7, -0.9], [-6.3, -1.9],
  ] },
  // 澳洲:sydney 緊貼東岸(太平洋),內陸往西延伸(沙漠/Outback 在雪梨西邊)
  { name: 'australia', coast: '#ffb000', biome: 'desert', pts: [
    [-2.0, 9.6], [-1.9, 11.0], [-2.5, 12.8], [-4.0, 13.4], [-5.8, 12.8],
    [-6.6, 11.0], [-5.8, 9.4], [-4.0, 8.8], [-2.8, 9.0],
  ] },
];

// 裝飾用小島(夏威夷/菲律賓/印尼/新加坡/紐西蘭)
const DECOR_ISLANDS = [
  { x: 4.0, z: -1.0, r: 0.45 }, { x: 4.7, z: -0.4, r: 0.3 },        // 夏威夷
  { x: -6.4, z: 3.2, r: 0.5 }, { x: -5.9, z: 4.2, r: 0.35 },        // 菲律賓
  [-9.5, 9.6, 0.5], [-8.0, 10.0, 0.45], [-6.6, 10.2, 0.4],          // 印尼鏈
  { x: -11.0, z: 8.5, r: 0.55 },                                     // 新加坡島
  { x: 1.5, z: 13.0, r: 0.5 }, { x: 2.1, z: 14.0, r: 0.4 },          // 紐西蘭
].map(i => Array.isArray(i) ? { x: i[0], z: i[1], r: i[2] } : i);

// ---------- 航線交通工具類型(EDGE_TYPES 由 data.js 共用:train/ship 相鄰、plane 跨洋) ----------
const TRAFFIC_STYLE = {
  plane: { color: NEON_PURPLE, opacity: 0.5, speed: 1.7 },
  ship:  { color: NEON_CYAN,   opacity: 0.32, speed: 0.65 },
  train: { color: NEON_AMBER,  opacity: 0.42, speed: 1.0 },
};

// Quaternius 純扁平 matte 材質:消金屬、全粗糙、flat shading。保留 color 語意,
// 僅留極少量同色自發光讓夜景下仍可辨識(非霓虹發光)。沿用此函式的程式生成
// fallback(地標/棋子)因此自動跟著外部 GLTF 一起呈現消光低面數風。
function emissiveMat(color, intensity = 0.7, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: Math.min(intensity * 0.12, 0.14),
    metalness: 0.0, roughness: 1.0, flatShading: true, ...extra,
  });
}

function neonEdges(geo, color, opacity = 0.85) {
  return new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

// ============ 程式生成優先 + 可選 GLTF 混合管線 ============
// 城市地標走「混合」:正中央用程式生成的專屬地標(LANDMARK_BUILDERS,每城不同、對應現實、
// 隨城市等級成長),外圈用 Quaternius 低面數建築當天際線(SKYLINE_BUILDINGS,見 _buildCity)。
// 因此 MODEL_MANIFEST 不再放 city:*(地標保持程式生成可控、可成長);只保留 pawn:* 角色棋子。
// 角色棋子用惡搞對位的 Quaternius 人物/動物/載具(全 CC0 1.0,免署名;見 quaternius/README.md):
//   astronaut=馬斯克(太空)、alien=祖克(蜥蜴/Meta)、anglerfish=梁文鋒(深海=DeepSeek)、
//   panda=李彥宏(百度熊掌)、sportscar=豐田(車廠)、robot/mech=三星/華為/台積、cube=Google。
// 載入失敗會自動退回程式生成的 fallback(PAWN_BUILDERS),不會開天窗。
// 要覆蓋地標可在 index.html 載 ui.js 前定義 window.MODEL_MANIFEST_EXTRA = {'city:sv':'...glb'}(會併入)。
const QM = 'assets/models/quaternius/';
// 天際線用的 Quaternius 建築檔(繞地標外圈、隨城市等級增加棟數);loadGltf 快取+clone 共用。
const SKYLINE_BUILDINGS = ['bldg-big', 'bldg-business', 'bldg-generic', 'bldg-l', 'bldg-small',
  'structure', 'cyber-platform', 'dome', 'silo', 'spaceship'].map(n => QM + n + '.glb');
const MODEL_MANIFEST = Object.assign({
  // ---- 角色棋子(pawn:<charId>)----
  'pawn:musk': QM + 'pawn-astronaut.glb',
  'pawn:jensen': QM + 'pawn-exec.glb',
  'pawn:zuck': QM + 'pawn-alien.glb',
  'pawn:jobs': QM + 'pawn-hoodie.glb',
  'pawn:google': QM + 'pawn-cubeguy.glb',
  'pawn:jack': QM + 'pawn-casual.glb',
  'pawn:ren': QM + 'pawn-mech.glb',
  'pawn:pony': QM + 'pawn-cubewoman.glb',
  'pawn:liang': QM + 'pawn-anglerfish.glb',
  'pawn:robin': QM + 'pawn-panda.glb',
  'pawn:tsmc': QM + 'pawn-mech2.glb',
  'pawn:toyota': QM + 'pawn-sportscar.glb',
  'pawn:lee': QM + 'pawn-robot.glb',
}, (typeof window !== 'undefined' && window.MODEL_MANIFEST_EXTRA) || {});

const _gltfLoader = new GLTFLoader();
const _gltfCache = new Map(); // url → Promise<Scene>(原件,使用時 clone)

function loadGltf(url) {
  if (!_gltfCache.has(url)) {
    _gltfCache.set(url, new Promise((resolve, reject) =>
      _gltfLoader.load(url, g => resolve(g.scene), undefined, reject)));
  }
  // SkeletonUtils.clone 正確複製骨架綁定:Quaternius 角色多為 skinned mesh,
  // 用 Object3D.clone 會讓多個棋子共用同一骨架而變形/消失;這裡每隻棋子安全各複製一份。
  return _gltfCache.get(url).then(scene => cloneSkinned(scene));
}

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}
function disposeGroup(g) { for (const c of g.children) disposeTree(c); }
// 短命特效專用:連同 CanvasTexture 一起釋放(特效群組不含共用貼圖,可安全 dispose map)
function disposeFx(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm.map) mm.map.dispose(); mm.dispose(); });
  });
}

// 把外部模型縮放到指定高度並讓底部坐在 y=0(對齊棋盤尺度)
function fitToHeight(obj, targetH) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  obj.scale.setScalar(targetH / (size.y || 1));
  const grounded = new THREE.Box3().setFromObject(obj);
  obj.position.y -= grounded.min.y;
}

// 依「最長邊」縮放(target=該邊長度)再置中、底部坐 y=0。比 fitToHeight 穩健:
// 高瘦的角色 → 受身高約束;扁長的車/魚/平台 → 受長邊約束,不會被拉成巨無霸。
function fitToSize(obj, target) {
  let box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  obj.scale.setScalar(target / (Math.max(size.x, size.y, size.z) || 1));
  obj.position.x -= center.x * obj.scale.x;
  obj.position.z -= center.z * obj.scale.z; // 水平置中
  box = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box.min.y;              // 底部坐地
}

// 把外部模型轉成 Quaternius「純扁平 matte」外觀:消金屬、全粗糙、flat shading、無自發光,
// 但保留模型自帶的頂點色 / 材質色 / 貼圖(維持低面數風格的識別)。
function matteify(obj) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if ('metalness' in m) m.metalness = 0;
      if ('roughness' in m) m.roughness = 1;
      if (m.emissive) { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
      m.flatShading = true;
      m.needsUpdate = true;
    }
  });
}

/** 立即回傳程式生成的 Group;若 manifest 有登記同 key 的 .glb,載入後就地替換。
 *  fallback 的 userData(含待機動作 anim 清單)會掛到外層 group 供動畫讀取。 */
function buildModel(key, proceduralFn, opts = {}) {
  const group = new THREE.Group();
  const fallback = proceduralFn();
  group.add(fallback);
  Object.assign(group.userData, fallback.userData);
  const url = MODEL_MANIFEST[key];
  if (url) {
    loadGltf(url).then(scene => {
      if (opts.fit) fitToSize(scene, opts.fit);
      matteify(scene); // Quaternius 純扁平 matte 外觀
      group.remove(fallback); disposeTree(fallback);
      group.userData.anim = []; // 外部模型沒有零件級待機動畫
      group.add(scene);
      opts.onReady && opts.onReady(group, scene);
    }).catch(e => console.warn('[board3d] GLTF 載入失敗,沿用程式生成:', key, url, e.message || e));
  }
  return group;
}

// ============ 角色棋子(惡搞特徵剪影 + 待機動作) ============
// 共享文法(Ruhnke 的不對稱共享文法):霓虹底座 + 陣營色身體 + 頭 + 該角色的「梗」道具,
// 道具多半在頭頂,俯視也認得出。builder 回傳 root,root.userData.anim 列出待機動作零件。
const NV_GREEN = 0x76b900, BAIDU_BLUE = 0x2266ff, ALI_ORANGE = 0xff6a00, SAMSUNG_BLUE = 0x1428a0;

function pawnBase(color, opts = {}) {
  const bodyH = opts.bodyH ?? 0.46;
  const root = new THREE.Group();
  const anim = [];
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.4, 0.13, 6),
    emissiveMat(color, 0.6, { metalness: 0.6, roughness: 0.3 }));
  base.position.y = 0.065; root.add(base);
  const edge = neonEdges(base.geometry, 0xffffff, 0.45);
  edge.position.copy(base.position); root.add(edge);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.19, bodyH, 4, 10),
    emissiveMat(color, 0.45, { metalness: 0.3, roughness: 0.45 }));
  body.position.y = 0.13 + bodyH / 2 + 0.19; root.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 14, 12),
    emissiveMat(opts.headColor ?? 0xf0ddc4, 0.25, { metalness: 0.1, roughness: 0.6 }));
  head.position.y = body.position.y + bodyH / 2 + 0.27; root.add(head);
  root.userData.anim = anim;
  return { root, head, body, base, anim, topY: head.position.y + 0.13 };
}

const PAWN_BUILDERS = {
  // ---- 米國 ----
  musk(color) {            // 火箭人(SpaceX / 特斯拉)
    const { root, anim, topY } = pawnBase(color);
    const r = new THREE.Group(); r.position.y = topY + 0.02;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 10), emissiveMat(0xeaf4ff, 0.4));
    b.position.y = 0.12; r.add(b);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 10), emissiveMat(NEON_PINK, 0.8));
    nose.position.y = 0.3; r.add(nose);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.07), emissiveMat(0x99bbff, 0.5));
      fin.position.set(Math.cos(a) * 0.07, 0.02, Math.sin(a) * 0.07); fin.rotation.y = -a; r.add(fin);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 8), emissiveMat(0xff8800, 1.4, { transparent: true, opacity: 0.85 }));
    flame.rotation.x = Math.PI; flame.position.y = -0.05; r.add(flame);
    root.add(r);
    anim.push({ mesh: r, type: 'spin', speed: 0.8 }, { mesh: flame, type: 'flick' });
    return root;
  },
  jensen(color) {          // 皮衣刀客(NVIDIA)
    const { root, anim, body, topY } = pawnBase(color);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 18), emissiveMat(0x14110f, 0.15, { metalness: 0.5, roughness: 0.5 }));
    collar.rotation.x = Math.PI / 2; collar.position.y = body.position.y + 0.1; root.add(collar);
    const gpu = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.16), emissiveMat(NV_GREEN, 0.95));
    gpu.position.y = topY + 0.05; root.add(gpu);
    anim.push({ mesh: gpu, type: 'spin', speed: 1.0 });
    return root;
  },
  zuck(color) {            // 蜥蜴人 + VR 頭盔(Meta)
    const { root, anim, head, topY } = pawnBase(color, { headColor: 0x4caf50 });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.12), emissiveMat(0x101820, 0.3, { metalness: 0.7, roughness: 0.2 }));
    visor.position.set(0, head.position.y + 0.02, 0.08); root.add(visor);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.005), emissiveMat(NEON_CYAN, 1.2));
    glow.position.set(0, head.position.y + 0.02, 0.145); root.add(glow);
    const meta = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 24), emissiveMat(0x1d8bf0, 0.9));
    meta.rotation.x = 1.2; meta.position.y = topY + 0.06; root.add(meta);
    anim.push({ mesh: meta, type: 'spin', speed: 1.3 });
    return root;
  },
  jobs(color) {            // 黑高領 + 圓框眼鏡 + 蘋果(Apple)
    const { root, anim, body, head, topY } = pawnBase(color, { headColor: 0xf0ddc4 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 12), emissiveMat(0x0a0a0a, 0.1, { metalness: 0.2, roughness: 0.8 }));
    neck.position.y = body.position.y + body.geometry.parameters.length / 2; root.add(neck);
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), emissiveMat(0xdddddd, 0.6));
      lens.position.set(s * 0.06, head.position.y + 0.01, 0.13); root.add(lens);
    }
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), emissiveMat(0xffffff, 0.7));
    apple.position.y = topY + 0.05; root.add(apple);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 6), emissiveMat(0x2eff8f, 0.9));
    leaf.position.set(0.03, topY + 0.14, 0); leaf.rotation.z = -0.6; root.add(leaf);
    anim.push({ mesh: apple, type: 'bob', y0: apple.position.y, amp: 0.05 });
    return root;
  },
  google(color) {          // 多彩 G 環(Google)
    const { root, anim, topY } = pawnBase(color);
    const ring = new THREE.Group(); ring.position.y = topY + 0.08;
    const gColors = [0x4285f4, 0xea4335, 0xfbbc05, 0x34a853];
    gColors.forEach((c, i) => {
      const a = i / 4 * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), emissiveMat(c, 0.95));
      dot.position.set(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16); ring.add(dot);
    });
    root.add(ring);
    anim.push({ mesh: ring, type: 'spin', speed: 1.1 });
    return root;
  },
  // ---- 牆國 ----
  jack(color) {            // 阿里橙光環 + 招財金幣(阿里巴巴)
    const { root, anim, topY } = pawnBase(color);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 24), emissiveMat(ALI_ORANGE, 1));
    halo.rotation.x = 1.1; halo.position.y = topY + 0.04; root.add(halo);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), emissiveMat(0xffd02e, 1));
    coin.position.y = topY + 0.04; root.add(coin);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), emissiveMat(0x1a1400, 0.1));
    hole.position.y = topY + 0.04; root.add(hole);
    anim.push({ mesh: coin, type: 'spin', speed: 1.4 }, { mesh: hole, type: 'spin', speed: 1.4 });
    return root;
  },
  ren(color) {             // 菊廠菊花(華為)
    const { root, anim, topY } = pawnBase(color);
    const flower = new THREE.Group(); flower.position.y = topY + 0.04;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4),
        emissiveMat(i % 2 ? 0xff3b3b : 0xffe0e0, 0.85));
      petal.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
      petal.rotation.z = Math.PI / 2; petal.rotation.y = -a; flower.add(petal);
    }
    root.add(flower);
    anim.push({ mesh: flower, type: 'spin', speed: 0.9 });
    return root;
  },
  pony(color) {            // QQ 企鵝(騰訊)
    const { root, anim, topY } = pawnBase(color, { bodyH: 0.3 });
    const peng = new THREE.Group(); peng.position.y = topY - 0.02;
    const blk = emissiveMat(0x14181f, 0.2), wht = emissiveMat(0xffffff, 0.4);
    const bod = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), blk); bod.scale.y = 1.25; peng.add(bod);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), wht); belly.scale.y = 1.2; belly.position.set(0, -0.02, 0.08); peng.add(belly);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 8), emissiveMat(0xffa02e, 0.9));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.04, 0.16); peng.add(beak);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), emissiveMat(0xff3b3b, 0.8));
    scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.02; peng.add(scarf);
    root.add(peng);
    anim.push({ mesh: peng, type: 'rock', speed: 1.6, amp: 0.18 });
    return root;
  },
  liang(color) {           // 深海鯨(DeepSeek)
    const { root, anim, topY } = pawnBase(color);
    const whale = new THREE.Group(); whale.position.y = topY + 0.06;
    const bod = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), emissiveMat(0x2a6cf0, 0.7));
    bod.scale.set(1.7, 0.85, 0.85); whale.add(bod);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 4), emissiveMat(0x2a6cf0, 0.7));
    tail.rotation.z = Math.PI / 2; tail.position.x = -0.22; whale.add(tail);
    root.add(whale);
    anim.push({ mesh: whale, type: 'spin', speed: 0.7 }, { mesh: whale, type: 'bob', y0: whale.position.y, amp: 0.05 });
    return root;
  },
  robin(color) {           // 百度熊掌(百度)
    const { root, anim, topY } = pawnBase(color);
    const paw = new THREE.Group(); paw.position.y = topY + 0.03;
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), emissiveMat(BAIDU_BLUE, 0.9)); pad.scale.y = 0.6; paw.add(pad);
    for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * 0.5;
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), emissiveMat(BAIDU_BLUE, 0.9));
      toe.scale.y = 0.6; toe.position.set(Math.sin(a) * 0.14, 0, 0.1 + Math.cos(a) * 0.05); paw.add(toe);
    }
    root.add(paw);
    anim.push({ mesh: paw, type: 'bob', y0: paw.position.y, amp: 0.05 });
    return root;
  },
  // ---- 台灣 ----
  tsmc(color) {            // 護國神山 + 晶圓(台積電)
    const { root, anim, topY } = pawnBase(color);
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 5), emissiveMat(0x0e4a2a, 0.6));
    mtn.position.y = topY + 0.1; root.add(mtn);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 5), emissiveMat(0x2eff8f, 0.95));
    snow.position.y = topY + 0.22; root.add(snow);
    const wafer = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 20), emissiveMat(0x2eff8f, 1.2));
    wafer.position.y = topY - 0.04; root.add(wafer);
    anim.push({ mesh: wafer, type: 'spin', speed: 1.6 });
    return root;
  },
  // ---- 日本 ----
  toyota(color) {          // 旋轉方向盤(豐田)
    const { root, anim, topY } = pawnBase(color);
    const wheel = new THREE.Group(); wheel.position.y = topY + 0.05; wheel.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 24), emissiveMat(0xcc0000, 0.8)); wheel.add(rim);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.025), emissiveMat(0xdddddd, 0.6));
      spoke.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0); spoke.rotation.z = a; wheel.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), emissiveMat(0xcc0000, 0.9)); hub.rotation.x = Math.PI / 2; wheel.add(hub);
    root.add(wheel);
    anim.push({ mesh: wheel, type: 'spinz', speed: 1.0 });
    return root;
  },
  // ---- 韓國 ----
  lee(color) {             // 三星(三顆星)+ 摺疊機(三星)
    const { root, anim, body, topY } = pawnBase(color);
    const stars = new THREE.Group(); stars.position.y = topY + 0.05;
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 4), emissiveMat(SAMSUNG_BLUE, 1));
      star.position.set((i - 1) * 0.14, 0, 0); stars.add(star);
    }
    root.add(stars);
    for (const s of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.26, 0.16), emissiveMat(0x101820, 0.3, { metalness: 0.7, roughness: 0.2 }));
      panel.position.set(s * 0.12, body.position.y, 0.12); panel.rotation.y = s * 0.5; root.add(panel);
    }
    anim.push({ mesh: stars, type: 'bob', y0: stars.position.y, amp: 0.05 });
    return root;
  },
  _default(color) {        // 後備:陣營色尖塔
    const { root, anim, topY } = pawnBase(color);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 4), emissiveMat(color, 0.9));
    spire.position.y = topY; root.add(spire);
    anim.push({ mesh: spire, type: 'spin', speed: 0.9 });
    return root;
  },
};

// ---------- 城市地標(各回傳基準點在 y=0 的 Group) ----------
const LANDMARK_BUILDERS = {
  seattle() { // 太空針塔
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.2, 8), emissiveMat(0xcfe8ff, 0.4));
    post.position.y = 0.6; g.add(post);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.1, 0.1, 12), emissiveMat(NEON_CYAN, 0.9));
    disc.position.y = 1.18; g.add(disc);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 6), emissiveMat(NEON_PINK, 1));
    tip.position.y = 1.36; g.add(tip);
    return g;
  },
  sv() { // 金門大橋
    const g = new THREE.Group();
    const orange = emissiveMat(0xff5533, 0.8);
    for (const dz of [-0.4, 0.4]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), orange);
      tower.position.set(0, 0.5, dz); g.add(tower);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 1.2), orange);
    deck.position.y = 0.34; g.add(deck);
    for (const sign of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const z = -0.6 + (i / 16) * 1.2;
        const y = 0.95 - (1 - Math.abs(z) / 0.6) * 0.55; // 懸索垂度
        pts.push(new THREE.Vector3(sign * 0.035, Math.max(y, 0.4), z));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.9 })));
    }
    return g;
  },
  austin() { // 發射台上的火箭
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.85, 12), emissiveMat(0xe8f4ff, 0.35));
    body.position.y = 0.55; g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 12), emissiveMat(NEON_PINK, 0.8));
    nose.position.y = 1.1; g.add(nose);
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.14), emissiveMat(0x99bbff, 0.5));
      const a = (i / 3) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.11, 0.2, Math.sin(a) * 0.11);
      fin.rotation.y = -a; g.add(fin);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 8), emissiveMat(0xff8800, 1.4, { transparent: true, opacity: 0.85 }));
    flame.rotation.x = Math.PI; flame.position.y = 0.04; flame.userData.flicker = true; g.add(flame);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), emissiveMat(0x667799, 0.3));
    tower.position.set(0.22, 0.5, 0); g.add(tower);
    return g;
  },
  tokyo() { // 東京鐵塔
    const g = new THREE.Group();
    const lattice = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.25, 4, 4, true),
      new THREE.MeshBasicMaterial({ color: 0xff5544, wireframe: true, transparent: true, opacity: 0.95 }));
    lattice.position.y = 0.62; g.add(lattice);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8), emissiveMat(0xffffff, 0.8));
    deck.position.y = 0.85; g.add(deck);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), emissiveMat(0xff5544, 1));
    antenna.position.y = 1.4; g.add(antenna);
    return g;
  },
  seoul() { // N首爾塔
    const g = new THREE.Group();
    const hill = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.3, 8), emissiveMat(0x1a3a55, 0.3));
    hill.position.y = 0.15; g.add(hill);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.85, 10), emissiveMat(0xcfe8ff, 0.4));
    shaft.position.y = 0.7; g.add(shaft);
    const obs = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.16, 10), emissiveMat(NEON_CYAN, 0.9));
    obs.position.y = 1.15; g.add(obs);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 6), emissiveMat(NEON_PINK, 1));
    spire.position.y = 1.4; g.add(spire);
    return g;
  },
  beijing() { // 城樓
    const g = new THREE.Group();
    const red = emissiveMat(0xcc2222, 0.5);
    const gold = emissiveMat(0xffb000, 0.8);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.4), red);
    base.position.y = 0.15; g.add(base);
    const roof1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.5), gold);
    roof1.position.y = 0.34; g.add(roof1);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.25, 0.3), red);
    hall.position.y = 0.5; g.add(hall);
    const roof2 = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.4), gold);
    roof2.position.y = 0.66; g.add(roof2);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.12), gold);
    ridge.position.y = 0.73; g.add(ridge);
    return g;
  },
  shanghai() { // 東方明珠
    const g = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.3, 10), emissiveMat(0x99bbff, 0.4));
    col.position.y = 0.65; g.add(col);
    const ball1 = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), emissiveMat(NEON_PINK, 0.95));
    ball1.position.y = 0.45; g.add(ball1);
    const ball2 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), emissiveMat(NEON_PURPLE, 1));
    ball2.position.y = 1.05; g.add(ball2);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.35, 6), emissiveMat(NEON_PINK, 1));
    spire.position.y = 1.45; g.add(spire);
    return g;
  },
  shenzhen() { // 平安金融中心
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.15, 1.5, 4), emissiveMat(0x10243f, 0.4, { metalness: 0.9, roughness: 0.2 }));
    tower.position.y = 0.75; tower.rotation.y = Math.PI / 4; g.add(tower);
    const glowEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(tower.geometry),
      new THREE.LineBasicMaterial({ color: NEON_CYAN, transparent: true, opacity: 0.9 }));
    glowEdges.position.copy(tower.position); glowEdges.rotation.copy(tower.rotation); g.add(glowEdges);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.3, 4), emissiveMat(NEON_CYAN, 1));
    spire.position.y = 1.62; g.add(spire);
    return g;
  },
  hsinchu() { // 護國神山 + 晶圓廠
    const g = new THREE.Group();
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.85, 5), emissiveMat(0x0e4a2a, 0.5));
    mountain.position.y = 0.42; g.add(mountain);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 5), emissiveMat(0x2eff8f, 0.9));
    snow.position.y = 0.7; g.add(snow);
    const fab = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.24), emissiveMat(0x123a2a, 0.6));
    fab.position.set(0.32, 0.08, 0.28); g.add(fab);
    const wafer = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), emissiveMat(0x2eff8f, 1.2));
    wafer.position.set(0.32, 0.2, 0.28); g.add(wafer);
    return g;
  },
  hanoi() { // 獨柱寺
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 8), emissiveMat(0x886644, 0.4));
    pillar.position.y = 0.2; g.add(pillar);
    const red = emissiveMat(0xcc3322, 0.55);
    const gold = emissiveMat(0xffb000, 0.8);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.34), red);
    hall.position.y = 0.49; g.add(hall);
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.16, 4), gold);
    roof1.rotation.y = Math.PI / 4; roof1.position.y = 0.66; g.add(roof1);
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 4), gold);
    roof2.rotation.y = Math.PI / 4; roof2.position.y = 0.8; g.add(roof2);
    return g;
  },
  singapore() { // 濱海灣金沙
    const g = new THREE.Group();
    const towerMat = emissiveMat(0x16304f, 0.45, { metalness: 0.8, roughness: 0.25 });
    for (const dx of [-0.22, 0, 0.22]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.75, 0.2), towerMat);
      t.position.set(dx, 0.38, 0); g.add(t);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.07, 0.24), emissiveMat(NEON_CYAN, 0.9));
    deck.position.y = 0.8; g.add(deck);
    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 4), emissiveMat(NEON_CYAN, 0.9));
    prow.rotation.z = Math.PI / 2; prow.position.set(0.46, 0.8, 0); g.add(prow);
    return g;
  },
  sydney() { // 雪梨歌劇院
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.1, 0.4), emissiveMat(0x99aabb, 0.3));
    base.position.y = 0.05; g.add(base);
    const shellMat = emissiveMat(0xf5f9ff, 0.55, { side: THREE.DoubleSide });
    [[-0.24, 0.30, -0.5], [0.0, 0.36, -0.45], [0.26, 0.26, -0.4]].forEach(([dx, r, tilt]) => {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 8, 0, Math.PI, 0, Math.PI / 2), shellMat);
      shell.position.set(dx, 0.1, 0.05);
      shell.rotation.set(tilt, Math.PI / 2, 0);
      g.add(shell);
    });
    return g;
  },
  nyc() { // 摩天樓 + 自由女神火炬
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.1, 0.24),
      emissiveMat(0x1a2a44, 0.4, { metalness: 0.8, roughness: 0.3 }));
    tower.position.y = 0.55; g.add(tower);
    const e = neonEdges(tower.geometry, NEON_CYAN, 0.7); e.position.copy(tower.position); g.add(e);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 6), emissiveMat(NEON_PINK, 1));
    spire.position.y = 1.25; g.add(spire);
    const lady = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.4, 8), emissiveMat(0x2eb89a, 0.5));
    lady.position.set(-0.34, 0.25, 0.12); g.add(lady);
    const torch = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8), emissiveMat(0xffb000, 1.3, { transparent: true, opacity: 0.9 }));
    torch.position.set(-0.34, 0.55, 0.12); torch.userData.flicker = true; g.add(torch);
    return g;
  },
  phoenix() { // 沙漠仙人掌 + 晶圓新廠
    const g = new THREE.Group();
    const cac = emissiveMat(0x1f7a4d, 0.5);
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), cac);
    trunk.position.set(-0.2, 0.4, 0); g.add(trunk);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 8), cac);
      arm.position.set(-0.2 + s * 0.13, 0.42, 0); arm.rotation.z = Math.PI / 2; g.add(arm);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.15, 4, 8), cac);
      up.position.set(-0.2 + s * 0.18, 0.55, 0); g.add(up);
    }
    const fab = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.28), emissiveMat(0x13324a, 0.5));
    fab.position.set(0.28, 0.09, 0.18); g.add(fab);
    const wafer = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), emissiveMat(NEON_CYAN, 1.2));
    wafer.position.set(0.28, 0.22, 0.18); g.add(wafer);
    return g;
  },
  la() { // 好萊塢看板 + 棕櫚樹
    const g = new THREE.Group();
    const hill = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 7), emissiveMat(0x3a2f1a, 0.3));
    hill.position.y = 0.2; g.add(hill);
    for (let i = 0; i < 5; i++) {
      const ltr = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.26, 0.03), emissiveMat(0xffffff, 0.85));
      ltr.position.set(-0.26 + i * 0.13, 0.55, -0.18); g.add(ltr);
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 6), emissiveMat(0x6b4a2a, 0.3));
    trunk.position.set(0.36, 0.3, 0.2); g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), emissiveMat(0x2eff8f, 0.7));
      leaf.position.set(0.36 + Math.cos(a) * 0.1, 0.62, 0.2 + Math.sin(a) * 0.1);
      leaf.rotation.z = Math.cos(a) * 0.9; leaf.rotation.x = Math.sin(a) * 0.9; g.add(leaf);
    }
    return g;
  },
  hangzhou() { // 西湖雷峰塔(電商之都)
    const g = new THREE.Group();
    const red = emissiveMat(0xcc4422, 0.5), gold = emissiveMat(0xffb000, 0.8);
    let y = 0;
    for (let i = 0; i < 4; i++) {
      const w = 0.42 - i * 0.07;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.55, 0.2, 8), red);
      body.position.y = y + 0.1; g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.72, 0.12, 8), gold);
      roof.position.y = y + 0.26; g.add(roof);
      y += 0.32;
    }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 8), gold); top.position.y = y + 0.04; g.add(top);
    return g;
  },
  wuhan() { // 黃鶴樓(光谷)
    const g = new THREE.Group();
    const wood = emissiveMat(0x9b3b22, 0.45), gold = emissiveMat(0xffc23a, 0.7);
    let y = 0;
    for (let i = 0; i < 3; i++) {
      const w = 0.5 - i * 0.1;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, w), wood); body.position.y = y + 0.09; g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.95, 0.14, 4), gold);
      roof.rotation.y = Math.PI / 4; roof.position.y = y + 0.25; g.add(roof);
      y += 0.3;
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 6), gold); spire.position.y = y + 0.04; g.add(spire);
    return g;
  },
  chengdu() { // 大熊貓(遊戲山城)
    const g = new THREE.Group();
    const white = emissiveMat(0xf2f2f2, 0.4), black = emissiveMat(0x111111, 0.15);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), white); body.scale.y = 0.85; body.position.y = 0.28; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), white); head.position.y = 0.62; g.add(head);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), black); ear.position.set(s * 0.13, 0.76, 0); g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), black); eye.position.set(s * 0.08, 0.62, 0.17); g.add(eye);
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), black); arm.position.set(s * 0.26, 0.24, 0.06); g.add(arm);
    }
    return g;
  },
  bangkok() { // 鄭王廟尖塔(東協門戶)
    const g = new THREE.Group();
    const stone = emissiveMat(0xe8dcc0, 0.5), gold = emissiveMat(0xffb000, 0.85);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.3, 8), stone); base.position.y = 0.15; g.add(base);
    const prang = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 8), stone); prang.position.y = 0.75; g.add(prang);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 8), gold); tip.position.y = 1.3; g.add(tip);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 6), stone);
      s.position.set(Math.cos(a) * 0.33, 0.35, Math.sin(a) * 0.33); g.add(s);
    }
    return g;
  },
  bangalore() { // 邦政府大廈圓頂(印度矽谷)
    const g = new THREE.Group();
    const stone = emissiveMat(0xd8c89a, 0.45);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.4), stone); base.position.y = 0.15; g.add(base);
    const cols = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), stone); cols.position.y = 0.4; g.add(cols);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), stone); dome.position.y = 0.51; g.add(dome);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 6), emissiveMat(0xffb000, 0.9)); finial.position.y = 0.72; g.add(finial);
    for (const s of [-0.26, 0.26]) {
      const sd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone); sd.position.set(s, 0.41, 0); g.add(sd);
    }
    return g;
  },
  dubai() { // 哈里發塔 + 油(石油金庫)
    const g = new THREE.Group();
    const glass = emissiveMat(0x16304f, 0.4, { metalness: 0.85, roughness: 0.2 });
    let y = 0;
    for (let i = 0; i < 4; i++) {
      const w = 0.28 - i * 0.06;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.7, w, 0.4, 6), glass);
      seg.position.y = y + 0.2; seg.rotation.y = i * 0.2; g.add(seg);
      y += 0.38;
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 0.5, 6), emissiveMat(NEON_CYAN, 1));
    spire.position.y = y + 0.2; g.add(spire);
    const cage = neonEdges(new THREE.CylinderGeometry(0.2, 0.28, 1.5, 6), NEON_AMBER, 0.25);
    cage.position.y = 0.75; g.add(cage);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.3), emissiveMat(0xffa02e, 0.7));
    pump.position.set(0.34, 0.25, 0.22); g.add(pump);
    return g;
  },
};

// ============ 科技卡 → 城市建築(依類別不同造型,高度隨階級 1→5 成長) ============
// 簽名 (facHex 擁有者陣營色, tier 階級1-5, catHex 類別色)→ Group(基準底面 y=0,消光 matte)。
const TECH_BUILDERS = {
  power(fac, tier, cat) { // 動力類:發射塔 + 天線(桁架段數=階級)
    const g = new THREE.Group();
    const h = 0.3 + tier * 0.12;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 6), emissiveMat(fac, 0.4));
    tower.position.y = h / 2; g.add(tower);
    for (let i = 0; i < tier; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.16), emissiveMat(fac, 0.3));
      bar.position.y = (i + 0.5) / tier * h; bar.rotation.y = i * 0.4; g.add(bar);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), emissiveMat(cat, 0.9));
    nose.position.y = h + 0.07; g.add(nose);
    return g;
  },
  hardware(fac, tier, cat) { // 硬體類:晶圓廠廠房 + 晶圓
    const g = new THREE.Group();
    const h = 0.22 + tier * 0.09;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, h, 0.26), emissiveMat(fac, 0.35));
    box.position.y = h / 2; g.add(box);
    const e = neonEdges(box.geometry, cat, 0.45); e.position.copy(box.position); g.add(e);
    const wafer = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), emissiveMat(cat, 0.8));
    wafer.position.y = h + 0.02; g.add(wafer);
    return g;
  },
  info(fac, tier, cat) { // 資訊類:堆疊伺服器層(層數=階級+1)
    const g = new THREE.Group();
    for (let i = 0; i < tier + 1; i++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.22),
        emissiveMat(i % 2 ? cat : fac, i % 2 ? 0.55 : 0.3));
      slab.position.y = 0.05 + i * 0.085; g.add(slab);
    }
    return g;
  },
  ai(fac, tier, cat) { // AI類:資料中心塔 + 發光核心 + 散熱鰭
    const g = new THREE.Group();
    const h = 0.3 + tier * 0.1;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.24, h, 0.24), emissiveMat(fac, 0.3));
    tower.position.y = h / 2; g.add(tower);
    for (const s of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, h * 0.7, 0.18), emissiveMat(cat, 0.45));
      fin.position.set(s * 0.14, h * 0.45, 0); g.add(fin);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), emissiveMat(cat, 1.0));
    core.position.y = h + 0.05; g.add(core);
    return g;
  },
  fun(fac, tier, cat) { // 娛樂類:LED 看板(尺寸隨階級)
    const g = new THREE.Group();
    const h = 0.25 + tier * 0.08;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, h, 6), emissiveMat(fac, 0.3));
      post.position.set(s * 0.12, h / 2, 0); g.add(post);
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18 + tier * 0.04, 0.03), emissiveMat(cat, 0.75));
    panel.position.y = h; g.add(panel);
    return g;
  },
};

// ============ 地形與天氣的共用工具 ============
const TERRAIN_Y = -0.16; // 陸塊頂面高度(山林/小丘坐這上面)

// 射線法:點 (x,z) 是否在多邊形 pts([[x,z],...],世界座標)內
function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

// 柔邊圓點貼圖(雲、雪花共用)
function makeSoftTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const lerp = (a, b, k) => a + (b - a) * k;
const smooth = k => k * k * (3 - 2 * k);
const easeOutBack = k => { const c = 1.70158; const x = k - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

// ---------- 角色公司旗幟(建造科技卡時於城市升起)----------
const _texLoader = new THREE.TextureLoader();
const _logoTexCache = new Map(); // url → 共用 Texture(常駐旗幟用,不隨 disposeGroup 釋放)
function logoTexture(charId, fresh = false) {
  const url = charLogo(charId);
  if (!url) return null;
  if (fresh) { const t = _texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; return t; }
  if (!_logoTexCache.has(url)) {
    const t = _texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace;
    _logoTexCache.set(url, t);
  }
  return _logoTexCache.get(url);
}

// 旗桿 + 陣營色旗布 + 公司 logo;userData.cloth 為旗布樞紐(供飄動動畫)
function makeCompanyFlag(charId, facHex, fresh = false) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.6, 6),
    new THREE.MeshStandardMaterial({ color: 0xd2dceb, metalness: 0.4, roughness: 0.5 }));
  pole.position.y = 0.8; g.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8),
    new THREE.MeshStandardMaterial({ color: facHex, emissive: facHex, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.4 }));
  knob.position.y = 1.63; g.add(knob);
  // 旗布:以旗桿為樞紐向 +x 展開
  const cloth = new THREE.Group(); cloth.position.set(0.014, 1.46, 0); g.add(cloth);
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.44),
    new THREE.MeshBasicMaterial({ color: facHex, side: THREE.DoubleSide, transparent: true, opacity: 0.96 }));
  backing.position.set(0.34, -0.06, 0); cloth.add(backing);
  const tex = logoTexture(charId, fresh);
  if (tex) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
    logo.position.set(0.34, -0.06, 0.012); cloth.add(logo);
  }
  g.userData.cloth = cloth;
  return g;
}

// ---------- 玩家標記 / 動作提示文字 ----------
// 圓形頭像貼圖:把 chibi 以 cover-fit 置中裁進正方畫布的圓形 → 顯示永遠水平置中,
// 與下方名牌(同樣置中)精準左右對齊,不受來源邊距/比例影響。
const _avatarTexCache = new Map();
function avatarTexture(charId) {
  if (!_avatarTexCache.has(charId)) {
    const S = 256;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2); ctx.clip();
      const s = Math.max(S / img.width, S / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h); // cover-fit 置中
      ctx.restore();
      tex.needsUpdate = true;
    };
    img.src = `images/avatars/${charId}_chibi.png`;
    _avatarTexCache.set(charId, tex);
  }
  return _avatarTexCache.get(charId);
}

function _roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// 名牌貼圖快取(每位玩家最多一張,跨 sync 共用 → 不隨 disposeGroup 累積洩漏)
const _tagTexCache = new Map();
function nameTagTexture(text, css) {
  const key = text + '|' + css;
  if (!_tagTexCache.has(key)) {
    const H = 80;
    const m = document.createElement('canvas').getContext('2d');
    m.font = 'bold 42px "Microsoft JhengHei", sans-serif';
    const tw = m.measureText(text).width;
    const W = Math.ceil((tw + 72) / 2) * 2; // 畫布寬度隨字數成長 → 字不被擠壓、保持置中
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 42px "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = 'rgba(6,10,24,0.86)'; _roundRect(ctx, 8, 10, W - 16, 60, 16); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = css; ctx.stroke();
    ctx.fillStyle = '#eaffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = css; ctx.shadowBlur = 8;
    ctx.fillText(text, W / 2, 42);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    _tagTexCache.set(key, { tex, aspect: W / H });
  }
  return _tagTexCache.get(key);
}
// 棋子名牌(圓角底 + 陣營色描邊),永遠面向鏡頭、不被遮擋;依文字長度等比縮放不變形
function makeNameTag(text, css = '#00f0ff', h = 0.55) {
  const { tex, aspect } = nameTagTexture(text, css);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  spr.scale.set(h * aspect, h, 1); spr.renderOrder = 12;
  return spr;
}

// 表情貼圖快取(供棋子標記用;fx 用的 makeEmojiSprite 不快取,因 disposeFx 會釋放 map)
const _emojiTexCache = new Map();
function emojiTexture(ch) {
  if (!_emojiTexCache.has(ch)) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = '92px "Segoe UI Emoji", "Microsoft JhengHei", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, 64, 70);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    _emojiTexCache.set(ch, tex);
  }
  return _emojiTexCache.get(ch);
}

// 動作提示文字(浮起淡出):大字 + 描邊,行動發生處顯示「誰做了什麼」
function makeFxText(text, css = '#00f0ff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 60px "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(2,4,12,0.92)'; ctx.strokeText(text, 256, 70, 500);
  ctx.shadowColor = css; ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff'; ctx.fillText(text, 256, 70, 500);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  spr.scale.set(5.2, 1.3, 1); spr.renderOrder = 22;
  return spr;
}

// ---------- 天氣型錄 ----------
// 每種天氣是一組會被平滑插值的參數;rain/snow/cloud=粒子強度,wind=風力,wave=浪高,
// light/amb=光照,flash=閃電頻率,funnel=漏斗(颱風/龍捲)強度,funnelGround=是否觸地,fog/bg=氛圍
const WEATHER = {
  clear:    { name: '晴天',   icon: '☀️', rain: 0,    snow: 0,   cloud: 0.10, wind: 0.15, wave: 0.30, light: 1.3,  amb: 1.5,  flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 46, fogFar: 100, bg: 0x1c2b48 },
  waves:    { name: '海浪',   icon: '🌊', rain: 0,    snow: 0,   cloud: 0.28, wind: 0.55, wave: 1.0,  light: 1.1,  amb: 1.35, flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 40, fogFar: 95,  bg: 0x18243c },
  monsoon:  { name: '季風',   icon: '🌬️', rain: 0.45, snow: 0,   cloud: 0.6,  wind: 0.95, wave: 0.7,  light: 0.95, amb: 1.15, flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 34, fogFar: 88,  bg: 0x060810 },
  plumrain: { name: '梅雨',   icon: '🌧️', rain: 0.4,  snow: 0,   cloud: 0.85, wind: 0.25, wave: 0.35, light: 0.7,  amb: 1.05, flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 24, fogFar: 70,  bg: 0x0a0c14 },
  snow:     { name: '下雪',   icon: '❄️', rain: 0,    snow: 0.85,cloud: 0.55, wind: 0.35, wave: 0.2,  light: 1.05, amb: 1.7,  flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 28, fogFar: 80,  bg: 0x223150 },
  thunder:  { name: '雷雨',   icon: '⛈️', rain: 0.9,  snow: 0,   cloud: 0.95, wind: 0.6,  wave: 0.65, light: 0.55, amb: 0.8,  flash: 1,   funnel: 0,   funnelGround: 0,    fogNear: 22, fogFar: 66,  bg: 0x070810 },
  typhoon:  { name: '颱風',   icon: '🌀', rain: 1.0,  snow: 0,   cloud: 1.0,  wind: 1.0,  wave: 1.0,  light: 0.55, amb: 0.85, flash: 0.6, funnel: 0.7, funnelGround: 0.12, fogNear: 18, fogFar: 60,  bg: 0x05060d },
  tornado:  { name: '龍捲風', icon: '🌪️', rain: 0.35, snow: 0,   cloud: 0.7,  wind: 1.0,  wave: 0.6,  light: 0.8,  amb: 1.0,  flash: 0.2, funnel: 1.0, funnelGround: 1.0,  fogNear: 28, fogFar: 78,  bg: 0x080a12 },
};
const WEATHER_WEIGHTS = { clear: 32, waves: 14, monsoon: 10, plumrain: 9, snow: 8, thunder: 9, typhoon: 9, tornado: 9 };
// 四季(回合季別 Q1→Q4):各自一組「與季節相符」的天氣加權池 + 招牌落物粒子(petal 櫻花 / leaf 落葉)
const SEASONS = {
  1: { name: '春', icon: '🌸', weights: { clear: 26, monsoon: 16, waves: 12, plumrain: 8, thunder: 4 }, fall: 'petal' },
  2: { name: '夏', icon: '☀️', weights: { clear: 24, typhoon: 16, thunder: 14, waves: 14, monsoon: 6 }, fall: null },
  3: { name: '秋', icon: '🍂', weights: { clear: 26, monsoon: 12, plumrain: 10, waves: 12, tornado: 4 }, fall: 'leaf' },
  4: { name: '冬', icon: '❄️', weights: { snow: 26, clear: 18, waves: 10, thunder: 6 }, fall: null },
};
const SEASON_FALL_COLOR = { petal: 0xffc8e0, leaf: 0xffa53d };
const WX_FIELDS = ['rain', 'snow', 'cloud', 'wind', 'wave', 'light', 'amb', 'flash', 'funnel', 'funnelGround', 'fogNear', 'fogFar'];
const WX_BLEND_DUR = 4.0; // 天氣切換的過渡秒數

function weightedPick(weights) {
  let tot = 0; for (const k in weights) tot += weights[k];
  let r = Math.random() * tot;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return 'clear';
}

export class Board3D {
  constructor(container, onRegionClick, onPawnClick) {
    this.container = container;
    this.onRegionClick = onRegionClick;
    this.onPawnClick = onPawnClick;     // 點擊棋子 → 查看玩家/角色
    this.pawnPrevPos = {};              // charId → 上次所在城市(用來播移動動畫)
    this.regionMeshes = {};
    this.nodeGroup = new THREE.Group();
    this.pawnGroup = new THREE.Group();
    this.flagCloths = [];               // 城市公司旗幟(升起動畫 + 飄動)
    this._flagSeen = undefined;         // 上次同步已存在的旗幟,用來判斷新建造→升起
    this.blockedRings = {};
    this.highlighted = new Set();
    this.traffic = [];
    this.flickers = [];
    this.fxItems = [];      // 進行中的短命特效
    this.clock = new THREE.Clock();
    this._init();
  }

  _init() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a2742); // 黃昏藍(matte 風,非純黑)
    this.scene.fog = new THREE.Fog(0x1a2742, 42, 95);

    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 220);
    this.camera.position.set(0, 24, 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 62;
    this.controls.enableDamping = true;
    // 操作:拖曳=平移地圖、雙指捏合=縮放(滾輪也可縮放);右鍵拖曳保留旋轉視角。
    this.controls.screenSpacePanning = false;        // 沿地面平移(像看地圖)
    this.controls.panSpeed = 0.9;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

    // 提亮、偏柔和日光,讓消光低面數模型讀得清楚(intensity 會被天氣覆寫,色相保留)
    this.ambient = new THREE.AmbientLight(0x9fb4d6, 1.4);
    this.scene.add(this.ambient);
    // Quaternius 風的招牌半球光:天空藍→地面暗,均勻柔和,且不受天氣覆寫,提供穩定 matte 底光
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a3142, 1.35);
    this.scene.add(this.hemi);
    this.dirLight = new THREE.DirectionalLight(0xfff2d8, 1.2); // 暖白太陽
    this.dirLight.position.set(10, 25, 10);
    this.scene.add(this.dirLight);
    // 僅保留微弱的霓虹補光當夜色點綴(從 60 → 16),不再讓畫面發光過曝
    const pink = new THREE.PointLight(NEON_PINK, 16, 60);
    pink.position.set(-14, 8, 0);
    this.scene.add(pink);
    const cyan = new THREE.PointLight(NEON_CYAN, 16, 60);
    cyan.position.set(14, 8, 0);
    this.scene.add(cyan);

    this._buildOcean();
    this._buildLand();
    this._buildTerrain();
    this._buildRegions();
    this._buildCities();
    this._buildRoutes();
    this._buildDeck();
    this._buildStars();
    this._buildWeather();
    this._initWeatherBadge();
    this._pickWeather();
    this.scene.add(this.nodeGroup);
    this.scene.add(this.pawnGroup);
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._downAt = null;
    this.renderer.domElement.addEventListener('pointerdown', e => { this._downAt = [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (!this._downAt) return;
      const dx = e.clientX - this._downAt[0], dy = e.clientY - this._downAt[1];
      this._downAt = null;
      if (dx * dx + dy * dy > 25) return; // 拖曳不算點擊
      this._pick(e);
    });

    window.addEventListener('resize', () => this._resize());
    this._animate();
  }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _buildOcean() {
    const grid = new THREE.GridHelper(100, 66, 0x0a2a4a, 0x07182e);
    grid.position.y = -0.6;
    this.scene.add(grid);

    // 會起伏的海面:高分段平面,每幀位移頂點 y 做浪
    const segs = 60;
    const geo = new THREE.PlaneGeometry(100, 100, segs, segs);
    geo.rotateX(-Math.PI / 2); // 烘進旋轉:頂點 x→世界 X、z→世界 Z、y 當垂直位移
    this.oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1c3d5c, metalness: 0.05, roughness: 0.92, transparent: true, opacity: 0.96, flatShading: true,
    });
    this.ocean = new THREE.Mesh(geo, this.oceanMat);
    // 海面壓在陸地底面(-0.38)與卡格底面(-0.25)之下,浪峰永遠不會浮上來蓋住陸地/城市/牌組
    this.ocean.position.y = -0.55;
    this.scene.add(this.ocean);
    this.oceanBase = geo.attributes.position.array.slice(); // 原始 x,z 供算浪
    this._oceanFrame = 0;

    // 標題挪到北側開放海域(讓出中央給三疊牌庫);抬高 + 不吃霧氣/不被擋,確保清楚可讀
    const title = makeLabelSprite('PACIFIC RIM // 環太平洋', 'CYBER TRADE WAR 2049', '#ff2bd6', { h: 2.4 });
    title.position.set(1.0, 1.6, -10);
    this.scene.add(title);
  }

  // 依浪高參數位移海面頂點。振幅刻意壓低:三項正弦最大合成 = amp×2,
  // 海面基準 -0.55,故最大浪峰 ≈ -0.55 + 0.16×2 = -0.23,仍低於陸地頂面(-0.16),不會蓋住重要物件。
  _animateOcean(t, waveAmt) {
    const pos = this.ocean.geometry.attributes.position;
    const arr = pos.array, base = this.oceanBase;
    const amp = 0.04 + waveAmt * 0.12;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], z = base[i + 2];
      arr[i + 1] = Math.sin(x * 0.18 + t * 1.1) * amp
                 + Math.cos(z * 0.31 - t * 0.9) * amp * 0.6
                 + Math.sin((x + z) * 0.12 + t * 1.7) * amp * 0.4;
    }
    pos.needsUpdate = true;
    if ((this._oceanFrame = (this._oceanFrame + 1) % 5) === 0) this.ocean.geometry.computeVertexNormals();
  }

  // ---------- 陸塊與海岸霓虹線 ----------
  _buildLand() {
    const landMat = new THREE.MeshStandardMaterial({
      color: 0x2f4636, metalness: 0.0, roughness: 1.0, flatShading: true,
    });
    const addPoly = (pts, coastColor) => {
      const shape = new THREE.Shape();
      pts.forEach(([x, z], i) => {
        if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z);
      });
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
      const mesh = new THREE.Mesh(geo, landMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.38; // 頂面 y=-0.16,略低於六角棋格
      this.scene.add(mesh);

      const linePts = pts.map(([x, z]) => new THREE.Vector3(x, -0.13, z));
      linePts.push(linePts[0].clone());
      this.scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePts),
        new THREE.LineBasicMaterial({ color: new THREE.Color(coastColor), transparent: true, opacity: 0.4 })));
    };
    for (const land of LANDMASSES) addPoly(land.pts, land.coast);

    // 裝飾小島(圓形小丘)
    for (const isl of DECOR_ISLANDS) {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(isl.r, isl.r * 1.25, 0.18, 10), landMat);
      disc.position.set(isl.x, -0.28, isl.z);
      this.scene.add(disc);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(isl.r * 1.1, 0.015, 6, 24),
        new THREE.MeshBasicMaterial({ color: 0x1e6090, transparent: true, opacity: 0.55 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(isl.x, -0.18, isl.z);
      this.scene.add(ring);
    }
    this._buildTerrain();
  }

  // 地形地標:矽谷東邊的大峽谷、雪梨西邊的澳洲沙漠(坐落於陸地頂面 y=-0.16,低於城市卡格)
  _buildTerrain() {
    const matte = (c, opt = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0, flatShading: true, ...opt });

    // 矽谷東邊:大峽谷(紅色層理峽谷 + 谷底科羅拉多河)
    const canyon = new THREE.Group();
    canyon.position.set(14.6, -0.16, -1.0); canyon.rotation.y = 0.4;
    const strata = [0x8f4326, 0xb5663a, 0xcf9356];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(1.9 - i * 0.16, 0.09, 0.55 - i * 0.14), matte(strata[i]));
        wall.position.set(0, 0.045 + i * 0.085, s * (0.42 - i * 0.1));
        canyon.add(wall);
      }
    }
    const river = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.08),
      matte(0x2a6cf0, { emissive: 0x123a6a, emissiveIntensity: 0.4, roughness: 0.6 }));
    river.position.y = 0.03; canyon.add(river);
    this.scene.add(canyon);

    // 雪梨西邊:澳洲沙漠(Uluru 紅岩巨石 + 周圍沙丘)
    const desert = new THREE.Group();
    desert.position.set(-5.1, -0.16, 11.3);
    const sand = matte(0xd9b86a);
    const uluru = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), matte(0xb5532a));
    uluru.scale.set(1.0, 0.42, 0.62); uluru.position.y = 0.2; desert.add(uluru);
    for (const [dx, dz, r] of [[-0.9, 0.3, 0.5], [0.6, -0.6, 0.4], [-0.3, 0.95, 0.45], [0.85, 0.55, 0.35]]) {
      const dune = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), sand);
      dune.scale.y = 0.3; dune.position.set(dx, 0.04, dz); desert.add(dune);
    }
    this.scene.add(desert);
  }

  _buildRegions() {
    this.tileR = {};
    const NEUTRAL = 0x6b7686;
    // 所有城市格子大小一致:統一半徑 = min over cities of(0.46 × 最近鄰距離)(上限 1.55),
    // 取最近一對城市的安全值套用到每一座城市,保證大小一致且不重疊。
    const nnOf = r => {
      let m = Infinity;
      for (const o of REGIONS) if (o !== r) { const d = Math.hypot(o.x - r.x, o.z - r.z); if (d < m) m = d; }
      return m;
    };
    let uniformR = 1.55;
    for (const r of REGIONS) uniformR = Math.min(uniformR, 0.46 * nnOf(r));
    for (const r of REGIONS) {
      const isChip = !!r.chipBonus;
      const fac = r.country ? FACTIONS[r.country] : null;
      const facHex = fac ? fac.color : NEUTRAL;           // 陣營色(中立=灰)
      const facCol = new THREE.Color(facHex);
      const topR = uniformR; // 所有城市格子大小一致
      this.tileR[r.id] = topR;
      const hexGeo = new THREE.CylinderGeometry(topR, topR * 1.12, 0.5, 6);

      const idleEmissive = facCol.clone().multiplyScalar(0.22).getHex(); // 該陣營色的暗化自發光
      const mat = new THREE.MeshStandardMaterial({
        color: facCol.clone().multiplyScalar(0.5).getHex(),  // 卡格底色 = 陣營色(消光)
        emissive: idleEmissive,
        metalness: 0.0, roughness: 0.95, flatShading: true,
        transparent: true, opacity: 0.92,
      });
      const mesh = new THREE.Mesh(hexGeo, mat);
      mesh.position.set(r.x, 0, r.z);
      mesh.userData.regionId = r.id;
      mesh.userData.idleEmissive = idleEmissive; // _animate idle 用(陣營色而非固定藍)
      this.scene.add(mesh);

      const line = new THREE.LineSegments(
        new THREE.EdgesGeometry(hexGeo),
        new THREE.LineBasicMaterial({ color: facHex, transparent: true, opacity: 0.9 }));
      line.position.copy(mesh.position);
      this.scene.add(line);

      // 晶片城:額外疊一圈綠框強調「護國神山」
      if (isChip) {
        const chipRing = new THREE.Mesh(
          new THREE.TorusGeometry(topR * 1.02, 0.05, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0x2eff8f, transparent: true, opacity: 0.9 }));
        chipRing.rotation.x = Math.PI / 2; chipRing.position.set(r.x, 0.27, r.z); chipRing.rotation.z = Math.PI / 6;
        this.scene.add(chipRing);
      }

      const label = makeLabelSprite(r.name, r.tag, '#' + facCol.getHexString());
      label.position.set(r.x, 3.1, r.z);
      this.scene.add(label);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(topR * 1.2, 0.07, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.9 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(r.x, 0.5, r.z);
      ring.visible = false;
      this.scene.add(ring);
      this.blockedRings[r.id] = ring;

      this.regionMeshes[r.id] = mesh;
    }
  }

  // ---------- 市中心(混合:程式地標中心 + Quaternius 天際線,隨等級成長) ----------
  _buildCities() {
    this.cityGroups = {};
    this.cityLevels = {};
    this.cityFlickers = {};
    for (const r of REGIONS) this._buildCity(r.id, r.startLevel || 1);
  }

  /** 建一座城市:中心放程式生成的專屬地標(每城不同、對應現實,整體高度隨 level 成長)+
   *  外圈用 Quaternius 低面數建築當天際線(棟數/高度隨 level 增加)。存進 cityGroups/cityLevels。 */
  _buildCity(rid, level) {
    const r = REGIONS.find(x => x.id === rid);
    const city = new THREE.Group();
    city.position.set(r.x, 0.25, r.z);             // 六角棋格頂面
    city.scale.setScalar((this.tileR[rid] || 1.55) / 1.55); // 依卡格大小縮放,擁擠城市自動縮小不出格

    // 中心地標(程式生成);整體高度隨城市等級 Lv1→0.9 ... Lv5→1.3 成長
    const flickers = [];
    const lm = LANDMARK_BUILDERS[rid] ? LANDMARK_BUILDERS[rid]() : (() => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), emissiveMat(0x8b9bb0, 0.4));
      t.position.y = 0.6; g.add(t); return g;
    })();
    lm.scale.y *= 0.8 + level * 0.1;
    lm.traverse(o => { if (o.userData.flicker) { flickers.push(o); this.flickers.push(o); } });
    city.add(lm);

    // 等級指示:基座一圈 level 顆發光柱(一眼看出城市發展程度)
    for (let i = 0; i < level; i++) {
      const a = (i - (level - 1) / 2) * 0.34 - Math.PI / 2;
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6), emissiveMat(NEON_CYAN, 1.0));
      stud.position.set(Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5); city.add(stud);
    }

    // 天際線:2+level 棟(上限 6)Quaternius 建築繞外圈,越高級越多越高(決定性挑檔)
    let seed = 0; for (const ch of rid) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const rand = mulberry32(seed);
    const n = Math.min(6, 2 + level);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.5;
      const dist = 1.0 + rand() * 0.25;
      const file = SKYLINE_BUILDINGS[Math.floor(rand() * SKYLINE_BUILDINGS.length)];
      const h = 0.5 + rand() * 0.3 + level * 0.05;
      const rotY = rand() * Math.PI * 2;
      loadGltf(file).then(g => {
        if (this.cityGroups[rid] !== city) { disposeTree(g); return; } // 期間已重建 → 丟棄
        fitToSize(g, h); matteify(g); // fitToSize 已把 g 置中+底坐 y=0,故包一層 holder 擺到外圈
        const holder = new THREE.Group();
        holder.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist);
        holder.rotation.y = rotY; holder.add(g); city.add(holder);
      }).catch(() => {}); // 少一棟不致命
    }

    this.cityFlickers[rid] = flickers;
    this.cityLevels[rid] = level;
    this.cityGroups[rid] = city;
    this.scene.add(city);
    return city;
  }

  // 城市升級時:釋放舊城重建新等級,並清掉舊地標殘留的 flicker 參考
  _rebuildCity(rid, level) {
    const old = this.cityGroups[rid];
    if (old) {
      const dead = this.cityFlickers[rid] || [];
      this.flickers = this.flickers.filter(f => !dead.includes(f));
      this.scene.remove(old); disposeGroup(old);
    }
    this._buildCity(rid, level);
  }

  // ---------- 航線(分類型)+ 交通工具 ----------
  _buildRoutes() {
    const posOf = id => {
      const r = REGIONS.find(x => x.id === id);
      return new THREE.Vector3(r.x, 0.08, r.z);
    };
    for (const [a, b] of EDGES) {
      const type = EDGE_TYPES[`${a}|${b}`] || EDGE_TYPES[`${b}|${a}`] || 'ship';
      const style = TRAFFIC_STYLE[type];
      const pa = posOf(a), pb = posOf(b);
      const dist = pa.distanceTo(pb);
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      mid.y = type === 'plane' ? 1.3 + dist * 0.15
            : type === 'train' ? 0.16
            : 0.1;
      const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);

      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(28));
      let lineMat;
      if (type === 'train') {
        lineMat = new THREE.LineDashedMaterial({
          color: style.color, transparent: true, opacity: style.opacity,
          dashSize: 0.3, gapSize: 0.2,
        });
      } else {
        lineMat = new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity });
      }
      const line = new THREE.Line(geo, lineMat);
      if (type === 'train') line.computeLineDistances();
      this.scene.add(line);

      this._addVehicle(type, curve, dist);
    }
  }

  _addVehicle(type, curve, dist) {
    const style = TRAFFIC_STYLE[type];
    const item = {
      type, curve,
      speed: style.speed / Math.max(curve.getLength(), 0.001),
      phase: Math.random(),
      dir: Math.random() < 0.5 ? 1 : -1,
      parts: [],
    };
    const make = {
      plane: () => {
        const g = new THREE.Group();
        const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.5, 8), emissiveMat(0xe8f4ff, 0.5));
        fus.rotation.x = Math.PI / 2; g.add(fus);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), emissiveMat(0xe8f4ff, 0.5));
        nose.rotation.x = Math.PI / 2; nose.position.z = 0.3; g.add(nose);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.02, 0.13), emissiveMat(NEON_PURPLE, 0.8));
        wing.position.z = -0.02; g.add(wing);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.1), emissiveMat(NEON_PURPLE, 0.9));
        tail.position.set(0, 0.08, -0.24); g.add(tail);
        const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.015, 0.08), emissiveMat(NEON_PURPLE, 0.8));
        tailWing.position.z = -0.24; g.add(tailWing);
        return [{ mesh: g, gap: 0 }];
      },
      ship: () => {
        const g = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.52), emissiveMat(0x224466, 0.35));
        g.add(hull);
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.08), emissiveMat(0xcfe8ff, 0.6));
        bridge.position.set(0, 0.1, -0.19); g.add(bridge);
        const boxColors = [NEON_CYAN, NEON_PINK, NEON_AMBER];
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), emissiveMat(boxColors[i], 0.8));
          c.position.set(0, 0.075, 0.14 - i * 0.12); g.add(c);
        }
        return [{ mesh: g, gap: 0 }];
      },
      train: () => {
        const parts = [];
        const gapT = 0.3 / Math.max(curve.getLength(), 0.001); // 車廂間距(t 參數)
        for (let i = 0; i < 3; i++) {
          const car = new THREE.Mesh(
            new THREE.BoxGeometry(0.13, 0.11, 0.26),
            emissiveMat(i === 0 ? NEON_AMBER : 0x2a3a55, i === 0 ? 0.9 : 0.45));
          parts.push({ mesh: car, gap: i * gapT });
        }
        return parts;
      },
    };
    item.parts = make[type]();
    item.parts.forEach(p => this.scene.add(p.mesh));
    this.traffic.push(item);
  }

  // 薄卡牌(背面朝上):背面貼圖在上下兩面,側邊暗霓虹;材質皆 transparent 供淡出
  _makeCardMesh(w, h, d, tex) {
    const back = new THREE.MeshStandardMaterial({ map: tex, metalness: 0, roughness: 1, flatShading: true, transparent: true });
    const side = new THREE.MeshStandardMaterial({ color: 0x0c1430, emissive: NEON_CYAN, emissiveIntensity: 0.12, metalness: 0, roughness: 1, transparent: true });
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, back, back, side, side]);
  }

  // ---------- 太平洋正中央的三疊牌庫:公共牌庫(1-3階) + 四階 / 五階牌庫,上下並排 ----------
  _buildDeck() {
    this.deckStacks = [];
    const COLX = 2.0; // 同一條 z 軸縱列,三疊上下並排
    this._makeDeckStack({ x: COLX, z: -1.0, label: '四階牌庫', sub: 'TIER 4', accent: '#ffb000',
      glyph: '4', icon: '🔼', countKey: 'tier4Count', n: 8, scale: 0.82 });
    const pub = this._makeDeckStack({ x: COLX, z: 2.0, label: '公共牌庫', sub: 'DRAW DECK', accent: '#00f0ff',
      glyph: '?', icon: '🃏', countKey: 'deckCount', n: 14, scale: 1.0 });
    this._makeDeckStack({ x: COLX, z: 5.0, label: '五階牌庫', sub: 'TIER 5', accent: '#ff2bd6',
      glyph: '5', icon: '🏆', countKey: 'tier5Count', n: 6, scale: 0.82 });
    // 抽牌特效從公共牌庫飛出;既有牌庫浮動動畫沿用主牌庫群組
    this.deckPos = { x: COLX, z: 2.0 };
    this.deckGroup = pub.group;
  }

  // 單疊牌庫:浮筒 + 霓虹光環 + 一疊卡背 + 圖示 + 看板;存進 deckStacks 供 sync 依剩餘量顯示
  _makeDeckStack({ x, z, label, sub, accent, glyph, icon, countKey, n, scale }) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale);
    const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.14, 6),
      emissiveMat(0x10243f, 0.4, { metalness: 0.3, roughness: 0.6 }));
    buoy.position.y = 0.05; g.add(buoy);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 8, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).getHex(), transparent: true, opacity: 0.85 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.14; g.add(ring);
    const tex = makeCardBackTexture(accent, glyph);
    const cards = [];
    for (let i = 0; i < n; i++) {
      const card = this._makeCardMesh(0.95, 0.05, 1.3, tex);
      card.position.set((Math.random() - 0.5) * 0.06, 0.18 + i * 0.05, (Math.random() - 0.5) * 0.06);
      card.rotation.y = (Math.random() - 0.5) * 0.25;
      g.add(card); cards.push(card);
    }
    const ic = makeEmojiSprite(icon); ic.position.y = 1.5; ic.scale.set(0.9, 0.9, 1); g.add(ic);
    const lab = makeLabelSprite(label, sub, accent, { h: 1.2 }); lab.position.y = 2.3; g.add(lab);
    this.scene.add(g);
    const stack = { group: g, ring, icon: ic, cards, countKey, max: undefined };
    this.deckStacks.push(stack);
    return stack;
  }

  // 抽牌效果:一張卡背從牌庫飛向抽牌者所在城市並旋轉淡出
  fxDraw(toId) {
    if (!this.deckPos) return;
    const pb = this._regionPos(toId); if (!pb) return;
    const a = new THREE.Vector3(this.deckPos.x, 0.95, this.deckPos.z);
    const b = pb.clone().setY(0.7);
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = 1.8 + a.distanceTo(b) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const g = new THREE.Group();
    const card = this._makeCardMesh(0.5, 0.03, 0.7, makeCardBackTexture());
    g.add(card);
    const _p = new THREE.Vector3();
    this._registerFx(g, 1.1, age => {
      const u = smooth(Math.min(1, age / 0.82));
      curve.getPointAt(u, _p); card.position.copy(_p);
      card.rotation.y = age * 14; card.rotation.x = Math.sin(age * 7) * 0.5;
      const op = age > 0.82 ? Math.max(0, (1 - age) / 0.18) : 1;
      for (const m of card.material) m.opacity = op;
    });
  }

  _buildStars() {
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 160;
      pos[i * 3 + 1] = 10 + Math.random() * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x88ccff, size: 0.18, transparent: true, opacity: 0.8,
    }));
    this.scene.add(this.stars);
  }

  // ---------- 地形:山林 / 平原 / 小島(決定性散布,InstancedMesh 省 draw call)----------
  // 氣候帶:z 負=北寒、z 正=南熱;中東阿拉伯半島與澳洲內陸=沙漠
  _biomeOf(x, z) {
    if (x < -13 && z >= 3.5 && z <= 8.5) return 'desert';  // 阿拉伯半島
    if (x > -6 && x < 1.2 && z > 8.5) return 'desert';     // 澳洲內陸
    if (z < -4.5) return 'cold';
    if (z > 4.5) return 'tropical';
    return 'temperate';
  }

  _buildTerrain() {
    const rand = mulberry32(0x7e44a1);
    const nearCity = (x, z, d) => REGIONS.some(r => (r.x - x) ** 2 + (r.z - z) ** 2 < d * d);
    const trees = [], mtns = [], cacti = [], dunes = [];
    for (const land of LANDMASSES) {
      const xs = land.pts.map(p => p[0]), zs = land.pts.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const tries = Math.floor((maxX - minX) * (maxZ - minZ) * 3.2);
      for (let i = 0; i < tries; i++) {
        const x = minX + rand() * (maxX - minX), z = minZ + rand() * (maxZ - minZ);
        if (!pointInPolygon(x, z, land.pts) || nearCity(x, z, 2.4)) continue;
        const roll = rand(), b = this._biomeOf(x, z);
        const alt = Math.sin(x * 0.4) * Math.cos(z * 0.35); // 低頻雜訊 → 山脈成群
        if (b === 'desert') { // 沙漠:沙丘 + 仙人掌,無樹無雪
          if (roll < 0.2 && cacti.length < 90) cacti.push([x, z, 0.5 + rand() * 0.5, rand() * Math.PI]);
          else if (roll < 0.62 && dunes.length < 170) dunes.push([x, z, 0.6 + rand() * 1.0, rand() * Math.PI]);
          continue;
        }
        const mtnChance = b === 'cold' ? 0.6 : b === 'temperate' ? 0.5 : 0.28; // 寒帶多山、熱帶少
        if (alt > 0.45 && roll < mtnChance && mtns.length < 90) {
          const snow = b === 'cold' || (b === 'temperate' && rand() < 0.5); // 高緯才有雪冠
          mtns.push([x, z, 0.7 + rand() * 1.1, rand() * Math.PI, snow]);
        } else if (roll < 0.74 && trees.length < 360) {
          trees.push([x, z, 0.5 + rand() * 0.6, rand() * Math.PI, rand(), b]);
        }
      }
    }
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const addInst = m => { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; this.scene.add(m); };

    // 森林(錐;依氣候帶上色:寒=墨綠、溫=草綠、熱=亮翠且高瘦如棕櫚)
    const treeMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.13, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.0, roughness: 1.0, flatShading: true }),
      trees.length);
    trees.forEach(([x, z, s, r, h, b], i) => {
      const sy = b === 'tropical' ? s * 1.5 : s, sx = b === 'tropical' ? s * 0.7 : s;
      dummy.position.set(x, TERRAIN_Y + 0.2 * sy, z); dummy.rotation.set(0, r, 0);
      dummy.scale.set(sx, sy, sx); dummy.updateMatrix(); treeMesh.setMatrixAt(i, dummy.matrix);
      const hue = b === 'tropical' ? 0.30 : b === 'cold' ? 0.42 : 0.34;
      const lit = b === 'tropical' ? 0.40 : b === 'cold' ? 0.26 : 0.34;
      col.setHSL(hue, b === 'cold' ? 0.45 : 0.6, lit + h * 0.14); treeMesh.setColorAt(i, col);
    });
    if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
    addInst(treeMesh);

    // 仙人掌(沙漠)
    const cactusMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x3f7d4a, metalness: 0.0, roughness: 1.0, flatShading: true }),
      cacti.length);
    cacti.forEach(([x, z, s, r], i) => {
      dummy.position.set(x, TERRAIN_Y + 0.25 * s, z); dummy.rotation.set(0, r, 0); dummy.scale.setScalar(s);
      dummy.updateMatrix(); cactusMesh.setMatrixAt(i, dummy.matrix);
    });
    addInst(cactusMesh);

    // 沙丘(低矮寬錐,沙色)
    const duneMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.6, 0.3, 7),
      new THREE.MeshStandardMaterial({ color: 0xcdb27a, metalness: 0.0, roughness: 1.0, flatShading: true }),
      dunes.length);
    dunes.forEach(([x, z, s, r], i) => {
      dummy.position.set(x, TERRAIN_Y + 0.12 * s, z); dummy.rotation.set(0, r, 0); dummy.scale.set(s, s * 0.5, s);
      dummy.updateMatrix(); duneMesh.setMatrixAt(i, dummy.matrix);
    });
    addInst(duneMesh);

    // 山(岩錐)+ 雪冠(只給寒/高緯的山)
    const snowy = mtns.filter(m => m[4]);
    const mtnMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.5, 1.0, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b7689, metalness: 0.0, roughness: 1.0, flatShading: true }),
      mtns.length);
    const capMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.24, 0.44, 6),
      new THREE.MeshStandardMaterial({ color: 0xeef6ff, metalness: 0.0, roughness: 1.0, flatShading: true }),
      snowy.length);
    mtns.forEach(([x, z, s, r], i) => {
      dummy.position.set(x, TERRAIN_Y + 0.5 * s, z); dummy.rotation.set(0, r, 0); dummy.scale.setScalar(s);
      dummy.updateMatrix(); mtnMesh.setMatrixAt(i, dummy.matrix);
    });
    snowy.forEach(([x, z, s, r], i) => {
      dummy.position.set(x, TERRAIN_Y + 0.78 * s, z); dummy.rotation.set(0, r, 0); dummy.scale.setScalar(s);
      dummy.updateMatrix(); capMesh.setMatrixAt(i, dummy.matrix);
    });
    addInst(mtnMesh); addInst(capMesh);

    // 既有裝飾島加小丘 + 額外散布太平洋小島
    const islMat = new THREE.MeshStandardMaterial({ color: 0x2f4636, metalness: 0.0, roughness: 1.0, flatShading: true });
    for (const isl of DECOR_ISLANDS) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(isl.r * 0.8, isl.r * 0.9, 7), islMat);
      hill.position.set(isl.x, -0.18 + isl.r * 0.45, isl.z); this.scene.add(hill);
    }
    let placed = 0, guard = 0;
    while (placed < 12 && guard++ < 500) {
      const x = -26 + rand() * 42, z = -16 + rand() * 30, r = 0.3 + rand() * 0.5;
      if (LANDMASSES.some(l => pointInPolygon(x, z, l.pts)) || nearCity(x, z, 2.4)) continue;
      if (DECOR_ISLANDS.some(d => (d.x - x) ** 2 + (d.z - z) ** 2 < 4)) continue;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.25, 0.16, 9), islMat);
      disc.position.set(x, -0.3, z); this.scene.add(disc);
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r * 0.7, r * 0.8, 7), islMat);
      hill.position.set(x, -0.2 + r * 0.4, z); this.scene.add(hill);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.15, 0.012, 6, 20),
        new THREE.MeshBasicMaterial({ color: 0x1e6090, transparent: true, opacity: 0.5 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(x, -0.2, z); this.scene.add(ring);
      placed++;
    }
  }

  // ---------- 天氣系統:雨 / 雪 / 雲 / 閃電 / 漏斗(颱風·龍捲)----------
  _buildWeather() {
    const soft = makeSoftTexture();

    // 雨(線段,帶風向傾斜)
    this.rainN = 1700;
    this.rainX = new Float32Array(this.rainN);
    this.rainY = new Float32Array(this.rainN);
    this.rainZ = new Float32Array(this.rainN);
    for (let i = 0; i < this.rainN; i++) {
      this.rainX[i] = (Math.random() - 0.5) * 90;
      this.rainY[i] = Math.random() * 28;
      this.rainZ[i] = (Math.random() - 0.5) * 80;
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.rainN * 6), 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0 });
    this.rain = new THREE.LineSegments(rgeo, this.rainMat);
    this.rain.frustumCulled = false; this.rain.visible = false;
    this.scene.add(this.rain);

    // 雪(柔邊點)
    this.snowN = 1100;
    this.snowX = new Float32Array(this.snowN);
    this.snowY = new Float32Array(this.snowN);
    this.snowZ = new Float32Array(this.snowN);
    for (let i = 0; i < this.snowN; i++) {
      this.snowX[i] = (Math.random() - 0.5) * 90;
      this.snowY[i] = Math.random() * 26;
      this.snowZ[i] = (Math.random() - 0.5) * 80;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.snowN * 3), 3));
    this.snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.34, map: soft, transparent: true, opacity: 0, depthWrite: false });
    this.snow = new THREE.Points(sgeo, this.snowMat);
    this.snow.frustumCulled = false; this.snow.visible = false;
    this.scene.add(this.snow);

    // 季節落物(春櫻花瓣 / 秋落葉):柔邊點,飄落 + 風漂 + 旋擺;季節切換改色與可見
    this.leafN = 360;
    this.leafX = new Float32Array(this.leafN); this.leafY = new Float32Array(this.leafN); this.leafZ = new Float32Array(this.leafN);
    for (let i = 0; i < this.leafN; i++) {
      this.leafX[i] = (Math.random() - 0.5) * 86; this.leafY[i] = Math.random() * 22; this.leafZ[i] = (Math.random() - 0.5) * 76;
    }
    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.leafN * 3), 3));
    this.leafMat = new THREE.PointsMaterial({ color: 0xffc8e0, size: 0.32, map: soft, transparent: true, opacity: 0, depthWrite: false });
    this.leaves = new THREE.Points(lgeo, this.leafMat);
    this.leaves.frustumCulled = false; this.leaves.visible = false;
    this.scene.add(this.leaves);
    this.seasonKey = 1; this._seasonQ = 0; this._seasonFall = null; this._seasonBadge = '🌸春';

    // 雲層(高空 sprite,隨風飄)
    this.clouds = new THREE.Group(); this.cloudSprites = [];
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.SpriteMaterial({ map: soft, transparent: true, opacity: 0, depthWrite: false, color: 0x9fb0c8 });
      const s = new THREE.Sprite(mat);
      s.position.set((Math.random() - 0.5) * 86, 12 + Math.random() * 8, (Math.random() - 0.5) * 76);
      const sc = 7 + Math.random() * 9; s.scale.set(sc, sc * 0.62, 1);
      s.userData = { speed: 0.4 + Math.random() * 0.7, alpha: 0.7 + Math.random() * 0.5 };
      this.clouds.add(s); this.cloudSprites.push(s);
    }
    this.scene.add(this.clouds);

    // 閃電(打雷時瞬間點亮)
    this.lightning = new THREE.PointLight(0xcfe0ff, 0, 140);
    this.lightning.position.set(0, 26, 0);
    this.scene.add(this.lightning);
    this._strikeT = 1;

    // 漏斗(颱風=高空寬旋臂 / 龍捲=觸地窄漏斗)
    this.funnel = new THREE.Group();
    const FN = 520, fpos = new Float32Array(FN * 3);
    for (let i = 0; i < FN; i++) {
      const f = i / FN, radius = 0.35 + f * 3.0, ang = f * Math.PI * 16 + (Math.random() - 0.5) * 0.4;
      fpos[i * 3] = Math.cos(ang) * radius * (0.85 + Math.random() * 0.3);
      fpos[i * 3 + 1] = f * 9.0;
      fpos[i * 3 + 2] = Math.sin(ang) * radius * (0.85 + Math.random() * 0.3);
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    this.funnelPtsMat = new THREE.PointsMaterial({ color: 0xb9c4d6, size: 0.22, map: soft, transparent: true, opacity: 0, depthWrite: false });
    const fpts = new THREE.Points(fgeo, this.funnelPtsMat); fpts.frustumCulled = false;
    this.funnel.add(fpts);
    this.funnelShellMat = new THREE.MeshBasicMaterial({ color: 0x8895a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const shell = new THREE.Mesh(new THREE.ConeGeometry(3.2, 9, 18, 1, true), this.funnelShellMat);
    shell.position.y = 4.5; shell.rotation.x = Math.PI; // 寬口朝上
    this.funnel.add(shell);
    this.funnel.visible = false;
    this.scene.add(this.funnel);
    this._funnelPhase = 0;

    // 天氣狀態(初始晴天,_pickWeather 會排程第一次切換)
    this.wxToKey = 'clear';
    this.wxTo = WEATHER.clear;
    this.wxFrom = { ...WEATHER.clear };
    this.wxLive = {};
    for (const f of WX_FIELDS) this.wxLive[f] = WEATHER.clear[f];
    this.wxBlend = 1;
    this.wxHold = 8;
    this.wxFromColor = new THREE.Color(WEATHER.clear.bg);
    this.wxToColor = new THREE.Color(WEATHER.clear.bg);
    this._tmpColor = new THREE.Color();
    this.wxWindDir = { x: 1, z: 0 };
  }

  _initWeatherBadge() {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:10px;left:12px;padding:4px 11px;border-radius:14px;'
      + 'background:rgba(6,10,20,0.55);border:1px solid rgba(0,240,255,0.5);color:#eaffff;'
      + 'font:600 15px/1.4 "Microsoft JhengHei",sans-serif;letter-spacing:1px;pointer-events:none;'
      + 'z-index:5;text-shadow:0 0 8px rgba(0,240,255,0.6);box-shadow:0 0 12px rgba(0,240,255,0.25)';
    if (getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
    this.container.appendChild(el);
    this.wxBadge = el;
  }

  /** 切換天氣(immediate=true 立即套用,否則平滑過渡)。公開:未來可由遊戲事件呼叫。 */
  setWeather(key, immediate = false) {
    if (!WEATHER[key]) return;
    this.wxFrom = immediate ? { ...WEATHER[key] } : { ...this.wxLive };
    this.wxFromColor.copy(immediate ? this._tmpColor.set(WEATHER[key].bg) : this.scene.background);
    this.wxToKey = key; this.wxTo = WEATHER[key]; this.wxToColor.set(WEATHER[key].bg);
    this.wxBlend = immediate ? 1 : 0;
    this.wxHold = 24 + Math.random() * 20;
    const ang = Math.random() * Math.PI * 2;
    this.wxWindDir = { x: Math.cos(ang), z: Math.sin(ang) };
    if (this.wxBadge) this.wxBadge.innerHTML = `${this._seasonBadge ? this._seasonBadge + ' · ' : ''}${WEATHER[key].icon} ${WEATHER[key].name}`;
  }

  _pickWeather() {
    const pool = (SEASONS[this.seasonKey] && SEASONS[this.seasonKey].weights) || WEATHER_WEIGHTS;
    let key;
    do { key = weightedPick(pool); } while (key === this.wxToKey && Math.random() < 0.6);
    this.setWeather(key, false);
  }

  /** 依回合季別(Q1春/Q2夏/Q3秋/Q4冬)切換當季氣候池與招牌落物;季別不變則略過。 */
  _applySeason(round) {
    const q = ((round - 1) % (RULES.seasonsPerYear || 4)) + 1;
    if (q === this._seasonQ) return;
    this._seasonQ = q;
    const se = SEASONS[q] || SEASONS[1];
    this.seasonKey = q;
    this._seasonFall = se.fall;
    this._seasonBadge = `${se.icon}${se.name}`;
    if (this.leaves) {
      this.leaves.visible = !!se.fall;
      if (se.fall) this.leafMat.color.setHex(SEASON_FALL_COLOR[se.fall]);
    }
    this._pickWeather(); // 立即抽當季天氣(平滑過渡)
  }

  _updateWeather(dt) {
    const t = this._elapsed || 0;
    if (this.wxBlend < 1) this.wxBlend = Math.min(1, this.wxBlend + dt / WX_BLEND_DUR);
    else { this.wxHold -= dt; if (this.wxHold <= 0) this._pickWeather(); }
    const k = smooth(this.wxBlend), L = this.wxLive;
    for (const f of WX_FIELDS) L[f] = lerp(this.wxFrom[f], this.wxTo[f], k);

    // 氛圍:背景 / 霧 / 光照
    this._tmpColor.copy(this.wxFromColor).lerp(this.wxToColor, k);
    this.scene.background.copy(this._tmpColor);
    this.scene.fog.color.copy(this._tmpColor);
    this.scene.fog.near = L.fogNear; this.scene.fog.far = L.fogFar;
    this.ambient.intensity = L.amb; this.dirLight.intensity = L.light;

    // 雨
    this.rain.visible = L.rain > 0.02;
    if (this.rain.visible) {
      const fall = 20 + L.wind * 16, wx = this.wxWindDir.x * L.wind * 7, wz = this.wxWindDir.z * L.wind * 7;
      const tx = this.wxWindDir.x * L.wind * 0.5, tz = this.wxWindDir.z * L.wind * 0.5;
      const arr = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < this.rainN; i++) {
        let y = this.rainY[i] - fall * dt, x = this.rainX[i] + wx * dt, z = this.rainZ[i] + wz * dt;
        if (y < 0) { y = 24 + Math.random() * 6; x = (Math.random() - 0.5) * 90; z = (Math.random() - 0.5) * 80; }
        else { if (x > 45) x -= 90; else if (x < -45) x += 90; if (z > 40) z -= 80; else if (z < -40) z += 80; }
        this.rainX[i] = x; this.rainY[i] = y; this.rainZ[i] = z;
        const b = i * 6;
        arr[b] = x; arr[b + 1] = y; arr[b + 2] = z;
        arr[b + 3] = x - tx; arr[b + 4] = y - 0.7; arr[b + 5] = z - tz;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    this.rainMat.opacity = L.rain * 0.55;

    // 雪
    this.snow.visible = L.snow > 0.02;
    if (this.snow.visible) {
      const fall = 2.5 + L.wind * 3;
      const arr = this.snow.geometry.attributes.position.array;
      for (let i = 0; i < this.snowN; i++) {
        let y = this.snowY[i] - fall * dt;
        let x = this.snowX[i] + (Math.sin(t * 0.8 + i) * 0.3 + this.wxWindDir.x * L.wind * 4) * dt;
        let z = this.snowZ[i] + (Math.cos(t * 0.7 + i) * 0.3 + this.wxWindDir.z * L.wind * 4) * dt;
        if (y < 0) { y = 22 + Math.random() * 6; x = (Math.random() - 0.5) * 90; z = (Math.random() - 0.5) * 80; }
        else { if (x > 45) x -= 90; else if (x < -45) x += 90; if (z > 40) z -= 80; else if (z < -40) z += 80; }
        this.snowX[i] = x; this.snowY[i] = y; this.snowZ[i] = z;
        const b = i * 3; arr[b] = x; arr[b + 1] = y; arr[b + 2] = z;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
    this.snowMat.opacity = L.snow * 0.9;

    // 雲(飄動 + 依光照轉暗成烏雲)
    const cTone = 0.35 + L.light * 0.4;
    for (const s of this.cloudSprites) {
      s.position.x += this.wxWindDir.x * (0.3 + L.wind * 2) * s.userData.speed * dt;
      s.position.z += this.wxWindDir.z * (0.3 + L.wind * 2) * s.userData.speed * dt;
      if (s.position.x > 48) s.position.x -= 96; else if (s.position.x < -48) s.position.x += 96;
      if (s.position.z > 42) s.position.z -= 84; else if (s.position.z < -42) s.position.z += 84;
      s.material.opacity = L.cloud * 0.5 * s.userData.alpha;
      s.material.color.setRGB(cTone, cTone, cTone * 1.05);
    }

    // 閃電
    if (L.flash > 0.04) {
      this._strikeT -= dt;
      if (this._strikeT <= 0) {
        this.lightning.intensity = 250 + 500 * L.flash;
        this.lightning.position.set((Math.random() - 0.5) * 36, 24, (Math.random() - 0.5) * 32);
        this._strikeT = 0.4 + Math.random() * (3.5 - 3 * L.flash);
      }
    }
    this.lightning.intensity *= Math.exp(-dt * 8);
    if (this.lightning.intensity < 0.5) this.lightning.intensity = 0;

    // 漏斗
    this.funnel.visible = L.funnel > 0.02;
    if (this.funnel.visible) {
      this.funnel.rotation.y += dt * (3 + L.wind * 6);
      this.funnelPtsMat.opacity = L.funnel * 0.85;
      this.funnelShellMat.opacity = L.funnel * 0.16;
      const gy = L.funnelGround, wide = lerp(1.5, 0.85, gy);
      this._funnelPhase += dt * 0.12;
      this.funnel.position.set(
        Math.cos(this._funnelPhase) * 9 + this.wxWindDir.x * 3,
        lerp(6.5, 0.2, gy),
        Math.sin(this._funnelPhase * 0.8) * 7 + this.wxWindDir.z * 3);
      this.funnel.scale.set(wide, lerp(0.85, 1.15, gy), wide);
    }

    // 季節落物(春櫻花瓣 / 秋落葉):淡入淡出 + 飄落 + 風漂 + 旋擺
    const leafTarget = this._seasonFall ? 0.6 : 0;
    this.leafMat.opacity += (leafTarget - this.leafMat.opacity) * Math.min(1, dt * 2);
    this.leaves.visible = this.leafMat.opacity > 0.01;
    if (this.leaves.visible) {
      const fall = 1.6 + L.wind * 2;
      const arr = this.leaves.geometry.attributes.position.array;
      for (let i = 0; i < this.leafN; i++) {
        let y = this.leafY[i] - fall * dt;
        let x = this.leafX[i] + (Math.sin(t * 0.9 + i) * 0.5 + this.wxWindDir.x * (0.5 + L.wind * 3)) * dt;
        let z = this.leafZ[i] + (Math.cos(t * 0.8 + i) * 0.5 + this.wxWindDir.z * (0.5 + L.wind * 3)) * dt;
        if (y < 0) { y = 18 + Math.random() * 6; x = (Math.random() - 0.5) * 86; z = (Math.random() - 0.5) * 76; }
        else { if (x > 44) x -= 88; else if (x < -44) x += 88; if (z > 40) z -= 76; else if (z < -40) z += 76; }
        this.leafX[i] = x; this.leafY[i] = y; this.leafZ[i] = z;
        const b = i * 3; arr[b] = x; arr[b + 1] = y; arr[b + 2] = z;
      }
      this.leaves.geometry.attributes.position.needsUpdate = true;
    }
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // 棋子在最上層,先測棋子(點擊查看玩家/角色);找出被點到的棋子 root
    if (this.onPawnClick && this.pawnGroup.children.length) {
      const phits = this.raycaster.intersectObjects(this.pawnGroup.children, true);
      if (phits.length) {
        let o = phits[0].object;
        while (o && o.parent !== this.pawnGroup) o = o.parent;
        if (o && o.userData.charId) { this.onPawnClick(o.userData.charId, o.userData.regionId); return; }
      }
    }
    const hits = this.raycaster.intersectObjects(Object.values(this.regionMeshes));
    if (hits.length > 0) this.onRegionClick(hits[0].object.userData.regionId);
  }

  // ---------- 依伺服器狀態重繪 ----------
  sync(state) {
    // 季節天氣:依回合季別(Q1春/Q2夏/Q3秋/Q4冬)切換當季氣候池
    this._applySeason(state.round);

    // 三疊牌庫:卡背堆疊高度約略反映各自剩餘牌量(max 取歷史最大,容量隨升階回庫成長)
    for (const st of this.deckStacks || []) {
      const cnt = state[st.countKey];
      if (cnt === undefined) continue;
      st.max = Math.max(st.max ?? 1, cnt);
      const frac = Math.max(0, Math.min(1, cnt / st.max));
      const show = cnt <= 0 ? 0 : Math.max(1, Math.round(frac * st.cards.length));
      st.cards.forEach((c, i) => { c.visible = i < show; });
    }

    // 城市等級變動 → 重建該城(地標長高 + 天際線增棟);首次同步不放升級煙火
    for (const rid in state.regions) {
      const lv = state.regions[rid].level;
      if (this.cityLevels[rid] !== undefined && lv !== this.cityLevels[rid]) {
        this._rebuildCity(rid, lv);
        if (this._synced) this.fxUpgrade(rid);
      }
    }
    this._synced = true;

    // 科技卡 → 城市出現對應類別的建築(高度隨階級,陣營色 + 類別色點綴)
    disposeGroup(this.nodeGroup);
    this.nodeGroup.clear();
    const prevFlagSeen = this._flagSeen;   // 上次已有的旗幟(undefined=首次同步,不播升起)
    const flagSeenNow = new Set();
    this.flagCloths = [];
    const slotOffsets = [[-0.75, -0.55], [0.75, -0.55], [-0.75, 0.75], [0.75, 0.75]];
    for (const rid in state.regions) {
      const r = state.regions[rid];
      const rDef = REGIONS.find(x => x.id === rid);
      const ts = (this.tileR[rid] || 1.55) / 1.55; // 依卡格縮放,不出格
      r.cards.forEach((card, si) => {
        const owner = state.players.find(p => p.id === card.owner);
        const facHex = FACTIONS[owner.faction].color;
        const catHex = new THREE.Color(TECH_CATEGORIES[card.cat].css).getHex();
        const [ox, oz] = slotOffsets[si % 4];
        const build = (TECH_BUILDERS[card.cat] || TECH_BUILDERS.info)(facHex, card.tier, catHex);
        build.position.set(rDef.x + ox * ts, 0.27, rDef.z + oz * ts);
        build.rotation.y = si * 0.5;
        build.scale.setScalar(ts);
        this.nodeGroup.add(build);

        // 公司旗幟:於該卡建築旁升起角色的公司旗(新建造時播放升起動畫)
        const fkey = rid + ':' + owner.charId;
        flagSeenNow.add(fkey);
        const flag = makeCompanyFlag(owner.charId, facHex);
        // 旗幟放大到旗布寬約 0.94(玩家頭像 1.5 的 ~2/3),讓所有玩家一眼看出哪家公司進駐
        const fullScale = ts * 1.7;
        flag.position.set(rDef.x + ox * ts * 1.05, 0.27, rDef.z + oz * ts * 1.05);
        if (prevFlagSeen && !prevFlagSeen.has(fkey)) { flag.scale.setScalar(0.001); flag.userData.riseT = 0; }
        else flag.scale.setScalar(fullScale);
        flag.userData.fullScale = fullScale;
        flag.userData.root = flag;
        flag.userData.phase = si * 1.3 + rid.length;
        this.nodeGroup.add(flag);
        this.flagCloths.push(flag.userData);
      });
      this.blockedRings[rid].visible = r.fakeUntilRound > state.round;
    }
    this._flagSeen = flagSeenNow;

    // 棋子:每個角色一座惡搞特徵剪影,陣營色,當前回合者加大動作
    disposeGroup(this.pawnGroup);
    this.pawnGroup.clear();
    const PAWN_BASE_Y = 0.3;
    const byRegion = {};
    state.players.forEach(p => { (byRegion[p.pos] = byRegion[p.pos] || []).push(p); });
    for (const rid in byRegion) {
      const rDef = REGIONS.find(x => x.id === rid);
      const ringR = Math.max(0.6, (this.tileR[rid] || 1.55) * 0.85); // 棋子環依卡格大小,不浮出海
      const ps = byRegion[rid];
      ps.forEach((p, i) => {
        const angle = (i / ps.length) * Math.PI * 2 + 0.6;
        const tx = rDef.x + Math.cos(angle) * ringR, tz = rDef.z + Math.sin(angle) * ringR;
        const color = FACTIONS[p.faction].color;
        const facCss = FACTIONS[p.faction].css;
        const builder = PAWN_BUILDERS[p.charId] || PAWN_BUILDERS._default;
        const pawn = buildModel('pawn:' + p.charId, () => builder(color), { fit: 1.6 });
        pawn.position.set(tx, PAWN_BASE_Y, tz);
        pawn.rotation.y = -angle + Math.PI; // 面向城市中心
        pawn.userData.baseY = PAWN_BASE_Y;

        // 玩家標記:頭頂 Q 版圓形頭像 + 名牌(垂直堆疊、置中對齊、互不遮擋;永遠面向鏡頭不被建築擋)
        const isMe = this.myCharId && this.myCharId !== '*' && p.charId === this.myCharId;
        const av = new THREE.Sprite(new THREE.SpriteMaterial({ map: avatarTexture(p.charId), transparent: true, depthTest: false, depthWrite: false, fog: false }));
        const avS = isMe ? 1.85 : 1.5;
        av.center.set(0.5, 0.5); av.scale.set(avS, avS, 1);
        av.position.set(0, 4.15, 0); av.renderOrder = 12; pawn.add(av);                         // 上:圓形頭像(置中)
        const tag = makeNameTag((p.isAI ? '🤖 ' : '') + p.name + (isMe ? '(你)' : ''), isMe ? '#ffd02e' : facCss, isMe ? 0.65 : 0.55);
        tag.center.set(0.5, 0.5); tag.position.set(0, 2.7, 0); tag.renderOrder = 14; pawn.add(tag); // 下:ID 名牌(與頭像共用 x=0 → 左右對齊)
        pawn.userData.marker = av;
        // 腳下陣營色光環(看得出棋子落點)
        const disc = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 32),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; pawn.add(disc);
        pawn.userData.disc = disc;
        // 當前回合者:陣營色光柱 + 頭頂指示標
        if (p.id === state.turnIdx && !state.over) {
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 5, 18, 1, true),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
          beam.position.y = 2.5; pawn.add(beam);
          pawn.userData.beam = beam;
          const arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🔻'), transparent: true, depthTest: false, depthWrite: false, fog: false }));
          arrow.scale.set(0.9, 0.9, 1); arrow.position.y = 5.5; arrow.renderOrder = 13; pawn.add(arrow);
          pawn.userData.arrow = arrow;
        }
        pawn.userData.phase = i * 1.7 + rid.length;
        pawn.userData.charId = p.charId;
        pawn.userData.regionId = rid;
        pawn.userData.tx = tx; pawn.userData.tz = tz;
        pawn.userData.faceY = -angle + Math.PI;
        pawn.userData.active = p.id === state.turnIdx && !state.over;
        pawn.userData.anim = pawn.userData.anim || [];
        // 移動動畫:此角色上次在別座城市 → 從舊城弧線滑過來(跳躍弧線)
        const prev = this.pawnPrevPos[p.charId];
        if (prev && prev !== rid) {
          const pr = REGIONS.find(x => x.id === prev);
          if (pr) { pawn.userData.fromX = pr.x; pawn.userData.fromZ = pr.z; pawn.userData.moveT = 0; pawn.userData.moveDur = 0.9; }
        }
        // 隱形 hitbox:棋子小,放大點擊命中範圍(walk-up 會讀到 root 的 charId)
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.7, 8),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hit.position.y = 0.85; hit.userData.isHitbox = true; pawn.add(hit);
        this.pawnGroup.add(pawn);
      });
    }
    // 記錄本次各角色位置,供下次同步判斷是否移動
    state.players.forEach(p => { this.pawnPrevPos[p.charId] = p.pos; });
  }

  // 城市升級光環:綠色擴散環 + ⬆️
  fxUpgrade(regionId) {
    const p = this._regionPos(regionId); if (!p) return;
    const g = new THREE.Group(); g.position.copy(p);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.78, 36),
      new THREE.MeshBasicMaterial({ color: 0x2eff8f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    const emo = this._floatEmoji(g, '⬆️');
    this._registerFx(g, 1.3, age => {
      const e = 1 - age;
      ring.scale.setScalar(0.5 + age * 2.6); ring.material.opacity = 0.9 * e;
      emo(age);
    });
  }

  highlight(regionIds) { this.highlighted = new Set(regionIds); }

  // 動作提示文字:在行動發生的城市上方浮現「誰做了什麼」,升起後淡出(永遠可見)
  fxLabel(regionId, text, css = '#00f0ff') {
    const p = this._regionPos(regionId); if (!p) return;
    const g = new THREE.Group(); g.position.copy(p);
    const spr = makeFxText(text, css); spr.position.y = 3.0; g.add(spr);
    this._registerFx(g, 2.4, age => {
      spr.position.y = 3.0 + age * 2.6;
      spr.material.opacity = age < 0.65 ? 1 : Math.max(0, 1 - (age - 0.65) / 0.35);
      const s = 0.6 + Math.min(1, age * 5) * 0.4;
      spr.scale.set(5.2 * s, 1.3 * s, 1);
    });
  }

  // ---------- 短命視覺特效:建造 / 作戰 / 移動 ----------
  _regionPos(id) {
    const r = REGIONS.find(x => x.id === id);
    return r ? new THREE.Vector3(r.x, 0.3, r.z) : null;
  }

  _registerFx(g, life, update) {
    this.fxGroup.add(g);
    this.fxItems.push({ t0: this._elapsed || 0, life, update, dispose: () => { this.fxGroup.remove(g); disposeFx(g); } });
  }

  // 浮起並淡出的表情符號(回傳每幀更新函式)
  _floatEmoji(g, ch) {
    const spr = makeEmojiSprite(ch); spr.position.y = 1.0; spr.scale.set(0.01, 0.01, 1); g.add(spr);
    return age => {
      const s = Math.sin(Math.min(age * 3, Math.PI)) * 1.3 + 0.01;
      spr.scale.set(s, s, 1); spr.position.y = 1.0 + age * 1.8; spr.material.opacity = 1 - age * age;
    };
  }

  // 科技卡部署:類別色地面環 + 上升光柱 + 火花,再加「對應卡片類別」的專屬收尾特效
  fxBuild(regionId, cat = 'info', catCss = '#00f0ff', emoji = '🏗️') {
    const p = this._regionPos(regionId); if (!p) return;
    const g = new THREE.Group(); g.position.copy(p);
    const col = new THREE.Color(catCss);
    const basic = (o) => new THREE.MeshBasicMaterial(Object.assign({ color: col, transparent: true, depthWrite: false }, o));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 36), basic({ opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 3.2, 18, 1, true), basic({ opacity: 0.45, side: THREE.DoubleSide }));
    beam.position.y = 1.6; g.add(beam);
    const N = 36, pos = new Float32Array(N * 3), vel = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, rr = Math.random() * 0.5; pos[i*3]=Math.cos(a)*rr; pos[i*3+1]=Math.random()*0.4; pos[i*3+2]=Math.sin(a)*rr; vel[i]=1.6+Math.random()*2.4; }
    const pos0 = pos.slice();
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: col, size: 0.16, transparent: true, opacity: 1, depthWrite: false }));
    g.add(sparks);

    // ---- 類別專屬收尾(對應卡片)----
    let extra = null;
    if (cat === 'power') {            // 動力:火箭升空
      const rk = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 10), basic({ opacity: 1 }));
      rk.position.y = 0.2; g.add(rk);
      extra = age => { rk.position.y = 0.2 + age * 4; rk.material.opacity = 1 - age; };
    } else if (cat === 'hardware') {  // 硬體:旋轉上升的晶圓
      const wf = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20), basic({ opacity: 0.9, side: THREE.DoubleSide }));
      wf.position.y = 0.5; g.add(wf);
      extra = age => { wf.rotation.y = age * 12; wf.position.y = 0.5 + age * 1.6; wf.scale.setScalar(1 + age); wf.material.opacity = 0.9 * (1 - age); };
    } else if (cat === 'info') {      // 資訊:上升的資料方塊流
      const cubes = [];
      for (let i = 0; i < 6; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.9 }));
        c.position.set((Math.random() - 0.5) * 0.5, 0.2 + i * 0.15, (Math.random() - 0.5) * 0.5); g.add(c); cubes.push(c);
      }
      extra = age => cubes.forEach((c, i) => { c.position.y = 0.2 + i * 0.15 + age * 2.2; c.rotation.set(age * 4, age * 5, 0); c.material.opacity = 0.9 * (1 - age); });
    } else if (cat === 'ai') {        // AI:神經脈衝擴散環
      const rings = [];
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 32), basic({ opacity: 0.9 }));
        r.rotation.x = Math.PI / 2; r.position.y = 0.3 + i * 0.4; g.add(r); rings.push(r);
      }
      extra = age => rings.forEach((r, i) => { const a = Math.max(0, Math.min(1, (age - i * 0.12) / 0.7)); r.scale.setScalar(0.5 + a * 2.2); r.position.y = 0.3 + i * 0.4 + age * 0.5; r.material.opacity = 0.9 * (1 - a); });
    } else if (cat === 'fun') {       // 娛樂:彩紙噴發
      const M = 50, fp = new Float32Array(M * 3), fcol = new Float32Array(M * 3), fv = [];
      const pal = [0xff2bd6, 0x00f0ff, 0xffd02e, 0x2eff8f, 0x7b2bff], cc = new THREE.Color();
      for (let i = 0; i < M; i++) {
        fp[i*3] = 0; fp[i*3+1] = 0.3; fp[i*3+2] = 0;
        const a = Math.random() * 6.28, sp = 1.5 + Math.random() * 2.5; fv.push([Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp]);
        cc.setHex(pal[i % pal.length]); fcol[i*3] = cc.r; fcol[i*3+1] = cc.g; fcol[i*3+2] = cc.b;
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
      fg.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
      const conf = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 1, depthWrite: false }));
      g.add(conf);
      extra = age => { const a = fg.attributes.position.array, tt = age * 1.5; for (let i = 0; i < M; i++) { a[i*3] = fv[i][0]*tt; a[i*3+1] = 0.3 + fv[i][1]*tt - 4*tt*tt; a[i*3+2] = fv[i][2]*tt; } fg.attributes.position.needsUpdate = true; conf.material.opacity = 1 - age; };
    }

    const emo = this._floatEmoji(g, emoji);
    this._registerFx(g, 1.5, age => {
      const e = 1 - age;
      ring.scale.setScalar(0.4 + age * 2.4); ring.material.opacity = 0.9 * e;
      beam.scale.set(e, 1, e); beam.material.opacity = 0.45 * e; beam.rotation.y = age * 4;
      const a = sg.attributes.position.array;
      for (let i = 0; i < N; i++) a[i*3+1] = pos0[i*3+1] + vel[i] * age * 1.5;
      sg.attributes.position.needsUpdate = true; sparks.material.opacity = e;
      if (extra) extra(age);
      emo(age);
    });
  }

  // 間諜摧毀:閃光 + 衝擊波環 + 拋射碎片
  fxDestroy(regionId) {
    const p = this._regionPos(regionId); if (!p) return;
    const g = new THREE.Group(); g.position.copy(p);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb733, transparent: true, opacity: 1, depthWrite: false }));
    flash.position.y = 0.6; g.add(flash);
    const shock = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.55, 36),
      new THREE.MeshBasicMaterial({ color: 0xff5522, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    shock.rotation.x = -Math.PI / 2; shock.position.y = 0.05; g.add(shock);
    const N = 60, pos = new Float32Array(N*3), vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = Math.random()*6.28; pos[i*3]=0; pos[i*3+1]=0.6; pos[i*3+2]=0; vx[i]=Math.cos(a)*(1.5+Math.random()*2.5); vy[i]=1+Math.random()*3; vz[i]=Math.sin(a)*(1.5+Math.random()*2.5); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const debris = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xff8844, size: 0.18, transparent: true, opacity: 1, depthWrite: false }));
    g.add(debris);
    const emo = this._floatEmoji(g, '💥');
    this._registerFx(g, 1.3, age => {
      const e = 1 - age;
      flash.scale.setScalar(0.4 + age * 3); flash.material.opacity = e * 0.9;
      shock.scale.setScalar(0.4 + age * 3.6); shock.material.opacity = 0.9 * e;
      const a = sg.attributes.position.array, tt = age * 1.3;
      for (let i = 0; i < N; i++) { a[i*3] = vx[i]*tt; a[i*3+1] = 0.6 + vy[i]*tt - 4*tt*tt; a[i*3+2] = vz[i]*tt; }
      sg.attributes.position.needsUpdate = true; debris.material.opacity = e;
      emo(age);
    });
  }

  // 竊取情報:綠色資料環上升 + 旋轉線框立方體
  fxSteal(regionId) {
    const p = this._regionPos(regionId); if (!p) return;
    const g = new THREE.Group(); g.position.copy(p);
    const col = new THREE.Color(0x2eff8f);
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 32),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.2 + i * 0.5; g.add(ring); rings.push(ring);
    }
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.9 }));
    cube.position.y = 0.9; g.add(cube);
    const emo = this._floatEmoji(g, '🕵️');
    this._registerFx(g, 1.4, (age, t) => {
      const e = 1 - age;
      rings.forEach((r, i) => { r.rotation.z = t * (3 + i); r.position.y = 0.2 + i * 0.5 + age * 0.8; r.material.opacity = 0.9 * e; r.scale.setScalar(1 - age * 0.3); });
      cube.rotation.set(t * 2, t * 3, 0); cube.material.opacity = 0.9 * e;
      emo(age);
    });
  }

  // 假新聞:洋紅漣漪擴散 + 📰
  fxFake(regionId) {
    const p = this._regionPos(regionId); if (!p) return;
    const g = new THREE.Group(); g.position.copy(p);
    const col = new THREE.Color(NEON_PINK);
    const ripples = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 36),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.06; r.userData.delay = i * 0.22; g.add(r); ripples.push(r);
    }
    const emo = this._floatEmoji(g, '📰');
    this._registerFx(g, 1.5, age => {
      ripples.forEach(r => { const a = Math.max(0, Math.min(1, (age - r.userData.delay) / (1 - r.userData.delay))); r.scale.setScalar(0.3 + a * 3); r.material.opacity = 0.85 * (1 - a); });
      emo(age);
    });
  }

  // 移動:依交通工具沿曲線飛行 + 拖尾(plane 走高空弧線 / train 貼地 / ship 走海)
  fxMove(from, to, plane = false) {
    const pa = this._regionPos(from), pb = this._regionPos(to);
    if (!pa || !pb) return;
    const type = plane ? 'plane' : (EDGE_TYPES[`${from}|${to}`] || EDGE_TYPES[`${to}|${from}`] || 'ship');
    const style = TRAFFIC_STYLE[type];
    const dist = pa.distanceTo(pb);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y = type === 'plane' ? 2.5 + dist * 0.2 : type === 'train' ? 0.4 : 0.28;
    const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
    const g = new THREE.Group();
    const tgeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    const trail = new THREE.Line(tgeo, new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: 0.85 }));
    trail.geometry.setDrawRange(0, 1); g.add(trail);
    const icon = type === 'plane' ? '✈️' : type === 'train' ? '🚄' : '🚢';
    const veh = makeEmojiSprite(icon); veh.scale.set(1.3, 1.3, 1); g.add(veh);
    const life = Math.min(2.2, 1.0 + dist * 0.07);
    const _p = new THREE.Vector3();
    this._registerFx(g, life, age => {
      const u = Math.min(1, age);
      curve.getPointAt(u, _p); veh.position.copy(_p);
      const fade = age > 0.85 ? (1 - age) / 0.15 : 1;
      veh.material.opacity = fade;
      trail.geometry.setDrawRange(0, Math.max(1, Math.floor(u * 48) + 1));
      trail.material.opacity = 0.85 * (1 - age * 0.4) * fade;
    });
  }

  // 施法者光環:腳下擴散環 + 升起光柱 + 符文(誰在施展一眼可見;AI/玩家同步播放)
  fxCast(regionId, css = '#00f0ff', emoji = '✨') {
    const p = this._regionPos(regionId); if (!p) return;
    const g = new THREE.Group(); g.position.copy(p);
    const col = new THREE.Color(css);
    const rings = [];
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 36),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.05; r.userData.delay = i * 0.18; g.add(r); rings.push(r);
    }
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 2.4, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    pillar.position.y = 1.2; g.add(pillar);
    const emo = this._floatEmoji(g, emoji);
    this._registerFx(g, 1.1, age => {
      rings.forEach(r => {
        const a = Math.max(0, Math.min(1, (age - r.userData.delay) / (1 - r.userData.delay)));
        r.scale.setScalar(0.5 + a * 2.2); r.material.opacity = 0.9 * (1 - a);
      });
      pillar.scale.set(1 - age, 1, 1 - age); pillar.material.opacity = 0.4 * (1 - age); pillar.rotation.y = age * 5;
      emo(age);
    });
  }

  // 施法連線:從施法者城市射出能量弧線到目標城市(看清楚誰打誰)
  fxBeam(fromId, toId, css = '#ff2bd6') {
    const pa = this._regionPos(fromId), pb = this._regionPos(toId);
    if (!pa || !pb || fromId === toId) return;
    const col = new THREE.Color(css);
    const g = new THREE.Group();
    const a = pa.clone().setY(0.55), b = pb.clone().setY(0.55);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y = 1.0 + a.distanceTo(b) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
    g.add(line);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, depthWrite: false }));
    g.add(head);
    const _p = new THREE.Vector3();
    this._registerFx(g, 0.8, age => {
      const u = Math.min(1, age / 0.6);
      curve.getPointAt(u, _p); head.position.copy(_p); head.scale.setScalar(1 + Math.sin(age * 22) * 0.2);
      line.material.opacity = 0.9 * (1 - Math.max(0, (age - 0.5) / 0.5));
      head.material.opacity = 1 - Math.max(0, (age - 0.6) / 0.4);
    });
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.05); // 夾住分頁切回時的大跳
    const t = (this._elapsed = (this._elapsed || 0) + dt);
    for (const rid in this.regionMeshes) {
      const m = this.regionMeshes[rid];
      if (this.highlighted.has(rid)) {
        m.material.emissive.setHex(0x2bd6ff);
        m.material.emissiveIntensity = 0.5 + Math.sin(t * 6) * 0.3;
      } else {
        m.material.emissive.setHex(m.userData.idleEmissive); // 待機:該城陣營色的暗化自發光
        m.material.emissiveIntensity = 1;
      }
    }
    for (const rid in this.blockedRings) {
      const ring = this.blockedRings[rid];
      if (ring.visible) ring.rotation.z = t * 1.5;
    }
    this.pawnGroup.children.forEach(p => {
      const ud = p.userData;
      const ph = ud.phase || 0;
      const baseY = ud.baseY || 0;
      // 移動中:沿弧線從舊城跳到新城,並面向移動方向(略過待機/active 動畫)
      if (ud.moveT !== undefined && ud.moveT < 1) {
        ud.moveT = Math.min(1, ud.moveT + dt / (ud.moveDur || 0.9));
        const k = smooth(ud.moveT);
        p.position.x = lerp(ud.fromX, ud.tx, k);
        p.position.z = lerp(ud.fromZ, ud.tz, k);
        p.position.y = baseY + Math.sin(Math.PI * ud.moveT) * 0.6;
        const dx = ud.tx - ud.fromX, dz = ud.tz - ud.fromZ;
        if (dx * dx + dz * dz > 1e-4) p.rotation.y = Math.atan2(dx, dz);
        if (ud.moveT >= 1) { p.position.set(ud.tx, baseY, ud.tz); p.rotation.y = ud.faceY ?? p.rotation.y; }
        return;
      }
      // 待機:輕浮動;當前回合者:明顯跳動 + 微旋身
      if (ud.active) {
        p.position.y = baseY + Math.abs(Math.sin(t * 3)) * 0.4;
        p.rotation.y = (ud.faceY ?? (ud.faceY = p.rotation.y)) + Math.sin(t * 2) * 0.25;
      } else {
        p.position.y = baseY + Math.sin(t * 1.6 + ph) * 0.035;
      }
      const boost = ud.active ? 1.9 : 1;
      for (const a of ud.anim || []) {
        const sp = (a.speed || 1) * boost;
        if (a.type === 'spin') a.mesh.rotation.y = t * sp;
        else if (a.type === 'spinz') a.mesh.rotation.z = t * sp;
        else if (a.type === 'rock') a.mesh.rotation.z = Math.sin(t * 2.2 * sp + ph) * (a.amp || 0.18);
        else if (a.type === 'bob') a.mesh.position.y = (a.y0 || 0) + Math.sin(t * 2 * sp + ph) * (a.amp || 0.04);
        else if (a.type === 'flick') {
          a.mesh.scale.y = 0.6 + Math.abs(Math.sin(t * 11)) * 0.7;
          a.mesh.material.opacity = 0.45 + Math.abs(Math.sin(t * 13)) * 0.5;
        }
      }
      // 玩家標記:腳下光環脈動、當前回合者光柱與指示標跳動
      if (ud.disc) {
        ud.disc.material.opacity = ud.active ? 0.45 + Math.abs(Math.sin(t * 3)) * 0.45 : 0.5;
        const ds = ud.active ? 1.1 + Math.sin(t * 3) * 0.12 : 1;
        ud.disc.scale.set(ds, ds, ds);
      }
      if (ud.beam) ud.beam.material.opacity = 0.14 + Math.abs(Math.sin(t * 2.4)) * 0.16;
      if (ud.arrow) ud.arrow.position.y = 5.5 + Math.sin(t * 4) * 0.2;
    });

    // 交通工具沿航線移動
    const _pos = new THREE.Vector3(), _tan = new THREE.Vector3(), _look = new THREE.Vector3();
    for (const v of this.traffic) {
      const u0 = (t * v.speed + v.phase) % 1;
      for (const p of v.parts) {
        let u = (u0 - p.gap + 1) % 1;
        if (v.dir < 0) u = 1 - u;
        v.curve.getPointAt(u, _pos);
        v.curve.getTangentAt(u, _tan);
        if (v.dir < 0) _tan.negate();
        if (v.type === 'ship') _pos.y += Math.sin(t * 2 + v.phase * 9) * 0.025; // 浪湧
        p.mesh.position.copy(_pos);
        _look.copy(_pos).add(_tan);
        p.mesh.lookAt(_look);
        if (v.type === 'plane') p.mesh.rotation.z += Math.sin(t * 1.3 + v.phase * 7) * 0.12; // 微側傾
      }
    }
    // 火箭尾焰閃爍
    for (const f of this.flickers) {
      f.scale.y = 0.7 + Math.abs(Math.sin(t * 11)) * 0.7;
      f.material.opacity = 0.5 + Math.abs(Math.sin(t * 13)) * 0.45;
    }

    if (this.stars) this.stars.rotation.y = t * 0.005;

    // 三疊牌庫:隨浪浮動 + 光環緩轉 + 圖示上下漂(各疊相位錯開)
    for (const st of this.deckStacks || []) {
      const ph = st.group.position.z;
      st.group.position.y = Math.sin(t * 1.2 + ph) * 0.05;
      st.ring.rotation.z = t * 0.6;
      st.icon.position.y = 1.5 + Math.sin(t * 2 + ph) * 0.08;
    }

    // 公司旗幟:新建造的升起動畫 + 隨風飄動
    for (const f of this.flagCloths) {
      if (f.riseT !== undefined && f.riseT < 1) {
        f.riseT = Math.min(1, f.riseT + dt / 0.7);
        f.root.scale.setScalar(Math.max(0.001, (f.fullScale || 1) * easeOutBack(f.riseT)));
      }
      if (f.cloth) {
        const ph = f.phase || 0;
        f.cloth.rotation.y = Math.sin(t * 2.2 + ph) * 0.3;
        f.cloth.rotation.z = Math.sin(t * 3.1 + ph) * 0.06;
      }
    }

    // 海浪 + 天氣
    if (this.ocean) this._animateOcean(t, this.wxLive ? this.wxLive.wave : 0.3);
    this._updateWeather(dt);

    // 短命特效(建造/作戰/移動)
    for (let i = this.fxItems.length - 1; i >= 0; i--) {
      const fx = this.fxItems[i];
      const age = (t - fx.t0) / fx.life;
      if (age >= 1) { fx.dispose(); this.fxItems.splice(i, 1); continue; }
      fx.update(age, t);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
