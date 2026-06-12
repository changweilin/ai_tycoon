// ============ 賽博龐克 3D 棋盤 (Three.js) ============
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
};

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

    this.scene.add(new THREE.AmbientLight(0x334466, 1.4));
    const dir = new THREE.DirectionalLight(0x99bbff, 1.2);
    dir.position.set(10, 25, 10);
    this.scene.add(dir);
    const pink = new THREE.PointLight(NEON_PINK, 60, 60);
    pink.position.set(-14, 8, 0);
    this.scene.add(pink);
    const cyan = new THREE.PointLight(NEON_CYAN, 60, 60);
    cyan.position.set(14, 8, 0);
    this.scene.add(cyan);

    this._buildOcean();
    this._buildLand();
    this._buildRegions();
    this._buildCities();
    this._buildRoutes();
    this._buildStars();
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
    grid.position.y = -0.4;
    this.scene.add(grid);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({
        color: 0x040818, metalness: 0.8, roughness: 0.4, transparent: true, opacity: 0.92,
      }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.45;
    this.scene.add(plane);

    const title = makeLabelSprite('PACIFIC RIM // 環太平洋', 'CYBER TRADE WAR 2049', '#ff2bd6');
    title.position.set(2.5, 0.4, 2.5);
    title.scale.set(9, 3.3, 1);
    this.scene.add(title);
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
        const lm = buildLandmark();
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

    // 棋子
    this.pawnGroup.clear();
    const coneGeo = new THREE.ConeGeometry(0.32, 0.95, 5);
    const byRegion = {};
    state.players.forEach(p => { (byRegion[p.pos] = byRegion[p.pos] || []).push(p); });
    for (const rid in byRegion) {
      const rDef = REGIONS.find(x => x.id === rid);
      const ps = byRegion[rid];
      ps.forEach((p, i) => {
        const angle = (i / ps.length) * Math.PI * 2 + 0.6;
        const color = FACTIONS[p.faction].color;
        const cone = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.3,
        }));
        cone.position.set(rDef.x + Math.cos(angle) * 1.35, 0.75, rDef.z + Math.sin(angle) * 1.35);
        if (p.id === state.turnIdx && !state.over) cone.userData.active = true;
        this.pawnGroup.add(cone);
      });
    }
  }

  highlight(regionIds) { this.highlighted = new Set(regionIds); }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const t = this.clock.getElapsedTime();
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
    this.pawnGroup.children.forEach(c => {
      if (c.userData.active) c.position.y = 0.75 + Math.abs(Math.sin(t * 3)) * 0.45;
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
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
