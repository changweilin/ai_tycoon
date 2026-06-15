// 回歸測試:斷線重連不該出現「尚未加入房間」
// 模擬客戶端 reattach 流程(帶 charId、等 sync 確認後才 flush 排隊行動),涵蓋:
//   A 伺服器重啟後重連(從 autosave 復原房間)  B token 失效但房間仍在(用 charId 重新入座)  C 完全無法復原(needRejoin)
import { spawn } from 'child_process';
import WebSocket from 'ws';

const PORT = 8602;
function startServer() {
  const s = spawn(process.execPath, ['server/server.js'], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  return new Promise(res => s.stdout.on('data', d => { if (String(d).includes('已啟動')) res(s); }));
}
const wait = (ms = 250) => new Promise(r => setTimeout(r, ms));

// 每個情境用一條全新連線 + 全新 state,避免舊連線污染檢查
function connect() {
  const state = { last: null, token: null, errors: [], queue: [], needRejoin: null, ws: null };
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  state.ws = ws;
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'sync') {
      state.last = m; if (m.token) state.token = m.token;
      for (const q of state.queue) ws.send(JSON.stringify(q)); // flushQueue:sync 確認後補送
      state.queue = [];
    } else if (m.t === 'error') { state.errors.push(m.msg); console.log('  error:', m.msg); }
    else if (m.t === 'needRejoin') { state.needRejoin = m.msg; state.queue = []; console.log('  needRejoin:', m.msg); }
  });
  return new Promise(res => ws.on('open', () => res(state)));
}
const send = (s, m) => s.ws.send(JSON.stringify(m));

let pass = true;
function check(cond, label) { console.log((cond ? '✅ ' : '❌ ') + label); if (!cond) pass = false; }

let server = await startServer();

// 開一局並推進到有 autosave(送一個行動 → server 寫 _autosave_<pin>.json)
const host = await connect();
send(host, { t: 'createRoom', name: '房主' });
await wait();
const pin = host.last.lobby.pin;
const token = host.token;
send(host, { t: 'selectChar', charId: 'jensen', charPin: '1111' });
await wait();
send(host, { t: 'startGame', mode: 'ai' });
await wait(600);
// 若輪到人類,送 endTurn 觸發 autosave;否則 AI 行動本身也會 autosave
if (host.last.state.turnIdx === host.last.state.players.find(p => p.charId === 'jensen').id) {
  send(host, { t: 'action', kind: 'endTurn' });
}
await wait(1500); // 讓 AI 跑一兩步,確保 autosave 落地
host.ws.close();
console.log('遊戲開始 pin =', pin);

// ---- A:伺服器重啟後重連(房間從 autosave 復原)----
console.log('\n--- A. 伺服器重啟後重連 ---');
server.kill(); await wait(500);
server = await startServer();
const a = await connect();
a.queue = [{ t: 'action', kind: 'endTurn' }]; // 斷線期間排隊的行動
send(a, { t: 'reattach', pin, token, charId: 'jensen', name: '房主' });
await wait(500);
check(a.needRejoin == null, 'A: 未被要求重新加入(成功復原)');
check(a.last?.lobby?.started === true, 'A: 重連後仍在進行中的遊戲');
check(a.last?.lobby?.clients?.some(c => c.charId === 'jensen'), 'A: 角色 jensen 已認回');
check(!a.errors.some(e => e.includes('尚未加入房間')), 'A: 無「尚未加入房間」錯誤');

// ---- B:座位過寬限被刪、但房間還在(token 失效)----
console.log('\n--- B. 座位失效但房間仍在 ---');
const b = await connect();
send(b, { t: 'reattach', pin, token: 'STALE_TOKEN', charId: 'jensen', name: '房主' });
await wait(500);
check(b.needRejoin == null, 'B: 未被要求重新加入');
check(b.last?.lobby?.clients?.some(c => c.charId === 'jensen'), 'B: 透過 charId 重新入座並認回角色');
check(!b.errors.some(e => e.includes('尚未加入房間') || e.includes('連線階段已失效')), 'B: 無失效/未加入錯誤');

// ---- C:房間與 autosave 都不存在 → needRejoin,絕不丟「尚未加入房間」----
console.log('\n--- C. 完全無法復原 ---');
const c = await connect();
c.queue = [{ t: 'action', kind: 'endTurn' }];
send(c, { t: 'reattach', pin: '0000', token: 'whatever', charId: 'jensen', name: '幽靈' });
await wait(500);
check(!!c.needRejoin, 'C: 收到 needRejoin 指示重新加入');
check(c.last == null, 'C: 沒有取得任何房間狀態');
check(!c.errors.some(e => e.includes('尚未加入房間')), 'C: 無「尚未加入房間」錯誤');

server.kill();
console.log('\n' + (pass ? '✅ 全部通過' : '❌ 有失敗項'));
process.exit(pass ? 0 : 1);
