// ============ 前端 UI 與流程(連線版) ============
import { FACTIONS, CHARACTERS, TECH_CATEGORIES, RULES, REGIONS, RES_KEYS, RESOURCES, applyRulesOverrides } from './data.js';
import { Board3D } from './board3d.js';
import { Net } from './net.js';

const $ = sel => document.querySelector(sel);

let net = null;
let board = null;
let last = null;        // 最近一次 sync payload
let mode = 'idle';      // idle | move
let myCharId = null;
let resultShown = false;
let lastFxId = null;    // 已播放的最後一個特效 id(增量播放,首次同步不重播歷史)

function fmtRes(c) {
  const parts = RES_KEYS.filter(k => c && c[k] > 0).map(k => `${RESOURCES[k].icon}${c[k]}`);
  return parts.length ? parts.join(' ') : '免費';
}
function totalRes(c) { return RES_KEYS.reduce((s, k) => s + (c?.[k] || 0), 0); }

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
    $('#eventFx').classList.remove('show');
    resultShown = false;
    lastFxId = null;        // 回到大廳:下一局重新基準,新局開場事件會播放
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

  // 角色池:遊戲人數 6+ 同時開放日韓
  const expected = lobby.config?.expectedCount || 4;
  const allowJPKR = expected >= RULES.jpkrMinPlayers;
  // 3 人以上:只剩我未選角且台灣沒人選 → 只能選台灣
  const playerClients = lobby.clients.filter(c => c.mode === 'player');
  const unselected = playerClients.filter(c => !c.charId);
  const mustTW = expected >= 3 && !lobby.takenChars.includes('tsmc') &&
    playerClients.length >= expected &&
    unselected.length === 1 && unselected[0].id === m.youId;
  $('#charPool').innerHTML = CHARACTERS.map(c => {
    const lockedJPKR = (c.faction === 'JP' || c.faction === 'KR') && !allowJPKR;
    const lockedTW = mustTW && c.id !== 'tsmc';
    const taken = lobby.takenChars.includes(c.id);
    const isMine = myCharId === c.id;
    return `<div class="char-card ${taken && !isMine ? 'taken' : ''} ${lockedJPKR || lockedTW ? 'locked' : ''} ${isMine ? 'mine' : ''}"
      data-char="${c.id}" style="--fc:${FACTIONS[c.faction].css}">
      <div class="char-faction">${FACTIONS[c.faction].name}</div>
      <div class="char-name">${c.name}</div>
      <div class="char-real">${c.real}</div>
      <div class="char-ind">🏭 ${c.industry}|${c.industryDesc}(${TECH_CATEGORIES[catOf(c)].name})</div>
      <div class="char-perk">✨ ${c.perkText}</div>
      ${lockedJPKR ? `<div class="lock-tip">遊戲人數 ${RULES.jpkrMinPlayers}+ 開放</div>` : ''}
      ${lockedTW && !lockedJPKR ? '<div class="lock-tip">最後一位須選台灣</div>' : ''}
      ${taken && !isMine ? '<div class="lock-tip">已被鎖定(可輸入 PIN 認領)</div>' : ''}
      ${isMine ? '<div class="lock-tip mine-tip">✔ 你的角色</div>' : ''}
    </div>`;
  }).join('');

  $('#hostModeBox').style.display = m.isHost ? '' : 'none';
  $('#startBtn').style.display = m.isHost ? '' : 'none';
  updateModeVisibility();
  const seated = lobby.clients.filter(c => c.mode === 'player' && c.charId);
  $('#lobbyStatus').textContent = mustTW
    ? '🏔️ 你是最後一位未選角的玩家,必須選擇台灣(護國神山)!'
    : `${seated.length} 位玩家已選角(2 人=米牆對決免台灣,3 人以上需米/牆/台各一)`;
}

