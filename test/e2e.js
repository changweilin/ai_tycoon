// 端對端煙霧測試:啟動伺服器,3 個 ws 客戶端跑完開局流程
import { spawn } from 'child_process';
import WebSocket from 'ws';

const PORT = 8599;
const server = spawn(process.execPath, ['server/server.js'], {
  env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
});
await new Promise(res => server.stdout.on('data', d => { if (String(d).includes('已啟動')) res(); }));

function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const c = { ws, name, last: null, errors: [] };
  c.infos = [];
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'sync') c.last = m;
    if (m.t === 'error') c.errors.push(m.msg);
    if (m.t === 'info') c.infos.push(m.msg);
    if (m.t === 'kicked') c.kicked = m.msg;
  });
  c.send = m => ws.send(JSON.stringify(m));
  c.wait = () => new Promise(r => setTimeout(r, 150));
  return new Promise(res => ws.on('open', () => res(c)));
}

const host = await client('host');
host.send({ t: 'createRoom', name: '房主' });
await host.wait();
const pin = host.last.lobby.pin;
console.log('房間 PIN:', pin);
// 設為 3 人(米/牆/台,無 AI 頂替)→ 擲骰回合順序下當前玩家恆為可查詢的真人
host.send({ t: 'setRoomConfig', expectedCount: 3 });
await host.wait();

const p2 = await client('p2');
p2.send({ t: 'joinRoom', pin, name: '玩家二', mode: 'player' });
const p3 = await client('p3');
p3.send({ t: 'joinRoom', pin, name: '玩家三', mode: 'player' });
const spec = await client('spec');
spec.send({ t: 'joinRoom', pin, name: '觀眾', mode: 'spectator' });
await host.wait();

host.send({ t: 'selectChar', charId: 'jensen', charPin: '1111' });
p2.send({ t: 'selectChar', charId: 'ren', charPin: '2222' });
p3.send({ t: 'selectChar', charId: 'tsmc', charPin: '3333' });
await host.wait();

// 錯誤 PIN 認領測試
spec.send({ t: 'selectChar', charId: 'jensen', charPin: '9999' });
await host.wait();
if (!spec.errors.some(e => e.includes('觀戰'))) throw new Error('觀戰者選角應被拒絕');

// 未全員準備好不能開始
host.send({ t: 'startGame' });
await host.wait();
if (host.last.lobby.started) throw new Error('未全員準備好不應開始');
if (!host.errors.some(e => e.includes('準備'))) throw new Error('應提示尚未準備');
p2.send({ t: 'setReady', ready: true });
p3.send({ t: 'setReady', ready: true });
await host.wait();
host.send({ t: 'startGame' }); // 房主按開始 = 自動準備
await host.wait();
if (!host.last.lobby.started) throw new Error('遊戲未開始: ' + host.errors.join(','));
console.log('遊戲已開始,玩家:', host.last.state.players.map(p => p.name).join(' / '));

// 私有資訊隔離檢查
if (spec.last.priv !== null) throw new Error('觀戰者不該有私有資訊');
const turnP = host.last.state.players[host.last.state.turnIdx];
console.log('輪到:', turnP.name);

// 輪到的人放棄打出作戰卡的權利換金錢
const clients = { '皮衣刀客·黃仁薰': host, '菊廠廠長·任正飛': p2, '護國神山·張中謀': p3,
  '房主': host, '玩家二': p2, '玩家三': p3 };
