// ============ 前端 UI 與流程(連線版) ============
import { FACTIONS, CHARACTERS, CHARACTER_LINES, TECH_CATEGORIES, TECH_CARDS,
  MAIN_TIER_COPIES, TIER4_COPIES, TIER5_COPIES, OPS_CARDS, OPS_DECK_COMPOSITION,
  OPS_TIER4_COMPOSITION, OPS_TIER5_COMPOSITION, EVENT_CARDS, CATEGORY_RATIO, splitCost,
  RULES, REGIONS, RES_KEYS, RESOURCES, STRENGTH_AXES, adjacencyOf,
  charAvatar, charPortrait, charLogo, factionFlag, applyRulesOverrides } from './data.js';
import { Board3D } from './board3d.js';
import { Net } from './net.js';
import { LocalNet } from './localnet.js';
import { audio } from './audio.js';

const $ = sel => document.querySelector(sel);

// 單機模式(GitHub Pages / 無後端):用瀏覽器內 LocalNet 取代連線,鎖定加入房間,只開放單人對 AI / 上帝模式。
// 觸發來源(任一即可):
//   1) solo-flag.js 的 window.__SOLO__(GitHub Pages workflow 會設為 true)
//   2) 網址參數 ?solo=1(本機測試用)
//   3) 主機名是 *.github.io(純靜態託管必為單機;旗標萬一沒設好也能保底)
const SOLO = !!window.__SOLO__
  || new URLSearchParams(location.search).has('solo')
  || /\.github\.io$/i.test(location.hostname);

let net = null;
let board = null;
let last = null;        // 最近一次 sync payload
let sessionToken = null; // 斷線重連用的座位 token(由 sync 帶回)
let mode = 'idle';      // idle | move
let myCharId = null;
let resultShown = false;
let lastFxId = null;    // 已播放的最後一個特效 id(增量播放,首次同步不重播歷史)
let lastTurnIdx = null; // 上次的回合玩家索引(偵測「輪到你」提示音)
let lastPhase = null;   // 上次的階段(偵測進入交易環節提示音)
let _prevHandUids = null; // 上一輪手牌的 uid(null=尚未基準);用來偵測新抽到的卡播放抽卡動畫
let _suppressDrawFx = 0;  // 升階合併動畫後短暫抑制「全螢幕抽卡」動畫的截止時間戳(避免兩段動畫疊播)
let _cardDrag = null;     // 進行中的手牌拖曳狀態(拖到手牌區外=打出);null=未拖曳
let _suppressCardClickUntil = 0; // 拖曳打出後短暫忽略接續的 click(避免又觸發點擊打出流程)
// 手機底部 dock:可展開 / 收合的面板清單。mbPanel = 目前展開的面板 id(null = 收合只看地圖)
const MB_PANELS = ['techBar', 'playerPanel', 'playersList', 'log', 'bottomCenter', 'hostBar'];
let mbPanel = null;
let _mbSig = null;      // 目前 dock 的項目組合簽章(角色變動才重建,避免每次同步重繪)

function fmtRes(c) {
  const parts = RES_KEYS.filter(k => c && c[k] > 0).map(k => `${RESOURCES[k].icon}${c[k]}`);
  return parts.length ? parts.join(' ') : '免費';
}
function totalRes(c) { return RES_KEYS.reduce((s, k) => s + (c?.[k] || 0), 0); }
// 科技卡科技力:初始(卡面)值與加權(含擅長/晶片/陣營/事件加成)值,差異時以括號顯示
function techDual(c) {
  return c.effTech != null && c.effTech !== c.tech ? `${c.tech} (${c.effTech})` : `${c.tech}`;
}
// 科技卡加權成分的單行摘要(供卡片/城市詳情內嵌顯示)
function techBreakLine(c) {
  if (c.effTech == null || c.effTech === c.tech || !c.techBreak) return '';
  const parts = c.techBreak.map(([l, v]) => `${l} ${v >= 0 ? '+' : ''}${v}`).join('、');
  return `<div class="bd-inline">🔎 加權明細:${parts} = <b>🔬${c.effTech}</b></div>`;
}
// 帶正負號的資源字串(明細用,0 略過)
function fmtResSigned(c) {
  const parts = RES_KEYS.filter(k => c && c[k]).map(k => `${RESOURCES[k].icon}${c[k] > 0 ? '+' : ''}${c[k]}`);
  return parts.length ? parts.join(' ') : '—';
}
// 加權成分明細彈窗(income: kind='res' 資源三元組;tech: kind='num' 純數值)
function showBreakdown(title, parts, kind, totalStr) {
  const rows = (parts || []).map(([label, v]) =>
    `<div class="bd-row"><span class="bd-label">${label}</span><span class="bd-val">${
      kind === 'res' ? fmtResSigned(v) : `${v >= 0 ? '+' : ''}${v}`}</span></div>`).join('');
  openModal(title,
    `<p class="modal-desc">加權 = 初始值 + 角色 / 陣營 / 集體事件等加成</p>
     <div class="bd-list">${rows}</div>
     <div class="bd-row bd-total"><span class="bd-label">加權合計</span><span class="bd-val">${totalStr}</span></div>`,
    [{ label: '關閉', value: null }]);
}

// ---------------- 工具 ----------------
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function openModal(title, bodyHtml, options, onChoose) {
  $('#modalTitle').innerHTML = title;
  $('#modalBody').onclick = null; // 清掉前一個 modal(如牌庫一覽)掛在 body 上的委派點擊
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalOptions').innerHTML = options.map((o, i) =>
    `<button class="btn modal-opt" data-i="${i}">${o.label}</button>`).join('');
  $('#modal').style.display = 'flex';
  $('#modalOptions').onclick = e => {
    const b = e.target.closest('.modal-opt');
    if (!b) return;
    $('#modal').style.display = 'none';
    const val = options[parseInt(b.dataset.i, 10)].value;
    if (onChoose) onChoose(val);
  };
}

function myPlayer() {
  if (!last?.state || !myCharId) return null;
  if (myCharId === '*') return last.state.players[last.state.turnIdx]; // 上帝模式:控制當前角色
  return last.state.players.find(p => p.charId === myCharId) || null;
}
function isMyTurn() {
  const me = myPlayer();
  if (!me || last.state.over) return false;
  return myCharId === '*' || last.state.turnIdx === me.id;
}

// ---------------- 進入點:連線畫面 ----------------
function setupConnect() {
  if (SOLO) { setupSolo(); return; } // 單機版:跳過多人連線畫面,改用單機設定畫面
  const params = new URLSearchParams(location.search);
  if (params.get('room')) {
    $('#joinPin').value = params.get('room');
    const dt = document.querySelector('.pin-join'); if (dt) dt.open = true;
  }
  $('#myName').value = localStorage.getItem('ctw_name') || '';

  const saveName = () => localStorage.setItem('ctw_name', $('#myName').value.trim());
  $('#createBtn').onclick = () => {
    saveName();
    ensureNet();
    net.send({ t: 'createRoom', name: $('#myName').value.trim(), isPublic: $('#createPublic').checked });
  };
  $('#joinBtn').onclick = () => {
    const pin = $('#joinPin').value.trim();
    if (!pin) { toast('請輸入房間 PIN'); return; }
    saveName();
    ensureNet();
    net.send({ t: 'joinRoom', pin, name: $('#myName').value.trim(), mode: joinModeValue() });
  };
  $('#refreshRoomsBtn').onclick = () => { ensureNet(); net.send({ t: 'listRooms' }); };
  $('#roomList').onclick = e => {
    const row = e.target.closest('[data-room]');
    if (!row) return;
    joinListedRoom(row.dataset.room, row.dataset.public === '1', row.dataset.name || '');
  };
  $('#loadBtn').onclick = () => {
    saveName();
    ensureNet();
    net.send({ t: 'listSaves' });
  };
  $('#clearSavesBtn').onclick = () => {
    openModal('🗑️ 清除暫存檔',
      '<p>清除所有自動存檔(每回合的暫存),玩家手動存檔會保留。確定嗎?</p>',
      [{ label: '清除暫存檔', value: true }, { label: '取消', value: null }],
      val => { if (val) { ensureNet(); net.send({ t: 'clearAutosaves' }); } });
  };

  // 一進連線畫面就抓房間列表,並在停留期間定時刷新(進房後 #connect 隱藏即停止送出)
  ensureNet();
  net.send({ t: 'listRooms' });
  setInterval(() => {
    if (net && net.connected && $('#connect').style.display !== 'none') net.send({ t: 'listRooms' });
  }, 4000);
}

function joinModeValue() {
  return document.querySelector('input[name="joinMode"]:checked')?.value || 'player';
}

// 從房間列表加入:公開房一鍵加入;私人房先彈出 PIN 輸入框
function joinListedRoom(roomId, isPublic, roomName) {
  localStorage.setItem('ctw_name', $('#myName').value.trim());
  ensureNet();
  const myName = $('#myName').value.trim();
  const mode = joinModeValue();
  if (isPublic) {
    net.send({ t: 'joinRoom', roomId, name: myName, mode });
    return;
  }
  openModal(`🔒 加入私人房間「${roomName}」`,
    `<p>此為私人房間,請輸入房主提供的 4 位數 PIN 才能加入。</p>
     <input id="roomPinInput" class="pin-input" type="text" inputmode="numeric" maxlength="4" placeholder="房間 PIN">`,
    [{ label: '加入', value: true }, { label: '取消', value: null }],
    val => {
      if (!val) return;
      const pin = ($('#roomPinInput')?.value || '').trim();
      if (!pin) { toast('請輸入 PIN'); return; }
      net.send({ t: 'joinRoom', roomId, pin, name: myName, mode });
    });
}

// HTML 轉義(房間/玩家名稱可能含特殊字元)
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 繪製房間列表(連線畫面)
function renderRoomList(list) {
  const el = $('#roomList');
  if (!el) return;
  if (!list || !list.length) {
    el.innerHTML = '<div class="room-empty">目前沒有開放中的房間 — 建立一個,或用 PIN 直接加入。</div>';
    return;
  }
  el.innerHTML = list.map(r => {
    const lock = r.isPublic ? '🌐 公開' : '🔒 私人';
    const status = r.started ? '<span class="room-tag live">⚔️ 進行中</span>' : '<span class="room-tag wait">🕓 等待中</span>';
    return `<div class="room-row" data-room="${r.id}" data-public="${r.isPublic ? 1 : 0}" data-name="${escapeHtml(r.name)}">
      <div class="room-main">
        <span class="room-name">${escapeHtml(r.name)}</span>
        ${status}
      </div>
      <div class="room-sub">${lock}・👑 ${escapeHtml(r.host)}・🎮 ${r.players}/${r.expected}${r.spectators ? `・👁️ ${r.spectators}` : ''}</div>
    </div>`;
  }).join('');
}

// ---------------- 單機設定畫面(單人對 AI / 上帝模式)----------------
let soloMode = 'ai';
let soloChar = null;

function setupSolo() {
  $('#connect').style.display = 'none';
  $('#lobby').style.display = 'none';
  $('#gameUI').style.display = 'none';
  $('#soloSetup').style.display = 'block';
  soloChar = localStorage.getItem('ctw_solo_char') || null;
  if (!CHARACTERS.some(c => c.id === soloChar)) soloChar = null;

  for (const btn of document.querySelectorAll('.solo-mode-tab')) {
    btn.onclick = () => {
      soloMode = btn.dataset.smode;
      document.querySelectorAll('.solo-mode-tab').forEach(b => b.classList.toggle('on', b === btn));
      updateSoloHint();
    };
  }
  $('#soloCount').onchange = () => { renderSoloChars(); updateSoloHint(); };
  $('#soloCharPool').onclick = e => {
    const detail = e.target.closest('[data-detail]');
    if (detail) { openCharDetail(detail.dataset.detail, { solo: true }); return; }
    const card = e.target.closest('.char-card');
    if (!card || card.classList.contains('locked')) return;
    pickSoloChar(card.dataset.char === soloChar ? null : card.dataset.char);
  };
  $('#soloStartBtn').onclick = () => {
    const expected = parseInt($('#soloCount').value, 10);
    if (soloMode === 'ai' && !soloChar) { toast('請先選擇你的角色'); return; }
    ensureNet();
    net.send({ t: 'startSolo', mode: soloMode, charId: soloChar, expectedCount: expected,
      name: localStorage.getItem('ctw_name') || '你' });
  };
  $('#soloRulesBtn').onclick = () => $('#rulesOverlay').style.display = 'flex';
  $('#soloLoadBtn').onclick = () => { ensureNet(); net.send({ t: 'listSaves' }); };

  renderSoloChars();
  updateSoloHint();
}

function updateSoloHint() {
  const n = parseInt($('#soloCount').value, 10);
  $('#soloCharWrap').style.display = soloMode === 'god' ? 'none' : '';
  $('#soloModeHint').textContent = soloMode === 'god'
    ? `👁️‍🗨️ 上帝模式:你一人輪流操控全部 ${n} 個角色(沒有 AI),適合試玩與學習規則。`
    : `🤖 你操控 1 個角色,其餘 ${n - 1} 個由 AI 對戰。`;
}

function pickSoloChar(id) {
  soloChar = id;
  localStorage.setItem('ctw_solo_char', id || '');
  renderSoloChars();
}

function renderSoloChars() {
  const pool = $('#soloCharPool');
  if (!pool) return;
  const expected = parseInt($('#soloCount').value, 10);
  const allowJPKR = expected >= RULES.jpkrMinPlayers;
  const allowTW = expected >= 3;
  // 人數變動使已選角色不合法(日韓需 6+、台灣需 3+)→ 自動取消
  if (soloChar) {
    const pc = CHARACTERS.find(c => c.id === soloChar);
    if (pc && (((pc.faction === 'JP' || pc.faction === 'KR') && !allowJPKR) || (pc.faction === 'TW' && !allowTW)))
      soloChar = null;
  }
  const FACTION_ORDER = ['US', 'CN', 'TW', 'JP', 'KR'];
  const FACTION_DESC = { US: '矽谷霸權', CN: '神州科技', TW: '護國神山', JP: '匠人精神', KR: '財閥帝國' };
  pool.innerHTML = FACTION_ORDER.map(fid => {
    const list = CHARACTERS.filter(c => c.faction === fid);
    if (!list.length) return '';
    const fac = FACTIONS[fid];
    const locked = ((fid === 'JP' || fid === 'KR') && !allowJPKR) || (fid === 'TW' && !allowTW);
    const note = locked ? (fid === 'TW' ? '・需 3+ 人' : `・需 ${RULES.jpkrMinPlayers}+ 人`) : '';
    return `<section class="char-group" style="--fc:${fac.css}">
      <div class="char-group-head">
        <img class="fac-flag" src="${factionFlag(fid)}" alt="" onerror="this.style.display='none'">
        <span class="cg-name">${fac.name}</span>
        <span class="cg-desc">${FACTION_DESC[fid]}</span>
        <span class="cg-count">${list.length} 位${note}</span>
      </div>
      <div class="char-group-grid">${list.map(c => soloCharCard(c, locked)).join('')}</div>
    </section>`;
  }).join('');
}

function soloCharCard(c, locked) {
  const mine = soloChar === c.id;
  return `<div class="char-card ${locked ? 'locked' : ''} ${mine ? 'mine' : ''}"
    data-char="${c.id}" style="--fc:${FACTIONS[c.faction].css}">
    <div class="char-head">
      <img class="char-avatar" src="${charAvatar(c)}" alt="${c.name}" data-detail="${c.id}"
           title="點擊查看立繪 / 生平 / 能力特長" onerror="this.style.display='none'">
      <div class="char-head-text">
        <div class="char-name">${c.name}</div>
        <div class="char-real">${c.real}</div>
      </div>
    </div>
    <div class="char-ind">🏭 ${c.industry}|${c.industryDesc}(${TECH_CATEGORIES[catOf(c)].name})</div>
    <div class="char-perk">✨ ${c.perkText}</div>
    <div class="char-detail-hint" data-detail="${c.id}">🔍 查看立繪 / 生平 / 能力特長</div>
    ${mine ? '<div class="lock-tip mine-tip">✔ 你的角色</div>' : ''}
  </div>`;
}

function ensureNet() {
  if (net) return;
  net = SOLO
    ? new LocalNet(onSync, msg => toast(msg), onOther)            // 單機:瀏覽器內本地伺服器
    : new Net(onSync, msg => toast(msg), onOther, onReconnect);   // 連線:WebSocket
}

// 斷線重連:用 token 認回原座位;token 失效時伺服器改用 charId/名稱重新入座。
// 認回成功後會收到 sync,屆時才由 onSync 補送斷線期間排隊的行動。
function onReconnect() {
  if (sessionToken && last?.lobby?.pin) {
    const me = last.lobby.clients.find(c => c.id === last.youId);
    const myName = me?.name || localStorage.getItem('ctw_name') || '';
    net.sendNow({ t: 'reattach', pin: last.lobby.pin, token: sessionToken, charId: myCharId, name: myName });
    toast('🔄 重新連線中…');
  } else {
    net.clearQueue(); // 沒有可認回的座位,別把排隊行動送到尚未加入的房間
  }
}

// 重連失敗(房間已結束無法復原):清掉過期行動,退回連線畫面讓玩家重新加入
function resetToConnect(msg) {
  net.clearQueue();
  last = null; sessionToken = null; myCharId = null; resultShown = false;
  $('#lobby').style.display = 'none';
  $('#gameUI').style.display = 'none';
  $('#resultOverlay').style.display = 'none';
  $('#connect').style.display = 'block';
  if (msg) toast(msg);
}

function onOther(m) {
  if (m.t === 'info') toast(m.msg);
  else if (m.t === 'rooms') renderRoomList(m.list);
  else if (m.t === 'saves') showSavesList(m.list);
  else if (m.t === 'needRejoin') resetToConnect(m.msg || '房間已結束,請重新加入');
  else if (m.t === 'kicked') { net.kill(); resetToConnect(m.msg || '你已被剔除房間'); }
}

// ---------------- 個人 PIN(設定一次,換角色沿用) ----------------
function getMyPin() { return localStorage.getItem('ctw_pin') || ''; }
function setMyPin(pin) { localStorage.setItem('ctw_pin', pin); }