function updateModeVisibility() {
  const mode = $('#gameMode').value;
  const n = parseInt($('#expectedCount').value, 10);
  $('#modeHint').textContent = {
    multi: n === 2 ? '⚔️ 2 人=米牆對決(無台灣規則)' : `共 ${n} 位玩家連線對戰`,
    ai: `你 1 人 + ${n - 1} 個 AI(AI 數量 = 遊戲人數 - 1)`,
    aiwar: `${n} 個 AI 互鬥,所有人觀戰看戲`,
    god: `你一人輪流操控全部 ${n} 個角色`,
  }[mode] || '';
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
  $('#startBtn').addEventListener('click', () =>
    net.send({ t: 'startGame', mode: $('#gameMode').value }));
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
  processFx(s);
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
  $('#curName').innerHTML = `<span style="color:${FACTIONS[me.faction].css}">${me.name}</span> 【${FACTIONS[me.faction].name}】`;
  const myTech = last.state.tech[me.faction] ?? 0;
  let stats = `💰 <b>${me.res.money}</b>  ⚡ <b>${me.res.power}</b>  🛢️ <b>${me.res.oil}</b>  🎯 行動點 <b>${me.ap}</b>  📍 ${REGIONS.find(r => r.id === me.pos).name}<br>📈 收入 ${fmtRes(me.income)}/回合  🔬 本國科技力 <b>${myTech}</b> 點(每 100 點收益 +1)`;
  if (priv?.intel?.length) {
    stats += '<br>' + priv.intel.map(it =>
      `🧬 ${TECH_CATEGORIES[it.cat].name}情報:下次發展 -${fmtRes(it.gain)}`).join('  ');
  }
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
      <span class="pl-dot" style="background:${FACTIONS[q.faction].css}"></span>
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
        <div class="card-desc">🔬${c.tech} 🛡️${c.def} 💱${c.trade}${c.special ? `|✨${c.special.text}` : ''}</div>
      </div>`;
    }
    return `<div class="card" data-idx="${i}">
      <div class="card-icon">${c.icon}</div>
      <div class="card-name">${c.name}</div>
      <div class="card-cost">${fmtRes(c.myCost)}${c.atk ? ` ⚔️${c.atk}` : ''}</div>
      <div class="card-desc">${c.desc}</div>
    </div>`;
  }).join('') || '<div class="hand-empty">沒有手牌</div>';
}

function renderActions(m) {
  const me = myPlayer();
  const priv = m.priv;
  const myTurn = isMyTurn();
  const s = m.state;

  const inTrade = s.phase === 'trade';
  for (const id of ['btnMove', 'btnDraw', 'btnEnd', 'btnReveal', 'btnPivot',
    'btnForfTech', 'btnForfOps', 'btnForfMove', 'btnUpgrade', 'btnExchange'])
    $('#' + id).disabled = !myTurn || inTrade;

  if (myTurn && priv && !inTrade) {
    $('#btnDraw').textContent = `🃏 抽卡(${fmtRes(priv.drawCost)})`;
    $('#btnDraw').disabled = me.ap < 1 || RES_KEYS.some(k => me.res[k] < (priv.drawCost[k] || 0));
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
    $('#btnDraw').textContent = '🃏 抽卡';
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
    board.highlight(last.priv.moveTargets.map(t => t.regionId));
    toast('點擊發光城市移動(相鄰 🛢️1;✈️ 搭飛機直達任一城市 🛢️5)');
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
  const blocked = (r.fakeUntilRound > s.round
    ? `<div style="color:#ff6">📰 假新聞影響中:此城發展科技花費 ×${r.fakeMult}</div>` : '')
    + (r.builtRound && s.round < r.builtRound + RULES.cityBuildCooldown
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
    body = `<p class="modal-desc">${cat.icon} ${cat.name}|${c.tier}階|🔬${c.tech} 🛡️${c.def} 💱${c.trade}
      ${c.special ? `<br>✨ ${c.special.text}` : ''}<br>${c.desc || ''}</p>`;
    if (c.playMsg) body += `<p class="modal-desc" style="color:#ff6">⚠️ ${c.playMsg}</p>`;
    else if (priv.turnFlags?.forfeitTech) body += `<p class="modal-desc" style="color:#ff6">⚠️ 你本回合已放棄打出科技卡的權利</p>`;
    else opts.push({ label: `🏗️ 部署在目前城市(${fmtRes(c.myCost)})`, value: { a: 'play' } });
  } else {
    const targets = priv.targets?.[c.id] || [];
    if (priv.turnFlags?.forfeitOps) body += `<p class="modal-desc" style="color:#ff6">⚠️ 你本回合已放棄打出作戰卡的權利</p>`;
    else if (targets.length) opts.push({ label: `${c.icon} 使用(${fmtRes(c.myCost)})`, value: { a: 'target' } });
    else body += `<p class="modal-desc" style="color:#ff6">⚠️ 沒有合法目標(限兩格內城市/防護太高/已被鎖定過)</p>`;
  }
  opts.push({ label: '取消', value: null });

  openModal(`${c.kind === 'tech' ? TECH_CATEGORIES[c.cat].icon : c.icon} ${c.name}`, body, opts, val => {
    if (!val) return;
    if (val.a === 'play') net.action('playTech', { handIdx: idx });
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
  for (const f of fx) { if (f.id > lastFxId) dispatchFx(f); }
  lastFxId = maxId;
}

function dispatchFx(f) {
  if (!board) return;
  switch (f.type) {
    case 'event': showEventFx(f.event); break;
    case 'build': { const c = TECH_CATEGORIES[f.cat]; board.fxBuild(f.region, f.cat, c?.css || '#00f0ff', c?.icon || '🏗️'); break; }
    case 'destroy': board.fxDestroy(f.region); break;
    case 'steal': board.fxSteal(f.region); break;
    case 'fake': board.fxFake(f.region); break;
    case 'move': board.fxMove(f.from, f.to, f.plane); break;
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
      <td><span class="pl-dot" style="background:${FACTIONS[q.faction].css}"></span>
        <b style="color:${FACTIONS[q.faction].css}">${q.name}</b>${isMe ? '(你)' : ''}${winnerSet.has(q.id) ? ' 👑' : ''}
        <div class="res">${ch ? ch.name : ''}【${FACTIONS[q.faction].name}】</div></td>
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
  $('#btnDraw').addEventListener('click', () => net.action('draw'));
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
// 先抓伺服器的數值參數設定(config/rules.json)套用,確保前後端顯示一致
try {
  const resp = await fetch('/config/rules.json');
  if (resp.ok) applyRulesOverrides(await resp.json());
} catch { /* 拿不到就用內建預設值 */ }
setupConnect();
setupLobbyEvents();
setupGameEvents();