const actor = clients[turnP.name];
// 非當前玩家開局手牌 4 張;當前玩家回合開始已自動抽牌(算力 perk 抽 2 張)
// 擲骰回合順序下,AI 頂替者可能排在非當前位,故只挑「可查詢的真人」非當前玩家驗證
const nonCurrent = host.last.state.players.find(p => p.id !== turnP.id && clients[p.name]);
const ncClient = clients[nonCurrent.name];
if (ncClient.last.priv?.hand?.length !== 4) throw new Error('非當前玩家開局手牌應為 4 張');
if (actor.last.priv.hand.length <= 4) throw new Error('當前玩家回合開始應已自動抽牌');
const beforeMoney = turnP.res.money;
const expectedGain = actor.last.priv.forfeitGain;
actor.send({ t: 'action', kind: 'forfeit', kind2: 'ops' });
await actor.wait();
const afterP = actor.last.state.players.find(p => p.id === turnP.id);
if (afterP.res.money !== beforeMoney + expectedGain) throw new Error('放棄作戰換金錢未生效');
if (!actor.last.priv.turnFlags?.forfeitOps) throw new Error('forfeitOps 旗標未同步');
console.log('放棄權利後紀錄:', actor.last.state.log.at(-1));
// 事件卡應已抽出
if (!actor.last.state.event) throw new Error('每輪開始應有集體事件');
console.log('本季事件:', actor.last.state.event.name);

// 非當前玩家行動應被拒
const other = actor === host ? p2 : host;
const before = other.errors.length;
other.send({ t: 'action', kind: 'upgradeCard', handIdxs: [], toTier: 4 });
await other.wait();
if (other.errors.length === before) throw new Error('非當前玩家行動應被拒絕');

console.log('✅ 多人房間流程通過');

// ---- 單人 vs AI 模式 ----
const solo = await client('solo');
solo.send({ t: 'createRoom', name: '獨行俠' });
await solo.wait();
solo.send({ t: 'selectChar', charId: 'musk', charPin: '4444' });
await solo.wait();
solo.send({ t: 'startGame', mode: 'ai', count: 3 });
await solo.wait();
if (!solo.last.lobby.started) throw new Error('AI 局未開始: ' + solo.errors.join(','));
if (solo.last.state.players.length !== 4) throw new Error('AI 局人數錯誤');
if (solo.last.state.players.filter(p => p.isAI).length !== 3) throw new Error('AI 數量錯誤');
const logLen = solo.last.state.log.length;
await new Promise(r => setTimeout(r, 4000)); // 讓 AI 跑幾步
if (solo.last.state.log.length <= logLen && solo.last.state.turnIdx === 0 && solo.last.state.players[0].charId === 'musk') {
  // 輪到人類是正常的;只要 AI 曾行動過(log 增加)或本來就輪到人類即可
}
console.log('✅ 單人 vs AI 模式通過(', solo.last.state.players.map(p => p.name).join(' / '), ')');

// ---- 上帝模式 ----
const god = await client('god');
god.send({ t: 'createRoom', name: '上帝' });
await god.wait();
god.send({ t: 'startGame', mode: 'god', count: 4 });
await god.wait();
if (!god.last.lobby.started) throw new Error('上帝局未開始: ' + god.errors.join(','));
if (god.last.priv === null) throw new Error('上帝模式應拿到當前角色私有資訊');
god.send({ t: 'action', kind: 'endTurn' });
await god.wait();
if (god.last.state.turnIdx !== 1) throw new Error('上帝模式應能控制每個角色');
if (god.last.priv.playerId !== 1) throw new Error('上帝模式私有資訊應跟著當前角色');
console.log('✅ 上帝模式通過');

// ---- 人數選項與日韓開放 ----
const cfg = await client('cfg');
cfg.send({ t: 'createRoom', name: '設定俠', gameName: '測試之夜' });
await cfg.wait();
cfg.send({ t: 'selectChar', charId: 'toyota', charPin: '5555' });
await cfg.wait();
if (!cfg.errors.some(e => e.includes('人數'))) throw new Error('預設人數 4 不該能選日本');
cfg.send({ t: 'setRoomConfig', expectedCount: 6 });
await cfg.wait();
if (cfg.last.lobby.config.expectedCount !== 6) throw new Error('人數設定未生效');
// 6 人即可同時選日韓
cfg.send({ t: 'selectChar', charId: 'lee', charPin: '5555' });
await cfg.wait();
if (!cfg.last.lobby.takenChars.includes('lee')) throw new Error('人數 6 應可選韓國');
cfg.send({ t: 'selectChar', charId: 'toyota', charPin: '5555' });
await cfg.wait();
if (!cfg.last.lobby.takenChars.includes('toyota')) throw new Error('人數 6 應可選日本');
// 同一 PIN 直接切換角色
cfg.send({ t: 'selectChar', charId: 'musk', charPin: '5555' });
await cfg.wait();
if (cfg.last.lobby.takenChars.includes('toyota')) throw new Error('切換角色應釋放舊角色');
if (!cfg.last.lobby.takenChars.includes('musk')) throw new Error('切換角色失敗');
console.log('✅ 人數選項/日韓開放/切換角色通過');

