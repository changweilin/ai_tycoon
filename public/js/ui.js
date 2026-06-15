// ============ 前端 UI 與流程(連線版) ============
import { FACTIONS, CHARACTERS, CHARACTER_LINES, TECH_CATEGORIES, RULES, REGIONS, RES_KEYS, RESOURCES, STRENGTH_AXES,
  charAvatar, charPortrait, charLogo, factionFlag, applyRulesOverrides } from './data.js';
import { Board3D } from './board3d.js';
import { Net } from './net.js';

const $ = sel => document.querySelector(sel);

let net = null;
let board = null;
let last = null;        // 最近一次 sync payload
let sessionToken = null; // 斷線重連用的座位 token(由 sync 帶回)
let mode = 'idle';      // idle | move
let myCharId = null;
let resultShown = false;
let lastFxId = null;    // 已播放的最後一個特效 id(增量播放,首次同步不重播歷史)

function fmtRes(c) {
  const parts = RES_KEYS.filter(k => c && c[k] > 0).map(k => `${RESOURCES[k].icon}${c[k]}`);
  return parts.length ? parts.join(' ') : '免費';
}
function totalRes(c) { return RES_KEYS.reduce((s, k) => s + (c?.[k] || 0), 0); }
// 科技卡科技力:初始(卡面)值與加權(含擅長/晶片/陣營/事件加成)值,差異時以括號顯示
function techDual(c) {
  return c.effTech != null && c.effTech !== c.tech ? `${c.tech} (${c.effTech})` : `${c.tech}`;
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
  const params = new URLSearchParams(location.search);
  if (params.get('room')) $('#joinPin').value = params.get('room');
  $('#myName').value = localStorage.getItem('ctw_name') || '';

  const saveName = () => localStorage.setItem('ctw_name', $('#myName').value.trim());
  $('#createBtn').onclick = () => {
    saveName();
    ensureNet();
    net.send({ t: 'createRoom', name: $('#myName').value.trim() });
  };
  $('#joinBtn').onclick = () => {
    const pin = $('#joinPin').value.trim();
    if (!pin) { toast('請輸入房間 PIN'); return; }
    saveName();
    ensureNet();
    const mode = document.querySelector('input[name="joinMode"]:checked').value;
    net.send({ t: 'joinRoom', pin, name: $('#myName').value.trim(), mode });
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
}

function ensureNet() {
  if (net) return;
  net = new Net(onSync, msg => toast(msg), onOther, onReconnect);
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
  else if (m.t === 'saves') showSavesList(m.list);
  else if (m.t === 'needRejoin') resetToConnect(m.msg || '房間已結束,請重新加入');
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
    $('#lobby').style.display = 'block';
    $('#resultOverlay').style.display = 'none';
    $('#eventFx').classList.remove('show');
    resultShown = false;
    lastFxId = null;        // 回到大廳:下一局重新基準,新局開場事件會播放
    lastLogLen = null;      // 行動訊息饋送也重置基準(下一局不重播歷史)
    renderLobby(m);
  } else {
    $('#connect').style.display = 'none';
    $('#lobby').style.display = 'none';
    $('#gameUI').style.display = 'block';
    if (!board) board = new Board3D($('#canvas3d'), onRegionClick, onPawnClick);
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

  // 成員列表
  $('#lobbyClients').innerHTML = lobby.clients.map(c => {
    const ch = c.charId ? CHARACTERS.find(x => x.id === c.charId) : null;
    return `<div class="seat">
      <span class="seat-no">${c.isHost ? '👑' : c.mode === 'spectator' ? '👁️' : '🎮'}</span>
      <span class="seat-name-ro">${c.name}</span>
      <span class="seat-char" style="color:${ch ? FACTIONS[ch.faction].css : '#667'}">
        ${ch ? `${ch.name}【${FACTIONS[ch.faction].name}】` : c.mode === 'spectator' ? '觀戰中' : '── 未選角色 ──'}</span>
    </div>`;
  }).join('');

  // 房間設定(預計人數 / 遊戲名稱)
  if (document.activeElement !== $('#gameName')) $('#gameName').value = lobby.config?.gameName || '';
  $('#expectedCount').value = String(lobby.config?.expectedCount || 4);
  $('#gameName').disabled = !m.isHost;
  $('#expectedCount').disabled = !m.isHost;

  // 角色池:遊戲人數 6+ 同時開放日韓
  const expected = lobby.config?.expectedCount || 4;
  const allowJPKR = expected >= RULES.jpkrMinPlayers;
  // 3 人以上:只剩我未選角且台灣沒人選 → 只能選台灣
  const playerClients = lobby.clients.filter(c => c.mode === 'player');
  const unselected = playerClients.filter(c => !c.charId);
  const mustTW = expected >= 3 && !lobby.takenChars.includes('tsmc') &&
    playerClients.length >= expected &&
    unselected.length === 1 && unselected[0].id === m.youId;
  // 角色卡 HTML(單張)
  const cardHtml = c => {
    const lockedJPKR = (c.faction === 'JP' || c.faction === 'KR') && !allowJPKR;
    const lockedTW = mustTW && c.id !== 'tsmc';
    const taken = lobby.takenChars.includes(c.id);
    const isMine = myCharId === c.id;
    return `<div class="char-card ${taken && !isMine ? 'taken' : ''} ${lockedJPKR || lockedTW ? 'locked' : ''} ${isMine ? 'mine' : ''}"
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
      ${lockedTW && !lockedJPKR ? '<div class="lock-tip">最後一位須選台灣</div>' : ''}
      ${taken && !isMine ? '<div class="lock-tip">已被鎖定(可輸入 PIN 認領)</div>' : ''}
      ${isMine ? '<div class="lock-tip mine-tip">✔ 你的角色</div>' : ''}
    </div>`;
  };
  // 依陣營/國籍分組顯示
  const FACTION_ORDER = ['US', 'CN', 'TW', 'JP', 'KR'];
  const FACTION_DESC = { US: '矽谷霸權', CN: '神州科技', TW: '護國神山', JP: '匠人精神', KR: '財閥帝國' };
  $('#charPool').innerHTML = FACTION_ORDER.map(fid => {
    const list = CHARACTERS.filter(c => c.faction === fid);
    if (!list.length) return '';
    const fac = FACTIONS[fid];
    const jpkrLocked = (fid === 'JP' || fid === 'KR') && !allowJPKR;
    return `<section class="char-group" style="--fc:${fac.css}">
      <div class="char-group-head">
        <img class="fac-flag" src="${factionFlag(fid)}" alt="" onerror="this.style.display='none'">
        <span class="cg-name">${fac.name}</span>
        <span class="cg-desc">${FACTION_DESC[fid] || ''}</span>
        <span class="cg-count">${list.length} 位${jpkrLocked ? `・需 ${RULES.jpkrMinPlayers}+ 人` : ''}</span>
      </div>
      <div class="char-group-grid">${list.map(cardHtml).join('')}</div>
    </section>`;
  }).join('');

  $('#hostModeBox').style.display = m.isHost ? '' : 'none';
  $('#startBtn').style.display = m.isHost ? '' : 'none';
  const meClient = lobby.clients.find(c => c.id === m.youId);
  if (document.activeElement !== $('#hostSpectate'))
    $('#hostSpectate').checked = !!meClient && meClient.mode === 'spectator';
  updateModeVisibility();
  const seated = lobby.clients.filter(c => c.mode === 'player' && c.charId);
  $('#lobbyStatus').textContent = mustTW
    ? '🏔️ 你是最後一位未選角的玩家,必須選擇台灣(護國神山)!'
    : `${seated.length} 位玩家已選角(2 人=米牆對決免台灣,3 人以上需米/牆/台各一)`;
}

function updateModeVisibility() {
  const optOut = $('#hostSpectate').checked;
  // 房主不參與時:只能用多人連線(上帝/單人模式需要房主自己操角)
  if (optOut) $('#gameMode').value = 'multi';
  $('#gameMode').disabled = optOut;
  const mode = $('#gameMode').value;
  const n = parseInt($('#expectedCount').value, 10);
  $('#modeHint').textContent = optOut
    ? '🙅 你只主持/觀戰,由其他玩家對戰(人數不足由 AI 頂替)'
    : ({
        multi: n === 2 ? '⚔️ 2 人=米牆對決(無台灣規則)' : `共 ${n} 位玩家連線對戰(人數不足由 AI 頂替)`,
        god: `你一人輪流操控全部 ${n} 個角色`,
      }[mode] || '');
}

function catOf(c) {
  return { '交通': 'power', '汽車': 'power', '硬體': 'hardware', '手機': 'hardware', '晶片': 'hardware', '資訊': 'info', 'AI': 'ai', '娛樂': 'fun' }[c.industry];
}

// 選擇/認領角色(大廳卡片與角色詳情共用)
function selectChar(charId) {
  if (!last?.lobby || last.lobby.started) return;
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
    const taken = last.lobby.takenChars.includes(charId) && myCharId !== charId;
    const isMine = myCharId === charId;
    if (isMine) {
      actions.innerHTML = '<div class="cd-mine">✔ 這是你目前的角色</div>';
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn big';
      btn.textContent = taken ? '🔑 認領此角色' : '✅ 選擇此角色';
      btn.onclick = () => { $('#charDetailOverlay').style.display = 'none'; selectChar(charId); };
      actions.appendChild(btn);
    }
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
  $('#charPool').addEventListener('click', e => {
    // 點頭像/放大鏡 → 查看立繪/生平/能力(即使該角色已鎖定或不可選也能瀏覽)
    const detailEl = e.target.closest('[data-detail]');
    if (detailEl) { openCharDetail(detailEl.dataset.detail, { fromLobby: true }); return; }
    const card = e.target.closest('.char-card');
    if (!card || card.classList.contains('locked')) return;
    selectChar(card.dataset.char);
  });
  $('#gameMode').addEventListener('change', updateModeVisibility);
  $('#hostSpectate').addEventListener('change', e => {
    net.send({ t: 'setMode', mode: e.target.checked ? 'spectator' : 'player' });
    updateModeVisibility(); // 立即反映(等不及伺服器回傳)
  });
  $('#gameName').addEventListener('change', () =>
    net.send({ t: 'setRoomConfig', gameName: $('#gameName').value }));
  $('#expectedCount').addEventListener('change', () =>
    net.send({ t: 'setRoomConfig', expectedCount: $('#expectedCount').value }));
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
    `1 年 = ${RULES.pointsPerYear} 點|米國勝利:領先 ${yrs(s.usThreshold)} 年|牆國勝利:差距 ≤ ${yrs(s.cnThreshold)} 年|${s.roundLabel}(共 3 年)`;
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
  let stats = `💰 <b>${me.res.money}</b>  ⚡ <b>${me.res.power}</b>  🛢️ <b>${me.res.oil}</b>  🎯 行動點 <b>${me.ap}</b>  📍 ${REGIONS.find(r => r.id === me.pos).name}<br>📈 收入 基礎 ${fmtRes(RULES.baseIncome)}(加權 <b>${fmtRes(me.income)}</b>)/回合  🔬 本國科技力 <b>${myTech}</b> 點(每 100 點收益 +1)`;
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

function renderHand(m) {
  const priv = m.priv;
  if (!priv) { $('#hand').innerHTML = ''; return; }
  $('#hand').innerHTML = priv.hand.map((c, i) => {
    if (c.kind === 'tech') {
      const cat = TECH_CATEGORIES[c.cat];
      return `<div class="card ${c.playMsg ? 'card-disabled' : ''}" data-idx="${i}" style="--cc:${cat.css}">
        <div class="card-icon">${cat.icon}</div>
        <div class="card-name">${c.name}|${c.tier}階</div>
        <div class="card-cost">${fmtRes(c.myCost)}</div>
        <div class="card-desc">🔬${techDual(c)} 🛡️${c.def} 💱${c.trade}${c.special ? `|✨${c.special.text}` : ''}</div>
      </div>`;
    }
    return `<div class="card" data-idx="${i}">
      <div class="card-icon">${c.icon}</div>
      <div class="card-name">${c.name}</div>
      <div class="card-cost">${fmtRes(c.myCost)}${c.atk ? ` ⚔️${c.atk}` : ''}</div>
      <div class="card-desc">${c.desc}</div>
    </div>`;
  }).join('') || '<div class="hand-empty">沒有手牌</div>';
  requestAnimationFrame(updateHandFade); // 重繪後依內容寬度更新左右淡出
}

// 手牌太多時:固定區塊內左右捲動,捲到非端點時該側邊緣淡出(--fl/--fr 控制 mask)
function updateHandFade() {
  const w = $('#handWrap');
  if (!w) return;
  const max = w.scrollWidth - w.clientWidth;
  w.style.setProperty('--fl', w.scrollLeft > 4 ? '34px' : '0px');
  w.style.setProperty('--fr', w.scrollLeft < max - 4 ? '34px' : '0px');
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
  const draw = toTier => {
    const eligible = hand.map((c, i) => ({ c, i }))
      .filter(o => o.c.kind === 'tech' && (toTier === 4 ? o.c.tier <= 3 : o.c.tier === 4));
    const need = toTier === 4 ? `階級加總正好 ${cu.sum}` : `${cu.need5} 張 4 階卡`;
    const pool = toTier === 4 ? cu.pool4 : cu.pool5;
    const tabs = `<div class="upg-tabs">
      <button class="btn small-btn ${toTier === 4 ? 'toggled' : ''}" data-totier="4" ${cu.pool4 ? '' : 'disabled'}>換 4 階卡(庫存 ${cu.pool4})</button>
      <button class="btn small-btn ${toTier === 5 ? 'toggled' : ''}" data-totier="5" ${cu.pool5 ? '' : 'disabled'}>換 5 階卡(庫存 ${cu.pool5})</button>
    </div>`;
    const rows = eligible.length ? eligible.map(o =>
      `<label class="upg-row"><input type="checkbox" class="upg-ck" data-idx="${o.i}" data-tier="${o.c.tier}">
        ${TECH_CATEGORIES[o.c.cat].icon}【${o.c.name}】${o.c.tier}階</label>`).join('')
      : `<div class="modal-desc">(沒有可用於換 ${toTier} 階卡的手牌科技卡)</div>`;
    $('#modalTitle').innerHTML = '⏫ 捨牌升階';
    $('#modalBody').innerHTML = tabs
      + `<p class="modal-desc">捨棄手牌科技卡換取 1 張 ${toTier} 階卡(消耗 ${cu.ap} 行動點)。需${need};該階卡庫剩 ${pool} 張。</p>`
      + `<div class="upg-list">${rows}</div><div id="upgSum" class="modal-desc"></div>`;
    $('#modalOptions').innerHTML =
      `<button class="btn" id="upgConfirm">確定升階</button><button class="btn" id="upgCancel">取消</button>`;
    $('#modal').style.display = 'flex';
    const updateSum = () => {
      const cks = [...$('#modalBody').querySelectorAll('.upg-ck:checked')];
      const sum = cks.reduce((t, e) => t + parseInt(e.dataset.tier, 10), 0);
      const ok = toTier === 4 ? sum === cu.sum : cks.length === cu.need5;
      $('#upgSum').textContent = toTier === 4
        ? `已選階級加總:${sum} / ${cu.sum}` : `已選 ${cks.length} / ${cu.need5} 張 4 階卡`;
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
        net.action('upgradeCard', { handIdxs: idxs, toTier });
        $('#modal').style.display = 'none';
      } else if (e.target.id === 'upgCancel') {
        $('#modal').style.display = 'none';
      }
    };
  };
  draw(cu.can4 || !cu.can5 ? 4 : 5);
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
  if (mode === 'move' && last?.priv?.moveTargets) {
    board.highlight(last.priv.moveTargets.map(t => t.regionId));
    toast(`點擊發光城市移動(相鄰 🛢️1;✈️ 搭飛機 ${RULES.planeRange} 格內 🛢️5)`);
  } else {
    board.highlight([]);
  }
  $('#btnMove').classList.toggle('toggled', mode === 'move');
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
      <span class="rc-stats">🔬${techDual(c)} 🛡️${c.effDef} 💱${c.trade}${c.special ? `|✨${c.special.text}` : ''}</span>${debuffText(c)}</div>`;
  }).join('') || '<div>(尚無科技卡)</div>';
  const blocked = (r.builtRound && s.round < r.builtRound + RULES.cityBuildCooldown
    ? `<div style="color:#ff6">🚧 今年已建造過,須過一年才可重新建造</div>` : '');
  const country = rDef.country ? `|${{ US: '🇺🇸米國', CN: '🇨🇳牆國', JP: '🇯🇵日本', KR: '🇰🇷韓國', TW: '🇹🇼台灣' }[rDef.country]}地盤` : '|中立';
  openModal(`${rDef.name} Lv.${r.level}|${rDef.tag}${country}${rDef.chipBonus ? '(晶片重鎮:科技力 +1)' : ''}`,
    `<p class="modal-desc">城市等級 ${r.level}:可建 ${r.level} 階以下科技卡|米國在牆國地盤(及反之)發展科技花費 ×2</p>` + lines + blocked,
    [{ label: '關閉', value: null }]);
}

function onCardClick(idx) {
  if (!isMyTurn()) { toast('還沒輪到你'); return; }
  const priv = last.priv;
  const c = priv.hand[idx];
  if (!c) return;

  const opts = [];
  let body = `<p class="modal-desc">${c.desc || ''}</p>`;
  if (c.kind === 'tech') {
    const cat = TECH_CATEGORIES[c.cat];
    body = `<p class="modal-desc">${cat.icon} ${cat.name}|${c.tier}階|🔬${techDual(c)} 🛡️${c.def} 💱${c.trade}
      ${c.special ? `<br>✨ ${c.special.text}` : ''}<br>${c.desc || ''}</p>`;
    if (priv.turnFlags?.forfeitTech) {
      body += `<p class="modal-desc" style="color:#ff6">⚠️ 你本回合已放棄打出科技卡的權利</p>`;
    } else {
      if (c.playMsg) body += `<p class="modal-desc" style="color:#ff6">⚠️ ${c.playMsg}</p>`;
      else opts.push({ label: `🏗️ 部署在目前城市(${fmtRes(c.myCost)})`, value: { a: 'play' } });
      // 盟友改建:改建同陣營盟友被作戰卡 debuff 的科技卡(折舊返還原建設玩家)
      for (const rt of (priv.rescueTargets || [])) {
        if (c.tier >= rt.tier)
          opts.push({ label: `🔧 改建盟友 ${rt.ownerName} 的受損【${rt.name}】(${rt.tier}階,折舊 ${rt.deprec} 返還)`,
            value: { a: 'rescue', uid: rt.uid } });
      }
    }
  } else {
    const targets = priv.targets?.[c.id] || [];
    if (priv.turnFlags?.forfeitOps) body += `<p class="modal-desc" style="color:#ff6">⚠️ 你本回合已放棄打出作戰卡的權利</p>`;
    else if (targets.length) opts.push({ label: `${c.icon} 選擇目標(基本費 ${fmtRes(c.myCost)},每多 1 格 +50%)`, value: { a: 'target' } });
    else body += `<p class="modal-desc" style="color:#ff6">⚠️ 沒有合法目標(超出航線範圍/防護太高/已被鎖定過)</p>`;
  }
  opts.push({ label: '取消', value: null });

  openModal(`${c.kind === 'tech' ? TECH_CATEGORIES[c.cat].icon : c.icon} ${c.name}`, body, opts, val => {
    if (!val) return;
    if (val.a === 'play') net.action('playTech', { handIdx: idx });
    else if (val.a === 'rescue') net.action('playTech', { handIdx: idx, rebuildUid: val.uid });
    else if (val.a === 'target') chooseOpsTarget(c, idx);
  });
}

function chooseOpsTarget(c, idx) {
  const targets = last.priv.targets?.[c.id] || [];
  openModal(`${c.icon} ${c.name} — 選擇目標`, `<p class="modal-desc">${c.desc}</p>`,
    targets.map(t => ({ label: t.label, value: t }))
      .concat([{ label: '取消', value: '__cancel' }]),
    val => {
      if (val === '__cancel' || val === null) return;
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
  if (lastFxId === null) lastFxId = maxId <= 2 ? 0 : maxId; // 新局播開場;重連略過歷史
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
  switch (f.type) {
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
  }
}

function showEventFx(ev) {
  if (!ev) return;
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
    const card = e.target.closest('.card');
    if (card) onCardClick(parseInt(card.dataset.idx, 10));
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

// ---------------- 初始化 ----------------
// 先抓伺服器的數值參數設定(config/rules.json)套用,確保前後端顯示一致
try {
  const resp = await fetch('/config/rules.json');
  if (resp.ok) applyRulesOverrides(await resp.json());
} catch { /* 拿不到就用內建預設值 */ }
setupConnect();
setupLobbyEvents();
setupGameEvents();
