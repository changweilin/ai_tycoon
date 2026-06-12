// ============ 數值參數設定檔載入(伺服器/模擬器共用) ============
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyRulesOverrides } from '../public/js/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RULES_PATH = path.join(__dirname, '..', 'config', 'rules.json');

/**
 * 讀取 JSON 參數檔並覆寫 RULES。
 * @param {string|null} file 自訂路徑(模擬器 --rules);省略則用 config/rules.json
 * @returns {{path:string, overrides:object}|null} 載入結果;檔案不存在回傳 null(沿用程式內預設值)
 */
export function loadRulesConfig(file = null) {
  const full = file ? path.resolve(file) : DEFAULT_RULES_PATH;
  if (!fs.existsSync(full)) {
    if (file) throw new Error(`找不到參數檔:${full}`);
    return null;
  }
  const overrides = JSON.parse(fs.readFileSync(full, 'utf8'));
  applyRulesOverrides(overrides);
  return { path: full, overrides };
}
