// ============ 權威遊戲邏輯(僅在伺服器執行) ============
import {
  FACTIONS, CHARACTERS, REGIONS, EDGES, RULES,
  TECH_CATEGORIES, TECH_CARDS, TIER_COPIES, INDUSTRY_CATEGORY,
  OPS_CARDS, OPS_DECK_COMPOSITION,
} from '../public/js/data.js';

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let cardUid = 1;

function makeTechCard(catId, def) {
  return { uid: cardUid++, cat: catId, ...def, special: def.special || null };
}

export class Game {
  /** @param {Array<{charId:string, playerName:string}>} seats */
  constructor(seats) {
    this.regions = {};
    for (const r of REGIONS) this.regions[r.id] = { ...r, cards: [], blockedUntilRound: 0 };
    this.adj = {};
    for (const r of REGIONS) this.adj[r.id] = [];
    for (const [a, b] of EDGES) { this.adj[a].push(b); this.adj[b].push(a); }

    this.players = seats.map((s, i) => {
      const ch = CHARACTERS.find(c => c.id === s.charId);
      return {
        id: i, name: s.playerName || ch.name, char: ch, faction: ch.faction,
        capital: RULES.startCapital, hand: [], pos: ch.home,
        ap: 0, usedFreeMove: false, isAI: !!s.isAI,
      };
    });
    this.hasTW = this.players.some(p => p.faction === 'TW');

    this.tech = { ...RULES.techStart };
    this.round = 1;
    this.turnIdx = 0;

    // 科技卡牌庫(每類一疊)
    this.techDecks = {};
    this.techDiscards = {};
    for (const catId in TECH_CATEGORIES) {
      const deck = [];
      for (const def of TECH_CARDS[catId]) {
        const copies = TIER_COPIES[def.tier - 1];
        for (let i = 0; i < copies; i++) deck.push(makeTechCard(catId, def));
      }
      this.techDecks[catId] = shuffle(deck);
      this.techDiscards[catId] = [];
    }
    // 作戰卡牌庫
    this.opsDeck = [];
    this.opsDiscard = [];
    for (const [type, n] of OPS_DECK_COMPOSITION)
      for (let i = 0; i < n; i++) this.opsDeck.push(type);
    shuffle(this.opsDeck);

    this.twSupport = Math.random() < 0.5 ? 'US' : 'CN';
    this.twRevealed = false;
    this.twJoined = null;
    this.chipReserve = 0;

    this.pendingOffer = null; // {playerId, cards:[techCard, techCard]}
    this.log = [];
    this.over = false;
    this.result = null;

    for (const p of this.players) { this.drawOpsFor(p); this.drawOpsFor(p); }
    this.beginTurn();
  }

  // ---------- 工具 ----------
  cur() { return this.players[this.turnIdx]; }
  addLog(msg) { this.log.push(`[第${this.round}輪] ${msg}`); }

  sideOf(p) {
    if (p.faction === 'TW') return this.twRevealed ? this.twSupport : null;
    return FACTIONS[p.faction].side;
  }
  secretSideOf(p) {
    if (p.faction === 'TW') return this.twSupport;
    return FACTIONS[p.faction].side;
  }
  lead() { return this.tech.US - this.tech.CN; }
  usThreshold() {
    return RULES.usWinLead + (this.twRevealed && this.twSupport === 'US' ? RULES.twRevealPenalty : 0);
  }
  cnThreshold() {
    return RULES.cnWinLead - (this.twRevealed && this.twSupport === 'CN' ? RULES.twRevealPenalty : 0);
  }

  /** 角色擅長的科技卡類別 */
  specialtyOf(p) { return INDUSTRY_CATEGORY[p.char.industry]; }