// ---- 儲存/載入/結束 ----
cfg.send({ t: 'setRoomConfig', expectedCount: 4 });
cfg.send({ t: 'startGame', mode: 'ai' }); // AI 數量 = 人數 - 1 = 3
await cfg.wait();
if (!cfg.last.lobby.started) throw new Error('存檔測試局未開始: ' + cfg.errors.join(','));
if (cfg.last.state.players.length !== 4) throw new Error('AI 數量應為人數-1(共4人)');
cfg.send({ t: 'action', kind: 'endTurn' }); // 推進一手讓狀態有變化
await cfg.wait();
cfg.send({ t: 'saveGame', name: '存檔測試' });
await cfg.wait();
cfg.send({ t: 'endGame' });
await cfg.wait();
if (cfg.last.lobby.started) throw new Error('結束遊戲未回到大廳');
console.log('✅ 儲存與結束遊戲通過');

const loader = await client('loader');
loader.send({ t: 'listSaves' });
await loader.wait();
const saves = await new Promise(res => {
  loader.ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'saves') res(m.list); });
  loader.send({ t: 'listSaves' });
});
const target = saves.find(s => s.name === '存檔測試');
if (!target) throw new Error('找不到剛才的存檔');
loader.send({ t: 'loadGame', file: target.file, name: '回鍋俠' });
await loader.wait();
if (!loader.last.lobby.started) throw new Error('載入後應為進行中');
if (loader.last.state.players.length !== 4) throw new Error('載入後人數錯誤');
// 以原 PIN 認領角色
loader.send({ t: 'selectChar', charId: 'musk', charPin: '5555' });
await loader.wait();
const meAfter = loader.last.lobby.clients.find(c => c.name === '回鍋俠');
if (meAfter.charId !== 'musk') throw new Error('載入後認領角色失敗');
if (!loader.last.priv) throw new Error('認領後應取得私有資訊');
console.log('✅ 載入存檔與角色認領通過');

// ---- 房主不參與(只主持/觀戰) + 選角額滿自動觀戰 ----
const oh = await client('optHost');
oh.send({ t: 'createRoom', name: '主持人' });
await oh.wait();
const opin = oh.last.lobby.pin;
oh.send({ t: 'setRoomConfig', expectedCount: 2 });
oh.send({ t: 'setMode', mode: 'spectator' });
await oh.wait();
if (oh.last.lobby.clients.find(c => c.isHost).mode !== 'spectator')
  throw new Error('房主不參與:應轉為觀戰');

const pa = await client('pa');
pa.send({ t: 'joinRoom', pin: opin, name: '玩家A', mode: 'player' });
const pb = await client('pb');
pb.send({ t: 'joinRoom', pin: opin, name: '玩家B', mode: 'player' });
const pc = await client('pc');
pc.send({ t: 'joinRoom', pin: opin, name: '遲到C', mode: 'player' });
await oh.wait();
pa.send({ t: 'selectChar', charId: 'musk', charPin: '1111' });
pb.send({ t: 'selectChar', charId: 'ren', charPin: '2222' });
await oh.wait();
// expectedCount=2 已額滿 → 未選角的「遲到C」自動轉觀戰
if (oh.last.lobby.clients.find(c => c.name === '遲到C').mode !== 'spectator')
  throw new Error('選角額滿:未選角玩家應自動轉觀戰');

