// ============ LAN 遊戲伺服器:HTTP 靜態檔 + WebSocket 房間 ============
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { botStep } from './bot.js';
import { CHARACTERS, RULES, FACTIONS } from '../public/js/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SAVE_DIR = path.join(__dirname, '..', 'saves');
const PORT = process.env.PORT || 8520;
fs.mkdirSync(SAVE_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------------- 房間管理 ----------------
/**
 * room = {
 *   pin, hostId, started, game,
 *   clients: Map<clientId, {ws, name, mode:'player'|'spectator', charId|null}>,
 *   chars: Map<charId, {pin, ownerName}>,  // 角色鎖定 PIN
 * }
 */
const rooms = new Map();
let nextClientId = 1;

function genPin() {
  let pin;
  do { pin = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(pin));
  return pin;
}

function lanUrls() {
  const urls = [];
  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const i of ifaces[name]) {
      if (i.family === 'IPv4' && !i.internal) urls.push(`http://${i.address}:${PORT}`);
    }
  }
  return urls;
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// ---------------- 存檔 ----------------
function sanitizeName(s) {
  return String(s || '').replace(/[^\w一-鿿\- ]/g, '').trim().slice(0, 24) || '未命名';
}

function saveRoom(room, name, file = null) {
  const data = {
    name: sanitizeName(name || room.config.gameName),
    savedAt: new Date().toISOString(),
    config: room.config,
    chars: [...room.chars.entries()].map(([id, lock]) => [id, lock]),
    aiChars: [...(room.aiChars || [])],
    started: room.started,
    game: room.game ? room.game.serialize() : null,
  };
  const fname = file || `${data.name}_${Date.now()}.json`;
  fs.writeFileSync(path.join(SAVE_DIR, fname), JSON.stringify(data));
  return { fname, data };
}

function autosave(room) {
  if (!room.started || !room.game) return;
  try { saveRoom(room, room.config.gameName, `_autosave_${room.pin}.json`); }
  catch (e) { console.error('自動存檔失敗:', e.message); }
}

function listSaves() {
  return fs.readdirSync(SAVE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, f), 'utf8'));
        return {
          file: f, name: d.name, savedAt: d.savedAt,
          auto: f.startsWith('_autosave_'),
          round: d.game ? d.game.round : null,
          over: d.game ? d.game.over : false,
          players: d.game ? d.game.players.map(p => p.name) : [...d.chars.map(c => c[1].ownerName)],
        };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}

/** 廣播房間狀態(每個 client 拿到自己視角的 payload) */
function broadcast(room) {
  const lobby = {
    pin: room.pin,
    started: room.started,
    urls: lanUrls(),
    config: room.config,
    clients: [...room.clients.entries()].map(([id, c]) => ({
      id, name: c.name, mode: c.mode, charId: c.charId, isHost: id === room.hostId,
    })),
    takenChars: [...room.chars.keys()],
  };
  const pub = room.started ? room.game.publicState() : null;
  for (const [id, c] of room.clients) {
    let priv = null;
    if (room.started && c.charId) {
      const pIdx = playerIdxOf(room, c);
      if (pIdx >= 0) priv = room.game.privateStateFor(pIdx);
    }
    send(c.ws, { t: 'sync', youId: id, isHost: id === room.hostId, lobby, state: pub, priv });
  }
}

function playerIdxOf(room, client) {
  if (!client.charId || !room.started) return -1;
  if (client.charId === '*') return room.game.turnIdx; // 上帝模式:永遠控制當前角色
  return room.game.players.findIndex(p => p.char.id === client.charId);
}

/** 自動補齊角色陣容(滿足 米/牆/台 限制;2 人局免台灣;7/8 人補日韓) */
function buildLineup(existing, total) {
  const chosen = [...existing];
  const has = f => chosen.some(id => CHARACTERS.find(c => c.id === id).faction === f);
  const pool = f => CHARACTERS.filter(c => c.faction === f && !chosen.includes(c.id)).map(c => c.id);
  if (!has('US')) chosen.push(pool('US')[0]);
  if (!has('CN')) chosen.push(pool('CN')[0]);
  if (total >= 3 && !has('TW')) chosen.push('tsmc');
  if (total >= 7 && !has('JP')) chosen.push('toyota');
  if (total >= 8 && !has('KR')) chosen.push('lee');
  let toggle = 0;
  while (chosen.length < total) {
    const f = toggle++ % 2 === 0 ? 'US' : 'CN';
    const next = pool(f)[0] || pool(f === 'US' ? 'CN' : 'US')[0];
    if (!next) break;
    chosen.push(next);
  }
  return chosen.slice(0, total);
}

