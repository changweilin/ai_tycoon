// ============ 前端 UI 與流程(連線版) ============
import { FACTIONS, CHARACTERS, TECH_CATEGORIES, RULES, REGIONS } from './data.js';
import { Board3D } from './board3d.js';
import { Net } from './net.js';

const $ = sel => document.querySelector(sel);

let net = null;
let board = null;
let last = null;        // 最近一次 sync payload
let mode = 'idle';      // idle | move
let myCharId = null;
let shownOfferSig = ''; // 避免重複彈出發展選卡
let resultShown = false;

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
}

function ensureNet() {
  if (net) return;
  net = new Net(onSync, msg => toast(msg), onOther);
}

function onOther(m) {
  if (m.t === 'info') toast(m.msg);
  else if (m.t === 'saves') showSavesList(m.list);
}

// ---------------- 個人 PIN(設定一次,換角色沿用) ----------------
function getMyPin() { return localStorage.getItem('ctw_pin') || ''; }
function setMyPin(pin) { localStorage.setItem('ctw_pin', pin); }

// ---------------- 同步處理 ----------------
function onSync(m) {
  last = m;
  const me = m.lobby.clients.find(c => c.id === m.youId);
  myCharId = me ? me.charId : null;

  if (!m.lobby.started) {
    $('#connect').style.display = 'none';
    $('#gameUI').style.display = 'none';
    $('#lobby').style.display = 'block';
    $('#resultOverlay').style.display = 'none';
    resultShown = false;
    shownOfferSig = '';
    renderLobby(m);
  } else {
    $('#connect').style.display = 'none';
    $('#lobby').style.display = 'none';
    $('#gameUI').style.display = 'block';
    if (!board) board = new Board3D($('#canvas3d'), onRegionClick);
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

  // 角色池:預計人數 7+ 才開放日韓
  const allowJPKR = (lobby.config?.expectedCount || 4) >= RULES.jpkrMinPlayers;
  $('#charPool').innerHTML = CHARACTERS.map(c => {
    const lockedJPKR = (c.faction === 'JP' || c.faction === 'KR') && !allowJPKR;
    const taken = lobby.takenChars.includes(c.id);
    const isMine = myCharId === c.id;
    return `<div class="char-card ${taken && !isMine ? 'taken' : ''} ${lockedJPKR ? 'locked' : ''} ${isMine ? 'mine' : ''}"
      data-char="${c.id}" style="--fc:${FACTIONS[c.faction].css}">
      <div class="char-faction">${FACTIONS[c.faction].name}</div>
      <div class="char-name">${c.name}</div>
      <div class="char-real">${c.real}</div>
      <div class="char-ind">🏭 ${c.industry}|${c.industryDesc}(${TECH_CATEGORIES[catOf(c)].name})</div>
      <div class="char-perk">✨ ${c.perkText}</div>
      ${lockedJPKR ? `<div class="lock-tip">預計人數 ${RULES.jpkrMinPlayers}+ 開放</div>` : ''}
      ${taken && !isMine ? '<div class="lock-tip">已被鎖定(可輸入 PIN 認領)</div>' : ''}
      ${isMine ? '<div class="lock-tip mine-tip">✔ 你的角色</div>' : ''}
    </div>`;
  }).join('');

  $('#hostModeBox').style.display = m.isHost ? '' : 'none';
  $('#startBtn').style.display = m.isHost ? '' : 'none';
  updateModeVisibility();
  const seated = lobby.clients.filter(c => c.mode === 'player' && c.charId);
  $('#lobbyStatus').textContent =
    `${seated.length} 位玩家已選角(多人 2~8 人;2 人=米牆對決免台灣,3 人以上需米/牆/台各一)`;
}

function updateModeVisibility() {
  const mode = $('#gameMode').value;
  $('#aiCountWrap').style.display = mode === 'ai' ? '' : 'none';
  $('#godCountWrap').style.display = mode === 'god' ? '' : 'none';
}

function catOf(c) {
  return { '交通': 'power', '汽車': 'power', '硬體': 'hardware', '手機': 'hardware', '晶片': 'hardware', '資訊': 'info', 'AI': 'ai', '娛樂': 'fun' }[c.industry];
}

function setupLobbyEvents() {
  $('#charPool').addEventListener('click', e => {
    const card = e.target.closest('.char-card');
    if (!card || card.classList.contains('locked')) return;
    const charId = card.dataset.char;
    const ch = CHARACTERS.find(c => c.id === charId);
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
  });
  $('#gameMode').addEventListener('change', updateModeVisibility);
  $('#gameName').addEventListener('change', () =>
    net.send({ t: 'setRoomConfig', gameName: $('#gameName').value }));
  $('#expectedCount').addEventListener('change', () =>
    net.send({ t: 'setRoomConfig', expectedCount: $('#expectedCount').value }));
  $('#startBtn').addEventListener('click', () => {
    const mode = $('#gameMode').value;
    const count = mode === 'ai' ? $('#aiCount').value : $('#godCount').value;
    net.send({ t: 'startGame', mode, count });
  });
}

// ---------------- 存檔/載入 ----------------
function showSavesList(list) {
  if (!list.length) { toast('目前沒有任何存檔'); return; }
  const body = '<p class="modal-desc">選擇要載入的存檔(會建立新房間,玩家以原 PIN 認領角色):</p>';
  const opts = list.slice(0, 12).map(s => ({
    label: `${s.auto ? '🔄 ' : '💾 '}${s.name}|第 ${s.round ?? '-'} 輪${s.over ? '(已結束)' : ''}|${(s.savedAt || '').slice(0, 16).replace('T', ' ')}<br><span class="save-players">${(s.players || []).join('、')}</span>`,
    value: s.file,
  })).concat([{ label: '取消', value: null }]);
  openModal('📂 載入遊戲', body, opts, val => {
    if (!val) return;
    net.send({ t: 'loadGame', file: val, name: $('#myName')?.value?.trim() || localStorage.getItem('ctw_name') || '' });
  });
}

// ---------------- 遊戲畫面 ----------------
function refreshGame(m) {
  const s = m.state;
  board.sync(s);
  renderTechBar(s);
  renderPlayersList(s);
  renderLog(s);

  const me = myPlayer();
  const spectating = !me;
  $('#actionBar').style.display = spectating ? 'none' : '';
  $('#handWrap').style.display = spectating ? 'none' : '';
  $('#spectatorTag').style.display = spectating ? '' : 'none';

  if (!spectating) {
    renderMyPanel(m);
    renderHand(m);
    renderActions(m);
    maybeShowOffer(m);
  } else {
    $('#curName').textContent = '👁️ 觀戰模式';
    $('#curStats').textContent = '';
    $('#curPerk').textContent = '';
  }

  const turnP = s.players[s.turnIdx];
  $('#turnBanner').innerHTML = s.over ? '🏁 遊戲結束'
    : `輪到 <b style="color:${FACTIONS[turnP.faction].css}">${turnP.name}</b>${isMyTurn() ? '(你!)' : ''}`;
  $('#hostBar').style.display = m.isHost ? '' : 'none';

  if (mode === 'move' && !isMyTurn()) setMode('idle');
  if (s.over && !resultShown) { resultShown = true; showResult(s); }
}

function renderTechBar(s) {
  const lead = s.tech.US - s.tech.CN;
  $('#techUS').textContent = s.tech.US;
  $('#techCN').textContent = s.tech.CN;
  $('#techLead').innerHTML = lead > 0 ? `米國領先 <b>${lead}</b> 年`
    : lead < 0 ? `牆國反超 <b>${-lead}</b> 年` : '雙方持平!';
  $('#techGoal').textContent =
    `米國勝利:領先 ${s.usThreshold} 年|牆國勝利:差距 ≤ ${s.cnThreshold} 年|第 ${s.round}/${s.maxRounds} 輪`;
  const total = 60;
  $('#barUS').style.width = Math.min(100, s.tech.US / total * 100) + '%';
  $('#barCN').style.width = Math.min(100, s.tech.CN / total * 100) + '%';
  if (s.hasTW) {
    const twTag = s.twJoined ? `已加入${FACTIONS[s.twJoined].name}`
      : s.twRevealed ? `公開支持${FACTIONS[s.twSupportPublic].name}` : '立場成謎';
    $('#twStatus').textContent = `🏔️ 台灣:${twTag}`;
  } else {
    $('#twStatus').textContent = '⚔️ 雙人對決:無台灣特殊規則';
  }
}

function renderMyPanel(m) {
  const me = myPlayer();
  const priv = m.priv;
  $('#curName').innerHTML = `<span style="color:${FACTIONS[me.faction].css}">${me.name}</span> 【${FACTIONS[me.faction].name}】`;
  let stats = `💰 資本 <b>${me.capital}</b>  ⚡ 行動點 <b>${me.ap}</b>  📍 ${REGIONS.find(r => r.id === me.pos).name}  📈 收入 ${me.income}/回合`;
  if (priv?.twSupport) {
    stats += `<br>🤫 秘密支持:<b style="color:${FACTIONS[priv.twSupport].css}">${FACTIONS[priv.twSupport].name}</b>  🏔️ 神山儲備:<b>${priv.chipReserve}</b> 年`;
  }
  $('#curStats').innerHTML = stats;
  const ch = CHARACTERS.find(c => c.id === me.charId);
  $('#curPerk').textContent = `✨ ${ch.perkText}`;
}

function renderPlayersList(s) {
  $('#playersList').innerHTML = s.players.map(q => {
    const active = q.id === s.turnIdx && !s.over;
    return `<div class="pl-row ${active ? 'active' : ''}">
      <span class="pl-dot" style="background:${FACTIONS[q.faction].css}"></span>
      <span class="pl-name">${q.isAI ? '🤖' : ''}${q.name}</span>
      <span class="pl-info">💰${q.capital} 🃏${q.handCount}</span>
    </div>`;
  }).join('');
}

function renderHand(m) {
  const priv = m.priv;
  if (!priv) { $('#hand').innerHTML = ''; return; }
  $('#hand').innerHTML = priv.hand.map((c, i) =>
    `<div class="card" data-idx="${i}">
      <div class="card-icon">${c.icon}</div>
      <div class="card-name">${c.name}</div>
      <div class="card-cost">💰${c.myCost}${c.atk ? ` ⚔️${c.atk}` : ''}</div>
      <div class="card-desc">${c.desc}</div>
    </div>`).join('') || '<div class="hand-empty">沒有手牌</div>';
}

function renderActions(m) {
  const me = myPlayer();
  const priv = m.priv;
  const myTurn = isMyTurn();
  const s = m.state;

  for (const id of ['btnMove', 'btnBuild', 'btnDraw', 'btnEnd', 'btnReveal', 'btnJoin'])
    $('#' + id).disabled = !myTurn;

  if (myTurn && priv) {
    const chk = priv.developCheck;
    $('#btnBuild').textContent = chk.ok ? '🏗️ 研發科技卡(1AP 翻 2 選 1)' : `🏗️ ${chk.msg}`;
    $('#btnBuild').disabled = !chk.ok || me.ap < 1;
    $('#btnDraw').textContent = `🃏 抽作戰卡(💰${priv.drawCost})`;
    $('#btnDraw').disabled = me.ap < 1 || me.capital < priv.drawCost;
  } else {
    $('#btnBuild').textContent = '🏗️ 研發科技卡';
    $('#btnDraw').textContent = '🃏 抽作戰卡';
  }
  $('#btnMove').classList.toggle('toggled', mode === 'move');

  const isTW = me.faction === 'TW';
  $('#btnReveal').style.display = isTW && !s.twRevealed ? '' : 'none';
  $('#btnJoin').style.display = isTW && s.twRevealed && !s.twJoined ? '' : 'none';
  if (isTW) $('#btnJoin').textContent = `🏆 加入陣營(💰${RULES.twJoinCost})`;
}

function renderLog(s) {
  $('#log').innerHTML = s.log.map(l => `<div>${l}</div>`).join('');
  $('#log').scrollTop = $('#log').scrollHeight;
}

// 研發:先選類別(擅長領域有折扣與科技加成)
function chooseCategory() {
  if (!isMyTurn() || !last?.priv) return;
  const priv = last.priv;
  const opts = Object.values(TECH_CATEGORIES).map(cat => {
    const isSpec = cat.id === priv.specialty;
    const left = priv.deckCounts?.[cat.id] ?? '?';
    return {
      label: `${cat.icon} ${cat.name}(${cat.trait})${isSpec ? ' ⭐擅長:費用-20%、科技+1' : ''}|剩 ${left} 張`,
      value: cat.id,
    };
  }).concat([{ label: '取消', value: null }]);
  openModal('🏗️ 研發 — 選擇科技類別(1 AP 翻 2 選 1)',
    '<p class="modal-desc">可研發任何類別;你的擅長領域(⭐)費用 -20% 且部署科技力 +1。</p>',
    opts, val => { if (val) net.action('developStart', { catId: val }); });
}

// 發展選卡 modal
function maybeShowOffer(m) {
  const offer = m.priv?.offer;
  if (!offer) { shownOfferSig = ''; return; }
  const sig = offer.map(c => c.uid).join(',');
  if (sig === shownOfferSig) return;
  shownOfferSig = sig;
  const body = `<div class="offer-row">` + offer.map((c, i) => {
    const cat = TECH_CATEGORIES[c.cat];
    return `<div class="tech-card" style="--cc:${cat.css}">
      <div class="tc-cat">${cat.icon} ${cat.name}|${c.tier}階</div>
      <div class="tc-name">${c.name}</div>
      <div class="tc-stats">🔬科技 ${c.tech}|🛡️防護 ${c.def}|💱交易 ${c.trade}</div>
      <div class="tc-desc">${c.desc || ''}</div>
      ${c.special ? `<div class="tc-special">✨ ${c.special.text}</div>` : ''}
      <div class="tc-cost">費用 💰${c.myCost}</div>
    </div>`;
  }).join('') + `</div>`;
  openModal('🏗️ 研發 — 選擇一張部署到目前區域', body,
    offer.map((c, i) => ({ label: `部署【${c.name}】💰${c.myCost}`, value: i }))
      .concat([{ label: '放棄(AP 不退)', value: -1 }]),
    val => net.action('developPick', { idx: val }));
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

function setMode(m2) {
  mode = m2;
  if (mode === 'move' && last?.priv?.moveTargets) {
    board.highlight(last.priv.moveTargets);
    toast('點擊發光的相鄰區域移動');
  } else {
    board.highlight([]);
  }
  $('#btnMove').classList.toggle('toggled', mode === 'move');
}

function showRegionInfo(rid) {
  const s = last.state;
  const r = s.regions[rid];
  const rDef = REGIONS.find(x => x.id === rid);
  const lines = r.cards.map(c => {
    const o = s.players.find(p => p.id === c.owner);
    const cat = TECH_CATEGORIES[c.cat];
    return `<div class="region-card-row" style="color:${FACTIONS[o.faction].css}">
      ${cat.icon}【${c.name}】${c.tier}階 — ${o.name}<br>
      <span class="rc-stats">🔬${c.tech} 🛡️${c.effDef} 💱${c.trade}${c.special ? `|✨${c.special.text}` : ''}</span></div>`;
  }).join('') || '<div>(尚無科技卡)</div>';
  const blocked = r.blockedUntilRound > s.round
    ? `<div style="color:#ff6">📰 假新聞封鎖中(至第 ${r.blockedUntilRound} 輪)</div>` : '';
  openModal(`${rDef.name}|${rDef.tag}${rDef.chipBonus ? '(晶片重鎮:科技力 +1)' : ''}`,
    lines + blocked, [{ label: '關閉', value: null }]);
}

function onCardClick(idx) {
  if (!isMyTurn()) { toast('還沒輪到你'); return; }
  const priv = last.priv;
  const c = priv.hand[idx];
  if (!c) return;
  const targets = priv.targets?.[c.id] || [];
  if (targets.length === 0) { toast('目前沒有合法目標(防護力太高或無敵方科技卡)'); return; }
  openModal(`${c.icon} ${c.name} — 選擇目標`, `<p class="modal-desc">${c.desc}</p>`,
    targets.map(t => ({ label: t.label, value: t }))
      .concat([{ label: '取消', value: '__cancel' }]),
    val => {
      if (val === '__cancel' || val === null) return;
      net.action('playCard', { handIdx: idx, target: val });
    });
}

// ---------------- 結算 ----------------
function showResult(s) {
  const r = s.result;
  const champion = s.players[r.champion];
  const winnerNames = r.winners.map(id => {
    const q = s.players[id];
    return `<span style="color:${FACTIONS[q.faction].css}">${q.name}</span>(💰${q.capital})`;
  }).join('、');
  $('#resultBody').innerHTML = `
    <p>${r.reason}</p>
    <p>獲勝方:${winnerNames}</p>
    <p class="champion">👑 最終勝利者:<b style="color:${FACTIONS[champion.faction].css}">${champion.name}</b></p>
    <p class="result-secret">台灣的秘密立場是:支持${FACTIONS[r.twSupport].name}</p>`;
  $('#resultOverlay').style.display = 'flex';
}

// ---------------- 事件繫結 ----------------
function setupGameEvents() {
  $('#btnMove').addEventListener('click', () => setMode(mode === 'move' ? 'idle' : 'move'));
  $('#btnBuild').addEventListener('click', chooseCategory);
  $('#btnDraw').addEventListener('click', () => net.action('draw'));
  $('#btnEnd').addEventListener('click', () => { setMode('idle'); net.action('endTurn'); });
  $('#btnReveal').addEventListener('click', () => {
    openModal('⚡ 公開表態',
      `<p>表態後你秘密支持的陣營將被公開,該陣營勝利門檻 <b>+5 年</b>,但神山儲備的科技力會全數注入。確定嗎?</p>`,
      [{ label: '確定表態!', value: true }, { label: '再想想', value: null }],
      val => { if (val) net.action('reveal'); });
  });
  $('#btnJoin').addEventListener('click', () => {
    openModal('🏆 正式加入陣營',
      `<p>花費 ${RULES.twJoinCost} 資本正式加入你支持的陣營 — <b>該陣營立即獲勝</b>!確定嗎?</p>`,
      [{ label: '神山歸位!', value: true }, { label: '再等等', value: null }],
      val => { if (val) net.action('joinSide'); });
  });
  $('#hand').addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (card) onCardClick(parseInt(card.dataset.idx, 10));
  });
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
  $('#rulesBtn').addEventListener('click', () => $('#rulesOverlay').style.display = 'flex');
  $('#rulesClose').addEventListener('click', () => $('#rulesOverlay').style.display = 'none');
  $('#resultClose').addEventListener('click', () => $('#resultOverlay').style.display = 'none');
}

// ---------------- 初始化 ----------------
setupConnect();
setupLobbyEvents();
setupGameEvents();
