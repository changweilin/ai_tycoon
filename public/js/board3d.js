// ============ 賽博龐克 3D 棋盤 (Three.js) ============
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { REGIONS, EDGES, FACTIONS, TECH_CATEGORIES } from './data.js';

const NEON_CYAN = 0x00f0ff;
const NEON_PINK = 0xff2bd6;
const NEON_PURPLE = 0x7b2bff;
const NEON_AMBER = 0xffb000;

function makeLabelSprite(text, sub, color = '#00f0ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 192);
  ctx.font = 'bold 84px "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#eaffff';
  ctx.fillText(text, 256, 90);
  ctx.font = '40px "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = color;
  ctx.shadowBlur = 12;
  ctx.fillText(sub, 256, 150);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.6, 1.7, 1);
  return sprite;
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
const LANDMASSES = [
  { name: 'northAmerica', coast: '#2bd6ff', pts: [
    [8, -16], [9.5, -12], [10, -9], [9.8, -7.5], [10.6, -5.8], [11, -4.2],
    [11.3, -2.6], [11.8, -0.5], [12.1, 1.5], [12.6, 3.5], [12.2, 5.5],
    [13.2, 7.5], [15, 9.5], [16.5, 11.5], [18, 13], [30, 13], [30, -16],
  ] },
  { name: 'asiaMainland', coast: '#ff2bd6', pts: [
    [-7, -16], [-8, -12], [-9, -10], [-8, -9.3], [-6.8, -8.4], [-6.1, -7.4],
    [-6.8, -6.8], [-8, -6.4], [-9.6, -6.6], [-10.4, -5.4], [-9.8, -4],
    [-8.5, -2.8], [-9.3, -1.2], [-9.8, 0.4], [-9.6, 1.8], [-9, 3],
    [-9.2, 4.5], [-8.7, 5.8], [-8.4, 7], [-7.9, 8], [-7.2, 8.8],
    [-8.4, 8.7], [-9.4, 7.2], [-10.5, 5.2], [-12.5, 4.2], [-16, 3.5],
    [-24, 3], [-24, -16],
  ] },
  { name: 'japan', coast: '#ff6b6b', pts: [
    [-2.0, -8.2], [-2.5, -7.0], [-2.9, -6.0], [-3.0, -5.2], [-3.8, -4.4],
    [-4.9, -4.0], [-5.4, -4.6], [-4.6, -5.4], [-4.2, -6.4], [-3.6, -7.6], [-2.8, -8.6],
  ] },
  { name: 'taiwan', coast: '#2eff8f', pts: [
    [-5.7, -1.9], [-5.4, -1.0], [-5.6, -0.1], [-6.1, 0.6], [-6.6, 0.2],
    [-6.7, -0.8], [-6.3, -1.7],
  ] },
  { name: 'australia', coast: '#ffb000', pts: [
    [-0.2, 9.0], [0.6, 10.2], [0.4, 11.8], [-1.0, 13.2], [-3.5, 13.6],
    [-5.5, 12.6], [-6.0, 11.0], [-4.8, 9.6], [-2.8, 9.2], [-1.2, 9.4],
  ] },
];

// 裝飾用小島(夏威夷/菲律賓/印尼/紐西蘭)
const DECOR_ISLANDS = [
  { x: 4, z: 0, r: 0.5 }, { x: 4.8, z: 0.6, r: 0.3 },          // 夏威夷
  { x: -6.6, z: 3.4, r: 0.55 }, { x: -6.0, z: 4.4, r: 0.35 },   // 菲律賓
  { x: -5.6, z: 9.6, r: 0.45 }, [-4.3, 10.2, 0.55], [-3.0, 10.6, 0.4], // 印尼鏈
  { x: 3.2, z: 13.2, r: 0.5 }, { x: 3.8, z: 14.2, r: 0.4 },     // 紐西蘭
].map(i => Array.isArray(i) ? { x: i[0], z: i[1], r: i[2] } : i);