// ---------------- 同步處理 ----------------
function onSync(m) {
  last = m;
  if (m.token) sessionToken = m.token; // 記住座位 token,斷線可重連認回
  net.flushQueue(); // 連線已被伺服器確認(含重連認回後),補送斷線期間排隊的行動
  const me = m.lobby.clients.find(c => c.id === m.youId);
  myCharId = me ? me.charId : null;

  if (!m.lobby.started) {
    $('#connect').style.display = 'none';
    $('#gameUI').style.display = 'none';
    $('#resultOverlay').style.display = 'none';
    $('#eventFx').classList.remove('show');
    resultShown = false;
    lastFxId = null;        // 回到大廳:下一局重新基準,新局開場事件會播放
    lastLogLen = null;      // 行動訊息饋送也重置基準(下一局不重播歷史)
    lastTurnIdx = null; lastPhase = null; // 回合 / 階段提示音也重置基準
    _prevHandUids = null;   // 手牌基準重置:下一局開場發牌不誤判為「抽卡」逐張飛入
    audio.dock(false); // 非戰局畫面:靜音鈕回到右下角浮動(大廳背景樂也可隨時開關)
    if (SOLO) {
      // 單機版:回到單機設定畫面(結束遊戲後),不顯示多人大廳
      $('#lobby').style.display = 'none';
      $('#soloSetup').style.display = 'block';
      audio.stopMusic();
      renderSoloChars();
    } else {
      $('#lobby').style.display = 'block';
      audio.playMusic('lobby'); // 大廳 / 等待開局背景樂
      renderLobby(m);
    }
  } else {
    $('#connect').style.display = 'none';
    $('#lobby').style.display = 'none';
    $('#soloSetup').style.display = 'none'; // 單機設定畫面(若有)在開局後收起
    updateAutoStartCountdown({ started: true }); // 進入戰局:收起自動開局倒數覆蓋層
    $('#gameUI').style.display = 'block';
    audio.stopMusic();      // 進入戰局:停止大廳背景樂
    if (!board) {
      board = new Board3D($('#canvas3d'), onRegionClick, onPawnClick, onDeckClick);
      $('#btnPlaneViz').classList.toggle('on', (board.planeViz || 0) !== 0); // 預設「漸進變換」→ 亮起
    }
    audio.dock(true); // 進入戰局:靜音鈕移到地圖工具列、天氣切換鍵下方
    refreshGame(m);
  }
}

// ---------------- 大廳 ----------------
function renderLobby(m) {
  const { lobby } = m;
  $('#roomPin').textContent = lobby.pin;

  // 連線網址 + QR
  const base = lobby.urls[0] || location.origin;
  const joinUrl = `${base}/?room=${lobby.pin}`;
  $('#joinUrls').innerHTML = lobby.urls.map(u =>
    `<div class="join-url">${u}/?room=${lobby.pin}</div>`).join('')
    + `<div class="join-hint">(Tailscale 玩家請改用 tailscale IP)</div>`;
  const qrEl = $('#qrBox');
  qrEl.innerHTML = '';
  if (window.qrcode) {
    const qr = window.qrcode(0, 'M');
    qr.addData(joinUrl);
    qr.make();
    qrEl.innerHTML = qr.createImgTag(5, 8);
  }

  const randomChars = !!lobby.config?.randomChars;
  // 成員列表(含準備狀態 + 投票剔除按鈕)
  const kv = lobby.kickVotes || {};
  const kickNeed = Math.floor((lobby.clients.length - 1) / 2) + 1;
  $('#lobbyClients').innerHTML = lobby.clients.map(c => {
    const ch = c.charId ? CHARACTERS.find(x => x.id === c.charId) : null;
    const isMe = c.id === m.youId;
    const icon = c.isHost ? '👑' : c.mode === 'spectator' ? '👁️' : '🎮';
    const charText = ch ? `${ch.name}【${FACTIONS[ch.faction].name}】`
      : c.mode === 'spectator' ? '觀戰中'
      : randomChars ? '🎲 待隨機分配' : '── 未選角色 ──';
    const readyBadge = c.mode === 'player'
      ? (c.ready ? '<span class="ready-tag yes">✅ 已準備</span>' : '<span class="ready-tag no">⏳ 未準備</span>')
      : '';
    let kickBtn = '';
    if (!isMe && !c.isHost) {
      const voters = kv[c.id] || [];
      const iVoted = voters.includes(m.youId);
      kickBtn = `<button class="kick-btn ${iVoted ? 'voted' : ''}" data-kick="${c.id}" title="投票剔除此玩家(過半同意即移出)">🗳️ ${voters.length}/${kickNeed}</button>`;
    }
    return `<div class="seat${isMe ? ' me' : ''}${c.connected === false ? ' offline' : ''}">
      <span class="seat-no">${icon}</span>
      <span class="seat-name-ro">${c.name}</span>
      <span class="seat-char" style="color:${ch ? FACTIONS[ch.faction].css : '#667'}">${charText}</span>
      ${readyBadge}${kickBtn}
    </div>`;
  }).join('');

  // 房間設定(預計人數 / 遊戲名稱)
  if (document.activeElement !== $('#gameName')) $('#gameName').value = lobby.config?.gameName || '';
  $('#expectedCount').value = String(lobby.config?.expectedCount || 4);
  $('#gameName').disabled = !m.isHost;
  $('#expectedCount').disabled = !m.isHost;
  if (document.activeElement !== $('#roomPublic')) $('#roomPublic').checked = lobby.config?.isPublic !== false;
  $('#roomPublic').disabled = !m.isHost;

  // 角色池:遊戲人數 6+ 同時開放日韓
  const expected = lobby.config?.expectedCount || 4;
  const allowJPKR = expected >= RULES.jpkrMinPlayers;
  // 3 人以上:只剩我未選角且台灣沒人選 → 只能選台灣
  const playerClients = lobby.clients.filter(c => c.mode === 'player');
  const unselected = playerClients.filter(c => !c.charId);
  const mustTW = expected >= 3 && !lobby.takenChars.includes('tsmc') &&
    playerClients.length >= expected &&
    unselected.length === 1 && unselected[0].id === m.youId;
  // 陣營人數平衡:每陣營(米=含日、牆=含韓)選角上限 = 扣除台灣後折半(偶數→1:1)
  const sideCap = sideCapFor(expected);
  const sc = { US: 0, CN: 0 };
  for (const c of lobby.clients) {
    if (c.mode !== 'player' || !c.charId) continue;
    const cc = CHARACTERS.find(x => x.id === c.charId);
    if (!cc || cc.faction === 'TW') continue;
    sc[FACTIONS[cc.faction].side]++;
  }
  const meClient = lobby.clients.find(c => c.id === m.youId);
  const meReady = !!meClient && meClient.ready;
  // 角色清單可瀏覽但不可挑選:隨機分配模式、或我已按準備好
  const viewOnly = randomChars || meReady;
  // 角色卡 HTML(單張)
  const cardHtml = c => {
    const lockedJPKR = (c.faction === 'JP' || c.faction === 'KR') && !allowJPKR;
    const lockedTW = (mustTW && c.id !== 'tsmc') || (c.faction === 'TW' && expected < 3);
    const isMine = myCharId === c.id;
    const sideFull = c.faction !== 'TW' && !isMine && sc[FACTIONS[c.faction].side] >= sideCap;
    const taken = lobby.takenChars.includes(c.id);
    const locked = lockedJPKR || lockedTW || sideFull;
    return `<div class="char-card ${taken && !isMine ? 'taken' : ''} ${locked ? 'locked' : ''} ${isMine ? 'mine' : ''}"
      data-char="${c.id}" style="--fc:${FACTIONS[c.faction].css}">
      <div class="char-head">
        <img class="char-avatar" src="${charAvatar(c)}" alt="${c.name}" data-detail="${c.id}"
             title="點擊查看立繪 / 生平 / 能力特長" onerror="this.style.display='none'">
        <div class="char-head-text">
          <div class="char-name">${c.name}</div>
          <div class="char-real">${c.real}</div>
        </div>
      </div>
      <div class="char-ind">🏭 ${c.industry}|${c.industryDesc}(${TECH_CATEGORIES[catOf(c)].name})</div>
      <div class="char-perk">✨ ${c.perkText}</div>
      <div class="char-detail-hint" data-detail="${c.id}">🔍 查看立繪 / 生平 / 能力特長</div>
      ${lockedJPKR ? `<div class="lock-tip">遊戲人數 ${RULES.jpkrMinPlayers}+ 開放</div>` : ''}
      ${c.faction === 'TW' && expected < 3 ? '<div class="lock-tip">雙人局不開放</div>' : ''}
      ${lockedTW && c.faction !== 'TW' && !lockedJPKR ? '<div class="lock-tip">最後一位須選台灣</div>' : ''}
      ${sideFull && !lockedJPKR ? `<div class="lock-tip">陣營已滿 ${sideCap} 人</div>` : ''}
      ${taken && !isMine ? '<div class="lock-tip">已被鎖定(可輸入 PIN 認領)</div>' : ''}
      ${isMine ? '<div class="lock-tip mine-tip">✔ 你的角色</div>' : ''}
    </div>`;
  };
  // 依陣營/國籍分組顯示(隨機分配模式 / 已準備時清單仍顯示,只是不可挑選)
  const FACTION_ORDER = ['US', 'CN', 'TW', 'JP', 'KR'];
  const FACTION_DESC = { US: '矽谷霸權', CN: '神州科技', TW: '護國神山', JP: '匠人精神', KR: '財閥帝國' };
  const banner = randomChars
    ? '<div class="pool-banner">🎲 房主已開啟「角色隨機分配」:可瀏覽角色,但不可挑選 — 按左側「✅ 我準備好了」即可,開始時系統依平衡分配。</div>'
    : meReady
      ? '<div class="pool-banner">🔒 你已準備好:點角色無法更換,請先按「⏳ 取消準備」。未選角色者開始時將由系統隨機分配。</div>'
      : '';
  $('#charPool').classList.toggle('view-only', viewOnly);
  $('#charPool').innerHTML = banner + FACTION_ORDER.map(fid => {
    const list = CHARACTERS.filter(c => c.faction === fid);
    if (!list.length) return '';
    const fac = FACTIONS[fid];
    const jpkrLocked = (fid === 'JP' || fid === 'KR') && !allowJPKR;
    const side = fid === 'TW' ? null : FACTIONS[fid].side;
    const capInfo = side ? `・${side === 'US' ? '親美' : '親中'} ${sc[side]}/${sideCap}` : '';
    return `<section class="char-group" style="--fc:${fac.css}">
      <div class="char-group-head">
        <img class="fac-flag" src="${factionFlag(fid)}" alt="" onerror="this.style.display='none'">
        <span class="cg-name">${fac.name}</span>
        <span class="cg-desc">${FACTION_DESC[fid] || ''}</span>
        <span class="cg-count">${list.length} 位${jpkrLocked ? `・需 ${RULES.jpkrMinPlayers}+ 人` : capInfo}</span>
      </div>
      <div class="char-group-grid">${list.map(cardHtml).join('')}</div>
    </section>`;
  }).join('');

  $('#hostModeBox').style.display = m.isHost ? '' : 'none';
  $('#startBtn').style.display = m.isHost ? '' : 'none';
  if (document.activeElement !== $('#hostSpectate'))
    $('#hostSpectate').checked = !!meClient && meClient.mode === 'spectator';
  if (document.activeElement !== $('#randomChars'))
    $('#randomChars').checked = randomChars;
  $('#randomChars').disabled = !m.isHost;
  // 準備按鈕(參與者皆可;隨機分配模式為主要操作)
  const amPlayer = !!meClient && meClient.mode === 'player';
  const readyBtn = $('#readyBtn');
  readyBtn.style.display = amPlayer ? '' : 'none';
  if (amPlayer) {
    readyBtn.textContent = meClient.ready ? '⏳ 取消準備' : '✅ 我準備好了';
    readyBtn.classList.toggle('is-ready', !!meClient.ready);
  }
  updateModeVisibility();
  updateAutoStartCountdown(lobby); // 全員準備+滿員時顯示自動開局倒數覆蓋層
  const seated = lobby.clients.filter(c => c.mode === 'player' && c.charId);
  const readyCount = playerClients.filter(c => c.ready).length;
  $('#lobbyStatus').textContent = randomChars
    ? `🎲 隨機分配:可瀏覽不可挑選|已準備 ${readyCount}/${playerClients.length}(預計 ${expected} 人,缺額 AI;未選角者開局隨機分配)`
    : mustTW
      ? '🏔️ 你是最後一位未選角的玩家,必須選擇台灣(護國神山)!'
      : `已選角 ${seated.length}・已準備 ${readyCount}/${playerClients.length}・每陣營上限 ${sideCap}(親美 ${sc.US}・親中 ${sc.CN}${(expected - (expected >= 3 ? 1 : 0)) % 2 === 0 ? ',目標 1:1' : ''})`;
}

function updateModeVisibility() {
  const optOut = $('#hostSpectate').checked;
  const randomChars = $('#randomChars').checked;
  // 房主不參與 / 角色隨機分配時:只能用多人連線(上帝/單人模式需房主自己操角/選角)
  if (optOut || randomChars) $('#gameMode').value = 'multi';
  $('#gameMode').disabled = optOut || randomChars;
  const mode = $('#gameMode').value;
  const n = parseInt($('#expectedCount').value, 10);
  $('#modeHint').textContent = randomChars
    ? '🎲 角色隨機分配:全部已準備的玩家按開始時隨機發角色,缺額由 AI 頂替'
    : optOut
      ? '🙅 你只主持/觀戰 — 其他玩家對戰;若無人選角,按開始即為全 AI 觀賞局'
      : ({
          multi: n === 2 ? '⚔️ 2 人=米牆對決(無台灣規則)' : `共 ${n} 位玩家連線對戰(人數不足由 AI 頂替)`,
          god: `你一人輪流操控全部 ${n} 個角色`,
        }[mode] || '');
  updateStartGate(mode);
}

// 開始按鈕門檻:多人連線模式下,房間內所有參與玩家(含房主)都按下「準備好」房主才可開始;
// 全員準備且滿員時改由伺服器倒數自動開局(見 updateAutoStartCountdown)。上帝模式房主一人操控,不需等待。
function updateStartGate(mode) {
  const startBtn = $('#startBtn');
  const lob = last?.lobby;
  if (!startBtn || !lob) return;
  const participants = lob.clients.filter(c => c.mode === 'player' && c.connected !== false);
  const notReady = participants.filter(c => !c.ready);
  const gated = (mode || 'multi') === 'multi' && participants.length > 0 && notReady.length > 0;
  startBtn.disabled = gated;
  startBtn.title = gated ? `還有 ${notReady.length} 位玩家尚未按「準備好」` : '';
  startBtn.textContent = gated ? `🚀 開始遊戲(待 ${notReady.length} 人準備)` : '🚀 開始遊戲';
}

// 全員(含房主)準備 + 滿員時,伺服器送來 startCountdownMs → 顯示全螢幕「即將開始 3..2..1」倒數;
// 倒數結束伺服器會自動開局(送來新的 sync)。期間有人取消準備 / 離開 → startCountdownMs 變 null → 收起。
let _cdTimer = null, _cdDeadline = 0;
function updateAutoStartCountdown(lobby) {
  const el = $('#startCountdown');
  if (!el) return;
  const ms = lobby?.startCountdownMs;
  if (ms == null || lobby.started) { // 取消 / 已開局:收起
    if (_cdTimer) { clearInterval(_cdTimer); _cdTimer = null; }
    el.classList.remove('show');
    return;
  }
  _cdDeadline = Date.now() + ms;
  const numEl = el.querySelector('.cd-num');
  let lastSec = -1;
  const tick = () => {
    const left = Math.max(0, _cdDeadline - Date.now());
    const sec = Math.ceil(left / 1000);
    if (sec !== lastSec) { // 每秒換數字才播一次「滴」聲、重置彈跳動畫
      numEl.textContent = sec > 0 ? sec : 'GO!';
      numEl.classList.remove('pulse'); void numEl.offsetWidth; numEl.classList.add('pulse');
      if (sec > 0) try { audio.sfx('move'); } catch { /* 音效未解鎖 */ }
      lastSec = sec;
    }
    if (left <= 0 && _cdTimer) { clearInterval(_cdTimer); _cdTimer = null; }
  };
  if (!_cdTimer) { el.classList.add('show'); _cdTimer = setInterval(tick, 120); }
  tick();
}

function catOf(c) {
  return { '交通': 'power', '汽車': 'power', '硬體': 'hardware', '手機': 'hardware', '晶片': 'hardware', '資訊': 'info', 'AI': 'ai', '娛樂': 'fun' }[c.industry];
}

// 每個陣營(米=含日、牆=含韓)的選角上限:扣除台灣 1 席後折半(與伺服器 sideCapFor 一致)
function sideCapFor(expected) {
  const twSeat = expected >= 3 ? 1 : 0;
  return Math.max(1, Math.ceil((expected - twSeat) / 2));
}

