// 海岸線幾何驗證:從 board3d.js 擷取 LANDMASSES、從 data.js 取 REGIONS(皆已 *MAP_SCALE),
// 檢查 (1) 每座城市落在某陸塊內 (2) 多邊形不自相交 (3) 英國島不與其他陸塊重疊。
// 執行:node test/coastline.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const { REGIONS, MAP_SCALE } = await import('../public/js/data.js');

// 從 board3d.js 原文擷取 LANDMASSES 陣列字面量(只含數字/字串/陣列/物件 → 安全 eval)
const src = readFileSync(join(root, 'public/js/board3d.js'), 'utf8');
const start = src.indexOf('const LANDMASSES = [');
let i = src.indexOf('[', start), depth = 0, end = -1;
for (; i < src.length; i++) {
  if (src[i] === '[') depth++;
  else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
}
const literal = src.slice(src.indexOf('[', start), end + 1);
// eslint-disable-next-line no-eval
const LANDMASSES = eval(literal);
for (const lm of LANDMASSES) lm.pts = lm.pts.map(([x, z]) => [x * MAP_SCALE, z * MAP_SCALE]);

function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

// 線段相交(嚴格相交,排除共端點)
function ccw(a, b, c) { return (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]); }
function segCross(p1, p2, p3, p4) {
  const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2), d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function selfIntersects(pts) {
  const n = pts.length, hits = [];
  for (let a = 0; a < n; a++) {
    const a2 = (a + 1) % n;
    for (let b = a + 1; b < n; b++) {
      const b2 = (b + 1) % n;
      if (a === b || a2 === b || a === b2 || a2 === b2) continue; // 相鄰段
      if (segCross(pts[a], pts[a2], pts[b], pts[b2])) hits.push([a, b]);
    }
  }
  return hits;
}
function polysOverlap(A, B) {
  // 任一頂點落在對方內,或任意邊相交 → 視為重疊
  for (const p of A) if (pointInPolygon(p[0], p[1], B)) return `vertex ${p} of A inside B`;
  for (const p of B) if (pointInPolygon(p[0], p[1], A)) return `vertex ${p} of B inside A`;
  for (let a = 0; a < A.length; a++)
    for (let b = 0; b < B.length; b++)
      if (segCross(A[a], A[(a + 1) % A.length], B[b], B[(b + 1) % B.length])) return `edge cross A[${a}] x B[${b}]`;
  return null;
}

let fail = 0;
const byName = Object.fromEntries(LANDMASSES.map(l => [l.name, l]));

// (1) 每座城市至少落在一個陸塊內
console.log('— 城市落地檢查 —');
const homeless = [];
for (const r of REGIONS) {
  const on = LANDMASSES.filter(l => pointInPolygon(r.x, r.z, l.pts)).map(l => l.name);
  if (!on.length) { homeless.push(r.id); fail++; }
}
if (homeless.length) console.log('  ✗ 落海城市:', homeless.join(', '));
else console.log('  ✓ 全部', REGIONS.length, '城落在陸塊上');

// 指定城市必須在指定陸塊
const expect = { seoul: 'eurasia', busan: 'eurasia', shanghai: 'eurasia', harbin: 'eurasia',
  london: 'britain', paris: 'europe', amsterdam: 'europe', berlin: 'europe',
  tokyo: 'japan', osaka: 'japan', hsinchu: 'taiwan', taipei: 'taiwan' };
for (const [id, want] of Object.entries(expect)) {
  const r = REGIONS.find(x => x.id === id);
  const ok = byName[want] && pointInPolygon(r.x, r.z, byName[want].pts);
  if (!ok) { console.log(`  ✗ ${id} 不在 ${want} 內`); fail++; }
}

// (2) 自相交
console.log('— 自相交檢查 —');
for (const lm of LANDMASSES) {
  const hits = selfIntersects(lm.pts);
  if (hits.length) { console.log(`  ✗ ${lm.name} 自相交:`, JSON.stringify(hits)); fail++; }
}
if (!fail) console.log('  ✓ 無自相交');

// (3) britain 不與其他陸塊重疊
console.log('— 英國島重疊檢查 —');
for (const other of ['europe', 'eurasia', 'northAmerica']) {
  if (!byName.britain || !byName[other]) continue;
  const ov = polysOverlap(byName.britain.pts, byName[other].pts);
  if (ov) { console.log(`  ✗ britain × ${other}: ${ov}`); fail++; }
  else console.log(`  ✓ britain 不撞 ${other}`);
}

// (4) 所有陸塊兩兩重疊掃描(資訊用,協助觀察 eurasia↔japan/taiwan 等是否誤撞)
console.log('— 全陸塊兩兩重疊 —');
let anyOverlap = false;
for (let a = 0; a < LANDMASSES.length; a++)
  for (let b = a + 1; b < LANDMASSES.length; b++) {
    const ov = polysOverlap(LANDMASSES[a].pts, LANDMASSES[b].pts);
    if (ov) { console.log(`  ⚠ ${LANDMASSES[a].name} × ${LANDMASSES[b].name}: ${ov}`); anyOverlap = true; }
  }
if (!anyOverlap) console.log('  ✓ 無任何陸塊互相重疊');

// 陸塊邊界框(輔助觀察)
console.log('— 陸塊範圍(scaled) —');
for (const lm of LANDMASSES) {
  const xs = lm.pts.map(p => p[0]), zs = lm.pts.map(p => p[1]);
  console.log(`  ${lm.name.padEnd(13)} x[${Math.min(...xs).toFixed(1)}, ${Math.max(...xs).toFixed(1)}]  z[${Math.min(...zs).toFixed(1)}, ${Math.max(...zs).toFixed(1)}]`);
}

console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 全部通過');
process.exit(fail ? 1 : 0);