// ---------- 航線交通工具類型 ----------
const EDGE_TYPES = {
  'seattle|sv': 'train', 'sv|austin': 'train',
  'seattle|tokyo': 'plane', 'sv|tokyo': 'plane', 'sv|hsinchu': 'plane',
  'tokyo|seoul': 'ship', 'seoul|beijing': 'train', 'beijing|shanghai': 'train',
  'shanghai|shenzhen': 'train', 'shanghai|tokyo': 'ship', 'shanghai|hsinchu': 'ship',
  'shenzhen|hsinchu': 'ship', 'shenzhen|hanoi': 'train',
  'hsinchu|singapore': 'ship', 'hanoi|singapore': 'train',
  'singapore|sydney': 'ship', 'sydney|austin': 'plane',
};
const TRAFFIC_STYLE = {
  plane: { color: NEON_PURPLE, opacity: 0.5, speed: 1.7 },
  ship:  { color: NEON_CYAN,   opacity: 0.32, speed: 0.65 },
  train: { color: NEON_AMBER,  opacity: 0.42, speed: 1.0 },
};

function emissiveMat(color, intensity = 0.7, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity,
    metalness: 0.4, roughness: 0.35, ...extra,
  });
}

function neonEdges(geo, color, opacity = 0.85) {
  return new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

// ============ 程式生成優先 + 可選 GLTF 混合管線 ============
// 預設 MODEL_MANIFEST 為空 → 全程式生成,LAN 下零外部請求。
// 要用外部寫實模型時,把 .glb 放進 public/assets/models/,並在此登記:
//   key 慣例:'city:<regionId>' 蓋掉城市地標;'pawn:<charId>' 蓋掉角色棋子。
// 詳見 public/assets/models/README.md。
const MODEL_MANIFEST = {
  // 'city:tokyo': 'assets/models/tokyo_tower.glb',
  // 'pawn:musk':  'assets/models/musk.glb',
};

const _gltfLoader = new GLTFLoader();
const _gltfCache = new Map(); // url → Promise<Scene>(原件,使用時 clone)

function loadGltf(url) {
  if (!_gltfCache.has(url)) {
    _gltfCache.set(url, new Promise((resolve, reject) =>
      _gltfLoader.load(url, g => resolve(g.scene), undefined, reject)));
  }
  return _gltfCache.get(url).then(scene => scene.clone(true));
}

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}
function disposeGroup(g) { for (const c of g.children) disposeTree(c); }

// 把外部模型縮放到指定高度並讓底部坐在 y=0(對齊棋盤尺度)
function fitToHeight(obj, targetH) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  obj.scale.setScalar(targetH / (size.y || 1));
  const grounded = new THREE.Box3().setFromObject(obj);
  obj.position.y -= grounded.min.y;
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
      if (opts.fit) fitToHeight(scene, opts.fit);
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