// 選擇/認領角色(大廳卡片與角色詳情共用)
function selectChar(charId) {
  if (!last?.lobby || last.lobby.started) return;
  if (last.lobby.config?.randomChars) { toast('🎲 角色隨機分配模式:請改用「準備好」按鈕'); return; }
  if (last.lobby.clients.find(c => c.id === last.youId)?.ready) {
    toast('你已準備好,請先按「⏳ 取消準備」才能選擇/更換角色'); return;
  }
  const ch = CHARACTERS.find(c => c.id === charId);
  if (!ch) return;
  const taken = last.lobby.takenChars.includes(charId) && myCharId !== charId;
  if (taken) {
    // 別人的角色:輸入該角色的 PIN 認領(換裝置/載入存檔重連)
    openModal(`🔑 認領角色 — ${ch.name}`,
      `<p>此角色已被鎖定。輸入正確的角色 PIN 即可從這台裝置接管它。</p>
       <input id="charPinInput" class="pin-input" type="password" inputmode="numeric" maxlength="8" placeholder="角色 PIN">`,
      [{ label: '認領', value: true }, { label: '取消', value: null }],
      val => {
        if (!val) return;
        const pin = $('#charPinInput').value;
        if (pin) setMyPin(pin); // 認領成功的 PIN 之後沿用
        net.send({ t: 'selectChar', charId, charPin: pin });
      });
    setTimeout(() => $('#charPinInput')?.focus(), 50);
    return;
  }
  if (!getMyPin()) {
    // 第一次:設定個人 PIN,之後切換角色都沿用
    openModal(`🔒 設定你的 PIN — 只需設定一次`,
      `<p>設定一組個人 PIN(至少 4 位數)。之後切換角色、換裝置重連都用同一組,不必重設。</p>
       <input id="charPinInput" class="pin-input" type="password" inputmode="numeric" maxlength="8" placeholder="你的 PIN">`,
      [{ label: '設定並選擇角色', value: true }, { label: '取消', value: null }],
      val => {
        if (!val) return;
        const pin = $('#charPinInput').value;
        if (!pin || pin.length < 4) { toast('PIN 至少 4 位數'); return; }
        setMyPin(pin);
        net.send({ t: 'selectChar', charId, charPin: pin });
      });
    setTimeout(() => $('#charPinInput')?.focus(), 50);
    return;
  }
  // 已有個人 PIN:直接切換角色
  net.send({ t: 'selectChar', charId, charPin: getMyPin() });
}

// 角色能力特長:長條填到加權值,數值以「初始(加權)」呈現(基準 3 = 平均)
function strengthBars(ch) {
  const MAX = 5, BASE = 3;
  return STRENGTH_AXES.map(ax => {
    const v = Math.max(0, Math.min(MAX, ch.strengths?.[ax.key] ?? 0));
    return `<div class="cd-str-row">
      <span class="cd-str-label">${ax.icon} ${ax.name}</span>
      <span class="cd-str-track"><span class="cd-str-fill" style="width:${v / MAX * 100}%"></span></span>
      <span class="cd-str-val">${BASE} (${v})</span>
    </div>`;
  }).join('');
}

// 角色詳情:全版立繪 / 角色生平(網路梗)/ 能力特長加權;支援左右切換
let cdCurrentId = null, cdOpts = {};
function cdNavigate(dir) {
  const ids = CHARACTERS.map(c => c.id);
  let i = ids.indexOf(cdCurrentId);
  if (i < 0) return;
  openCharDetail(ids[(i + dir + ids.length) % ids.length], cdOpts);
}
function openCharDetail(charId, opts = {}) {
  const ch = CHARACTERS.find(c => c.id === charId);
  if (!ch) return;
  cdCurrentId = charId; cdOpts = opts;
  const fac = FACTIONS[ch.faction];
  const cat = TECH_CATEGORIES[catOf(ch)];
  $('#charDetailOverlay .char-detail-box').style.setProperty('--fc', fac.css);
  const portrait = $('#cdPortrait');
  portrait.style.visibility = 'visible';
  portrait.src = charPortrait(ch);
  portrait.alt = ch.name;
  const logoEl = $('#cdLogo');
  const logo = charLogo(ch);
  if (logo) { logoEl.style.display = ''; logoEl.src = logo; } else { logoEl.style.display = 'none'; }
  const facEl = $('#cdFaction');
  facEl.innerHTML = `<img class="fac-flag" src="${factionFlag(ch.faction)}" alt="" onerror="this.style.display='none'">${fac.name}陣營`;
  facEl.style.color = fac.css;
  const nameEl = $('#cdName');
  nameEl.textContent = ch.name; nameEl.style.color = fac.css;
  $('#cdReal').textContent = ch.real;
  $('#cdIndustry').textContent = `🏭 ${ch.industry}｜${ch.industryDesc}（${cat.icon} ${cat.name}）`;
  $('#cdPerk').textContent = `✨ ${ch.perkText}`;
  $('#cdBio').textContent = ch.bio || '(暫無生平)';
  $('#cdStrengths').innerHTML = strengthBars(ch);

  // 大廳開啟時提供「選擇此角色」捷徑
  const actions = $('#cdActions');
  actions.innerHTML = '';
  if (opts.fromLobby && last && !last.lobby?.started) {
    const meC = last.lobby.clients.find(c => c.id === last.youId);
    const taken = last.lobby.takenChars.includes(charId) && myCharId !== charId;
    const isMine = myCharId === charId;
    if (last.lobby.config?.randomChars) {
      actions.innerHTML = '<div class="cd-mine">🎲 隨機分配模式:不可挑選</div>';
    } else if (meC && meC.ready) {
      actions.innerHTML = '<div class="cd-mine">🔒 已準備好,需先「取消準備」才能更換</div>';
    } else if (isMine) {
      const btn = document.createElement('button');
      btn.className = 'btn big';
      btn.textContent = '↩️ 取消選擇此角色';
      btn.onclick = () => { $('#charDetailOverlay').style.display = 'none'; net.send({ t: 'selectChar', charId }); };
      actions.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn big';
      btn.textContent = taken ? '🔑 認領此角色' : '✅ 選擇此角色';
      btn.onclick = () => { $('#charDetailOverlay').style.display = 'none'; selectChar(charId); };
      actions.appendChild(btn);
    }
  } else if (opts.solo && SOLO) {
    // 單機設定畫面開啟:提供「選擇此角色」捷徑(依目前人數驗證日韓/台灣可選性)
    const expected = parseInt($('#soloCount').value, 10);
    const allowJPKR = expected >= RULES.jpkrMinPlayers;
    const allowTW = expected >= 3;
    const locked = ((ch.faction === 'JP' || ch.faction === 'KR') && !allowJPKR) || (ch.faction === 'TW' && !allowTW);
    const isMine = soloChar === charId;
    const btn = document.createElement('button');
    btn.className = 'btn big';
    if (locked) {
      btn.disabled = true;
      btn.textContent = ch.faction === 'TW' ? '台灣需 3 人以上' : `日韓需 ${RULES.jpkrMinPlayers} 人以上`;
    } else {
      btn.textContent = isMine ? '↩️ 取消選擇此角色' : '✅ 選擇此角色';
      btn.onclick = () => { $('#charDetailOverlay').style.display = 'none'; pickSoloChar(isMine ? null : charId); };
    }
    actions.appendChild(btn);
  }
  $('#charDetailOverlay').style.display = 'flex';
}

function setupLobbyEvents() {
  $('#charDetailClose').addEventListener('click', () => $('#charDetailOverlay').style.display = 'none');
  $('#charDetailOverlay').addEventListener('click', e => {
    if (e.target.id === 'charDetailOverlay') e.currentTarget.style.display = 'none';
  });
  $('#lobbyBackBtn').addEventListener('click', () => {
    openModal('↩️ 返回開始頁', '<p>確定要離開大廳、回到開始頁面嗎?(可重新輸入 PIN 再加入)</p>',
      [{ label: '返回開始頁', value: true }, { label: '取消', value: null }],
      val => { if (val) location.href = location.origin + location.pathname; });
  });
  $('#cdPrev').addEventListener('click', () => cdNavigate(-1));
  $('#cdNext').addEventListener('click', () => cdNavigate(1));
  document.addEventListener('keydown', e => {
    if ($('#charDetailOverlay').style.display !== 'flex') return;
    if (e.key === 'ArrowLeft') cdNavigate(-1);
    else if (e.key === 'ArrowRight') cdNavigate(1);
    else if (e.key === 'Escape') $('#charDetailOverlay').style.display = 'none';
  });
  // 按 V 鍵循環「空運(飛機航線)」顯示模式:完全顯示 → 高透明度 → 漸隱交替 → 回到完全顯示
  document.addEventListener('keydown', e => {
    if (e.key !== 'v' && e.key !== 'V') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    if (!board) return;
    toast(`${board.cyclePlaneViz()}(按 V 切換)`);
  });
  $('#charPool').addEventListener('click', e => {
    // 點頭像/放大鏡 → 查看立繪/生平/能力(即使該角色已鎖定或不可選也能瀏覽)
    const detailEl = e.target.closest('[data-detail]');
    if (detailEl) { openCharDetail(detailEl.dataset.detail, { fromLobby: true }); return; }
    const card = e.target.closest('.char-card');
    if (!card) return;
    const me = last?.lobby?.clients.find(c => c.id === last.youId);
    if (last?.lobby?.config?.randomChars) { toast('🎲 隨機分配模式:可瀏覽角色,開始時由系統發牌'); return; }
    if (me && me.ready) { toast('你已準備好,請先按「⏳ 取消準備」才能更換角色'); return; }
    // 點自己已選的角色 → 取消選擇
    if (card.dataset.char === myCharId) { net.send({ t: 'selectChar', charId: myCharId }); return; }
    if (card.classList.contains('locked')) return;
    selectChar(card.dataset.char);
  });
  $('#gameMode').addEventListener('change', updateModeVisibility);
  $('#hostSpectate').addEventListener('change', e => {
    net.send({ t: 'setMode', mode: e.target.checked ? 'spectator' : 'player' });
    updateModeVisibility(); // 立即反映(等不及伺服器回傳)
  });
  $('#randomChars').addEventListener('change', e =>
    net.send({ t: 'setRoomConfig', randomChars: e.target.checked }));
  $('#readyBtn').addEventListener('click', () => {
    const me = last?.lobby?.clients.find(c => c.id === last.youId);
    net.send({ t: 'setReady', ready: !(me && me.ready) });
  });
  $('#lobbyClients').addEventListener('click', e => {
    const kickEl = e.target.closest('[data-kick]');
    if (!kickEl) return;
    net.send({ t: 'voteKick', targetId: Number(kickEl.dataset.kick) });
  });
  $('#gameName').addEventListener('change', () =>
    net.send({ t: 'setRoomConfig', gameName: $('#gameName').value }));
  $('#expectedCount').addEventListener('change', () =>
    net.send({ t: 'setRoomConfig', expectedCount: $('#expectedCount').value }));
  $('#roomPublic').addEventListener('change', e =>
    net.send({ t: 'setRoomConfig', isPublic: e.target.checked }));
  $('#startBtn').addEventListener('click', () =>
    net.send({ t: 'startGame', mode: $('#gameMode').value }));
}

// ---------------- 存檔/載入 ----------------
function showSavesList(list) {
  const myName = () => $('#myName')?.value?.trim() || localStorage.getItem('ctw_name') || '';
  $('#modalTitle').innerHTML = '📂 載入遊戲';
  $('#modalBody').innerHTML = '<p class="modal-desc">載入會建立新房間,玩家以原 PIN 認領角色。🗑️ 可刪除單筆存檔。</p>'
    + (list.length ? '<div class="saves-list">' + list.slice(0, 20).map(s => `
        <div class="save-row">
          <button class="btn small-btn save-load" data-file="${s.file}">▶️ 載入</button>
          <div class="save-meta">
            <div>${s.auto ? '🔄' : '💾'} ${s.name}|第 ${s.round ?? '-'} 輪${s.over ? '(已結束)' : ''}</div>
            <div class="save-players">${(s.players || []).join('、')}　${(s.savedAt || '').slice(0, 16).replace('T', ' ')}</div>
          </div>
          <button class="btn small-btn save-del" data-file="${s.file}" title="刪除此存檔">🗑️</button>
        </div>`).join('') + '</div>'
      : '<p class="modal-desc">(目前沒有任何存檔)</p>');
  $('#modalOptions').innerHTML =
    '<button class="btn save-clear">🗑️ 清除所有暫存檔(自動存檔)</button>'
    + '<button class="btn save-close">關閉</button>';
  $('#modal').style.display = 'flex';
  $('#modalBody').onclick = e => {
    const load = e.target.closest('.save-load'), del = e.target.closest('.save-del');
    if (load) {
      $('#modal').style.display = 'none';
      net.send({ t: 'loadGame', file: load.dataset.file, name: myName() });
    } else if (del) {
      net.send({ t: 'deleteSave', file: del.dataset.file });
      net.send({ t: 'listSaves' }); // 重抓列表 → onOther 重繪此 modal
    }
  };
  $('#modalOptions').onclick = e => {
    if (e.target.closest('.save-clear')) { net.send({ t: 'clearAutosaves' }); net.send({ t: 'listSaves' }); }
    else if (e.target.closest('.save-close')) $('#modal').style.display = 'none';
  };
}

// ---------------- 遊戲畫面 ----------------
function refreshGame(m) {
  const s = m.state;
  board.myCharId = myCharId;   // 讓 3D 標出「你」的棋子
  board.sync(s);
  processFx(s);
  renderTechBar(s);
  renderPlayersList(s);
  renderLog(s);
  maybeToastLog(s);

  const me = myPlayer();
  const spectating = !me;

  // 提示音(僅限有座位玩家、狀態轉變時):輪到你 / 進入交易環節
  if (me && !s.over) {
    if (s.phase === 'play' && s.turnIdx !== lastTurnIdx && s.players[s.turnIdx]?.id === me.id) audio.sfx('turn');
    else if (s.phase === 'trade' && lastPhase !== 'trade') audio.sfx('turn');
  }
  // 換人行動:鏡頭自動跟隨當前行動角色(輪到誰畫面就跟著誰,含 AI / 對手)
  if (board && !s.over && s.phase === 'play' && s.turnIdx !== lastTurnIdx) {
    const cur = s.players[s.turnIdx];
    if (cur) board.focusRegion(cur.pos);
  }
  lastTurnIdx = s.turnIdx; lastPhase = s.phase;

  $('#actionBar').style.display = spectating ? 'none' : '';
  $('#handWrap').style.display = spectating ? 'none' : '';
  $('#spectatorTag').style.display = spectating ? '' : 'none';

  if (!spectating) {
    renderMyPanel(m);
    renderHand(m);
    renderActions(m);
  } else {
    $('#curName').textContent = '👁️ 觀戰模式';
    $('#curStats').textContent = '';
    $('#curPerk').textContent = '';
  }

  const turnP = s.players[s.turnIdx];
  $('#turnBanner').innerHTML = s.over ? '🏁 遊戲結束'
    : s.phase === 'trade' ? '🤝 交易環節 — 自由交換資源'
    : `輪到 <b style="color:${FACTIONS[turnP.faction].css}">${turnP.name}</b>${isMyTurn() ? '(你!)' : ''}`;
  $('#hostBar').style.display = m.isHost ? '' : 'none';
  renderMobileDock(m); // 手機底部 dock(依角色:觀戰無「操作」、房主多「主持」)

  // 交易環節 overlay
  const meP = myPlayer();
  if (s.phase === 'trade' && meP && !s.over) {
    renderTrade(m, meP);
    $('#tradeOverlay').style.display = 'flex';
  } else {
    $('#tradeOverlay').style.display = 'none';
  }

  if (mode === 'move' && !isMyTurn()) setMode('idle');
  if (s.over && !resultShown) { resultShown = true; showResult(s); }
}

function renderTechBar(s) {
  const lead = s.tech.US - s.tech.CN;
  const yrs = pts => Math.round(pts / RULES.pointsPerYear * 10) / 10;
  $('#techUS').textContent = s.tech.US;
  $('#techCN').textContent = s.tech.CN;
  $('#techLead').innerHTML = lead > 0 ? `米國領先 <b>${lead}</b> 點(${yrs(lead)} 年)`
    : lead < 0 ? `牆國反超 <b>${-lead}</b> 點(${yrs(-lead)} 年)` : '雙方持平!';
  $('#techGoal').textContent =
    `1 年 = ${RULES.pointsPerYear} 點|米國勝利:領先 ${yrs(s.usThreshold)} 年|牆國勝利:差距 ≤ ${yrs(s.cnThreshold)} 年|${s.roundLabel}(共 ${Math.ceil((s.maxRounds || RULES.maxRounds) / RULES.seasonsPerYear)} 年)`;
  $('#eventLine').textContent = s.event
    ? `🌏 本季事件【${s.event.icon} ${s.event.name}】${s.event.desc}` : '';
  const total = 800;
  $('#barUS').style.width = Math.min(100, s.tech.US / total * 100) + '%';
  $('#barCN').style.width = Math.min(100, s.tech.CN / total * 100) + '%';
  if (s.hasTW) {
    const twTag = s.twRevealed ? `公開支持${FACTIONS[s.twSupportPublic].name}` : '立場成謎';
    $('#twStatus').textContent = `🏔️ 台灣:${twTag}`;
  } else {
    $('#twStatus').textContent = '⚔️ 雙人對決:無台灣特殊規則';
  }
}

function renderMyPanel(m) {
  const me = myPlayer();
  const priv = m.priv;
  $('#curName').innerHTML = `<img class="panel-avatar" src="${charAvatar(me.charId)}" alt=""
      data-detail="${me.charId}" title="查看角色詳情" onerror="this.style.display='none'">
    <span class="panel-name" style="color:${FACTIONS[me.faction].css}">${me.name}</span>
    <span class="panel-fac">【${FACTIONS[me.faction].name}】</span>`;
  const myTech = last.state.tech[me.faction] ?? 0;
  let stats = `💰 <b>${me.res.money}</b>  ⚡ <b>${me.res.power}</b>  🛢️ <b>${me.res.oil}</b>  🎯 行動點 <b>${me.ap}</b>  📍 ${REGIONS.find(r => r.id === me.pos).name}<br>📈 收入 基礎 ${fmtRes(RULES.baseIncome)}(加權 <b class="wval" data-bd="income" title="點擊看加權成分">${fmtRes(me.income)}</b> 🔎)/回合  🔬 本國科技力 <b>${myTech}</b> 點(每 100 點收益 +1)`;
  if (me.faction === 'TW' && priv) {
    if (priv.twSupport) {
      stats += `<br>🤫 秘密支持:<b style="color:${FACTIONS[priv.twSupport].css}">${FACTIONS[priv.twSupport].name}</b>  🏔️ 神山儲備:<b>${priv.chipReserve}</b> 點`;
    } else {
      stats += `<br>🤫 秘密立場:<b style="color:#ff6">尚未選定 — 第 1 季內須選邊,逾期隨機!</b>`;
    }
  }
  $('#curStats').innerHTML = stats;
  const ch = CHARACTERS.find(c => c.id === me.charId);
  $('#curPerk').textContent = `✨ ${ch.perkText}`;
}