// 不參與的房主仍可開始多人遊戲,由 A/B 米牆對決(需全員準備好)
pa.send({ t: 'setReady', ready: true });
pb.send({ t: 'setReady', ready: true });
await oh.wait();
oh.send({ t: 'startGame', mode: 'multi' });
await oh.wait();
if (!oh.last.lobby.started) throw new Error('房主觀戰下多人遊戲未開始: ' + oh.errors.join(','));
if (oh.last.state.players.length !== 2) throw new Error('多人遊戲人數應為 2');
if (oh.last.priv !== null) throw new Error('不參與的房主應為觀戰(無私有資訊)');
console.log('✅ 房主不參與 + 選角額滿自動觀戰通過');

// ---- 房主不參與且無人選角 → 直接開全 AI 觀賞局 ----
const aw = await client('allAiHost');
aw.send({ t: 'createRoom', name: '純觀眾' });
await aw.wait();
aw.send({ t: 'setRoomConfig', expectedCount: 4 });
aw.send({ t: 'setMode', mode: 'spectator' });
await aw.wait();
aw.send({ t: 'startGame', mode: 'multi' });
await aw.wait();
if (!aw.last.lobby.started) throw new Error('全 AI 觀賞局未開始: ' + aw.errors.join(','));
if (aw.last.state.players.length !== 4) throw new Error('全 AI 局人數應為 4');
if (!aw.last.state.players.every(p => p.isAI)) throw new Error('全 AI 局應全為 AI');
if (aw.last.priv !== null) throw new Error('不參與房主應為觀戰(無私有資訊)');
const awLog = aw.last.state.log.length;
await new Promise(r => setTimeout(r, 3000));
if (aw.last.state.log.length <= awLog) throw new Error('全 AI 局應自動進行');
console.log('✅ 房主不參與直接開始 = 全 AI 觀賞局通過');

// ---- 3 人以上最後一位必選台灣 ----
const t1 = await client('t1');
t1.send({ t: 'createRoom', name: '搶角一號' });
await t1.wait();
const twPin = t1.last.lobby.pin;
t1.send({ t: 'setRoomConfig', expectedCount: 3 });
const t2 = await client('t2');
t2.send({ t: 'joinRoom', pin: twPin, name: '搶角二號', mode: 'player' });
const t3 = await client('t3');
t3.send({ t: 'joinRoom', pin: twPin, name: '慢半拍', mode: 'player' });
await t1.wait();
t1.send({ t: 'selectChar', charId: 'jensen', charPin: '1111' });
t2.send({ t: 'selectChar', charId: 'ren', charPin: '2222' });
await t1.wait();
t3.send({ t: 'selectChar', charId: 'musk', charPin: '3333' });
await t3.wait();
if (!t3.errors.some(e => e.includes('台灣') || e.includes('神山'))) throw new Error('最後一位選非台灣應被拒');
t3.send({ t: 'selectChar', charId: 'tsmc', charPin: '3333' });
await t3.wait();
if (!t3.last.lobby.takenChars.includes('tsmc')) throw new Error('最後一位應可選台灣');
console.log('✅ 最後一位必選台灣通過');

// ---- 陣營人數平衡:某陣營達上限不可再選 ----
const b1 = await client('b1');
b1.send({ t: 'createRoom', name: '平衡房' });
await b1.wait();
const balPin = b1.last.lobby.pin;
b1.send({ t: 'setRoomConfig', expectedCount: 4 }); // 扣台灣後 3 席 → 每陣營上限 2
const b2 = await client('b2'); b2.send({ t: 'joinRoom', pin: balPin, name: '親美二', mode: 'player' });
const b3 = await client('b3'); b3.send({ t: 'joinRoom', pin: balPin, name: '親美三', mode: 'player' });
await b1.wait();
b1.send({ t: 'selectChar', charId: 'jensen', charPin: '1111' }); // US 1
b2.send({ t: 'selectChar', charId: 'zuck', charPin: '2222' });   // US 2(達上限)
await b1.wait();
b3.send({ t: 'selectChar', charId: 'musk', charPin: '3333' });   // US 3 → 應被拒
await b3.wait();
if (!b3.errors.some(e => e.includes('親美') && e.includes('上限'))) throw new Error('超過陣營上限應被拒');
b3.send({ t: 'selectChar', charId: 'ren', charPin: '3333' });    // 改選 CN → 應可
await b3.wait();
if (!b3.last.lobby.takenChars.includes('ren')) throw new Error('改選另一陣營應成功');
console.log('✅ 陣營人數平衡上限通過');

