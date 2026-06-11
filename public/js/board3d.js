// ============ 賽博龐克 3D 棋盤 (Three.js) ============
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { REGIONS, EDGES, FACTIONS, TECH_CATEGORIES } from './data.js';

const NEON_CYAN = 0x00f0ff;
const NEON_PINK = 0xff2bd6;
const NEON_PURPLE = 0x7b2bff;

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

export class Board3D {
  constructor(container, onRegionClick) {
    this.container = container;
    this.onRegionClick = onRegionClick;
    this.regionMeshes = {};
    this.nodeGroup = new THREE.Group();
    this.pawnGroup = new THREE.Group();
    this.blockedRings = {};
    this.highlighted = new Set();
    this.clock = new THREE.Clock();
    this._init();
  }

  _init() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04050f);
    this.scene.fog = new THREE.Fog(0x04050f, 38, 80);

    this.camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 200);
    this.camera.position.set(0, 24, 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 50;
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
    this._buildRegions();
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
    const grid = new THREE.GridHelper(90, 60, 0x0a2a4a, 0x07182e);
    grid.position.y = -0.4;
    this.scene.add(grid);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({
        color: 0x040818, metalness: 0.8, roughness: 0.4, transparent: true, opacity: 0.92,
      }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.45;
    this.scene.add(plane);

    const title = makeLabelSprite('PACIFIC RIM // 環太平洋', 'CYBER TRADE WAR 2049', '#ff2bd6');
    title.position.set(1.5, 0.4, 1.5);
    title.scale.set(9, 3.3, 1);
    this.scene.add(title);
  }

  _buildRegions() {
    const hexGeo = new THREE.CylinderGeometry(1.7, 1.95, 0.5, 6);
    for (const r of REGIONS) {
      const isChip = !!r.chipBonus;
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0c1430,
        emissive: isChip ? 0x0a3a22 : 0x0a1535,
        metalness: 0.6, roughness: 0.35,
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
      label.position.set(r.x, 2.6, r.z);
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

  _buildRoutes() {
    const posOf = id => {
      const r = REGIONS.find(x => x.id === id);
      return new THREE.Vector3(r.x, 0.05, r.z);
    };
    for (const [a, b] of EDGES) {
      const pa = posOf(a), pb = posOf(b);
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      mid.y = 0.4 + pa.distanceTo(pb) * 0.06;
      const curve = new THREE.QuadraticBezierCurve3(pa, mid, pb);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
      this.scene.add(new THREE.Line(geo,
        new THREE.LineBasicMaterial({ color: NEON_PURPLE, transparent: true, opacity: 0.5 })));
    }
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
      this.blockedRings[rid].visible = r.blockedUntilRound > state.round;
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
    if (this.stars) this.stars.rotation.y = t * 0.005;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
