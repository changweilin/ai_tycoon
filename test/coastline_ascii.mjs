// 把陸塊多邊形以 ASCII 俯視圖印出,肉眼確認朝鮮半島/英國島形狀(無瀏覽器)。
// 執行:node test/coastline_ascii.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const { REGIONS, MAP_SCALE } = await import('../public/js/data.js');

const src = readFileSync(join(root, 'public/js/board3d.js'), 'utf8');
const start = src.indexOf('const LANDMASSES = [');
let i = src.indexOf('[', start), depth = 0, end = -1;
for (; i < src.length; i++) { if (src[i] === '[') depth++; else if (src[i] === ']') { depth--; if (!depth) { end = i; break; } } }
const LANDMASSES = eval(src.slice(src.indexOf('[', start), end + 1));
for (const lm of LANDMASSES) lm.pts = lm.pts.map(([x, z]) => [x * MAP_SCALE, z * MAP_SCALE]);

function pip(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

// x0..x1 / z0..z1 為「未放大」座標範圍;step 為未放大格距。城市以首字母標記。
function render(title, x0, x1, z0, z1, step, cities) {
  console.log(`\n=== ${title} ===  (x:右→ ${x0}..${x1}  z:下→ ${z0}..${z1})`);
  const cityCells = {};
  for (const id of cities) {
    const r = REGIONS.find(c => c.id === id);
    if (!r) continue;
    const cx = Math.round((r.x / MAP_SCALE - x0) / step);
    const cz = Math.round((r.z / MAP_SCALE - z0) / step);
    cityCells[`${cx},${cz}`] = id[0].toUpperCase();
  }
  for (let z = z0; z <= z1; z += step) {
    let line = '';
    for (let x = x0; x <= x1; x += step) {
      const cx = Math.round((x - x0) / step), cz = Math.round((z - z0) / step);
      const ck = cityCells[`${cx},${cz}`];
      if (ck) { line += ck; continue; }
      const sx = x * MAP_SCALE, sz = z * MAP_SCALE;
      line += LANDMASSES.some(l => pip(sx, sz, l.pts)) ? '#' : '·';
    }
    console.log(line);
  }
}

// 朝鮮半島周邊(eurasia 東岸 + 日本 + 台灣);S=seoul B=busan T=tokyo/taipei O=osaka H=hsinchu
render('NE Asia / 朝鮮半島', -10, -3.5, -10.5, -0.5, 0.3,
  ['seoul', 'busan', 'tokyo', 'osaka', 'hsinchu', 'taipei', 'shanghai', 'harbin']);

// 英國島 / 北美東北角 / 歐陸西緣;L=london N=nyc B=boston M=montreal P=paris
render('英國島 vs 北美/歐陸', 16.5, 27, -15.5, -4, 0.35,
  ['london', 'nyc', 'boston', 'montreal', 'toronto', 'paris', 'amsterdam']);
