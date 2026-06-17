// 房間列表 / 公開私人房 / PIN 驗證的端對端測試
import { spawn } from 'child_process';
import WebSocket from 'ws';

const PORT = 8601;
const server = spawn(process.execPath, ['server/server.js'], {
  env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
});
await new Promise(res => server.stdout.on('data', d => { if (String(d).includes('已啟動')) res(); }));

function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const c = { ws, name, last: null, errors: [], rooms: null };
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'sync') c.last = m;
    if (m.t === 'error') c.errors.push(m.msg);
    if (m.t === 'rooms') c.rooms = m.list;
  });
  c.send = m => ws.send(JSON.stringify(m));
  c.wait = (ms = 150) => new Promise(r => setTimeout(r, ms));
  return new Promise(res => ws.on('open', () => res(c)));
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } }

// 1) 建立一個公開房 + 一個私人房
const hostPub = await client('公開房主');
hostPub.send({ t: 'createRoom', name: '公開房主', isPublic: true });
await hostPub.wait();
hostPub.send({ t: 'setRoomConfig', gameName: '週五公開夜' });
await hostPub.wait();

const hostPri = await client('私人房主');
hostPri.send({ t: 'createRoom', name: '私人房主', isPublic: false });
await hostPri.wait();
hostPri.send({ t: 'setRoomConfig', gameName: '密室科技戰' });
await hostPri.wait();
const priPin = hostPri.last.lobby.pin;
console.log('私人房 PIN:', priPin, '| 公開房 PIN:', hostPub.last.lobby.pin);

// 2) 訪客列出房間
const guest = await client('訪客');
guest.send({ t: 'listRooms' });
await guest.wait();
console.log('房間列表:', JSON.stringify(guest.rooms));
ok(Array.isArray(guest.rooms) && guest.rooms.length === 2, '列出 2 間房間');
const pub = guest.rooms.find(r => r.name === '週五公開夜');
const pri = guest.rooms.find(r => r.name === '密室科技戰');
ok(pub && pub.isPublic === true, '公開房標記 isPublic=true');
ok(pub && typeof pub.pin === 'string', '公開房列表附帶 PIN(可直接加入)');
ok(pri && pri.isPublic === false, '私人房標記 isPublic=false');
ok(pri && pri.pin === undefined, '私人房列表「不」外洩 PIN');
ok(pri && pri.id && pub && pub.id, '兩房皆有公開 id');

// 3) 一鍵加入公開房(用 roomId、無 PIN)
const g2 = await client('一鍵加入');
g2.send({ t: 'joinRoom', roomId: pub.id, name: '一鍵加入', mode: 'player' });
await g2.wait();
ok(g2.last && g2.last.lobby && g2.last.lobby.pin === pub.pin, '用 roomId 直接加入公開房成功');
ok(g2.errors.length === 0, '公開房加入無錯誤');

// 4) 用錯誤 PIN 加入私人房 → 應被拒
const g3 = await client('錯誤PIN');
const wrongPin = priPin === '0000' ? '1111' : '0000';
g3.send({ t: 'joinRoom', roomId: pri.id, pin: wrongPin, name: '錯誤PIN', mode: 'player' });
await g3.wait();
ok(g3.errors.length > 0, '私人房錯誤 PIN 被拒(有錯誤訊息)');
ok(!g3.last || !g3.last.lobby || g3.last.lobby.pin !== priPin, '私人房錯誤 PIN 未進入房間');

// 5) 用正確 PIN 加入私人房 → 成功
const g4 = await client('正確PIN');
g4.send({ t: 'joinRoom', roomId: pri.id, pin: priPin, name: '正確PIN', mode: 'player' });
await g4.wait();
ok(g4.last && g4.last.lobby && g4.last.lobby.pin === priPin, '私人房正確 PIN 加入成功');

// 6) 房主把私人房改為公開 → 列表開始附帶 PIN
hostPri.send({ t: 'setRoomConfig', isPublic: true });
await hostPri.wait();
guest.send({ t: 'listRooms' });
await guest.wait();
const priNow = guest.rooms.find(r => r.name === '密室科技戰');
ok(priNow && priNow.isPublic === true && typeof priNow.pin === 'string', '房主改公開後,列表附帶 PIN');

console.log(`\n結果:${pass} 通過 / ${fail} 失敗`);
server.kill();
process.exit(fail ? 1 : 0);
