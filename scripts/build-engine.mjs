// ============ 把伺服器端遊戲引擎複製進 public/engine/(供靜態網頁/GitHub Pages 直接 import)============
// 單機(單人對 AI / 上帝模式)版本沒有 Node 伺服器,瀏覽器需要直接載入 game.js / bot.js / strategy.js。
// 這些檔案原本放在 public/ 之外(server/),且以 '../public/js/data.js' 相對路徑 import 資料;
// 部署到 GitHub Pages 時站台根目錄 = public/,該路徑會失效。
// 本腳本把三個純 ES module 複製到 public/engine/ 並改寫 import 路徑為 '../js/data.js'。
// server/ 仍是唯一真實來源;此處產物為衍生檔(workflow 會在部署前重新產生,避免漂移)。
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'server');
const OUT = join(root, 'public', 'engine');
mkdirSync(OUT, { recursive: true });

const HEADER = '// ⚠️ 自動產生(scripts/build-engine.mjs);請改 server/ 內的原檔,勿直接編輯。\n';

// 把 server 端對 data.js 的相對路徑改成 public/engine/ 視角的路徑
const rewrite = src => src.replaceAll('../public/js/data.js', '../js/data.js');

for (const file of ['game.js', 'bot.js', 'strategy.js']) {
  const src = readFileSync(join(SRC, file), 'utf8');
  writeFileSync(join(OUT, file), HEADER + rewrite(src));
  console.log(`✔ public/engine/${file}`);
}
console.log('引擎複製完成 → public/engine/');