// ---------- 天氣型錄 ----------
// 每種天氣是一組會被平滑插值的參數;rain/snow/cloud=粒子強度,wind=風力,wave=浪高,
// light/amb=光照,flash=閃電頻率,funnel=漏斗(颱風/龍捲)強度,funnelGround=是否觸地,fog/bg=氛圍
const WEATHER = {
  clear:    { name: '晴天',   icon: '☀️', rain: 0,    snow: 0,   cloud: 0.10, wind: 0.15, wave: 0.30, light: 1.3,  amb: 1.5,  flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 46, fogFar: 100, bg: 0x04050f },
  waves:    { name: '海浪',   icon: '🌊', rain: 0,    snow: 0,   cloud: 0.28, wind: 0.55, wave: 1.0,  light: 1.1,  amb: 1.35, flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 40, fogFar: 95,  bg: 0x05060f },
  monsoon:  { name: '季風',   icon: '🌬️', rain: 0.45, snow: 0,   cloud: 0.6,  wind: 0.95, wave: 0.7,  light: 0.95, amb: 1.15, flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 34, fogFar: 88,  bg: 0x060810 },
  plumrain: { name: '梅雨',   icon: '🌧️', rain: 0.4,  snow: 0,   cloud: 0.85, wind: 0.25, wave: 0.35, light: 0.7,  amb: 1.05, flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 24, fogFar: 70,  bg: 0x0a0c14 },
  snow:     { name: '下雪',   icon: '❄️', rain: 0,    snow: 0.85,cloud: 0.55, wind: 0.35, wave: 0.2,  light: 1.05, amb: 1.7,  flash: 0,   funnel: 0,   funnelGround: 0,    fogNear: 28, fogFar: 80,  bg: 0x0b1020 },
  thunder:  { name: '雷雨',   icon: '⛈️', rain: 0.9,  snow: 0,   cloud: 0.95, wind: 0.6,  wave: 0.65, light: 0.55, amb: 0.8,  flash: 1,   funnel: 0,   funnelGround: 0,    fogNear: 22, fogFar: 66,  bg: 0x070810 },
  typhoon:  { name: '颱風',   icon: '🌀', rain: 1.0,  snow: 0,   cloud: 1.0,  wind: 1.0,  wave: 1.0,  light: 0.55, amb: 0.85, flash: 0.6, funnel: 0.7, funnelGround: 0.12, fogNear: 18, fogFar: 60,  bg: 0x05060d },
  tornado:  { name: '龍捲風', icon: '🌪️', rain: 0.35, snow: 0,   cloud: 0.7,  wind: 1.0,  wave: 0.6,  light: 0.8,  amb: 1.0,  flash: 0.2, funnel: 1.0, funnelGround: 1.0,  fogNear: 28, fogFar: 78,  bg: 0x080a12 },
};
const WEATHER_WEIGHTS = { clear: 32, waves: 14, monsoon: 10, plumrain: 9, snow: 8, thunder: 9, typhoon: 9, tornado: 9 };
const WX_FIELDS = ['rain', 'snow', 'cloud', 'wind', 'wave', 'light', 'amb', 'flash', 'funnel', 'funnelGround', 'fogNear', 'fogFar'];
const WX_BLEND_DUR = 4.0; // 天氣切換的過渡秒數

function weightedPick(weights) {
  let tot = 0; for (const k in weights) tot += weights[k];
  let r = Math.random() * tot;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return 'clear';
}

export class Board3D {
  constructor(container, onRegionClick) {
    this.container = container;
    this.onRegionClick = onRegionClick;
    this.regionMeshes = {};
    this.nodeGroup = new THREE.Group();
    this.pawnGroup = new THREE.Group();
    this.blockedRings = {};
    this.highlighted = new Set();
    this.traffic = [];
    this.flickers = [];
    this.clock = new THREE.Clock();
    this._init();
  }

