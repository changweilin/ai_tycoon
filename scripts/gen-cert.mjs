// ============ 產生自簽 TLS 憑證(讓伺服器走 HTTPS + WSS,手機可安全連線)============
// 用法:npm run gen-cert  →  產生 config/key.pem + config/cert.pem,之後 npm start 會自動走 HTTPS。
// 憑證 SAN 會自動帶入:localhost / 127.0.0.1 / 所有區網 IPv4 / Tailscale IP 與 *.ts.net 名稱,
// 因此用區網或 Tailscale 連都認得這張憑證(自簽仍會跳一次安全警告,點「仍要前往」即可)。
// 想完全免警告(行動裝置最穩):改用 Tailscale Serve 取得受信任憑證(見 README)。
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import os from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(root, 'config');
mkdirSync(CONFIG, { recursive: true });
const keyPath = join(CONFIG, 'key.pem');
const certPath = join(CONFIG, 'cert.pem');

// openssl 路徑:優先用 PATH 的 openssl,找不到再試 Git for Windows 內建的
function resolveOpenssl() {
  const candidates = ['openssl',
    'C:/Program Files/Git/mingw64/bin/openssl.exe',
    'C:/Program Files/Git/usr/bin/openssl.exe'];
  for (const c of candidates) {
    try { execFileSync(c, ['version'], { stdio: 'ignore' }); return c; }
    catch { /* 試下一個 */ }
  }
  return null;
}

// 安全跑外部指令拿輸出(失敗回空字串,不中斷)
function tryCmd(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

// 蒐集要寫進憑證 SAN 的主機:DNS 名與 IP
const dnsNames = new Set(['localhost']);
const ips = new Set(['127.0.0.1']);
for (const list of Object.values(os.networkInterfaces())) {
  for (const i of list) if (i.family === 'IPv4' && !i.internal) ips.add(i.address);
}
// Tailscale:IP 與 MagicDNS 名稱(若有安裝)
for (const ip of tryCmd('tailscale', ['ip', '-4']).split(/\s+/)) if (ip) ips.add(ip);
const tsJson = tryCmd('tailscale', ['status', '--json']);
if (tsJson) {
  try {
    const dns = (JSON.parse(tsJson).Self?.DNSName || '').replace(/\.$/, '');
    if (dns) dnsNames.add(dns);
  } catch { /* 忽略 */ }
}

const san = [...[...dnsNames].map(d => `DNS:${d}`), ...[...ips].map(ip => `IP:${ip}`)].join(',');

const openssl = resolveOpenssl();
if (!openssl) {
  console.error('❌ 找不到 openssl。請安裝 OpenSSL,或用 Git Bash 執行(Git for Windows 內建 openssl)。');
  console.error('   手動指令範例:');
  console.error(`   openssl req -x509 -newkey rsa:2048 -nodes -keyout config/key.pem -out config/cert.pem -days 825 -subj "/CN=cyber-trade-war-2049" -addext "subjectAltName=${san}"`);
  process.exit(1);
}

console.log('🔐 產生自簽憑證,SAN =', san);
execFileSync(openssl, [
  'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
  '-keyout', keyPath, '-out', certPath,
  '-days', '825', '-subj', '/CN=cyber-trade-war-2049',
  '-addext', `subjectAltName=${san}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });

if (existsSync(keyPath) && existsSync(certPath)) {
  console.log('✅ 已產生:');
  console.log('   ' + keyPath);
  console.log('   ' + certPath);
  console.log('現在執行 `npm start`,伺服器會自動以 HTTPS + WSS 啟動。');
  console.log('手機開啟區網/Tailscale 網址(https://…)時,遇安全警告請點「進階 → 仍要前往」。');
} else {
  console.error('❌ 憑證產生失敗,請檢查 openssl 輸出。');
  process.exit(1);
}