function renderPlayersList(s) {
  $('#playersList').innerHTML = s.players.map(q => {
    const active = q.id === s.turnIdx && !s.over;
    return `<div class="pl-row ${active ? 'active' : ''}">
      <img class="pl-avatar" src="${charAvatar(q.charId)}" alt="" data-detail="${q.charId}"
           title="查看角色詳情" style="border-color:${FACTIONS[q.faction].css}" onerror="this.style.display='none'">
      <span class="pl-name">${q.isAI ? '🤖' : ''}${q.name}</span>
      <span class="pl-info">💰${q.res.money} ⚡${q.res.power} 🛢️${q.res.oil} 🃏${q.handCount}</span>
    </div>`;
  }).join('');
}

// 灰色作戰卡依類型上色,與棋盤特效光束同色系(spy 紅 / steal 綠 / fake 粉)
const OPS_COLOR = { spy: '#ff5a5a', steal: '#2eff8f', fake: '#ff2bd6' };
const OPS_CAT_NAME = { spy: '間諜', steal: '竊取', fake: '假新聞' }; // 灰卡三類中文名
// 右上角等級徽章的「卡種圖示」:🔬=科技卡、💣=灰色作戰卡(與 STRENGTH_AXES 的科技/作戰圖示一致)
const CARD_KIND_ICON = { tech: '🔬', ops: '💣' };

// 卡種 → 顏色 / 預設圖示 / 中文類別名(統一給卡面、徽章、詳情使用)
function cardKindMeta(kind, cat) {
  if (kind === 'event') return { color: '#2eff8f', icon: '🌏', label: '集體事件' };
  if (kind === 'tech') { const t = TECH_CATEGORIES[cat]; return { color: t.css, icon: t.icon, label: t.name }; }
  return { color: OPS_COLOR[cat] || '#9aa7c7', icon: '💣', label: OPS_CAT_NAME[cat] || '作戰卡' };
}

// 事件效果 → 卡面短標籤 + 好/壞色調(讓事件卡也有可掃讀的「角標」)
function eventEffectChip(e) {
  const ef = e.effect || {}; const t = ef.type; const m = ef.mult;
  const good = t === 'resBoost' || t === 'incomeBonus' || t === 'techDelta' || (t === 'catCost' && m < 1);
  const bad = t === 'resZero' || t === 'resHalf' || t === 'opsCost' || t === 'allCost'
    || (t === 'catCost' && m > 1) || (t === 'apDelta' && ef.val < 0);
  const tone = good ? 'ev-good' : bad ? 'ev-bad' : 'ev-neutral';
  const label = ({ resZero: '收入歸零', resHalf: '收入減半', resBoost: '收入加成', incomeBonus: '全資源 +1',
    catCost: m > 1 ? '建造漲價' : '建造降價', opsCost: '作戰漲價', allCost: '全面漲價',
    apDelta: `行動點 ${ef.val > 0 ? '+' : ''}${ef.val}`, techDelta: `科技力 +${ef.val}` })[t] || '事件效果';
  return { tone, label };
}

// 把不同來源(手牌 / 牌庫靜態科技卡 / 灰卡 / 事件)正規化成同一份「卡片物件」,
// 讓卡面(cardFaceHtml)與詳情(cardDetailHtml)在任何清單都長得跟手牌一模一樣。
function techCardLike(d, catId) {
  return { kind: 'tech', cat: catId, tier: d.tier, name: d.name, icon: d.icon || TECH_CATEGORIES[catId].icon,
    tech: d.tech, def: d.def, trade: d.trade, special: d.special, desc: d.desc, lore: d.lore,
    myCost: splitCost(d.cost, CATEGORY_RATIO[catId] || d.ratio || { money: 1, power: 1, oil: 1 }) };
}
function opsCardLike(o) {
  return { kind: 'ops', cat: o.cat, level: o.level, name: o.name, icon: o.icon, atk: o.atk,
    desc: o.desc, lore: o.lore, myCost: splitCost(o.cost, o.ratio) };
}
function eventCardLike(e) {
  return { kind: 'event', cat: null, name: e.name, icon: e.icon, desc: e.desc, __ev: e };
}

// 單張 3D 卡牌標記(手牌 / 牌庫一覽 / 事件一覽共用,確保牌面格式完全一致):
// 外層 .card 為點擊目標(手牌用 data-idx;牌庫/事件用 data-dk 供 modal 委派點擊看詳情)。
// 卡面分兩排顯示「能力數值」與「資源需求」;4 / 5 階卡加華麗高級邊框(card-lux4 / card-lux5)。
// opts: { idx 手牌索引 | dk 清單索引, copies 牌組張數, stateCls 事件本季/已發生樣式 }
function cardFaceHtml(c, opts = {}) {
  const k = c.kind;
  const isTech = k === 'tech', isEvent = k === 'event';
  const meta = cardKindMeta(k, c.cat);
  const icon = c.icon || meta.icon; // 每張卡專屬圖示(舊存檔無 icon 時退回類別圖)
  const lv = isEvent ? null : (isTech ? c.tier : (c.level || 0));
  const ability = isEvent ? null : (isTech ? `🔬${techDual(c)} 🛡️${c.def} 💱${c.trade}` : `⚔️${c.atk}`);
  const flavor = isEvent ? '' : isTech ? (c.desc || '') : (c.lore || c.desc || '');
  const blocked = !!c.playMsg; // 僅手牌:資源不足等 → 不可打出(不變暗,改禁止拖曳並提示,見 setupCardDrag)
  const lux = lv >= 4 ? lv : 0; // 4 / 5 階華麗框
  const kindCls = isTech ? 'card-tech' : isEvent ? 'card-event' : 'card-ops';
  const dataAttr = opts.idx != null ? ` data-idx="${opts.idx}"` : opts.dk != null ? ` data-dk="${opts.dk}"` : '';
  const extra = (lux ? ` card-lux card-lux${lux}` : '') + (blocked ? ' card-blocked' : '') + (opts.stateCls ? ` ${opts.stateCls}` : '');
  // 角標:科技 / 作戰卡 = [卡種圖示]LV{n};事件卡 = 效果性質標籤
  const badge = isEvent
    ? (() => { const ch = eventEffectChip(c.__ev || c); return `<span class="card-evtag ${ch.tone}">${ch.label}</span>`; })()
    : `<span class="card-tier"><span class="ct-ic">${CARD_KIND_ICON[isTech ? 'tech' : 'ops']}</span>LV${lv}</span>`;
  // 兩排:能力數值 / 資源需求(事件卡無數值 → 改用效果說明填滿)
  const statsBlock = isEvent
    ? `<div class="card-stats card-stats-ev"><div class="card-effect">${escapeHtml(c.desc || '')}</div></div>`
    : `<div class="card-stats">
        <div class="card-statline"><span class="cs-tag">能力</span>${ability}</div>
        <div class="card-cost"><span class="cs-tag">需求</span>${fmtRes(c.myCost)}</div>
      </div>`;
  const copiesBadge = opts.copies ? `<span class="card-copies" title="此牌在牌組中的張數">×${opts.copies}</span>` : '';
  const luxOver = lux >= 5
    ? `<div class="card-lux-ring"></div><div class="card-holo"></div><div class="card-gem">👑</div>`
    : lux === 4 ? `<div class="card-lux-ring"></div><div class="card-gem">⭐</div>` : '';
  return `<div class="card ${kindCls}${extra}"${dataAttr} style="--cc:${meta.color}">
    <div class="card3d">
      <div class="card-face card-front">
        <div class="card-hd"><span class="card-name">${escapeHtml(c.name)}</span>${badge}</div>
        <div class="card-art"><span class="card-icon">${icon}</span><span class="card-kind">${meta.label}</span>${c.special ? '<span class="card-fx">✨</span>' : ''}${copiesBadge}</div>
        ${statsBlock}
        ${isEvent ? '' : `<div class="card-desc">${escapeHtml(flavor)}</div>`}
        <div class="card-more">點擊看詳情 ›</div>
        <div class="card-shine"></div>
        <div class="card-edge"></div>
        ${luxOver}
      </div>
      <div class="card-face card-back"><span class="cb-mark">◈</span></div>
    </div>
  </div>`;
}

// 卡片詳情主體(手牌詳情與牌庫一覽點卡共用):卡圖 + 卡種/等級 + 完整數值 + 資源需求 + 解說 + 時空背景。
function cardDetailHtml(c) {
  const meta = cardKindMeta(c.kind, c.cat);
  const icon = c.icon || meta.icon;
  if (c.kind === 'event') {
    const ch = eventEffectChip(c.__ev || c);
    return `<div class="card-detail card-detail-ev" style="--cc:${meta.color}">
      <div class="cd-top">
        <div class="cd-art"><span class="cd-icon">${icon}</span></div>
        <div class="cd-meta">
          <div class="cd-kind">🌏 集體事件卡</div>
          <div class="cd-stats"><span class="card-evtag ${ch.tone}">${ch.label}</span></div>
        </div>
      </div>
      <div class="cd-desc">${escapeHtml(c.desc || '')}</div>
    </div>`;
  }
  const isTech = c.kind === 'tech';
  const lv = isTech ? c.tier : (c.level || 0);
  const kindName = isTech ? `${meta.label}科技卡` : `${meta.label}灰色作戰卡`;
  const stats = isTech
    ? `🔬 科技力 <b>${techDual(c)}</b>　🛡️ 防護 <b>${c.def}</b>　💱 交易 <b>${c.trade}</b>`
    : `⚔️ 攻擊力 <b>${c.atk}</b>`;
  const luxCls = lv >= 4 ? ` cd-lux cd-lux${lv}` : '';
  return `<div class="card-detail${luxCls}" style="--cc:${meta.color}">
    <div class="cd-top">
      <div class="cd-art"><span class="cd-icon">${icon}</span></div>
      <div class="cd-meta">
        <div class="cd-kind">${CARD_KIND_ICON[isTech ? 'tech' : 'ops']} ${kindName}・LV${lv}</div>
        <div class="cd-stats">${stats}</div>
        <div class="cd-cost">💲 資源需求 ${fmtRes(c.myCost)}</div>
      </div>
    </div>
    ${c.special ? `<div class="cd-special">✨ ${escapeHtml(c.special.text)}</div>` : ''}
    ${isTech ? techBreakLine(c) : ''}
    <div class="cd-desc">${escapeHtml(c.desc || '')}</div>
    ${c.lore ? `<div class="cd-lore">📖 ${escapeHtml(c.lore)}</div>` : ''}
  </div>`;
}

// 牌庫 / 事件一覽中點擊單卡 → 開該卡詳情(可附「返回牌庫」回到清單)
function showCardDetailModal(c, backFn) {
  const meta = cardKindMeta(c.kind, c.cat);
  const opts = [];
  if (backFn) opts.push({ label: '← 返回牌庫', value: 'back' });
  opts.push({ label: '關閉', value: null });
  openModal(`${c.icon || meta.icon} ${c.name}`, cardDetailHtml(c), opts,
    val => { if (val === 'back' && backFn) backFn(); });
}

function renderHand(m) {
  const priv = m.priv;
  const handEl = $('#hand');
  if (!priv) { handEl.innerHTML = ''; _prevHandUids = null; return; }
  // 手牌區不再顯示牌庫小卡堆(改由地圖「公牌區」點擊查看牌組組成,見 board onDeckClick → showDeckInfo)
  const cards = priv.hand.map((c, i) => cardFaceHtml(c, { idx: i })).join('');
  handEl.innerHTML = cards || '<div class="hand-empty">沒有手牌</div>';

  // 偵測本輪「新抽到」的卡(uid 不在上一輪手牌)。首次渲染 / 重連(_prevHandUids 為 null)
  // 只顯示不動畫,避免整手牌一起飛入。有新卡時:
  //  ・一般抽卡 → 播放「全螢幕抽卡」動畫(牌庫翻出 → 攤開揭示 → 收入手牌);
  //  ・升階合併剛結束(_suppressDrawFx 未過期)→ 改回小幅「翻入手牌格」避免與合併動畫疊播。
  const curUids = priv.hand.map(c => c.uid);
  if (_prevHandUids) {
    const prev = new Set(_prevHandUids);
    const fresh = priv.hand.filter(c => !prev.has(c.uid));
    if (fresh.length) {
      const suppressed = Date.now() < _suppressDrawFx;
      if (suppressed) { // 合併升階後:逐張小幅翻入手牌格
        let n = 0;
        priv.hand.forEach((c, i) => {
          if (prev.has(c.uid)) return;
          const el = handEl.querySelector(`.card[data-idx="${i}"]`);
          if (!el) return;
          el.classList.add('card-draw');
          el.style.setProperty('--draw-delay', (n * 0.14) + 's');
          n++;
        });
      } else { // 一般抽卡:全螢幕動畫
        showDrawFx(fresh);
      }
    }
  }
  _prevHandUids = curUids;
  requestAnimationFrame(updateHandFade); // 重繪後依內容寬度更新左右淡出
}