  _init() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04050f);
    this.scene.fog = new THREE.Fog(0x04050f, 42, 95);

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
    this.controls.maxDistance = 55;
    this.controls.enableDamping = true;

    this.ambient = new THREE.AmbientLight(0x334466, 1.4);
    this.scene.add(this.ambient);
    this.dirLight = new THREE.DirectionalLight(0x99bbff, 1.2);
    this.dirLight.position.set(10, 25, 10);
    this.scene.add(this.dirLight);
    const pink = new THREE.PointLight(NEON_PINK, 60, 60);
    pink.position.set(-14, 8, 0);
    this.scene.add(pink);
    const cyan = new THREE.PointLight(NEON_CYAN, 60, 60);
    cyan.position.set(14, 8, 0);
    this.scene.add(cyan);

    this._buildOcean();
    this._buildLand();
    this._buildTerrain();
    this._buildRegions();
    this._buildCities();
    this._buildRoutes();
    this._buildStars();
    this._buildWeather();
    this._initWeatherBadge();
    this._pickWeather();
    this.scene.add(this.nodeGroup);
    this.scene.add(this.pawnGroup);

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
    grid.position.y = -0.42;
    this.scene.add(grid);

    // 會起伏的海面:高分段平面,每幀位移頂點 y 做浪
    const segs = 60;
    const geo = new THREE.PlaneGeometry(100, 100, segs, segs);
    geo.rotateX(-Math.PI / 2); // 烘進旋轉:頂點 x→世界 X、z→世界 Z、y 當垂直位移
    this.oceanMat = new THREE.MeshStandardMaterial({
      color: 0x05101f, metalness: 0.85, roughness: 0.35, transparent: true, opacity: 0.94,
    });
    this.ocean = new THREE.Mesh(geo, this.oceanMat);
    this.ocean.position.y = -0.4;
    this.scene.add(this.ocean);
    this.oceanBase = geo.attributes.position.array.slice(); // 原始 x,z 供算浪
    this._oceanFrame = 0;

    const title = makeLabelSprite('PACIFIC RIM // 環太平洋', 'CYBER TRADE WAR 2049', '#ff2bd6');
    title.position.set(2.5, 0.4, 2.5);
    title.scale.set(9, 3.3, 1);
    this.scene.add(title);
  }

  // 依浪高參數位移海面頂點
  _animateOcean(t, waveAmt) {
    const pos = this.ocean.geometry.attributes.position;
    const arr = pos.array, base = this.oceanBase;
    const amp = 0.05 + waveAmt * 0.5;
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
      color: 0x0a1228, emissive: 0x050f24, emissiveIntensity: 0.9,
      metalness: 0.5, roughness: 0.6,
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
        new THREE.LineBasicMaterial({ color: new THREE.Color(coastColor), transparent: true, opacity: 0.65 })));
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
  }

  _buildRegions() {
    const hexGeo = new THREE.CylinderGeometry(1.7, 1.95, 0.5, 6);
    for (const r of REGIONS) {
      const isChip = !!r.chipBonus;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0c1430,
        emissive: isChip ? 0x0a3a22 : 0x0a1535,
        metalness: 0.6, roughness: 0.35,
        transparent: true, opacity: 0.82,
      });
      const mesh = new THREE.Mesh(hexGeo, mat);
      mesh.position.set(r.x, 0, r.z);
      mesh.userData.regionId = r.id;
      this.scene.add(mesh);

      const line = new THREE.LineSegments(
        new THREE.EdgesGeometry(hexGeo),
        new THREE.LineBasicMaterial({ color: isChip ? 0x2eff8f : NEON_CYAN, transparent: true, opacity: 0.85 }));
      line.position.copy(mesh.position);
      this.scene.add(line);

      const label = makeLabelSprite(r.name, r.tag, isChip ? '#2eff8f' : '#00f0ff');
      label.position.set(r.x, 3.1, r.z);
      this.scene.add(label);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.2, 0.08, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.9 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(r.x, 0.5, r.z);
      ring.visible = false;
      this.scene.add(ring);
      this.blockedRings[r.id] = ring;

      this.regionMeshes[r.id] = mesh;
    }
  }

  // ---------- 市中心(地標 + 迷你天際線) ----------
  _buildCities() {
    const windowColors = [NEON_CYAN, NEON_PINK, NEON_PURPLE, NEON_AMBER];
    REGIONS.forEach((r, ri) => {
      const city = new THREE.Group();
      city.position.set(r.x, 0.25, r.z); // 六角棋格頂面

      const buildLandmark = LANDMARK_BUILDERS[r.id];
      if (buildLandmark) {
        const lm = buildModel('city:' + r.id, buildLandmark, { fit: 1.7 });
        lm.traverse(o => { if (o.userData.flicker) this.flickers.push(o); });
        city.add(lm);
      }

      // 市中心建築群:地標周圍一圈小高樓(決定性隨機,避開卡片插槽)
      const rand = mulberry32(ri * 1000 + 7);
      const n = 7 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.5;
        const dist = 0.42 + rand() * 0.18;
        const hgt = 0.18 + rand() * 0.5;
        const sz = 0.09 + rand() * 0.07;
        const c = windowColors[Math.floor(rand() * windowColors.length)];
        const bld = new THREE.Mesh(
          new THREE.BoxGeometry(sz, hgt, sz),
          new THREE.MeshStandardMaterial({
            color: 0x0e1c38, emissive: c, emissiveIntensity: 0.28,
            metalness: 0.7, roughness: 0.3,
          }));
        bld.position.set(Math.cos(a) * dist, hgt / 2, Math.sin(a) * dist);
        bld.rotation.y = rand() * Math.PI;
        city.add(bld);
      }
      this.scene.add(city);
    });
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
  _buildTerrain() {
    const rand = mulberry32(0x7e44a1);
    const nearCity = (x, z, d) => REGIONS.some(r => (r.x - x) ** 2 + (r.z - z) ** 2 < d * d);
    const trees = [], mtns = [];
    for (const land of LANDMASSES) {
      const xs = land.pts.map(p => p[0]), zs = land.pts.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const tries = Math.floor((maxX - minX) * (maxZ - minZ) * 3.2);
      for (let i = 0; i < tries; i++) {
        const x = minX + rand() * (maxX - minX), z = minZ + rand() * (maxZ - minZ);
        if (!pointInPolygon(x, z, land.pts) || nearCity(x, z, 2.6)) continue;
        const roll = rand();
        const alt = Math.sin(x * 0.4) * Math.cos(z * 0.35); // 低頻雜訊 → 山脈成群
        if (alt > 0.45 && roll < 0.55 && mtns.length < 80) mtns.push([x, z, 0.7 + rand() * 1.1, rand() * Math.PI]);
        else if (roll < 0.72 && trees.length < 320) trees.push([x, z, 0.5 + rand() * 0.6, rand() * Math.PI, rand()]);
      }
    }
    const dummy = new THREE.Object3D(), col = new THREE.Color();

    // 森林(松樹錐,逐株變色)
    const treeMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.13, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x0b3a1e, emissiveIntensity: 0.45, metalness: 0.2, roughness: 0.7 }),
      trees.length);
    trees.forEach(([x, z, s, r, h], i) => {
      dummy.position.set(x, TERRAIN_Y + 0.2 * s, z); dummy.rotation.set(0, r, 0); dummy.scale.setScalar(s);
      dummy.updateMatrix(); treeMesh.setMatrixAt(i, dummy.matrix);
      col.setHSL(0.34, 0.6, 0.22 + h * 0.18); treeMesh.setColorAt(i, col);
    });
    treeMesh.instanceMatrix.needsUpdate = true;
    if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
    treeMesh.frustumCulled = false; // 實例散布全圖,別讓單一包圍球誤剔
    this.scene.add(treeMesh);

    // 山(岩錐)+ 雪冠
    const mtnMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.5, 1.0, 6),
      new THREE.MeshStandardMaterial({ color: 0x223044, emissive: 0x0a1422, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.85, flatShading: true }),
      mtns.length);
    const capMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.24, 0.44, 6),
      new THREE.MeshStandardMaterial({ color: 0xdff0ff, emissive: 0x6fa8d6, emissiveIntensity: 0.5, roughness: 0.5 }),
      mtns.length);
    mtns.forEach(([x, z, s, r], i) => {
      dummy.position.set(x, TERRAIN_Y + 0.5 * s, z); dummy.rotation.set(0, r, 0); dummy.scale.setScalar(s);
      dummy.updateMatrix(); mtnMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, TERRAIN_Y + 0.78 * s, z); dummy.scale.setScalar(s);
      dummy.updateMatrix(); capMesh.setMatrixAt(i, dummy.matrix);
    });
    mtnMesh.instanceMatrix.needsUpdate = true; capMesh.instanceMatrix.needsUpdate = true;
    mtnMesh.frustumCulled = false; capMesh.frustumCulled = false;
    this.scene.add(mtnMesh); this.scene.add(capMesh);

    // 既有裝飾島加小丘 + 額外散布太平洋小島
    const islMat = new THREE.MeshStandardMaterial({ color: 0x14233f, emissive: 0x0a1730, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.7 });
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
    if (this.wxBadge) this.wxBadge.innerHTML = `${WEATHER[key].icon} ${WEATHER[key].name}`;
  }

  _pickWeather() {
    let key;
    do { key = weightedPick(WEATHER_WEIGHTS); } while (key === this.wxToKey && Math.random() < 0.7);
    this.setWeather(key, false);
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
  }

  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(Object.values(this.regionMeshes));
    if (hits.length > 0) this.onRegionClick(hits[0].object.userData.regionId);
  }

  // ---------- 依伺服器狀態重繪 ----------
  sync(state) {
    // 科技卡:依擁有者陣營顏色堆疊,高度 = 階級
    disposeGroup(this.nodeGroup);
    this.nodeGroup.clear();
    const boxGeo = new THREE.BoxGeometry(0.52, 0.42, 0.52);
    const slotOffsets = [[-0.75, -0.55], [0.75, -0.55], [-0.75, 0.75], [0.75, 0.75]];
    for (const rid in state.regions) {
      const r = state.regions[rid];
      const rDef = REGIONS.find(x => x.id === rid);
      r.cards.forEach((card, si) => {
        const owner = state.players.find(p => p.id === card.owner);
        const color = FACTIONS[owner.faction].color;
        const catColor = new THREE.Color(TECH_CATEGORIES[card.cat].css);
        const [ox, oz] = slotOffsets[si % 4];
        for (let lv = 0; lv < card.tier; lv++) {
          const mat = new THREE.MeshStandardMaterial({
            color, emissive: lv === card.tier - 1 ? catColor : color,
            emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.3,
          });
          const box = new THREE.Mesh(boxGeo, mat);
          box.position.set(rDef.x + ox, 0.48 + lv * 0.46, rDef.z + oz);
          box.rotation.y = si * 0.4;
          this.nodeGroup.add(box);
        }
      });
      this.blockedRings[rid].visible = r.fakeUntilRound > state.round;
    }

    // 棋子:每個角色一座惡搞特徵剪影,陣營色,當前回合者加大動作
    disposeGroup(this.pawnGroup);
    this.pawnGroup.clear();
    const PAWN_BASE_Y = 0.3;
    const byRegion = {};
    state.players.forEach(p => { (byRegion[p.pos] = byRegion[p.pos] || []).push(p); });
    for (const rid in byRegion) {
      const rDef = REGIONS.find(x => x.id === rid);
      const ps = byRegion[rid];
      ps.forEach((p, i) => {
        const angle = (i / ps.length) * Math.PI * 2 + 0.6;
        const color = FACTIONS[p.faction].color;
        const builder = PAWN_BUILDERS[p.charId] || PAWN_BUILDERS._default;
        const pawn = buildModel('pawn:' + p.charId, () => builder(color), { fit: 1.2 });
        pawn.position.set(rDef.x + Math.cos(angle) * 1.35, PAWN_BASE_Y, rDef.z + Math.sin(angle) * 1.35);
        pawn.rotation.y = -angle + Math.PI; // 面向城市中心
        pawn.userData.baseY = PAWN_BASE_Y;
        pawn.userData.phase = i * 1.7 + rid.length;
        pawn.userData.charId = p.charId;
        pawn.userData.active = p.id === state.turnIdx && !state.over;
        pawn.userData.anim = pawn.userData.anim || [];
        this.pawnGroup.add(pawn);
      });
    }
  }

  highlight(regionIds) { this.highlighted = new Set(regionIds); }

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
        const r = REGIONS.find(x => x.id === rid);
        m.material.emissive.setHex(r.chipBonus ? 0x0a3a22 : 0x0a1535);
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

    // 海浪 + 天氣
    if (this.ocean) this._animateOcean(t, this.wxLive ? this.wxLive.wave : 0.3);
    this._updateWeather(dt);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