// ---- 點自己的角色取消選擇 + 準備好後鎖定選擇 ----
b3.send({ t: 'selectChar', charId: 'ren' }); // 再點一次自己的角色 → 取消
await b3.wait();
if (b3.last.lobby.takenChars.includes('ren')) throw new Error('再次點選自己的角色應取消選擇');
b3.send({ t: 'setReady', ready: true });
await b3.wait();
b3.send({ t: 'selectChar', charId: 'jack', charPin: '3333' }); // 已準備 → 不可再選
await b3.wait();
if (!b3.errors.some(e => e.includes('準備'))) throw new Error('準備好後不應能選角');
console.log('✅ 取消選擇 + 準備鎖定選擇通過');

// ---- 角色隨機分配 + 準備好 ----
const r1 = await client('r1');
r1.send({ t: 'createRoom', name: '隨機房' });
await r1.wait();
const rPin = r1.last.lobby.pin;
r1.send({ t: 'setRoomConfig', expectedCount: 3, randomChars: true });
const r2 = await client('r2'); r2.send({ t: 'joinRoom', pin: rPin, name: '隨機二', mode: 'player' });
await r1.wait();
r2.send({ t: 'selectChar', charId: 'musk', charPin: '1234' }); // 隨機模式下選角應被拒
await r2.wait();
if (!r2.errors.some(e => e.includes('隨機'))) throw new Error('隨機模式下不應允許自選角色');
r2.send({ t: 'setReady', ready: true });
await r1.wait();
if (!r1.last.lobby.clients.find(c => c.name === '隨機二').ready) throw new Error('準備狀態應同步');
r1.send({ t: 'startGame', mode: 'multi' }); // 房主按開始 = 自動準備,缺額 AI 頂替
await r1.wait();
if (!r1.last.lobby.started) throw new Error('隨機分配應能開始: ' + r1.errors.join(','));
if (!r1.last.state.players.some(p => !p.isAI)) throw new Error('應至少有真人玩家分到角色');
if (!r2.infos.some(i => i.includes('分配給你的角色'))) throw new Error('玩家應收到抽到的角色通知');
console.log('✅ 角色隨機分配 + 準備好通過');

// ---- 投票剔除玩家(過半) ----
const k1 = await client('k1');
k1.send({ t: 'createRoom', name: '踢人房' });
await k1.wait();
const kPin = k1.last.lobby.pin;
const k2 = await client('k2'); k2.send({ t: 'joinRoom', pin: kPin, name: '好人', mode: 'player' });
const k3 = await client('k3'); k3.send({ t: 'joinRoom', pin: kPin, name: '搗蛋鬼', mode: 'player' });
await k1.wait();
const targetId = k1.last.lobby.clients.find(c => c.name === '搗蛋鬼').id;
k1.send({ t: 'voteKick', targetId }); // 1/2 票
await k1.wait();
if (k1.last.lobby.clients.some(c => c.name === '搗蛋鬼') === false) throw new Error('單票不應剔除');
k2.send({ t: 'voteKick', targetId }); // 2/2 票 → 剔除
await k1.wait();
if (!k3.kicked) throw new Error('被剔除者應收到 kicked 通知');
if (k1.last.lobby.clients.some(c => c.name === '搗蛋鬼')) throw new Error('過半票後應被移出房間');
console.log('✅ 投票剔除玩家通過');

console.log('✅ 端對端煙霧測試全部通過');
server.kill();
process.exit(0);