/** AI 回合驅動:當前玩家是 AI 時,以計時器逐步執行讓玩家看見過程 */
function pumpAI(room) {
  if (!room.started || room.game.over || room.aiTimer) return;
  const cur = room.game.cur();
  if (!room.aiChars || !room.aiChars.has(cur.char.id)) return;
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    if (!rooms.has(room.pin) || !room.started) return;
    let cont = false;
    try { cont = botStep(room.game); } catch (e) { console.error('AI 錯誤:', e); room.game.endTurn(); }
    broadcast(room);
    if (!cont) autosave(room); // AI 回合結束時自動存檔
    pumpAI(room);
  }, 800);
}

// ---------------- WebSocket ----------------
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', ws => {
  const clientId = nextClientId++;
  let room = null;
  let client = null;

  const err = msg => send(ws, { t: 'error', msg });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    // ----- 建立/加入房間 -----
    if (m.t === 'createRoom') {
      const pin = genPin();
      room = {
        pin, hostId: clientId, started: false, game: null,
        clients: new Map(), chars: new Map(),
        config: { gameName: sanitizeName(m.gameName) , expectedCount: 4 },
      };
      client = { ws, name: m.name || `玩家${clientId}`, mode: 'player', charId: null };
      room.clients.set(clientId, client);
      rooms.set(pin, room);
      console.log(`🏠 房間 ${pin} 已建立`);
      broadcast(room);
      return;
    }
    // ----- 列出/載入存檔(可在尚未加入房間時使用) -----
    if (m.t === 'listSaves') {
      send(ws, { t: 'saves', list: listSaves() });
      return;
    }
    if (m.t === 'loadGame') {
      if (room && room.started) { err('你已在進行中的房間'); return; }
      const file = path.basename(String(m.file || ''));
      const full = path.join(SAVE_DIR, file);
      if (!file.endsWith('.json') || !fs.existsSync(full)) { err('找不到存檔'); return; }
      let data;
      try { data = JSON.parse(fs.readFileSync(full, 'utf8')); }
      catch { err('存檔損毀'); return; }
      if (room) { room.clients.delete(clientId); if (room.clients.size === 0) rooms.delete(room.pin); }
      const pin = genPin();
      room = {
        pin, hostId: clientId, started: data.started && !!data.game, game: null,
        clients: new Map(), chars: new Map(data.chars),
        config: data.config || { gameName: data.name, expectedCount: 4 },
        aiChars: new Set(data.aiChars || []),
      };
      if (data.game) room.game = Game.fromSave(data.game);
      client = { ws, name: m.name || `玩家${clientId}`, mode: 'player', charId: null };
      room.clients.set(clientId, client);
      rooms.set(pin, room);
      console.log(`📂 從存檔「${data.name}」建立房間 ${pin}`);
      broadcast(room);
      pumpAI(room);
      return;
    }
    if (m.t === 'joinRoom') {
      const r = rooms.get(String(m.pin));
      if (!r) { err('找不到此 PIN 的房間'); return; }
      room = r;
      client = { ws, name: m.name || `玩家${clientId}`, mode: m.mode === 'spectator' ? 'spectator' : 'player', charId: null };
      room.clients.set(clientId, client);
      console.log(`👤 ${client.name} 加入房間 ${room.pin}(${client.mode})`);
      broadcast(room);
      return;
    }
    if (!room || !client) { err('尚未加入房間'); return; }

    // ----- 房間設定(房主):遊戲名稱、預計人數 -----
    if (m.t === 'setRoomConfig') {
      if (clientId !== room.hostId) { err('只有房主能修改設定'); return; }
      if (m.gameName !== undefined) room.config.gameName = sanitizeName(m.gameName);
      if (m.expectedCount !== undefined) {
        const n = parseInt(m.expectedCount, 10);
        if (n >= 2 && n <= RULES.maxPlayers) room.config.expectedCount = n;
      }
      broadcast(room);
      return;
    }

    // ----- 儲存遊戲(房主) -----
    if (m.t === 'saveGame') {
      if (clientId !== room.hostId) { err('只有房主能儲存'); return; }
      if (!room.started || !room.game) { err('遊戲尚未開始,沒有可儲存的進度'); return; }
      try {
        const { fname, data } = saveRoom(room, m.name);
        send(ws, { t: 'info', msg: `💾 已儲存「${data.name}」` });
        console.log(`💾 房間 ${room.pin} 存檔:${fname}`);
      } catch (e) { err('存檔失敗:' + e.message); }
      return;
    }

    // ----- 結束遊戲(房主):回到大廳,保留角色鎖定 -----
    if (m.t === 'endGame') {
      if (clientId !== room.hostId) { err('只有房主能結束遊戲'); return; }
      if (!room.started) { err('遊戲尚未開始'); return; }
      autosave(room); // 結束前自動留一份
      if (room.aiTimer) { clearTimeout(room.aiTimer); room.aiTimer = null; }
      room.started = false;
      room.game = null;
      room.aiChars = new Set();
      console.log(`⏹️ 房間 ${room.pin} 遊戲已由房主結束`);
      broadcast(room);
      return;
    }

    // ----- 選角色(設定 PIN 鎖定) -----
    if (m.t === 'selectChar') {
      if (client.mode === 'spectator') { err('觀戰者無法選擇角色'); return; }
      const ch = CHARACTERS.find(c => c.id === m.charId);
      if (!ch) { err('無此角色'); return; }
      if ((ch.faction === 'JP' || ch.faction === 'KR') && room.config.expectedCount < RULES.jpkrMinPlayers) {
        err(`日本/韓國需要預計人數 ${RULES.jpkrMinPlayers} 以上(請房主調整人數選項)`); return;
      }
      if (room.chars.has(m.charId)) {
        // 角色已被選:驗證 PIN 即可接管/觀察(換裝置重連)
        const lock = room.chars.get(m.charId);
        if (lock.pin !== String(m.charPin)) { err('角色 PIN 錯誤,無法存取該角色'); return; }
      } else {
        if (room.started) { err('遊戲已開始,只能用 PIN 認領已有角色'); return; }
        if (!m.charPin || String(m.charPin).length < 4) { err('請設定至少 4 位數的角色 PIN'); return; }
        // 一個玩家換角色:釋放舊角色
        if (client.charId) room.chars.delete(client.charId);
        room.chars.set(m.charId, { pin: String(m.charPin), ownerName: client.name });
      }
      client.charId = m.charId;
      broadcast(room);
      return;
    }

    // ----- 開始遊戲(房主) -----
    if (m.t === 'startGame') {
      if (clientId !== room.hostId) { err('只有房主能開始遊戲'); return; }
      if (room.started) { err('遊戲已開始'); return; }
      const gameMode = m.mode || 'multi';
      let seats = [];
      room.aiChars = new Set();

      if (gameMode === 'god') {
        // 上帝模式:所有角色由房主一人控制(試玩)
        const total = Math.min(RULES.maxPlayers, Math.max(2, parseInt(m.count, 10) || 4));
        const lineup = buildLineup(client.charId && client.charId !== '*' ? [client.charId] : [], total);
        seats = lineup.map(id => ({ charId: id }));
        for (const c of room.clients.values())
          if (c.mode === 'player') c.charId = '*';
      } else if (gameMode === 'ai') {
        // 單人 vs AI:房主一個角色,其餘 AI
        if (!client.charId) { err('請先選擇你的角色'); return; }
        const aiCount = Math.min(RULES.maxPlayers - 1, Math.max(1, parseInt(m.count, 10) || 2));
        const hostFaction = CHARACTERS.find(c => c.id === client.charId).faction;
        if ((hostFaction === 'JP' || hostFaction === 'KR') && 1 + aiCount < RULES.jpkrMinPlayers) {
          err(`選日本/韓國需要總人數 ${RULES.jpkrMinPlayers} 以上(請增加 AI 數量)`); return;
        }
        const lineup = buildLineup([client.charId], 1 + aiCount);
        seats = lineup.map(id => ({
          charId: id,
          playerName: id === client.charId ? client.name
            : '🤖 ' + CHARACTERS.find(c => c.id === id).name,
          isAI: id !== client.charId,
        }));
        for (const id of lineup) if (id !== client.charId) room.aiChars.add(id);
      } else {
        // 多人連線(2 人 = 米牆對決,免台灣)
        const seated = [...room.clients.values()].filter(c => c.mode === 'player' && c.charId);
        const factions = seated.map(c => CHARACTERS.find(x => x.id === c.charId).faction);
        const errs = [];
        if (seated.length < 2) errs.push('至少需要 2 位玩家');
        if (seated.length > RULES.maxPlayers) errs.push(`最多 ${RULES.maxPlayers} 位玩家`);
        if (seated.length === 2) {
          // 雙人特殊規則:一米一牆,無台灣
          if (!(factions.includes('US') && factions.includes('CN')))
            errs.push('雙人對決必須一位米國、一位牆國');
        } else {
          if (!factions.includes('US')) errs.push('至少需要 1 位米國玩家');
          if (!factions.includes('CN')) errs.push('至少需要 1 位牆國玩家');
          if (!factions.includes('TW')) errs.push('至少需要 1 位台灣玩家');
        }
        if ((factions.includes('JP') || factions.includes('KR')) && room.config.expectedCount < RULES.jpkrMinPlayers)
          errs.push(`日本/韓國需要預計人數 ${RULES.jpkrMinPlayers} 以上`);
        if (errs.length) { err(errs.join(';')); return; }
        seats = seated.map(c => ({ charId: c.charId, playerName: c.name }));
      }

      room.game = new Game(seats);
      room.started = true;
      console.log(`🎮 房間 ${room.pin} 開始遊戲(模式 ${gameMode},${seats.length} 角色)`);
      broadcast(room);
      pumpAI(room);
      return;
    }

    // ----- 遊戲行動 -----
    if (m.t === 'action') {
      if (!room.started) { err('遊戲尚未開始'); return; }
      const g = room.game;
      const pIdx = playerIdxOf(room, client);
      if (pIdx < 0) { err('你不是此局玩家'); return; }
      if (g.turnIdx !== pIdx && m.kind !== 'noop') { err('還沒輪到你'); return; }

      let res = { ok: false, msg: '未知行動' };
      switch (m.kind) {
        case 'move': res = g.doMove(m.regionId); break;
        case 'developStart': res = g.doDevelopStart(m.catId); break;
        case 'developPick': res = g.doDevelopPick(m.idx); break;
        case 'draw': res = g.doDraw(); break;
        case 'playCard': res = g.doPlayCard(m.handIdx, m.target); break;
        case 'endTurn': g.endTurn(); res = { ok: true }; break;
        case 'reveal': res = g.doReveal(); break;
        case 'joinSide': res = g.doJoin(); break;
      }
      if (!res.ok) err(res.msg);
      broadcast(room);
      autosave(room);
      pumpAI(room);
      return;
    }
  });

  ws.on('close', () => {
    if (!room || !client) return;
    room.clients.delete(clientId);
    // 角色鎖保留(可用 PIN 重新認領);房間無人時銷毀
    if (room.clients.size === 0) {
      rooms.delete(room.pin);
      console.log(`🗑️ 房間 ${room.pin} 已關閉`);
    } else {
      if (clientId === room.hostId) room.hostId = [...room.clients.keys()][0];
      broadcast(room);
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('===========================================');
  console.log('  🌏 賽博貿易戰 2049 — 伺服器已啟動');
  console.log('===========================================');
  console.log(`  本機:  http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  區網:  ${u}  ← 其他玩家用這個連線`);
  console.log('  (Tailscale 使用者可用 tailscale IP:' + PORT + ')');
  console.log('===========================================');
});