  /** 玩家場上是否有指定特效,回傳總值 */
  specialSum(p, type) {
    let sum = 0, found = false;
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards)
        if (c.owner === p.id && c.special?.type === type) { sum += c.special.val; found = true; }
    return found ? sum : 0;
  }

  opsCostFor(p, type) {
    const c = OPS_CARDS[type];
    let cost = c.cost;
    if (p.faction === 'CN') cost -= RULES.cnOpsDiscount;
    if (p.char.perk === 'phone') cost -= 2;
    cost -= this.specialSum(p, 'opsDiscount');
    if (c.cat === 'fake' && (p.char.perk === 'media' || this.hasFakeFree(p))) cost = 0;
    return Math.max(0, cost);
  }

  hasFakeFree(p) {
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards)
        if (c.owner === p.id && c.special?.type === 'fakeFree') return true;
    return false;
  }

  developCostFor(p, card) {
    let cost = card.cost;
    if (card.cat === this.specialtyOf(p))
      cost -= Math.ceil(cost * RULES.specialtyDiscount); // 擅長領域 -20%
    if (p.char.perk === 'hardware') cost -= 3;
    if (p.char.perk === 'auto') cost -= 2;
    return Math.max(1, cost);
  }

  drawCost(p) { return p.char.perk === 'ai' ? 0 : RULES.drawCost; }

  drawOpsFor(p) {
    if (this.opsDeck.length === 0) {
      if (this.opsDiscard.length === 0) return null;
      this.opsDeck = shuffle(this.opsDiscard);
      this.opsDiscard = [];
    }
    if (p.hand.length >= RULES.handLimit) return null;
    const c = this.opsDeck.pop();
    p.hand.push(c);
    return c;
  }

  /** 有效防護力 = 卡片防護 + 同區域同擁有者其他卡的防護光環 */
  effDef(rid, card) {
    let def = card.def;
    for (const c of this.regions[rid].cards) {
      if (c.uid === card.uid || c.owner !== card.owner) continue;
      if (c.special?.type === 'aura') def += c.special.val;
    }
    return def;
  }

  /** 卡片實際科技力(含加成),用於上場/被毀時的科技結算 */
  techValueOf(p, card, rid) {
    let v = card.tech;
    if (this.regions[rid].chipBonus) v += 1;        // 新竹晶片重鎮
    if (card.cat === this.specialtyOf(p)) v += RULES.specialtyTechBonus; // 擅長領域 +1
    if (p.char.perk === 'chip' && card.cat === 'hardware') v += 1; // 神山硬體+1
    if (p.faction === 'US' && card.tier >= 4) v += 1;              // 米國:尖端科技領先
    return v;
  }

  // ---------- 回合流程 ----------
  incomeOf(p) {
    let income = RULES.baseIncome;
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards)
        if (c.owner === p.id) {
          income += c.trade;
          if (c.special?.type === 'income') income += c.special.val;
        }
    if (p.char.perk === 'info' || p.char.perk === 'auto') income += 2;
    return income;
  }

  beginTurn() {
    const p = this.cur();
    p.ap = RULES.apPerTurn;
    p.usedFreeMove = false;
    const income = this.incomeOf(p);
    p.capital += income;
    this.addLog(`${p.name} 開始回合,獲得收入 ${income} 資本(共 ${p.capital})`);
  }

  endTurn() {
    if (this.over) return;
    this.pendingOffer = null;
    this.turnIdx++;
    if (this.turnIdx >= this.players.length) {
      this.turnIdx = 0;
      this.round++;
      if (this.round > RULES.maxRounds) { this.endGameByRounds(); return; }
      this.addLog(`====== 第 ${this.round} 輪開始 ======`);
    }
    this.beginTurn();
  }

  // ---------- 行動 ----------
  canMoveTo(rid) {
    const p = this.cur();
    if (this.over || this.pendingOffer) return false;
    if (!this.adj[p.pos].includes(rid)) return false;
    const free = p.char.perk === 'transport' && !p.usedFreeMove;
    return free || p.ap >= 1;
  }

  doMove(rid) {
    const p = this.cur();
    if (!this.canMoveTo(rid)) return { ok: false, msg: '無法移動到該區域' };
    const free = p.char.perk === 'transport' && !p.usedFreeMove;
    if (free) p.usedFreeMove = true; else p.ap -= 1;
    p.pos = rid;
    this.addLog(`${p.name} 移動到 ${this.regions[rid].name}${free ? '(免費移動)' : ''}`);
    return { ok: true };
  }

  /** 目前區域可否發展 */
  developCheck() {
    const p = this.cur();
    const r = this.regions[p.pos];
    if (r.blockedUntilRound > this.round) return { ok: false, msg: '此區域被假新聞封鎖中' };
    if (r.cards.length >= RULES.maxCardsPerRegion) return { ok: false, msg: '此區域科技卡已滿' };
    const own = r.cards.filter(c => c.owner === p.id).length;
    if (own >= RULES.maxOwnCardsPerRegion) return { ok: false, msg: '你在此區域的科技卡已達上限' };
    return { ok: true };
  }

  /** 發展第一步:花 1 AP 選一個類別,翻開 2 張科技卡(擅長領域有折扣與加成) */
  doDevelopStart(catId) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.pendingOffer) return { ok: false, msg: '請先完成目前的發展選擇' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    const chk = this.developCheck();
    if (!chk.ok) return chk;
    const cat = catId || this.specialtyOf(p);
    if (!TECH_CATEGORIES[cat]) return { ok: false, msg: '無此科技類別' };
    if (this.techDecks[cat].length === 0 && this.techDiscards[cat].length === 0)
      return { ok: false, msg: '該類別牌庫已抽光' };
    const cards = [];
    for (let i = 0; i < 2; i++) {
      if (this.techDecks[cat].length === 0) {
        if (this.techDiscards[cat].length === 0) break;
        this.techDecks[cat] = shuffle(this.techDiscards[cat]);
        this.techDiscards[cat] = [];
      }
      cards.push(this.techDecks[cat].pop());
    }
    if (cards.length === 0) return { ok: false, msg: '牌庫已空' };
    p.ap -= 1;
    this.pendingOffer = { playerId: p.id, cat, cards };
    this.addLog(`${p.name} 開始研發,翻開了 ${cards.length} 張${TECH_CATEGORIES[cat].name}科技卡…`);
    return { ok: true };
  }

  /** 發展第二步:選一張付費上場(idx = -1 取消,AP 不退) */
  doDevelopPick(idx) {
    const p = this.cur();
    const offer = this.pendingOffer;
    if (!offer || offer.playerId !== p.id) return { ok: false, msg: '沒有待選的科技卡' };
    if (idx === -1) {
      this.techDiscards[offer.cat].push(...offer.cards);
      this.pendingOffer = null;
      this.addLog(`${p.name} 放棄了這次研發`);
      return { ok: true };
    }
    const card = offer.cards[idx];
    if (!card) return { ok: false, msg: '無此卡片' };
    const cost = this.developCostFor(p, card);
    if (p.capital < cost) return { ok: false, msg: `資本不足(需要 ${cost})` };

    const cat = offer.cat;
    p.capital -= cost;
    // 未選的退回棄牌堆
    this.techDiscards[cat].push(...offer.cards.filter((c, i) => i !== idx));
    this.pendingOffer = null;

    // 晶片稅
    const twPlayer = this.players.find(q => q.faction === 'TW');
    if (twPlayer && twPlayer.id !== p.id) {
      const levy = Math.min(RULES.chipLevy, p.capital);
      p.capital -= levy;
      twPlayer.capital += levy;
      if (levy > 0) this.addLog(`${p.name} 支付晶片稅 ${levy} 資本給 ${twPlayer.name}`);
    }

    const r = this.regions[p.pos];
    card.owner = p.id;
    r.cards.push(card);

    const gain = this.techValueOf(p, card, p.pos);
    const side = this.sideOf(p);
    if (side) {
      this.tech[side] += gain;
      this.addLog(`${p.name} 在 ${r.name} 部署【${card.name}】(${card.tier}階),${FACTIONS[side].name}科技力 +${gain} 年`);
    } else {
      this.chipReserve += gain;
      this.addLog(`${p.name} 在 ${r.name} 部署【${card.name}】(${card.tier}階),神山儲備增加(秘密)`);
    }
    card.techApplied = gain; // 被毀時要扣回的量
    this.checkVictory();
    return { ok: true };
  }

  doDraw() {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.pendingOffer) return { ok: false, msg: '請先完成目前的發展選擇' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    const cost = this.drawCost(p);
    if (p.capital < cost) return { ok: false, msg: '資本不足' };
    if (p.hand.length >= RULES.handLimit) return { ok: false, msg: '手牌已滿' };
    p.ap -= 1;
    p.capital -= cost;
    this.drawOpsFor(p);
    this.addLog(`${p.name} 抽了一張作戰卡`);
    return { ok: true };
  }

  // ---------- 作戰卡 ----------
  /** 合法目標清單 */
  cardTargets(type) {
    const p = this.cur();
    const card = OPS_CARDS[type];
    if (!card) return [];
    const mySide = this.secretSideOf(p);

    if (card.cat === 'spy' || card.cat === 'steal') {
      const targets = [];
      for (const rid in this.regions) {
        for (const c of this.regions[rid].cards) {
          if (c.owner === p.id) continue;
          const owner = this.players[c.owner];
          if (p.faction !== 'TW' && this.secretSideOf(owner) === mySide) continue; // 不打自己陣營
          const def = this.effDef(rid, c);
          if (card.atk < def) continue; // 防護力太高
          targets.push({
            regionId: rid, uid: c.uid, tier: c.tier, tech: c.tech,
            label: `${this.regions[rid].name}|${owner.name}【${c.name}】${c.tier}階(防護${def})`,
          });
        }
      }
      return targets;
    }
    if (card.cat === 'fake') {
      return Object.values(this.regions)
        .filter(r => r.blockedUntilRound <= this.round)
        .map(r => ({ regionId: r.id, label: r.name }));
    }
    return [];
  }

  doPlayCard(handIdx, target) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.pendingOffer) return { ok: false, msg: '請先完成目前的發展選擇' };
    const type = p.hand[handIdx];
    if (!type) return { ok: false, msg: '無此卡片' };
    const card = OPS_CARDS[type];
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    const cost = this.opsCostFor(p, type);
    if (p.capital < cost) return { ok: false, msg: '資本不足' };

    // 驗證目標仍合法
    const valid = this.cardTargets(type);
    let chosen = null;
    if (card.cat === 'fake') chosen = valid.find(t => t.regionId === target?.regionId);
    else chosen = valid.find(t => t.uid === target?.uid);
    if (!chosen) return { ok: false, msg: '目標不合法或已消失' };

    p.ap -= 1;
    p.capital -= cost;
    p.hand.splice(handIdx, 1);
    this.opsDiscard.push(type);

    const mySide = this.secretSideOf(p);

    if (card.cat === 'spy') {
      const r = this.regions[chosen.regionId];
      const tc = r.cards.find(c => c.uid === chosen.uid);
      const owner = this.players[tc.owner];
      r.cards = r.cards.filter(c => c.uid !== tc.uid);
      this.techDiscards[tc.cat].push(tc);
      const ownerSide = this.sideOf(owner);
      const loss = tc.techApplied || tc.tech;
      if (ownerSide) {
        this.tech[ownerSide] = Math.max(0, this.tech[ownerSide] - loss);
        this.addLog(`💣 ${p.name} 用【${card.name}】摧毀了 ${owner.name} 在 ${r.name} 的【${tc.name}】!${FACTIONS[ownerSide].name}科技力 -${loss} 年`);
      } else {
        this.chipReserve = Math.max(0, this.chipReserve - loss);
        this.addLog(`💣 ${p.name} 用【${card.name}】摧毀了 ${owner.name} 在 ${r.name} 的【${tc.name}】!神山儲備受損(秘密)`);
      }
      this.checkVictory();
      return { ok: true };
    }

    if (card.cat === 'steal') {
      const r = this.regions[chosen.regionId];
      const tc = r.cards.find(c => c.uid === chosen.uid);
      const owner = this.players[tc.owner];
      const amount = Math.ceil(tc.tier / 2);
      const ownerSide = this.sideOf(owner);
      if (ownerSide) this.tech[ownerSide] = Math.max(0, this.tech[ownerSide] - amount);
      else this.chipReserve = Math.max(0, this.chipReserve - amount);
      if (p.faction === 'TW' && !this.twRevealed) {
        this.chipReserve += amount;
        this.addLog(`🕵️ ${p.name} 用【${card.name}】竊取了【${tc.name}】的機密,存入神山儲備(秘密)`);
      } else {
        this.tech[mySide] += amount;
        this.addLog(`🕵️ ${p.name} 用【${card.name}】從 ${owner.name} 的【${tc.name}】竊取了 ${amount} 年科技力!`);
      }
      this.checkVictory();
      return { ok: true };
    }

    if (card.cat === 'fake') {
      const r = this.regions[chosen.regionId];
      const dur = type === 'fake2' ? 2 : 1;
      r.blockedUntilRound = this.round + dur;
      this.addLog(`📰 ${p.name} 對 ${r.name} 發動【${card.name}】,${dur} 輪內無法發展!`);
      return { ok: true };
    }
    return { ok: false, msg: '未知卡片' };
  }

  // ---------- 台灣專屬 ----------
  doReveal() {
    const p = this.cur();
    if (p.faction !== 'TW') return { ok: false, msg: '只有台灣可以表態' };
    if (this.twRevealed) return { ok: false, msg: '已經表態過了' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    p.ap -= 1;
    this.twRevealed = true;
    const side = this.twSupport;
    if (this.chipReserve > 0) {
      this.tech[side] += this.chipReserve;
      this.addLog(`⚡ ${p.name} 公開表態支持${FACTIONS[side].name}!神山儲備 ${this.chipReserve} 年科技力全數注入!(該陣營勝利門檻 +5 年)`);
      this.chipReserve = 0;
    } else {
      this.addLog(`⚡ ${p.name} 公開表態支持${FACTIONS[side].name}!(該陣營勝利門檻 +5 年)`);
    }
    this.checkVictory();
    return { ok: true };
  }

  doJoin() {
    const p = this.cur();
    if (p.faction !== 'TW') return { ok: false, msg: '只有台灣可以加入陣營' };
    if (!this.twRevealed) return { ok: false, msg: '必須先表態' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    if (p.capital < RULES.twJoinCost) return { ok: false, msg: `需要 ${RULES.twJoinCost} 資本` };
    p.ap -= 1;
    p.capital -= RULES.twJoinCost;
    this.twJoined = this.twSupport;
    this.addLog(`🏆 ${p.name} 正式加入${FACTIONS[this.twSupport].name}!神山歸位,大局已定!`);
    this.checkVictory();
    return { ok: true };
  }

  // ---------- 勝負 ----------
  checkVictory() {
    if (this.over) return;
    const lead = this.lead();
    let side = null, reason = '';
    if (this.twJoined) {
      side = this.twJoined;
      reason = `台灣加入${FACTIONS[side].name},${FACTIONS[side].name}立即獲勝!`;
    } else if (lead >= this.usThreshold()) {
      side = 'US';
      reason = `米國科技力領先 ${lead} 年(門檻 ${this.usThreshold()}),米國獲勝!`;
    } else if (lead <= this.cnThreshold()) {
      side = 'CN';
      reason = this.cnThreshold() < 0
        ? `牆國科技力反超 ${-lead} 年,牆國獲勝!`
        : `牆國科技力追平米國,牆國獲勝!`;
    }
    if (!side) return;
    const winners = [];
    for (const p of this.players) {
      if (p.faction === 'TW') {
        if (this.twSupport === side) winners.push(p.id);
      } else if (p.faction === 'US' || p.faction === 'CN') {
        if (FACTIONS[p.faction].side === side) winners.push(p.id);
      }
    }
    this.concludeWinners(winners, reason);
  }

  endGameByRounds() {
    const lead = this.lead();
    const jp = this.players.find(p => p.faction === 'JP');
    const kr = this.players.find(p => p.faction === 'KR');
    let winners = [];
    let reason = `第 ${RULES.maxRounds} 輪結束,米牆雙方和局(差距 ${lead} 年)。`;
    if (jp && lead >= RULES.jpWinLead && !this.twJoined) {
      winners.push(jp.id);
      reason += ` 米國領先 ${lead} 年(≥5)且台灣未加入任一方 → 日本達成勝利條件!`;
    }
    if (kr && lead < RULES.jpWinLead) {
      winners.push(kr.id);
      reason += ` 米國領先不足 5 年且雙方和局 → 韓國達成勝利條件!`;
    }
    if (winners.length === 0) {
      const richest = [...this.players].sort((a, b) => b.capital - a.capital)[0];
      winners = [richest.id];
      reason += ` 無陣營達成勝利 → 資本最雄厚的 ${richest.name} 獲得商業勝利!`;
    }
    this.concludeWinners(winners, reason);
  }

  concludeWinners(winnerIds, reason) {
    this.over = true;
    const ws = winnerIds.map(id => this.players[id]);
    const champion = [...ws].sort((a, b) => b.capital - a.capital)[0];
    this.result = { winners: winnerIds, champion: champion.id, reason, twSupport: this.twSupport };
    if (ws.length > 1) {
      this.addLog(reason);
      this.addLog(`👑 多位贏家中資本最多者為 ${champion.name}(${champion.capital} 資本),奪得最終勝利!`);
    } else {
      this.addLog(`${reason} 👑 ${champion.name} 獲得最終勝利!`);
    }
  }

  // ---------- 序列化 ----------
  publicState() {
    const regions = {};
    for (const rid in this.regions) {
      const r = this.regions[rid];
      regions[rid] = {
        id: rid, blockedUntilRound: r.blockedUntilRound,
        cards: r.cards.map(c => ({
          uid: c.uid, owner: c.owner, cat: c.cat, tier: c.tier, name: c.name,
          tech: c.tech, def: c.def, trade: c.trade, effDef: this.effDef(rid, c),
          special: c.special,
        })),
      };
    }
    return {
      players: this.players.map(p => ({
        id: p.id, name: p.name, charId: p.char.id, faction: p.faction,
        capital: p.capital, pos: p.pos, ap: p.ap, handCount: p.hand.length,
        income: this.incomeOf(p), isAI: p.isAI,
      })),
      hasTW: this.hasTW,
      regions,
      tech: this.tech,
      round: this.round, maxRounds: RULES.maxRounds,
      turnIdx: this.turnIdx,
      usThreshold: this.usThreshold(), cnThreshold: this.cnThreshold(),
      twRevealed: this.twRevealed,
      twSupportPublic: this.twRevealed ? this.twSupport : null,
      twJoined: this.twJoined,
      log: this.log.slice(-60),
      over: this.over, result: this.result,
      pendingOfferFor: this.pendingOffer ? this.pendingOffer.playerId : null,
    };
  }

  // ---------- 存檔/讀檔 ----------
  serialize() {
    const regions = {};
    for (const rid in this.regions)
      regions[rid] = { cards: this.regions[rid].cards, blockedUntilRound: this.regions[rid].blockedUntilRound };
    return {
      players: this.players.map(p => ({
        id: p.id, name: p.name, charId: p.char.id, capital: p.capital,
        hand: p.hand, pos: p.pos, ap: p.ap, usedFreeMove: p.usedFreeMove, isAI: p.isAI,
      })),
      regions,
      techDecks: this.techDecks, techDiscards: this.techDiscards,
      opsDeck: this.opsDeck, opsDiscard: this.opsDiscard,
      tech: this.tech, round: this.round, turnIdx: this.turnIdx,
      twSupport: this.twSupport, twRevealed: this.twRevealed,
      twJoined: this.twJoined, chipReserve: this.chipReserve,
      pendingOffer: this.pendingOffer, log: this.log,
      over: this.over, result: this.result, cardUid,
    };
  }

  static fromSave(d) {
    const g = Object.create(Game.prototype);
    g.regions = {};
    for (const r of REGIONS) g.regions[r.id] = { ...r, cards: [], blockedUntilRound: 0 };
    for (const rid in d.regions) Object.assign(g.regions[rid], d.regions[rid]);
    g.adj = {};
    for (const r of REGIONS) g.adj[r.id] = [];
    for (const [a, b] of EDGES) { g.adj[a].push(b); g.adj[b].push(a); }
    g.players = d.players.map(p => ({
      ...p, char: CHARACTERS.find(c => c.id === p.charId),
      faction: CHARACTERS.find(c => c.id === p.charId).faction,
    }));
    g.hasTW = g.players.some(p => p.faction === 'TW');
    g.techDecks = d.techDecks; g.techDiscards = d.techDiscards;
    g.opsDeck = d.opsDeck; g.opsDiscard = d.opsDiscard;
    g.tech = d.tech; g.round = d.round; g.turnIdx = d.turnIdx;
    g.twSupport = d.twSupport; g.twRevealed = d.twRevealed;
    g.twJoined = d.twJoined; g.chipReserve = d.chipReserve;
    g.pendingOffer = d.pendingOffer; g.log = d.log;
    g.over = d.over; g.result = d.result;
    cardUid = Math.max(cardUid, d.cardUid || 1);
    return g;
  }

  /** 某玩家的私有資訊 */
  privateStateFor(playerId) {
    const p = this.players[playerId];
    if (!p) return null;
    const priv = {
      playerId,
      hand: p.hand.map(t => ({ ...OPS_CARDS[t], myCost: this.opsCostFor(p, t) })),
      drawCost: this.drawCost(p),
    };
    if (p.faction === 'TW') {
      priv.twSupport = this.twSupport;
      priv.chipReserve = this.chipReserve;
    }
    if (this.turnIdx === playerId && !this.over) {
      priv.targets = {};
      for (const t of ['spy1', 'spy2', 'steal1', 'steal2', 'fake1', 'fake2'])
        priv.targets[t] = this.cardTargets(t);
      priv.developCheck = this.developCheck();
      priv.specialty = this.specialtyOf(p);
      priv.deckCounts = {};
      for (const catId in this.techDecks)
        priv.deckCounts[catId] = this.techDecks[catId].length + this.techDiscards[catId].length;
      priv.moveTargets = this.adj[p.pos].filter(r => this.canMoveTo(r));
      if (this.pendingOffer && this.pendingOffer.playerId === playerId) {
        priv.offer = this.pendingOffer.cards.map(c => ({ ...c, myCost: this.developCostFor(p, c) }));
      }
    }
    return priv;
  }
}