// 全螢幕抽卡動畫:中央牌庫翻出 N 張卡背 → 翻面攤成扇形揭示牌面 → 往下收進手牌淡出。
// 只在本機玩家實際抽到新卡時觸發(AI / 對手抽卡不播);最多視覺呈現 6 張,避免雜亂。
function showDrawFx(cards) {
  const host = $('#drawFx');
  if (!host || !cards || !cards.length) return;
  audio.sfx('draw');
  const cap = cards.slice(0, 6);
  const n = cap.length;
  const cardHtml = cap.map((c, k) => {
    const isTech = c.kind === 'tech';
    const cat = isTech ? TECH_CATEGORIES[c.cat] : null;
    const color = isTech ? cat.css : (OPS_COLOR[c.cat] || '#9aa7c7');
    const icon = c.icon || (isTech ? cat.icon : '💣'); // 每張卡專屬圖示
    const tier = isTech ? `${c.tier}階` : (c.level ? `Lv.${c.level}` : '');
    const off = (k - (n - 1) / 2).toFixed(3); // 以中心為基準的扇形欄位偏移
    return `<div class="dfx-card" style="--cc:${color}; --off:${off}; --d:${(k * 0.12).toFixed(2)}s">
      <div class="dfx-cf dfx-back">◈</div>
      <div class="dfx-cf dfx-front">
        <div class="dfx-ic">${icon}</div>
        <div class="dfx-nm">${escapeHtml(c.name || '')}</div>
        ${tier ? `<div class="dfx-tier">${tier}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  host.innerHTML = `<div class="dfx-stage">
    <div class="dfx-deck">◈<b>抽牌</b></div>
    <div class="dfx-fan">${cardHtml}</div>
  </div>`;
  host.classList.remove('show'); void host.offsetWidth; host.classList.add('show'); // 重置動畫
  clearTimeout(showDrawFx._t);
  showDrawFx._t = setTimeout(() => { host.classList.remove('show'); host.innerHTML = ''; }, 1800 + n * 140);
}

// 打出卡牌全螢幕動畫:卡片從下方升起放大到中央 → 衝擊光環爆開 → 上飄淡出。
// 本機玩家實際打出卡片時觸發(點擊或拖曳打出皆共用,見 onCardClick / chooseOpsTarget / playCardByDrag)。
function showPlayFx(c) {
  const host = $('#playFx');
  if (!host || !c) return;
  try { audio.sfx('upgrade'); } catch { /* 音效未解鎖 */ }
  const isTech = c.kind === 'tech';
  const cat = isTech ? TECH_CATEGORIES[c.cat] : null;
  const color = isTech ? cat.css : (OPS_COLOR[c.cat] || '#9aa7c7');
  const icon = isTech ? cat.icon : (c.icon || '💣');
  const tier = isTech ? `${c.tier}階` : (c.level ? `Lv.${c.level}` : '');
  const kindLabel = isTech ? cat.name : '作戰卡';
  host.innerHTML = `<div class="pfx-stage" style="--cc:${color}">
    <div class="pfx-ring"></div>
    <div class="pfx-card">
      <div class="pfx-ic">${icon}</div>
      <div class="pfx-nm">${escapeHtml(c.name || '')}</div>
      <div class="pfx-kind">${kindLabel}${tier ? ` · ${tier}` : ''}</div>
      <div class="pfx-label">🚀 打出卡牌!</div>
    </div>
  </div>`;
  host.classList.remove('show'); void host.offsetWidth; host.classList.add('show');
  clearTimeout(showPlayFx._t);
  showPlayFx._t = setTimeout(() => { host.classList.remove('show'); host.innerHTML = ''; }, 1500);
}

// 該張手牌目前「無法打出」的原因(資金不足/城市等級/已放棄/無合法目標…);可打出時回 null。
// 用於:禁止拖曳不可用的卡(不變暗,改跳提示)。
function cardBlockReason(c) {
  if (!isMyTurn()) return '還沒輪到你';
  const priv = last?.priv;
  if (!c || !priv) return '無法操作';
  if (c.kind !== 'tech') {
    if (priv.turnFlags?.forfeitOps) return '本回合已放棄打出作戰卡的權利';
    const targets = priv.targets?.[c.id] || [];
    if (!targets.length) return '沒有合法目標(超出航線範圍/防護太高/已被鎖定過)';
    return null;
  }
  if (priv.turnFlags?.forfeitTech) return '本回合已放棄打出科技卡的權利';
  // 盟友改建是合法的打出方式 → 即使本城自身不能蓋,只要有改建目標仍可拖曳打出
  const hasRescue = (priv.rescueTargets || []).some(rt => c.tier >= rt.tier);
  if (c.playMsg && !hasRescue) return c.playMsg; // 例:資源不足(需 …)/ 城市等級不足 / 一城一卡
  return null;
}

// 拖曳手牌到手牌區外 → 打出這張卡。科技卡可直接部署者立即打出並播動畫;
// 需選目標(作戰卡)或有特殊選項(盟友改建)者交回點擊流程處理。
function playCardByDrag(idx) {
  const priv = last?.priv;
  const c = priv?.hand?.[idx];
  if (!c) return;
  const block = cardBlockReason(c);
  if (block) { toast(`⚠️ ${block}`); return; }
  if (c.kind !== 'tech') { chooseOpsTarget(c, idx); return; } // 作戰卡:選目標(打出時於 chooseOpsTarget 播動畫)
  // 科技卡:有盟友改建選項 → 走詳情/選項流程;否則直接部署在目前城市
  const hasRescue = (priv.rescueTargets || []).some(rt => c.tier >= rt.tier);
  if (hasRescue) { onCardClick(idx); return; }
  showPlayFx(c);
  net.action('playTech', { handIdx: idx });
}

// 座標是否落在「手牌區」之外(以 #handWrap 外框 + 小外擴判定);拖曳卡片到此放開 = 打出
function isOutsideHand(x, y) {
  const w = $('#handWrap');
  if (!w) return false;
  const r = w.getBoundingClientRect();
  const M = 10; // 邊界外擴一點,避免貼邊誤判
  return x < r.left - M || x > r.right + M || y < r.top - M || y > r.bottom + M;
}

// 手牌拖曳:按住卡片拖動,移到手牌區外放開 = 打出。觸控以「縱向為主」才啟動拖曳,否則讓
// 手牌列照常水平捲動(避免捲動與打出衝突);純點按(未超過位移門檻)仍走 click 打出流程。
function setupCardDrag(handEl) {
  handEl.addEventListener('pointerdown', e => {
    if (e.button != null && e.button > 0) return; // 僅主鍵 / 觸控 / 觸控筆
    if (!isMyTurn()) return;
    const card = e.target.closest('.card');
    if (!card) return;
    _cardDrag = { idx: parseInt(card.dataset.idx, 10), card, x0: e.clientX, y0: e.clientY,
      moved: false, aborted: false, pid: e.pointerId, touch: e.pointerType !== 'mouse' };
  });
  handEl.addEventListener('pointermove', e => {
    const d = _cardDrag;
    if (!d || d.aborted || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 8) return; // 未達門檻:仍視為點按
      if (d.touch && Math.abs(dx) > Math.abs(dy)) { d.aborted = true; return; } // 觸控橫向 → 讓手牌捲動
      // 資源不足等原因不可使用 → 不變暗,但禁止拖曳並跳提示(仍可點按看詳情)
      const block = cardBlockReason(last?.priv?.hand?.[d.idx]);
      if (block) { d.aborted = true; toast(`⚠️ ${block}`); return; }
      d.moved = true;
      d.card.classList.add('card-dragging');
      d.card.style.removeProperty('--rx'); d.card.style.removeProperty('--ry');
      try { d.card.setPointerCapture(d.pid); } catch { /* 忽略 */ }
    }
    if (e.cancelable) e.preventDefault(); // 拖曳中阻止捲動 / 選取
    d.card.style.setProperty('--dragX', dx.toFixed(0) + 'px');
    d.card.style.setProperty('--dragY', dy.toFixed(0) + 'px');
    d.card.classList.toggle('card-drag-out', isOutsideHand(e.clientX, e.clientY)); // 移到區外 → 高亮「可打出」
  });
  const finish = e => {
    const d = _cardDrag;
    if (!d || e.pointerId !== d.pid) return;
    _cardDrag = null;
    d.card.classList.remove('card-dragging', 'card-drag-out');
    d.card.style.removeProperty('--dragX'); d.card.style.removeProperty('--dragY');
    try { d.card.releasePointerCapture(e.pointerId); } catch { /* 忽略 */ }
    if (d.moved && !d.aborted && isOutsideHand(e.clientX, e.clientY)) {
      _suppressCardClickUntil = Date.now() + 500; // 忽略接續觸發的 click(避免又跑點擊打出流程)
      playCardByDrag(d.idx);
    }
  };
  handEl.addEventListener('pointerup', finish);
  handEl.addEventListener('pointercancel', finish);
}

// 手牌太多時:固定區塊內左右捲動,捲到非端點時該側邊緣淡出(--fl/--fr 控制 mask)
function updateHandFade() {
  const w = $('#handWrap');
  if (!w) return;
  const max = w.scrollWidth - w.clientWidth;
  w.style.setProperty('--fl', w.scrollLeft > 4 ? '34px' : '0px');
  w.style.setProperty('--fr', w.scrollLeft < max - 4 ? '34px' : '0px');
}

// ---------------- 手機底部 dock(項目清單 + 抽屜)----------------
// 依角色產生可展開 / 收合的面板項目;點一下展開該面板成底部抽屜,再點收合回地圖,
// 切換到別項則自動收起前一張。項目過多時 dock 可左右滑,超出邊緣淡出(--dl/--dr,同手牌手法)。
function renderMobileDock(m) {
  const dock = $('#mobileDock');
  if (!dock) return;
  if (!dock._wired) {
    dock._wired = true;
    dock.addEventListener('click', e => {
      const b = e.target.closest('.mb-chip');
      if (b) setMbPanel(b.dataset.mb);
    });
    dock.addEventListener('scroll', updateDockFade, { passive: true });
    dock.addEventListener('wheel', e => {
      if (e.deltaY && dock.scrollWidth > dock.clientWidth) { dock.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    window.addEventListener('resize', updateDockFade);
  }
  const spectating = !myPlayer();
  const chips = [
    ['techBar', '📊', '戰況'],
    ['playerPanel', spectating ? '👁️' : '👤', spectating ? '觀戰' : '我的'],
    ['playersList', '👥', '對手'],
    ['log', '📜', '紀錄'],
  ];
  if (!spectating) chips.push(['bottomCenter', '🎮', '操作']);
  if (m.isHost) chips.push(['hostBar', '💾', '主持']);
  const sig = chips.map(c => c[0]).join(',');
  if (sig !== _mbSig) {
    _mbSig = sig;
    dock.innerHTML = chips.map(([id, ic, lb]) =>
      `<button class="mb-chip" data-mb="${id}"><span class="mb-ic">${ic}</span><span class="mb-lb">${lb}</span></button>`).join('');
    requestAnimationFrame(updateDockFade);
  }
  if (mbPanel && !chips.some(c => c[0] === mbPanel)) mbPanel = null; // 開著的面板已不適用(如轉觀戰)→ 收合
  applyMbActive();
}

// 套用目前展開狀態到面板與 dock 項目(桌機 .mb-active 無對應規則,無害)
function applyMbActive() {
  for (const id of MB_PANELS) $('#' + id)?.classList.toggle('mb-active', id === mbPanel);
  for (const chip of document.querySelectorAll('.mb-chip')) chip.classList.toggle('on', chip.dataset.mb === mbPanel);
}

// 切換面板:再點同一項 = 收合;點別項 = 切換(自動收起前一張)
function setMbPanel(id) {
  mbPanel = (id === mbPanel) ? null : id;
  applyMbActive();
  if (mbPanel === 'bottomCenter') requestAnimationFrame(updateHandFade); // 操作抽屜展開後重算手牌淡出
}

// dock 太長時:左右捲動,捲到非端點時該側邊緣淡出
function updateDockFade() {
  const d = $('#mobileDock');
  if (!d) return;
  const max = d.scrollWidth - d.clientWidth;
  d.style.setProperty('--dl', d.scrollLeft > 4 ? '22px' : '0px');
  d.style.setProperty('--dr', (max > 4 && d.scrollLeft < max - 4) ? '22px' : '0px');
}

function renderActions(m) {
  const me = myPlayer();
  const priv = m.priv;
  const myTurn = isMyTurn();
  const s = m.state;

  const inTrade = s.phase === 'trade';
  for (const id of ['btnMove', 'btnUpgradeCard', 'btnEnd', 'btnReveal', 'btnPivot',
    'btnForfTech', 'btnForfOps', 'btnForfMove', 'btnUpgrade', 'btnExchange'])
    $('#' + id).disabled = !myTurn || inTrade;

  if (myTurn && priv && !inTrade) {
    const cu = priv.cardUpgrade;
    if (cu) {
      $('#btnUpgradeCard').textContent = `⏫ 升階卡片(4階庫${cu.pool4}/5階庫${cu.pool5})`;
      $('#btnUpgradeCard').disabled = !(cu.can4 || cu.can5);
    } else {
      $('#btnUpgradeCard').textContent = '⏫ 升階卡片';
      $('#btnUpgradeCard').disabled = true;
    }
    const f = priv.turnFlags || {};
    const g = priv.forfeitGain ?? RULES.forfeitBase;
    $('#btnForfTech').textContent = f.forfeitTech ? '♻️ 已放棄科技' : `♻️ 放棄科技 → ⚡${g}`;
    $('#btnForfTech').disabled = f.forfeitTech || f.playedTech;
    $('#btnForfOps').textContent = f.forfeitOps ? '♻️ 已放棄作戰' : `♻️ 放棄作戰 → 💰${g}`;
    $('#btnForfOps').disabled = f.forfeitOps || f.playedOps;
    $('#btnForfMove').textContent = f.forfeitMove ? '♻️ 已放棄行動' : `♻️ 放棄行動 → 🛢️${g}`;
    $('#btnForfMove').disabled = f.forfeitMove || f.moved;
    $('#btnMove').disabled = !!f.forfeitMove;
    const up = priv.upgrade;
    if (up) {
      $('#btnUpgrade').textContent = up.cost === null
        ? `⬆️ 城市已滿級(Lv.${up.level})`
        : `⬆️ 升級城市 Lv.${up.level}→${up.level + 1}(⚡${up.cost})`;
      $('#btnUpgrade').disabled = up.cost === null || me.ap < 1 || me.res.power < up.cost;
    }
    $('#btnExchange').textContent = f.exchanged ? '💱 本回合已兌換' : `💱 金錢兌換(${RULES.exchangeRate}💰=1)`;
    $('#btnExchange').disabled = f.exchanged || me.res.money < RULES.exchangeRate;
  } else {
    $('#btnUpgradeCard').textContent = '⏫ 升階卡片';
  }
  $('#btnMove').classList.toggle('toggled', mode === 'move');

  const isTW = me.faction === 'TW';
  const twUnset = isTW && priv && !priv.twSupport && !s.over;
  $('#btnTwChoose').style.display = twUnset ? '' : 'none';
  $('#btnTwChoose').disabled = false; // 選邊不耗 AP、不受輪次限制(限第 1 季)
  $('#btnPivot').style.display = isTW && !twUnset && !s.twRevealed && !s.twPivoted ? '' : 'none';
  $('#btnReveal').style.display = isTW && !twUnset && !s.twRevealed ? '' : 'none';
  if (twUnset && !twChoosePrompted) { twChoosePrompted = true; openTwChooseModal(); }
}

// 捨牌升階(換 4/5 階卡):勾選要捨棄的手牌,湊出加總/張數後確定
function openCardUpgradeModal() {
  const priv = last?.priv;
  const cu = priv?.cardUpgrade;
  if (!priv || !cu) { toast('目前無法升階'); return; }
  const hand = priv.hand;
  const lvlOf = c => c.kind === 'tech' ? c.tier : (c.level || 0);
  const draw = toTier => {
    const eligible = hand.map((c, i) => ({ c, i, lv: lvlOf(c) }))
      .filter(o => o.lv >= 1 && (toTier === 4 ? o.lv <= 3 : o.lv === 4));
    const need = toTier === 4 ? `級數加總正好 ${cu.sum}` : `${cu.need5} 張 Lv.4 卡`;
    const pool = toTier === 4 ? cu.pool4 : cu.pool5;
    const tabs = `<div class="upg-tabs">
      <button class="btn small-btn ${toTier === 4 ? 'toggled' : ''}" data-totier="4" ${cu.pool4 ? '' : 'disabled'}>換 4 階卡(庫存 ${cu.pool4})</button>
      <button class="btn small-btn ${toTier === 5 ? 'toggled' : ''}" data-totier="5" ${cu.pool5 ? '' : 'disabled'}>換 5 階卡(庫存 ${cu.pool5})</button>
    </div>`;
    const rows = eligible.length ? eligible.map(o => {
      const icon = o.c.icon || (o.c.kind === 'tech' ? TECH_CATEGORIES[o.c.cat].icon : '💣'); // 每張卡專屬圖示
      const tag = o.c.kind === 'ops' ? '灰卡' : '階';
      return `<label class="upg-row"><input type="checkbox" class="upg-ck" data-idx="${o.i}" data-tier="${o.lv}">
        ${icon}【${o.c.name}】Lv.${o.lv}${tag === '灰卡' ? ' 灰卡' : ''}</label>`;
    }).join('')
      : `<div class="modal-desc">(沒有可用於換 ${toTier} 階卡的手牌卡片)</div>`;
    $('#modalTitle').innerHTML = '⏫ 捨牌升階';
    $('#modalBody').innerHTML = tabs
      + `<p class="modal-desc">捨棄手牌卡片(科技卡或灰色作戰卡,不分類)換取 1 張 ${toTier} 階卡(消耗 ${cu.ap} 行動點)。需${need};該階卡庫剩 ${pool} 張。</p>`
      + `<div class="upg-list">${rows}</div><div id="upgSum" class="modal-desc"></div>`;
    $('#modalOptions').innerHTML =
      `<button class="btn" id="upgConfirm">確定升階</button><button class="btn" id="upgCancel">取消</button>`;
    $('#modal').style.display = 'flex';
    const updateSum = () => {
      const cks = [...$('#modalBody').querySelectorAll('.upg-ck:checked')];
      const sum = cks.reduce((t, e) => t + parseInt(e.dataset.tier, 10), 0);
      const ok = toTier === 4 ? sum === cu.sum : cks.length === cu.need5;
      $('#upgSum').textContent = toTier === 4
        ? `已選級數加總:${sum} / ${cu.sum}` : `已選 ${cks.length} / ${cu.need5} 張 Lv.4 卡`;
      $('#upgConfirm').disabled = !ok || pool === 0;
    };
    updateSum();
    $('#modalBody').onclick = e => {
      if (e.target.classList.contains('upg-ck')) { updateSum(); return; }
      const tab = e.target.closest('button[data-totier]');
      if (tab) draw(parseInt(tab.dataset.totier, 10));
    };
    $('#modalOptions').onclick = e => {
      if (e.target.id === 'upgConfirm') {
        const idxs = [...$('#modalBody').querySelectorAll('.upg-ck:checked')].map(x => parseInt(x.dataset.idx, 10));
        // 捨棄卡的圖示/顏色,供合併動畫呈現「聚合 → 升出新階卡」
        const items = idxs.map(ix => {
          const c = hand[ix];
          return c.kind === 'tech'
            ? { icon: TECH_CATEGORIES[c.cat].icon, color: TECH_CATEGORIES[c.cat].css }
            : { icon: c.icon || '💣', color: OPS_COLOR[c.cat] || '#9aa7c7' };
        });
        net.action('upgradeCard', { handIdxs: idxs, toTier });
        $('#modal').style.display = 'none';
        playMergeFx(items, toTier);
      } else if (e.target.id === 'upgCancel') {
        $('#modal').style.display = 'none';
      }
    };
  };
  draw(cu.can4 || !cu.can5 ? 4 : 5);
}

// 合併升階動畫:捨棄的卡(items=[{icon,color}])從四周聚合到中心 → 爆裂 → 升出新階卡;
// 動畫結束後伺服器回傳的新卡會再以「抽卡」翻入手牌(renderHand 的 uid 偵測)。
function playMergeFx(items, toTier) {
  const host = $('#mergeFx');
  if (!host || !items || !items.length) return;
  _suppressDrawFx = Date.now() + 3000; // 合併動畫期間抑制全螢幕抽卡,改用小幅翻入(見 renderHand)
  audio.sfx('upgrade');
  const n = items.length;
  const bc = toTier >= 5 ? '#ffd02e' : '#00f0ff';
  const R = 130;
  const cards = items.map((it, k) => {
    const ang = (k / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(Math.cos(ang) * R), y = Math.round(Math.sin(ang) * R);
    return `<div class="mfx-card" style="--sx:${x}px; --sy:${y}px; --cc:${it.color}; --d:${(k * 0.04).toFixed(2)}s"><span>${it.icon}</span></div>`;
  }).join('');
  host.innerHTML = `<div class="mfx-stage" style="--bc:${bc}">
    ${cards}
    <div class="mfx-core"></div>
    <div class="mfx-new" style="--cc:${bc}"><span class="mfx-new-ic">✦</span><span class="mfx-new-lb">${toTier} 階卡</span></div>
  </div>`;
  host.classList.add('show');
  clearTimeout(playMergeFx._t);
  playMergeFx._t = setTimeout(() => { host.classList.remove('show'); host.innerHTML = ''; }, 1900);
}

let twChoosePrompted = false;
function openTwChooseModal() {
  openModal('🤫 秘密選定立場(只有你看得到)',
    `<p>台灣是天生的造王者:秘密選擇你支持的陣營,押對寶就與該陣營一同獲勝。<br>
     第 1 季內未選擇將由命運隨機決定;選定後在表態前可用「🔄 秘密轉向」改變一次(1 AP,神山儲備折半)。</p>`,
    [{ label: '🔵 支持米國', value: 'US' },
     { label: '🔴 支持牆國', value: 'CN' },
     { label: '再想想', value: null }],
    val => { if (val) net.action('twChoose', { side: val }); });
}

function renderLog(s) {
  $('#log').innerHTML = s.log.map(l => `<div>${l}</div>`).join('');
  $('#log').scrollTop = $('#log').scrollHeight;
}

// 行動訊息饋送:有新的行動紀錄就用 toast 明確提示(首次同步/重連不重播歷史)
let lastLogLen = null;
function maybeToastLog(s) {
  const log = s.log || [];
  if (lastLogLen === null || log.length < lastLogLen) { lastLogLen = log.length; return; }
  if (log.length > lastLogLen && log.length) {
    toast(String(log[log.length - 1]).replace(/<[^>]*>/g, ''));
  }
  lastLogLen = log.length;
}

// ---------------- 行動 ----------------
function onRegionClick(rid) {
  if (!last?.state) return;
  if (mode === 'move' && isMyTurn()) {
    net.action('move', { regionId: rid });
    setMode('idle');
  } else {
    showRegionInfo(rid);
  }
}

// 點擊棋子:移動模式下視為點該城市(可移動),否則彈出該玩家/角色資訊
function onPawnClick(charId, rid) {
  if (!last?.state) return;
  if (mode === 'move' && isMyTurn()) { onRegionClick(rid); return; }
  showPlayerInfo(charId);
}

function showPlayerInfo(charId) {
  const s = last.state;
  const p = s.players.find(x => x.charId === charId);
  if (!p) return;
  const ch = CHARACTERS.find(c => c.id === charId);
  const fac = FACTIONS[p.faction];
  const tech = s.tech[p.faction] ?? 0;
  const here = REGIONS.find(r => r.id === p.pos);
  const active = p.id === s.turnIdx && !s.over;
  const me = myPlayer();
  const isMe = me && p.id === me.id;
  const body = `<div class="pawn-info">
    <div class="pawn-info-top">
      <img class="pawn-info-avatar" src="${charAvatar(charId)}" alt="" style="border-color:${fac.css}" onerror="this.style.display='none'">
      <div>
        <div class="pawn-info-head" style="color:${fac.css}">${p.isAI ? '🤖 ' : ''}${ch ? ch.name : p.name}${isMe ? '(你)' : ''}　【${fac.name}】${active ? '　⏳ 行動中' : ''}</div>
        ${ch ? `<div class="modal-desc">${ch.real}|🏭 ${ch.industry}(${ch.industryDesc})</div>` : ''}
      </div>
    </div>
    <div class="pawn-info-res">💰 ${p.res.money}　⚡ ${p.res.power}　🛢️ ${p.res.oil}</div>
    <div class="modal-desc">📍 ${here ? here.name : p.pos}　🎯 行動點 ${p.ap}　🃏 手牌 ${p.handCount}</div>
    <div class="modal-desc">🔬 ${fac.name}科技力 <b>${tech}</b> 點　📈 收入 ${fmtRes(p.income)}/回合</div>
    ${ch ? `<div class="pawn-info-perk">✨ ${ch.perkText}</div>` : ''}
  </div>`;
  openModal(`${ch ? ch.name : p.name}`, body,
    ch ? [{ label: '🔍 立繪 / 生平 / 能力特長', value: 'detail' }, { label: '關閉', value: null }]
       : [{ label: '關閉', value: null }],
    val => { if (val === 'detail') openCharDetail(charId); });
}

function setMode(m2) {
  mode = m2;
  if (!board) { $('#btnMove').classList.toggle('toggled', mode === 'move'); return; }
  if (mode === 'move') {
    // 進入移動模式:鏡頭平滑跳轉到「你的角色」為中心(觀戰/上帝模式為當前回合角色),方便挑選目的地
    const me = myPlayer() || last?.state?.players?.[last.state.turnIdx];
    if (me) board.focusRegion(me.pos);
  }
  if (mode === 'move' && last?.priv?.moveTargets) {
    board.highlight(last.priv.moveTargets.map(t => t.regionId));
    toast(`點擊發光城市移動(相鄰 🛢️1;✈️ 搭飛機 ${RULES.planeRange} 格內 🛢️5)`);
  } else {
    board.highlight([]);
  }
  $('#btnMove').classList.toggle('toggled', mode === 'move');
}

// 點擊牌庫 → 顯示牌組組成與剩餘(可公開資訊)
function onDeckClick(deckKey) {
  if (!last?.state) return;
  showDeckInfo(deckKey);
}
function deckScaleFor(n) { return RULES.deckScale[Math.min(8, Math.max(2, n))] || 1; }
function copiesScaled(base, scale) { return Math.max(1, Math.round(base * scale)); }
function showDeckInfo(deckKey) {
  if (deckKey === 'eventCount') { showEventDeckInfo(); return; }
  const s = last.state;
  const scale = deckScaleFor(s.players.length);
  const map = {
    deckCount: { title: '🃏 公共牌庫(抽牌庫)', remain: s.deckCount, tiers: [1, 2, 3],
      ops: OPS_DECK_COMPOSITION,
      note: '只放 1~3 階科技卡(比例 4:3:2)+ Lv.2~3 灰色作戰卡;抽完會把棄牌洗回。' },
    tier4Count: { title: '🔼 四階牌庫', remain: s.tier4Count, tiers: [4],
      ops: OPS_TIER4_COMPOSITION,
      note: '獨立一疊(含 Lv.4 灰卡,約科技卡 50%),只能用「捨牌升階」(捨棄級數加總 6)換取。' },
    tier5Count: { title: '🏆 五階牌庫', remain: s.tier5Count, tiers: [5],
      ops: OPS_TIER5_COMPOSITION,
      note: '獨立一疊(含 Lv.5 灰卡,約科技卡 50%),只能用「2 張 Lv.4 卡升階」換取。' },
  };
  const info = map[deckKey]; if (!info) return;
  // 收集牌組內所有卡(科技卡 + 灰卡),正規化成卡片物件附該牌複製張數;依「種類 → 等級」排序。
  // 以與手牌完全相同的卡面呈現(cardFaceHtml),點擊單卡 → 詳情(showCardDetailModal,可返回牌庫)。
  const TYPE_RANK = { power: 0, hardware: 1, info: 2, ai: 3, fun: 4, spy: 5, steal: 6, fake: 7 };
  const items = []; let total = 0;
  for (const catId in TECH_CATEGORIES) {
    for (const d of (TECH_CARDS[catId] || [])) {
      if (!info.tiers.includes(d.tier)) continue;
      const base = d.tier <= 3 ? MAIN_TIER_COPIES[d.tier - 1] : d.tier === 4 ? TIER4_COPIES : TIER5_COPIES;
      const copies = copiesScaled(base, scale); total += copies;
      items.push({ cl: techCardLike(d, catId), copies, rank: TYPE_RANK[catId], lv: d.tier });
    }
  }
  if (info.ops) for (const [type, base] of info.ops) {
    const o = OPS_CARDS[type]; const copies = copiesScaled(base, scale); total += copies;
    items.push({ cl: opsCardLike(o), copies, rank: TYPE_RANK[o.cat] ?? 9, lv: o.level });
  }
  items.sort((a, b) => (a.rank - b.rank) || (a.lv - b.lv));
  openModal(info.title,
    `<p class="modal-desc">目前牌庫剩 <b>${info.remain}</b> 張(全牌組共 ${total} 張)。${info.note}<br>
       以下為「全牌組組成」(卡面與手牌相同,依種類・等級排序;卡圖右上角為該牌的複製張數,點卡看詳情):</p>
     <div class="dk-cards">${items.map((x, i) => cardFaceHtml(x.cl, { dk: i, copies: x.copies })).join('')}</div>`,
    [{ label: '關閉', value: null }]);
  $('#modalBody').onclick = e => {
    const card = e.target.closest('.card[data-dk]'); if (!card) return;
    showCardDetailModal(items[+card.dataset.dk].cl, () => showDeckInfo(deckKey));
  };
}

// 點擊地圖中央的「集體事件牌庫」→ 查看全部事件卡內容(與手牌相同卡面,本季/已發生有標示,點卡看詳情)
function showEventDeckInfo() {
  const s = last.state;
  const curId = s.event?.id || null;
  const past = new Set(s.pastEvents || []); // 已發生過的事件 id
  const pastCount = [...past].filter(id => id !== curId).length;
  const items = EVENT_CARDS.map(e => ({ cl: eventCardLike(e),
    stateCls: e.id === curId ? 'card-ev-active' : past.has(e.id) ? 'card-ev-past' : '' }));
  openModal('🌏 集體事件牌庫',
    `<p class="modal-desc">每季開始前自動抽 1 張,效果持續整季;全 ${EVENT_CARDS.length} 張抽完會循環洗回。${
      curId ? `本季為【${s.event.icon} ${s.event.name}】。` : ''}${
      pastCount ? `已發生 ${pastCount} 張(灰底標「已發生」)。` : ''}<br>以下為所有事件卡內容(點卡看詳情):</p>
     <div class="dk-cards">${items.map((x, i) => cardFaceHtml(x.cl, { dk: i, stateCls: x.stateCls })).join('')}</div>`,
    [{ label: '關閉', value: null }]);
  $('#modalBody').onclick = e => {
    const card = e.target.closest('.card[data-dk]'); if (!card) return;
    showCardDetailModal(items[+card.dataset.dk].cl, () => showEventDeckInfo());
  };
}

// 尋找當前位置:把 3D 鏡頭平滑聚焦到「你」(觀戰/上帝模式時為當前回合玩家)所在的城市
function locateMe() {
  if (!board || !last?.state) return;
  const me = myPlayer() || last.state.players[last.state.turnIdx];
  if (!me) return;
  if (board.focusRegion(me.pos)) {
    const r = REGIONS.find(x => x.id === me.pos);
    toast(`📍 鏡頭聚焦${me === myPlayer() ? '你所在的' : '當前玩家的'}${r ? r.name : '城市'}`);
  }
}

function showRegionInfo(rid) {
  const s = last.state;
  const r = s.regions[rid];
  const rDef = REGIONS.find(x => x.id === rid);
  const debuffText = c => {
    if (!c.debuff) return '';
    if (c.debuff.type === 'tech') return `<br><span class="rc-debuff">💣 間諜:科技力 -${c.debuff.val}(${c.debuff.byName})</span>`;
    if (c.debuff.type === 'drain') return `<br><span class="rc-debuff">🕵️ 收益遭竊:每回合 -${fmtRes(c.debuff.amt)} → ${c.debuff.byName}</span>`;
    if (c.debuff.type === 'leak') return `<br><span class="rc-debuff">📰 折舊陷阱:同類改建時轉移折舊資源 ${c.debuff.val} 給 ${c.debuff.byName}</span>`;
    return '';
  };
  const lines = r.cards.map(c => {
    const o = s.players.find(p => p.id === c.owner);
    const cat = TECH_CATEGORIES[c.cat];
    return `<div class="region-card-row" style="color:${FACTIONS[o.faction].css}">
      ${cat.icon}【${c.name}】${c.tier}階 — ${o.name}<br>
      <span class="rc-stats">🔬${techDual(c)} 🛡️${c.effDef} 💱${c.trade}${c.special ? `|✨${c.special.text}` : ''}</span>${techBreakLine(c)}${debuffText(c)}</div>`;
  }).join('') || '<div>(尚無科技卡)</div>';
  const blocked = (r.builtRound && s.round < r.builtRound + RULES.cityBuildCooldown
    ? `<div style="color:#ff6">🚧 今年已建造過,須過一年才可重新建造</div>` : '');
  const country = rDef.country ? `|${{ US: '🇺🇸米國', CN: '🇨🇳牆國', JP: '🇯🇵日本', KR: '🇰🇷韓國', TW: '🇹🇼台灣' }[rDef.country]}地盤` : '|中立';
  // 相鄰城市的交通(鐵路/航運=相鄰移動 🛢️1;飛機=長程航線 🛢️5)
  const adj = adjacencyOf(rid);
  const TT = { train: { icon: '🚆', name: '鐵路' }, ship: { icon: '🚢', name: '航運' }, plane: { icon: '✈️', name: '航線' } };
  const adjRows = ['train', 'ship', 'plane'].map(t => {
    const names = adj.filter(a => a.type === t).map(a => `${a.name} Lv.${s.regions[a.id]?.level ?? '?'}`);
    return names.length ? `<div class="adj-row">${TT[t].icon} ${TT[t].name}:${names.join('、')}</div>` : '';
  }).join('');
  const adjBlock = adj.length
    ? `<div class="region-adj"><div class="adj-head">🧭 相鄰交通(${adj.length} 條航線)</div>${adjRows}</div>`
    : '';
  openModal(`${rDef.name} Lv.${r.level}|${rDef.tag}${country}${rDef.chipBonus ? '(晶片重鎮:科技力 +1)' : ''}`,
    `<p class="modal-desc">城市等級 ${r.level}:可建 ${r.level} 階以下科技卡|米國在牆國地盤(及反之)發展科技花費 ×2</p>`
      + adjBlock + lines + blocked,
    [{ label: '關閉', value: null }]);
}

// 點擊手牌 → 卡片詳情視窗:卡圖 + 卡種/等級 + 完整數值 + 解說 + 時空背景(lore)+ 特殊效果;
// 並依「是否輪到你 / 可否打出」附上打出按鈕(打出本身也可改用「拖曳到手牌區外」)。
function onCardClick(idx) {
  const priv = last?.priv;
  const c = priv?.hand?.[idx];
  if (!c) return;
  const isTech = c.kind === 'tech';
  const icon = c.icon || cardKindMeta(c.kind, c.cat).icon;
  const myTurn = isMyTurn();

  let body = cardDetailHtml(c); // 與牌庫一覽點卡相同的詳情主體
  const opts = [];
  if (!myTurn) {
    body += `<p class="modal-desc">(目前非你的回合,僅供檢視)</p>`;
  } else if (isTech) {
    if (priv.turnFlags?.forfeitTech) body += `<p class="modal-desc cd-warn">⚠️ 你本回合已放棄打出科技卡的權利</p>`;
    else if (c.playMsg) body += `<p class="modal-desc cd-warn">⚠️ ${escapeHtml(c.playMsg)}</p>`;
    else {
      opts.push({ label: `🏗️ 部署在目前城市(${fmtRes(c.myCost)})`, value: { a: 'play' } });
      for (const rt of (priv.rescueTargets || [])) { // 盟友改建:改建同陣營盟友被 debuff 的卡
        if (c.tier >= rt.tier)
          opts.push({ label: `🔧 改建盟友 ${rt.ownerName} 的受損【${rt.name}】(${rt.tier}階,折舊 ${rt.deprec} 返還)`,
            value: { a: 'rescue', uid: rt.uid } });
      }
    }
  } else { // 灰色作戰卡
    if (priv.turnFlags?.forfeitOps) body += `<p class="modal-desc cd-warn">⚠️ 你本回合已放棄打出作戰卡的權利</p>`;
    else {
      const targets = priv.targets?.[c.id] || [];
      if (!targets.length) body += `<p class="modal-desc cd-warn">⚠️ 沒有合法目標(超出航線範圍/防護太高/已被鎖定過)</p>`;
      else opts.push({ label: '🎯 選擇攻擊目標(近 → 遠)', value: { a: 'ops' } });
    }
  }
  opts.push({ label: '關閉', value: null });

  openModal(`${icon} ${c.name}`, body, opts, val => {
    if (!val) return;
    if (val.a === 'play') { showPlayFx(c); net.action('playTech', { handIdx: idx }); }
    else if (val.a === 'rescue') { showPlayFx(c); net.action('playTech', { handIdx: idx, rebuildUid: val.uid }); }
    else if (val.a === 'ops') chooseOpsTarget(c, idx);
  });
}

function chooseOpsTarget(c, idx) {
  // 依航線距離由近到遠排序(同距離者把科技力高的列前面,優先打大目標)
  const targets = (last.priv.targets?.[c.id] || []).slice()
    .sort((a, b) => (a.dist - b.dist) || (b.tech - a.tech));
  openModal(`${c.icon} ${c.name} — 選擇目標(近 → 遠)`,
    `<p class="modal-desc">${c.desc}<br>基本費 ${fmtRes(c.myCost)},每超出 1 格航線 +50%;清單已依距離由近到遠排序。</p>`,
    targets.map(t => ({ label: t.label, value: t }))
      .concat([{ label: '取消', value: '__cancel' }]),
    val => {
      if (val === '__cancel' || val === null) return;
      showPlayFx(c); // 打出卡牌全螢幕動畫
      net.action('playCard', { handIdx: idx, target: val });
    });
}


// ---------------- 交易環節 ----------------
function renderTrade(m, me) {
  const s = m.state;
  $('#tradeMyRes').innerHTML = `你的資源:💰<b>${me.res.money}</b> ⚡<b>${me.res.power}</b> 🛢️<b>${me.res.oil}</b>`;
  // 對象下拉(避免打字中重建)
  const sel = $('#tradeTo');
  const others = s.players.filter(p => p.id !== me.id);
  if (sel.childElementCount !== others.length || sel.dataset.me !== String(me.id)) {
    const prev = sel.value;
    sel.dataset.me = String(me.id);
    sel.innerHTML = others.map(p =>
      `<option value="${p.id}">${p.isAI ? '🤖' : ''}${p.name}</option>`).join('');
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
  const iAmDone = (s.tradeDone || []).includes(me.id);
  const myOffers = s.tradeOfferCount?.[me.id] || 0;
  // 提案列表
  $('#tradeOffers').innerHTML = (s.tradeOffers || []).map(o => {
    const from = s.players[o.fromId], to = s.players[o.toId];
    const txt = `${from.name} 以 ${fmtRes(o.give)} 換 ${to.name} 的 ${fmtRes(o.receive)}`;
    if (o.toId === me.id && !iAmDone)
      return `<div class="trade-offer">📨 ${txt}
        <button class="btn small-btn" data-acc="${o.id}">✅ 接受</button>
        <button class="btn small-btn" data-dec="${o.id}">❌ 婉拒</button></div>`;
    if (o.fromId === me.id)
      return `<div class="trade-offer">📤 ${txt} <button class="btn small-btn" data-cxl="${o.id}">↩️ 撤回</button></div>`;
    return `<div class="trade-offer">👀 ${txt}</div>`;
  }).join('') || '<div class="trade-offer">(目前沒有提案)</div>';
  // 次數限制與準備狀態
  $('#tradeSend').disabled = iAmDone || myOffers >= RULES.tradeMaxOffers;
  $('#tradeSend').textContent = iAmDone ? '✅ 你已成交(每環節限 1 次)'
    : `📨 送出提案(${myOffers}/${RULES.tradeMaxOffers})`;
  const ready = s.tradeReady || [];
  $('#tradeStatus').textContent =
    `每人最多提案 ${RULES.tradeMaxOffers} 次、成交 1 次|已結束交易:${ready.length}/${s.players.length} — ${ready.map(id => s.players[id].name).join('、') || '(無)'}`;
  $('#tradeReadyBtn').disabled = ready.includes(me.id) && myCharId !== '*';
}

function readTradeInputs(prefix) {
  const out = {};
  for (const k of RES_KEYS) out[k] = Math.max(0, parseInt($(`#${prefix}_${k}`).value, 10) || 0);
  return out;
}

// ---------------- 視覺特效派發(伺服器 fx 饋送)----------------
function processFx(s) {
  const fx = s.fx || [];
  const maxId = fx.length ? fx[fx.length - 1].id : 0;
  if (lastFxId === null) lastFxId = maxId <= 4 ? 0 : maxId; // 新局開場 fx(擲骰+事件+抽卡)全播;重連略過歷史
  if (maxId <= lastFxId) { lastFxId = maxId; return; }      // 無新特效(或伺服器讀檔重置)
  for (const f of fx) { if (f.id > lastFxId) dispatchFx(f, s); }
  lastFxId = maxId;
}

// fx 類型 → 台詞類別(draw/event 不發台詞)
const SPEECH_CAT = { build: 'build', spy: 'attack', destroy: 'attack', steal: 'attack', fake: 'attack', move: 'move' };
function pickLine(charId, cat) {
  const set = CHARACTER_LINES[charId]; if (!set) return null;
  const pool = set[cat] || set.general; if (!pool || !pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 派發特效:施法者(含 AI)出現施法光環,作戰類再射出能量弧線到目標,目標播放對應特效
function dispatchFx(f, s) {
  if (!board) return;
  const facCss = id => FACTIONS[id]?.css || '#00f0ff';
  // 施法者目前位置(由 charId 回查;作戰卡不移動、科技卡在原地建造)
  const caster = f.charId ? s.players.find(p => p.charId === f.charId) : null;
  const ch = f.charId ? CHARACTERS.find(c => c.id === f.charId) : null;
  const who = ch ? ch.name : (caster ? caster.name : '');
  const col = facCss(f.faction);
  // 角色行動台詞泡泡(所有角色皆適用):在施法者位置上方冒出
  const speechCat = SPEECH_CAT[f.type];
  if (speechCat && ch) {
    const at = f.type === 'build' ? f.region : f.type === 'move' ? f.to : caster?.pos;
    const line = pickLine(ch.id, speechCat);
    if (at && line) board.fxSpeech(at, ch.name, line, col);
  }
  audio.fx(f.type); // 卡片 / 行動特效音(event 另由 showEventFx 處理)
  switch (f.type) {
    case 'dice': showDiceFx(f); break;
    case 'event': showEventFx(f.event); break;
    case 'build': {
      const c = TECH_CATEGORIES[f.cat];
      // 建造本身在施法者所在城市,fxBuild 即為施展特效(不再疊光環避免雜亂)
      board.fxBuild(f.region, f.cat, c?.css || '#00f0ff', c?.icon || '🏗️');
      board.fxLabel(f.region, `${c?.icon || '🏗️'} ${who} 建造 ${f.name || ''}`.trim(), col);
      break;
    }
    case 'spy':
      if (caster) { board.fxCast(caster.pos, col, '💣'); board.fxBeam(caster.pos, f.region, col); }
      board.fxDestroy(f.region);
      board.fxLabel(f.region, `💣 ${who} 滲透 ${f.name || '科技卡'}(科技力 -${f.val || 0})`, col); break;
    case 'destroy':
      if (caster) { board.fxCast(caster.pos, col, '💣'); board.fxBeam(caster.pos, f.region, col); }
      board.fxDestroy(f.region);
      board.fxLabel(f.region, `💣 ${who} 摧毀 ${f.name || '科技卡'}!`, col); break;
    case 'steal':
      if (caster) { board.fxCast(caster.pos, col, '🕵️'); board.fxBeam(caster.pos, f.region, '#2eff8f'); }
      board.fxSteal(f.region);
      board.fxLabel(f.region, `🕵️ ${who} 竊取收益`, col); break;
    case 'fake':
      if (caster) { board.fxCast(caster.pos, col, '📰'); board.fxBeam(caster.pos, f.region, '#ff2bd6'); }
      board.fxFake(f.region);
      board.fxLabel(f.region, `📰 ${who} 假新聞·折舊陷阱`, col); break;
    case 'move':
      board.fxMove(f.from, f.to, f.plane);
      board.fxLabel(f.to, `${f.plane ? '✈️' : '🚶'} ${who}`, col); break;
    case 'draw': board.fxDraw(f.region); break;
    case 'upgrade':
      board.fxLabel(f.region, `⬆️ ${who} 升級 ${f.name || ''} Lv.${f.level || ''}`.trim(), col); break;
  }
}

// 開局擲骰決定回合順序:全螢幕骰子滾動動畫,定格後揭示先攻陣營與行動順序
const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
function showDiceFx(f) {
  const face = v => DICE_FACES[v] || `🎲${v}`;
  const d = f.dice || [3, 3, 3];
  // 優先用棋盤上的 3D 擲骰動畫(骰子在地圖上方翻滾落定);無 board 時退回 2D 覆蓋層
  if (board && typeof board.fxDice === 'function') {
    board.fxDice(f);
    audio.sfx('move');
    clearTimeout(showDiceFx._t);
    showDiceFx._t = setTimeout(() => audio.sfx('upgrade'), 1300);
    return;
  }
  const ov = $('#diceOverlay');
  if (!ov) { // 無覆蓋層時退回 toast
    toast(`🎲 米${face(d[0])} ⚔️ 牆${face(d[1])} → ${f.usFirst ? '米' : '牆'}陣營先攻`);
    return;
  }
  const die0 = $('#die0'), die1 = $('#die1'), die2 = $('#die2');
  const tie = d[0] === d[1];
  const res = $('#diceResult'), ord = $('#diceOrder');
  res.textContent = ''; ord.textContent = '';
  $('#die2').parentElement.classList.toggle('show-arb', tie); // 平手才點亮裁決骰
  for (const el of [die0, die1, die2]) { el.classList.remove('landed'); el.classList.add('rolling'); }
  ov.classList.add('show');
  audio.sfx('move'); // 骰子滾動聲(沿用既有音效)

  let ticks = 0;
  clearInterval(showDiceFx._iv);
  showDiceFx._iv = setInterval(() => {
    die0.textContent = face(1 + Math.floor(Math.random() * 6));
    die1.textContent = face(1 + Math.floor(Math.random() * 6));
    if (tie) die2.textContent = face(1 + Math.floor(Math.random() * 6));
    if (++ticks >= 12) {
      clearInterval(showDiceFx._iv);
      die0.textContent = face(d[0]); die1.textContent = face(d[1]); die2.textContent = face(d[2]);
      for (const el of [die0, die1, die2]) { el.classList.remove('rolling'); el.classList.add('landed'); }
      audio.sfx('upgrade'); // 定格提示音
      res.textContent = `米 ${d[0]} ⚔️ 牆 ${d[1]}${tie ? `（平手·裁決 ${d[2]}）` : ''} → ${f.usFirst ? '🟦 米' : '🟥 牆'}陣營先攻`;
      ord.textContent = '行動順序　' + (f.order || []).map(o => o.name).join('　→　');
    }
  }, 90);
  clearTimeout(showDiceFx._t);
  showDiceFx._t = setTimeout(() => ov.classList.remove('show'), 4600);
}

function showEventFx(ev) {
  if (!ev) return;
  audio.event(ev.id); // 集體事件情境音(依事件 id 對應災難 / 管制 / 榮景)
  const el = $('#eventFx');
  el.querySelector('.evfx-icon').textContent = ev.icon || '🌏';
  el.querySelector('.evfx-name').textContent = ev.name || '';
  el.querySelector('.evfx-desc').textContent = ev.desc || '';
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); // 重置動畫
  clearTimeout(showEventFx._t);
  showEventFx._t = setTimeout(() => el.classList.remove('show'), 2800);
}

// ---------------- 結算(勝負效果 + 排行榜)----------------
function showResult(s) {
  const r = s.result;
  const champion = s.players[r.champion];
  const me = myPlayer();
  const winnerSet = new Set(r.winners);
  const iWon = me && winnerSet.has(me.id);

  const box = $('#resultOverlay .result-box');
  box.classList.remove('win', 'lose');
  const h1 = box.querySelector('h1');
  if (me) { box.classList.add(iWon ? 'win' : 'lose'); h1.textContent = iWon ? '🏆 勝利!' : '🏁 落敗'; }
  else h1.textContent = '🏁 終局';
  audio.stopMusic();                       // 確保結算時無背景樂干擾
  audio.sfx(!me || iWon ? 'win' : 'lose'); // 玩家依勝負;觀戰 / 房主播勝利終曲

  const ranked = [...s.players].sort((a, b) => {
    const wa = a.id === r.champion ? 2 : winnerSet.has(a.id) ? 1 : 0;
    const wb = b.id === r.champion ? 2 : winnerSet.has(b.id) ? 1 : 0;
    if (wa !== wb) return wb - wa;
    return totalRes(b.res) - totalRes(a.res);
  });
  const rows = ranked.map((q, i) => {
    const ch = CHARACTERS.find(c => c.id === q.charId);
    const isMe = me && q.id === me.id;
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
    const tech = s.tech[q.faction] ?? 0;
    return `<tr class="${q.id === r.champion ? 'champ' : ''} ${isMe ? 'me' : ''}">
      <td class="rk">${medal}</td>
      <td class="lb-who">
        <img class="lb-avatar" src="${charAvatar(q.charId)}" alt="" data-detail="${q.charId}"
             title="查看角色詳情" style="border-color:${FACTIONS[q.faction].css}" onerror="this.style.display='none'">
        <span><b style="color:${FACTIONS[q.faction].css}">${q.name}</b>${isMe ? '(你)' : ''}${winnerSet.has(q.id) ? ' 👑' : ''}
        <div class="res">${ch ? ch.name : ''}【${FACTIONS[q.faction].name}】</div></span></td>
      <td class="res">${tech} 點</td>
      <td class="res">${fmtRes(q.res)}</td>
    </tr>`;
  }).join('');

  $('#resultBody').innerHTML = `
    <p>${r.reason}</p>
    <p class="champion">👑 最終勝利者:<b style="color:${FACTIONS[champion.faction].css}">${champion.name}</b></p>
    <table class="lb"><thead><tr><th class="rk">#</th><th>玩家</th><th>陣營科技力</th><th>資源</th></tr></thead>
      <tbody>${rows}</tbody></table>
    ${r.twSupport ? `<p class="result-secret">台灣的秘密立場是:支持${FACTIONS[r.twSupport].name}</p>` : ''}`;
  $('#resultOverlay').style.display = 'flex';
}

// ---------------- 事件繫結 ----------------
function setupGameEvents() {
  $('#btnMove').addEventListener('click', () => setMode(mode === 'move' ? 'idle' : 'move'));
  $('#btnUpgradeCard').addEventListener('click', openCardUpgradeModal);
  $('#btnForfTech').addEventListener('click', () => net.action('forfeit', { kind2: 'tech' }));
  $('#btnForfOps').addEventListener('click', () => net.action('forfeit', { kind2: 'ops' }));
  $('#btnForfMove').addEventListener('click', () => net.action('forfeit', { kind2: 'move' }));
  $('#btnUpgrade').addEventListener('click', () => net.action('upgradeCity'));
  $('#btnExchange').addEventListener('click', () => {
    openModal('💱 金錢兌換(每回合一次,不可反向)',
      `<p class="modal-desc">每 ${RULES.exchangeRate} 金錢換 1 石油或電力,單次最多 ${RULES.exchangeMax} 單位。</p>`,
      [1, 3, 5].flatMap(n => [
        { label: `🛢️ 石油 ×${n}(💰${n * RULES.exchangeRate})`, value: { res: 'oil', n } },
        { label: `⚡ 電力 ×${n}(💰${n * RULES.exchangeRate})`, value: { res: 'power', n } },
      ]).concat([{ label: '取消', value: null }]),
      val => { if (val) net.action('exchange', { res: val.res, amount: val.n }); });
  });
  // 交易環節
  $('#tradeSend').addEventListener('click', () => {
    const toId = parseInt($('#tradeTo').value, 10);
    if (Number.isNaN(toId)) { toast('請選擇交易對象'); return; }
    net.action('tradeOffer', { toId, give: readTradeInputs('tg'), receive: readTradeInputs('tr') });
  });
  $('#tradeOffers').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.acc) net.action('tradeRespond', { offerId: parseInt(b.dataset.acc, 10), accept: true });
    else if (b.dataset.dec) net.action('tradeRespond', { offerId: parseInt(b.dataset.dec, 10), accept: false });
    else if (b.dataset.cxl) net.action('tradeCancel', { offerId: parseInt(b.dataset.cxl, 10) });
  });
  $('#tradeReadyBtn').addEventListener('click', () => net.action('tradeReady'));
  $('#btnEnd').addEventListener('click', () => { setMode('idle'); net.action('endTurn'); });
  $('#btnLocate').addEventListener('click', locateMe);
  $('#btnViewTilt').addEventListener('click', () => {
    if (!board) return;
    const label = board.toggleViewTilt();
    $('#btnViewTilt').classList.toggle('on', board._viewTilt === 'top');
    toast(label);
  });
  $('#btnPlaneViz').addEventListener('click', () => {
    if (!board) return;
    toast(`${board.cyclePlaneViz()}(也可按 V)`);
    $('#btnPlaneViz').classList.toggle('on', (board.planeViz || 0) !== 0);
  });
  $('#btnWeatherDetail').addEventListener('click', () => {
    if (!board) return;
    toast(board.cycleWeatherDetail());
    $('#btnWeatherDetail').classList.toggle('on', board.wxDetail === 'simple');
  });
  $('#btnTwChoose').addEventListener('click', openTwChooseModal);
  $('#btnPivot').addEventListener('click', () => {
    openModal('🔄 秘密轉向(整局一次)',
      `<p>花 1 AP 秘密改變支持的陣營。其他玩家會知道你轉向了,但不知道方向。<br>
       <b>代價:情報外洩,神山儲備折損一半。</b>確定嗎?</p>`,
      [{ label: '確定轉向!', value: true }, { label: '再想想', value: null }],
      val => { if (val) net.action('pivot'); });
  });
  $('#btnReveal').addEventListener('click', () => {
    openModal('⚡ 公開表態',
      `<p>表態後你秘密支持的陣營將被公開,該陣營勝利門檻 <b>+5 年</b>,但神山儲備的科技力會全數注入。確定嗎?</p>`,
      [{ label: '確定表態!', value: true }, { label: '再想想', value: null }],
      val => { if (val) net.action('reveal'); });
  });
  $('#hand').addEventListener('click', e => {
    if (Date.now() < _suppressCardClickUntil) return; // 剛拖曳打出 → 忽略接續的 click
    const card = e.target.closest('.card');
    if (card) onCardClick(parseInt(card.dataset.idx, 10)); // 點擊卡片 → 開詳情(打出改用拖曳/詳情內按鈕)
  });
  // 3D 卡牌:游標在卡片上移動時依位置做視差傾斜,離開復位,讓手牌像實體立體卡
  const handEl = $('#hand');
  setupCardDrag(handEl); // 拖曳手牌到區外=打出(見 playCardByDrag)
  handEl.addEventListener('pointermove', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return; // 觸控不做視差傾斜(避免點按後卡片卡住歪斜)
    if (_cardDrag?.moved) return; // 拖曳中不套用視差傾斜(改由拖曳位移控制)
    const card = e.target.closest('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;   // -0.5 ~ 0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.setProperty('--ry', (px * 18).toFixed(1) + 'deg');
    card.style.setProperty('--rx', (-py * 16).toFixed(1) + 'deg');
  });
  handEl.addEventListener('pointerleave', () => {
    for (const c of handEl.querySelectorAll('.card')) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); }
  });
  handEl.addEventListener('pointerout', e => {
    const card = e.target.closest('.card');
    if (card && !card.contains(e.relatedTarget)) { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); }
  });
  // 點擊玩家面板的「加權」收入 → 顯示加權成分明細
  $('#playerPanel').addEventListener('click', e => {
    const w = e.target.closest('.wval');
    if (w?.dataset.bd === 'income' && last?.priv?.incomeBreak) {
      const me = myPlayer();
      showBreakdown('📈 收入加權明細', last.priv.incomeBreak, 'res', fmtRes(me.income));
    }
  });
  // 手牌捲動:垂直滾輪轉成水平捲動,捲動/縮放時更新左右淡出
  const handWrap = $('#handWrap');
  handWrap.addEventListener('scroll', updateHandFade, { passive: true });
  handWrap.addEventListener('wheel', e => {
    if (e.deltaY && !e.shiftKey && handWrap.scrollWidth > handWrap.clientWidth) {
      handWrap.scrollLeft += e.deltaY; e.preventDefault();
    }
  }, { passive: false });
  window.addEventListener('resize', updateHandFade);
  $('#btnSave').addEventListener('click', () => {
    openModal('💾 儲存遊戲',
      `<p>輸入存檔名稱(也會自動每回合暫存):</p>
       <input id="saveNameInput" class="pin-input" maxlength="24" placeholder="存檔名稱" value="${last?.lobby?.config?.gameName || ''}">`,
      [{ label: '儲存', value: true }, { label: '取消', value: null }],
      val => { if (val) net.send({ t: 'saveGame', name: $('#saveNameInput').value }); });
  });
  $('#btnEndGame').addEventListener('click', () => {
    openModal('⏹️ 結束遊戲',
      '<p>結束目前對局並回到大廳(會自動留一份暫存檔,角色鎖定保留)。確定嗎?</p>',
      [{ label: '結束遊戲', value: true }, { label: '取消', value: null }],
      val => { if (val) net.send({ t: 'endGame' }); });
  });
  // 點操作區/資訊面板的 Q 版頭像 → 角色詳情
  for (const id of ['#playerPanel', '#playersList', '#resultBody']) {
    $(id).addEventListener('click', e => {
      const d = e.target.closest('[data-detail]');
      if (d) openCharDetail(d.dataset.detail);
    });
  }
  $('#rulesBtn').addEventListener('click', () => $('#rulesOverlay').style.display = 'flex');
  $('#rulesClose').addEventListener('click', () => $('#rulesOverlay').style.display = 'none');
  $('#resultClose').addEventListener('click', () => $('#resultOverlay').style.display = 'none');
}

// ---------------- 規則說明(頁籤式,依資料動態產生)----------------
function buildRulesTabs() {
  const panels = $('#rulesPanels');
  if (!panels) return;
  panels.innerHTML = [
    ['basic', ruleBasicHtml()], ['win', ruleWinHtml()], ['turn', ruleTurnHtml()], ['faction', ruleFactionHtml()],
    ['char', ruleCharHtml()], ['tech', ruleTechHtml()], ['ops', ruleOpsHtml()],
  ].map(([k, html]) => `<section class="rules-panel" data-rpanel="${k}">${html}</section>`).join('');
  showRuleTab('basic');
  $('#rulesTabs').onclick = e => {
    const t = e.target.closest('.rules-tab');
    if (t) showRuleTab(t.dataset.rtab);
  };
  // 角色頁點頭像看立繪詳情(避免同時觸發 <details> 開合)
  panels.addEventListener('click', e => {
    const d = e.target.closest('[data-detail]');
    if (d) { e.preventDefault(); openCharDetail(d.dataset.detail); }
  });
}
function showRuleTab(key) {
  for (const t of document.querySelectorAll('.rules-tab')) t.classList.toggle('on', t.dataset.rtab === key);
  for (const p of document.querySelectorAll('.rules-panel')) p.style.display = p.dataset.rpanel === key ? '' : 'none';
  $('#rulesPanels').scrollTop = 0;
}

function ruleBasicHtml() {
  const years = Math.round(RULES.maxRounds / RULES.seasonsPerYear);
  return `
  <div class="rule-block"><h4>🎯 目標</h4>
    <p>以「科技力(點數)」決勝,領先 1 年 = <b>${RULES.pointsPerYear} 點</b>。<b>米國</b>把對牆國的領先拉開到 ${RULES.usWinLead} 年即提前獲勝;<b>牆國</b>追平米國即提前獲勝。完整勝負規則請見 <b>🏆 勝利條件</b> 頁籤。</p></div>
  <div class="rule-block"><h4>🏁 賽程長度</h4>
    <p>共 <b>${years} 年 / ${RULES.maxRounds} 季</b>(每 ${RULES.seasonsPerYear} 季 = 1 年)。期間任一方達成提前勝利即結束;否則打滿後進入終局判定(見 🏆 勝利條件)。</p></div>
  <div class="rule-block"><h4>🔬 科技力歸屬</h4>
    <p>每位玩家的部署計入「本國」科技力,影響自身收益(每 ${RULES.techIncomeDivisor} 點 +1,上限 +${RULES.techBonusCap})。日本計入米國、韓國計入牆國、台灣依秘密立場計入。</p></div>
  <div class="rule-block"><h4>💰 三種資源</h4>
    <p>💰金錢 / ⚡電力 / 🛢️石油。卡片依類型偏重不同資源;固定收益與放棄權利收益都和陣營科技力正相關;科技卡建造後每回合也會產出資源(約 1/3 卡片例外)。</p></div>
  <div class="rule-block"><h4>🏙️ 城市等級</h4>
    <p>每城等級 Lv.1~${RULES.cityMaxLevel},<b>城市等級 ≥ 科技卡階級才能建造</b>。花 1AP+⚡(等級×${RULES.cityUpgradePower})升級,升級後所有人共用。</p></div>
  <div class="rule-block"><h4>🌏 集體事件</h4>
    <p>每季開始抽 1 張事件卡(共 ${EVENT_CARDS.length} 張),效果持續整輪:限制某種資源收入、增減卡費或行動點/科技力等。</p></div>
  <div class="rule-block"><h4>🏔️ 台灣(造王者)</h4>
    <p>第 1 季內秘密選邊,押對即與該方同贏;未表態前可「轉向」一次(神山儲備折半);「表態」公開立場並注入神山儲備(該方門檻 +5 年)。2 人局為米牆對決,無台灣規則。</p></div>`;
}

// 勝利條件:提前勝利 / 終局判定 / 同享與奪冠 / 台灣(全部依 game.js 實際判定邏輯撰寫)
function ruleWinHtml() {
  const years = Math.round(RULES.maxRounds / RULES.seasonsPerYear);
  const ppy = RULES.pointsPerYear;
  return `
  <div class="rule-block"><p>勝負核心是<b>米、牆兩國的科技力差距</b>(差距每 ${ppy} 點 = 1 年)。米國想把差距拉大、牆國想把差距追平。分出勝負有兩個時機:<b>提前勝利</b>與<b>終局判定</b>。</p></div>

  <div class="rule-block"><h4>⚡ 提前勝利(每次打出科技卡 / 作戰卡後即時檢查)</h4>
    <ul class="rf-bonus">
      <li><b>米陣營</b>:科技力領先牆國達 <b>${RULES.usWinLead} 年</b>(${RULES.usWinLead * ppy} 點)→ 立即獲勝。</li>
      <li><b>牆陣營</b>:把差距追到 <b>追平(0 年)</b>或反超 → 立即獲勝。</li>
      <li>台灣若已<b>公開表態</b>,被押的陣營提前門檻 <b>+${RULES.twRevealPenalty} 年</b>(更難提前贏)。</li>
    </ul></div>

  <div class="rule-block"><h4>🏁 終局判定(打滿 ${years} 年 / ${RULES.maxRounds} 季仍未提前分勝負)</h4>
    <ul class="rf-bonus">
      <li><b>米陣營勝</b>:終局領先 <b>≥ ${RULES.jpWinLead} 年</b>。</li>
      <li><b>牆陣營勝</b>:終局差距 <b>≤ ${RULES.cnEndLead} 年</b>(實質追平)或反超。</li>
      <li><b>僵局帶</b>(差距介於 ${RULES.cnEndLead}~${RULES.jpWinLead} 年):合格的<b>韓國</b>可左右逢源<b>獨勝</b>;若無,則以開局讓分線判定——守住領先的算米陣營贏、把差距追近的算牆陣營贏。</li>
      <li>若仍無任何贏家(極端情況)→ <b>總資源最雄厚</b>者獲得商業勝利。</li>
    </ul></div>

  <div class="rule-block"><h4>🤝 同享勝利與最終奪冠</h4>
    <ul class="rf-bonus">
      <li><b>陣營同享</b>:米陣營含<b>日本</b>、牆陣營含<b>韓國</b>;<b>台灣</b>依秘密立場跟著押對的一方同贏。</li>
      <li><b>日 / 韓不能躺贏</b>:要分享勝利,自身場上需 ≥ <b>${RULES.spoilerWinCards} 張科技卡</b>。</li>
      <li><b>劇本級奪冠</b>:米國只「剛剛好」贏(沒達提前門檻)時,精準攪局且合格的<b>日本</b>反成最大贏家;牆國熬到終局才追平時,左右逢源且合格的<b>韓國</b>反成最大贏家。</li>
      <li><b>多人同贏</b>:由其中<b>總資源最多</b>者拿下最終冠軍。</li>
    </ul></div>

  <div class="rule-block"><h4>🏔️ 台灣(造王者)的勝利</h4>
    <p>第 1 季內<b>秘密選邊</b>,押中的陣營獲勝即同享。可「<b>轉向</b>」一次改變立場(神山儲備折半),或「<b>公開表態</b>」注入神山儲備但讓所押陣營的提前門檻 +${RULES.twRevealPenalty} 年。2 人局為米牆對決,無台灣規則。</p></div>`;
}

function ruleTurnHtml() {
  const rows = [
    ['🃏 自動抽卡', '0 AP', '每回合開始自動抽 1 張(算力 perk 抽 2 張),不再手動抽卡'],
    ['🚶 移動(相鄰)', `1 AP + 🛢️${RULES.moveOilCost}`, '鐵路/航運到相鄰城市(日本石油費用減半)'],
    ['✈️ 移動(飛機)', `1 AP + 🛢️${RULES.planeOilCost}`, `沿航線最多跨 ${RULES.planeRange} 格,超過須分段飛`],
    ['🔬 部署科技卡', '1 AP + 卡費', '城市等級 ≥ 卡片階級;一城每人一張、上限 4 張;建造後 4 季冷卻'],
    ['💣 打作戰卡', '1 AP + 卡費', `對 ${RULES.opsRange} 格內敵方科技卡(牆國 +${RULES.cnOpsRangeBonus} 格)`],
    ['⬆️ 升級城市', `1 AP + ⚡(等級×${RULES.cityUpgradePower})`, '升級後所有人共用(韓國電力費用減半)'],
    ['⏫ 捨牌升階', `${RULES.cardUpgradeAp} AP`, `階級加總 ${RULES.tier4DiscardSum} → 1 張 4 階;${RULES.tier5DiscardCount} 張 4 階 → 1 張 5 階`],
    ['💱 金錢兌換', '0 AP', `每回合一次:${RULES.exchangeRate}💰 換 1🛢️或 1⚡(上限 ${RULES.exchangeMax},不可反向)`],
  ];
  const forfeits = [
    ['♻️ 放棄科技 → ⚡', '放棄本回合打出科技卡,換電力'],
    ['♻️ 放棄作戰 → 💰', '放棄本回合打出作戰卡,換金錢'],
    ['♻️ 放棄行動 → 🛢️', '放棄移動,換石油'],
  ];
  return `<div class="rule-block"><p>每回合 <b>${RULES.apPerTurn} 行動點(AP)</b>,可自由分配;回合開始獲得固定收入並自動抽卡。</p></div>
    <table class="rule-table"><thead><tr><th>行動</th><th>成本</th><th>說明</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r[0]}</td><td class="rt-cost">${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
    <div class="rule-block"><h4>♻️ 放棄權利換資源(不耗 AP,每回合各一次)</h4>
      <p>收益 = ${RULES.forfeitBase} + 陣營科技力紅利(每 ${RULES.techIncomeDivisor} 點 +1,上限 +${RULES.techBonusCap})。</p>
      <ul class="rf-bonus">${forfeits.map(f => `<li><b>${f[0]}</b> — ${f[1]}</li>`).join('')}</ul></div>
    <div class="rule-block"><h4>🤝 交易環節</h4>
      <p>每輪所有人行動後進入交易環節:可任意比值互換資源,每人最多提案 ${RULES.tradeMaxOffers} 次、成交 ${RULES.tradeMaxDeals} 次(接受別人提案也算成交),全員結束後進入下一季。</p></div>`;
}

function ruleFactionHtml() {
  const intro = `<div class="rule-block"><p>計分以陣營為單位:<b>米陣營</b>(含日本)、<b>牆陣營</b>(含韓國)、<b>台灣</b>押對方同享、僵局時韓國可獨勝。各陣營機制如下。</p></div>`;
  const F = {
    US: ['初始科技力最高(約 10 年),因此每回合資源收益更高', '4 階以上科技卡額外 +10 點科技力'],
    CN: [`灰色作戰卡費用為他國的一半(×${RULES.cnOpsHalf})`, `作戰卡攻擊範圍 +${RULES.cnOpsRangeBonus} 格`],
    TW: [`晶片稅:他人每次研發須付你 💰${RULES.chipLevy}`, '硬體類科技卡 +5 點科技力', '新竹晶片重鎮部署 +5 點', '造王者:第 1 季秘密選邊,可轉向一次與公開表態'],
    JP: ['科技產出計入米國陣營', '油電混合:移動石油費用減半', '改善哲學:發展費用 -2、每回合收入 +2'],
    KR: ['科技產出計入牆國陣營', '基建狂魔:升級城市電力費用減半', '財閥手腕:打出作戰卡費用 -2'],
  };
  const start = { US: `${RULES.techStart.US} 點`, CN: `${RULES.techStart.CN} 點(小局依人數上調)`, TW: '米牆中間值', JP: '米牆中間值', KR: '米牆中間值' };
  const side = { US: '親美陣營', CN: '親中陣營', TW: '中立(秘密選邊)', JP: '親美(計入米國)', KR: '親中(計入牆國)' };
  return intro + ['US', 'CN', 'TW', 'JP', 'KR'].map(fid => {
    const fac = FACTIONS[fid];
    return `<div class="rule-faction" style="--fc:${fac.css}">
      <div class="rf-head"><img class="fac-flag" src="${factionFlag(fid)}" alt="" onerror="this.style.display='none'"><b>${fac.name}</b><span class="rf-side">${side[fid]}</span></div>
      <div class="rf-start">初始科技力:${start[fid]}</div>
      <ul class="rf-bonus">${F[fid].map(b => `<li>${b}</li>`).join('')}</ul>
    </div>`;
  }).join('');
}

function ruleCharHtml() {
  const intro = `<div class="rule-block"><p>角色能力特長加權(${STRENGTH_AXES.map(a => a.icon + a.name).join(' / ')})為 1~5 級,影響起始傾向與台詞風格。<b>點角色列展開</b>查看特長長條與專屬 perk;點頭像看立繪與生平。</p></div>`;
  return intro + ['US', 'CN', 'TW', 'JP', 'KR'].map(fid => {
    const list = CHARACTERS.filter(c => c.faction === fid);
    if (!list.length) return '';
    const fac = FACTIONS[fid];
    return `<div class="rule-charsec" style="--fc:${fac.css}">
      <div class="rf-head"><img class="fac-flag" src="${factionFlag(fid)}" alt="" onerror="this.style.display='none'"><b>${fac.name}</b></div>
      ${list.map(ruleCharRow).join('')}
    </div>`;
  }).join('');
}
function ruleCharRow(c) {
  return `<details class="rule-char" style="--fc:${FACTIONS[c.faction].css}">
    <summary>
      <img class="rl-ch-avatar" src="${charAvatar(c)}" alt="" data-detail="${c.id}" onerror="this.style.display='none'">
      <span class="rl-ch-name">${c.name}<small>${c.real}</small></span>
      <span class="rl-ch-cat">${TECH_CATEGORIES[catOf(c)].icon} ${c.industry}</span>
    </summary>
    <div class="rl-ch-body">
      <div class="rl-ch-perk">✨ ${c.perkText}</div>
      <div class="cd-strengths">${strengthBars(c)}</div>
    </div>
  </details>`;
}

function ruleTechHtml() {
  const intro = `<div class="rule-block"><p>科技卡分 <b>5 大類 × 5 階</b>,三項數值:🔬科技力(每 ${RULES.pointsPerYear} 點 = 1 年,影響勝負)/ 🛡️防護力(抵擋作戰卡)/ 💱交易力(每回合收入)。費用依類型偏重不同資源。<b>1~3 階</b>來自公共牌庫;<b>4/5 階 ✦</b> 為劃時代建設,只能靠捨牌升階取得。下方依「類型 → 階級」排列。</p></div>`;
  return intro + Object.keys(TECH_CATEGORIES).map((catId, i) => {
    const cat = TECH_CATEGORIES[catId];
    const cards = TECH_CARDS[catId].map(c => ruleTechCardRow(catId, c)).join('');
    return `<details class="rule-acc" ${i === 0 ? 'open' : ''} style="--cc:${cat.css}">
      <summary><span class="rl-cat-ico">${cat.icon}</span> ${cat.name}<span class="rl-cat-trait">${cat.trait}</span></summary>
      <div class="rl-cards">${cards}</div>
    </details>`;
  }).join('');
}
function ruleTechCardRow(catId, card) {
  const ratio = card.ratio || CATEGORY_RATIO[catId] || { money: 1, power: 1, oil: 1 };
  const cost = fmtRes(splitCost(card.cost, ratio));
  const mark = card.tier >= 4 ? ' ✦' : '';
  return `<div class="rl-card" style="--cc:${TECH_CATEGORIES[catId].css}">
    <div class="rl-card-top"><span class="rl-tier">${card.tier} 階${mark}</span><span class="rl-name">${card.name}</span><span class="rl-cost">${cost}</span></div>
    <div class="rl-stats">🔬 ${card.tech} ・ 🛡️ ${card.def} ・ 💱 ${card.trade}</div>
    ${card.special ? `<div class="rl-special">✨ ${card.special.text}</div>` : ''}
    <div class="rl-desc">${card.desc}</div>
  </div>`;
}

function ruleOpsHtml() {
  const intro = `<div class="rule-block"><p>灰色作戰卡分 <b>3 類 × 4 級(Lv.2~5)</b>,對 ${RULES.opsRange} 格航線內的敵方科技卡出手(牆國 +${RULES.cnOpsRangeBonus} 格;每多 1 格費用 +${RULES.opsDistSurcharge * 100}%)。<b>城市等級 ≤ 卡片等級</b> 且 <b>攻擊力 ≥ 目標防護力</b> 才打得動,附 debuff 不拆卡(數值隨 攻−防 放大;每張科技卡只能被鎖定一次)。Lv.2/3 在公共牌庫,Lv.4/5 需捨牌升階。下方依「類型 → 等級」排列。</p></div>`;
  const CATS = [
    { id: 'spy', name: '💣 間諜類', eff: '植入「減科技力」debuff,削減目標貢獻的科技力' },
    { id: 'steal', name: '🕵️ 竊取類', eff: '植入「竊取收益」debuff,每回合把目標交易收益轉給你' },
    { id: 'fake', name: '📰 假新聞類', eff: '植入「折舊陷阱」,對手同類改建該卡時把折舊資源分你' },
  ];
  return intro + CATS.map((c, i) => {
    const cards = Object.values(OPS_CARDS).filter(o => o.cat === c.id)
      .sort((a, b) => a.level - b.level).map(ruleOpsCardRow).join('');
    return `<details class="rule-acc" ${i === 0 ? 'open' : ''}>
      <summary>${c.name}<span class="rl-cat-trait">${c.eff}</span></summary>
      <div class="rl-cards">${cards}</div>
    </details>`;
  }).join('');
}
function ruleOpsCardRow(card) {
  const cost = fmtRes(splitCost(card.cost, card.ratio || { money: 1, power: 1, oil: 1 }));
  const deck = card.level <= 3 ? '公共牌庫' : card.level === 4 ? '四階牌庫' : '五階牌庫';
  return `<div class="rl-card">
    <div class="rl-card-top"><span class="rl-tier">Lv.${card.level}</span><span class="rl-name">${card.icon} ${card.name}</span><span class="rl-cost">${cost}</span></div>
    <div class="rl-stats">⚔️ 攻擊力 ${card.atk} ・ 🗂️ ${deck}</div>
    <div class="rl-desc">${card.desc}</div>
  </div>`;
}

// ---------------- 初始化 ----------------
// 先抓伺服器的數值參數設定(config/rules.json)套用,確保前後端顯示一致
try {
  const resp = await fetch('/config/rules.json');
  if (resp.ok) applyRulesOverrides(await resp.json());
} catch { /* 拿不到就用內建預設值 */ }
buildRulesTabs();   // 規則說明頁籤(依資料動態產生,連線版/單機版皆適用)
setupConnect();
setupLobbyEvents();
setupGameEvents();
audio.init();
