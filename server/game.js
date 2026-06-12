// ============ 權威遊戲邏輯(僅在伺服器執行) ============
import {
  FACTIONS, CHARACTERS, REGIONS, EDGES, RULES,
  TECH_CATEGORIES, TECH_CARDS, TIER_COPIES, INDUSTRY_CATEGORY,
  OPS_CARDS, OPS_DECK_COMPOSITION, EVENT_CARDS,
  RES_KEYS, CATEGORY_RATIO, splitCost,
} from '../public/js/data.js';

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- 資源三元組工具 ----------
function zeroRes() { return { money: 0, power: 0, oil: 0 }; }
function addRes(a, b) { for (const k of RES_KEYS) a[k] += (b[k] || 0); return a; }
function subRes(a, b) { for (const k of RES_KEYS) a[k] = Math.max(0, a[k] - (b[k] || 0)); return a; }
function canPay(p, c) { return RES_KEYS.every(k => p.res[k] >= (c[k] || 0)); }
function pay(p, c) { for (const k of RES_KEYS) p.res[k] -= (c[k] || 0); }
function totalRes(c) { return RES_KEYS.reduce((s, k) => s + (c[k] || 0), 0); }
export function resStr(c) {
  const icons = { money: '💰', power: '⚡', oil: '🛢️' };
  const parts = RES_KEYS.filter(k => c[k] > 0).map(k => `${icons[k]}${c[k]}`);
  return parts.length ? parts.join(' ') : '免費';
}

let cardUid = 1;

/** 每回合重置的旗標:played* = 已用過該權利;forfeit* = 已放棄該權利換取資源 */
function emptyTurnFlags() {
  return { playedTech: false, playedOps: false, moved: false,
    forfeitTech: false, forfeitOps: false, forfeitMove: false, exchanged: false };
}

function makeTechCard(catId, def) {
  return { uid: cardUid++, kind: 'tech', cat: catId, ...def, special: def.special || null };
}
function makeOpsCard(type) {
  return { uid: cardUid++, kind: 'ops', type };
}

export class Game {
  /** @param {Array<{charId:string, playerName:string}>} seats */
  constructor(seats) {
    this.regions = {};
    for (const r of REGIONS)
      this.regions[r.id] = { ...r, cards: [], fakeUntilRound: 0, fakeMult: 1, level: r.startLevel || 1, builtRound: 0 };
    this.adj = {};
    for (const r of REGIONS) this.adj[r.id] = [];
    for (const [a, b] of EDGES) { this.adj[a].push(b); this.adj[b].push(a); }

    this.players = seats.map((s, i) => {
      const ch = CHARACTERS.find(c => c.id === s.charId);
      return {
        id: i, name: s.playerName || ch.name, char: ch, faction: ch.faction,
        res: { ...RULES.startResources }, hand: [], intel: [], pos: ch.home,
        ap: 0, usedFreeMove: false, isAI: !!s.isAI, strategy: s.strategy || null,
        turnFlags: emptyTurnFlags(),
      };
    });
    this.hasTW = this.players.some(p => p.faction === 'TW');

    this.tech = { ...RULES.techStart };
    this.round = 1;
    this.turnIdx = 0;

    // 混合牌庫:科技卡 + 灰色作戰卡全部洗成一疊(數量依遊玩人數調整)
    const scale = RULES.deckScale[Math.min(8, Math.max(2, seats.length))] || 1;
    this.deck = [];
    this.discardPile = [];
    for (const catId in TECH_CATEGORIES) {
      for (const def of TECH_CARDS[catId]) {
        const copies = Math.max(1, Math.round(TIER_COPIES[def.tier - 1] * scale));
        for (let i = 0; i < copies; i++) this.deck.push(makeTechCard(catId, def));
      }
    }
    for (const [type, n] of OPS_DECK_COMPOSITION) {
      const copies = Math.max(1, Math.round(n * scale));
      for (let i = 0; i < copies; i++) this.deck.push(makeOpsCard(type));
    }
    shuffle(this.deck);

    // 集體事件卡牌庫
    this.eventDeck = shuffle(EVENT_CARDS.map(e => e.id));
    this.activeEvent = null;

    this.twSupport = Math.random() < 0.5 ? 'US' : 'CN';
    this.twRevealed = false;
    this.chipReserve = 0;

    this.log = [];
    this.over = false;
    this.result = null;

    // 交易環節(每輪所有玩家行動結束後)
    this.phase = 'play';
    this.tradeOffers = [];
    this.tradeReady = [];
    this.tradeOfferCount = {}; // playerId → 本環節已提案次數(上限 3)
    this.tradeDone = [];       // 本環節已成交的玩家(每人限成交 1 次,含接受)
    this.nextOfferId = 1;

    for (const p of this.players)
      for (let i = 0; i < RULES.startHand; i++) this.drawCardFor(p);
    this.drawEvent();
    this.beginTurn();
  }

  // ---------- 工具 ----------
  cur() { return this.players[this.turnIdx]; }
  roundLabel() {
    const y = Math.ceil(this.round / RULES.seasonsPerYear);
    const q = ((this.round - 1) % RULES.seasonsPerYear) + 1;
    return `第${y}年Q${q}`;
  }
  addLog(msg) { this.log.push(`[${this.roundLabel()}] ${msg}`); }

  sideOf(p) {
    if (p.faction === 'TW') return this.twRevealed ? this.twSupport : null;
    return FACTIONS[p.faction].side;
  }
  secretSideOf(p) {
    if (p.faction === 'TW') return this.twSupport;
    return FACTIONS[p.faction].side;
  }
  lead() { return this.tech.US - this.tech.CN; }
  /** 點 → 年(領先 1 年 = 20 點) */
  yearsOf(pts) { return Math.round(pts / RULES.pointsPerYear * 10) / 10; }

  /** 科技力紅利:每 100 點「本國」科技力,每種資源收入 +1、放棄權利收益 +1 */
  techBonusOf(p) { return Math.floor((this.tech[p.faction] || 0) / RULES.techIncomeDivisor); }
  forfeitGainOf(p) { return RULES.forfeitBase + this.techBonusOf(p); }
  usThreshold() {
    return (RULES.usWinLead + (this.twRevealed && this.twSupport === 'US' ? RULES.twRevealPenalty : 0))
      * RULES.pointsPerYear;
  }
  cnThreshold() {
    return (RULES.cnWinLead - (this.twRevealed && this.twSupport === 'CN' ? RULES.twRevealPenalty : 0))
      * RULES.pointsPerYear;
  }

  /** 部署科技卡的科技力結算:計入本國分數;日本另計入米國、韓國另計入牆國、台灣依立場(未表態進神山儲備) */
  applyTechGain(p, gain) {
    this.tech[p.faction] = (this.tech[p.faction] || 0) + gain;
    if (p.faction === 'JP') { this.tech.US += gain; return 'US'; }
    if (p.faction === 'KR') { this.tech.CN += gain; return 'CN'; }
    if (p.faction === 'TW') {
      const side = this.sideOf(p);
      if (side) { this.tech[side] += gain; return side; }
      this.chipReserve += gain;
      return null;
    }
    return p.faction; // US/CN 本身就是陣營分數
  }

  /** 科技卡被毀/拆除時扣回(與 applyTechGain 對稱) */
  removeTechGain(p, loss) {
    this.tech[p.faction] = Math.max(0, (this.tech[p.faction] || 0) - loss);
    if (p.faction === 'JP') { this.tech.US = Math.max(0, this.tech.US - loss); return 'US'; }
    if (p.faction === 'KR') { this.tech.CN = Math.max(0, this.tech.CN - loss); return 'CN'; }
    if (p.faction === 'TW') {
      const side = this.sideOf(p);
      if (side) { this.tech[side] = Math.max(0, this.tech[side] - loss); return side; }
      this.chipReserve = Math.max(0, this.chipReserve - loss);
      return null;
    }
    return p.faction;
  }

  /** 角色擅長的科技卡類別 */
  specialtyOf(p) { return INDUSTRY_CATEGORY[p.char.industry]; }

  /** from 出發 maxDist 格內可達的城市集合(含自身) */
  regionsWithin(from, maxDist) {
    const seen = new Set([from]);
    let frontier = [from];
    for (let d = 0; d < maxDist; d++) {
      const next = [];
      for (const rid of frontier)
        for (const n of this.adj[rid])
          if (!seen.has(n)) { seen.add(n); next.push(n); }
      frontier = next;
    }
    return seen;
  }

  /** 科技/作戰卡的資源花費比例 */
  ratioOf(card) {
    if (card.kind === 'ops') return OPS_CARDS[card.type].ratio;
    return CATEGORY_RATIO[card.cat] || card.ratio || { money: 1, power: 1, oil: 1 };
  }

  eventEffect() { return this.activeEvent ? EVENT_CARDS.find(e => e.id === this.activeEvent).effect : null; }

  drawEvent() {
    if (this.eventDeck.length === 0) this.eventDeck = shuffle(EVENT_CARDS.map(e => e.id));
    this.activeEvent = this.eventDeck.pop();
    const ev = EVENT_CARDS.find(e => e.id === this.activeEvent);
    this.addLog(`🌏 集體事件【${ev.icon} ${ev.name}】:${ev.desc}`);
  }

  /** 玩家場上是否有指定特效,回傳總值 */
  specialSum(p, type) {
    let sum = 0;
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards)
        if (c.owner === p.id && c.special?.type === type) sum += c.special.val;
    return sum;
  }

  hasFakeFree(p) {
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards)
        if (c.owner === p.id && c.special?.type === 'fakeFree') return true;
    return false;
  }

  /** 作戰卡費用(三種資源);牆國優勢:費用是他國的一半 */
  opsCostFor(p, type) {
    const c = OPS_CARDS[type];
    if (c.cat === 'fake' && (p.char.perk === 'media' || this.hasFakeFree(p))) return zeroRes();
    let cost = c.cost;
    if (p.faction === 'CN') cost = Math.ceil(cost * RULES.cnOpsHalf);
    if (p.char.perk === 'phone') cost -= 2;
    cost -= this.specialSum(p, 'opsDiscount');
    const ev = this.eventEffect();
    if (ev?.type === 'opsCost') cost = Math.ceil(cost * ev.mult);
    return splitCost(Math.max(0, cost), c.ratio);
  }

  /** 玩家在此城市已有的科技卡(一城一卡) */
  ownCardAt(p, rid) { return this.regions[rid].cards.find(c => c.owner === p.id) || null; }

  /** 發展科技卡費用(三種資源;含敵對地盤加倍/假新聞加費/事件/情報折抵/同類折舊) */
  developCostFor(p, card, rid = p.pos) {
    const r = this.regions[rid];
    let cost = card.cost;
    if (card.cat === this.specialtyOf(p))
      cost -= Math.ceil(cost * RULES.specialtyDiscount); // 擅長領域 -20%
    if (p.char.perk === 'hardware') cost -= 3;
    if (p.char.perk === 'auto') cost -= 2;
    const ev = this.eventEffect();
    if (ev?.type === 'catCost' && ev.cat === card.cat) cost = Math.ceil(cost * ev.mult);
    if (ev?.type === 'allCost') cost = Math.ceil(cost * ev.mult);
    if (r.fakeUntilRound > this.round) cost = Math.ceil(cost * r.fakeMult); // 假新聞:更多花費
    // 米國在牆國地盤(及反之)發展科技花費加倍,其他國家不在此限
    if ((p.faction === 'US' && r.country === 'CN') || (p.faction === 'CN' && r.country === 'US'))
      cost *= RULES.rivalLandMult;
    const triple = splitCost(Math.max(1, cost), this.ratioOf(card));
    // 同類型替換:舊卡折舊抵免
    const old = this.ownCardAt(p, rid);
    if (old && old.cat === card.cat) {
      const credit = splitCost(Math.floor(old.cost * RULES.depreciationRate), this.ratioOf(old));
      subRes(triple, credit);
    }
    // 竊取情報:減少一次同類型科技卡花費
    const intel = p.intel.find(it => it.cat === card.cat);
    if (intel) subRes(triple, intel.gain);
    return triple;
  }

  drawCost(p) { return p.char.perk === 'ai' ? zeroRes() : { ...RULES.drawCost }; }

  drawCardFor(p) {
    if (this.deck.length === 0) {
      if (this.discardPile.length === 0) return null;
      this.deck = shuffle(this.discardPile);
      this.discardPile = [];
    }
    if (p.hand.length >= RULES.handLimit) return null;
    const c = this.deck.pop();
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

  /** 卡片實際科技力「點」(含加成),用於上場/被毀時的科技結算 */
  techValueOf(p, card, rid) {
    let v = card.tech;
    if (this.regions[rid].chipBonus) v += 5;        // 新竹晶片重鎮 +5 點
    if (card.cat === this.specialtyOf(p)) v += RULES.specialtyTechBonus; // 擅長領域 +5 點
    if (p.char.perk === 'chip' && card.cat === 'hardware') v += 5; // 神山硬體 +5 點
    if (p.faction === 'US' && card.tier >= 4) v += 10;             // 米國:尖端科技領先 +10 點
    const ev = this.eventEffect();
    if (ev?.type === 'techDelta') v += ev.val;                     // 事件:科技力增減
    return Math.max(0, v);
  }

  // ---------- 回合流程 ----------
  /** 收入(三種資源):基礎(隨陣營科技力提高)+ 場上卡片交易力(依類別比例) */
  incomeOf(p) {
    const inc = { ...RULES.baseIncome };
    const bonus = this.techBonusOf(p);
    for (const k of RES_KEYS) inc[k] += bonus;
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards)
        if (c.owner === p.id) {
          // 建造後產出資源:預設依建造比例(消耗多的生產也多),約 1/3 卡片有 prodRatio 例外
          addRes(inc, splitCost(c.trade, c.prodRatio || this.ratioOf(c)));
          if (c.special?.type === 'income') inc.money += c.special.val;
        }
    if (p.char.perk === 'info' || p.char.perk === 'auto') inc.money += 2;
    const ev = this.eventEffect();
    if (ev?.type === 'resZero') inc[ev.res] = 0;
    if (ev?.type === 'resHalf') inc[ev.res] = Math.floor(inc[ev.res] / 2);
    if (ev?.type === 'resBoost') inc[ev.res] += ev.val;
    if (ev?.type === 'incomeBonus') for (const k of RES_KEYS) inc[k] += ev.val;
    return inc;
  }

  apPerTurn() {
    const ev = this.eventEffect();
    return Math.max(1, RULES.apPerTurn + (ev?.type === 'apDelta' ? ev.val : 0));
  }

  beginTurn() {
    const p = this.cur();
    p.ap = this.apPerTurn();
    p.usedFreeMove = false;
    p.turnFlags = emptyTurnFlags();
    const income = this.incomeOf(p);
    addRes(p.res, income);
    this.addLog(`${p.name} 開始回合,獲得收入 ${resStr(income)}(行動點 ${p.ap})`);
  }

  endTurn() {
    if (this.over || this.phase === 'trade') return;
    this.turnIdx++;
    if (this.turnIdx >= this.players.length) {
      this.turnIdx = 0;
      if (this.round >= RULES.maxRounds) { this.endGameByRounds(); return; }
      this.enterTradePhase();
      return;
    }
    this.beginTurn();
  }

  // ---------- 交易環節(所有玩家行動結束時,自由交換資源) ----------
  enterTradePhase() {
    this.phase = 'trade';
    this.tradeOffers = [];
    this.tradeOfferCount = {};
    this.tradeDone = [];
    this.tradeReady = this.players.filter(p => p.isAI).map(p => p.id); // AI 自動準備
    this.addLog(`🤝 交易環節:可以以任意比值交換資源(每人最多提案 ${RULES.tradeMaxOffers} 次、成交 ${RULES.tradeMaxDeals} 次)`);
    this.checkTradeDone();
  }

  checkTradeDone() {
    if (this.phase !== 'trade') return;
    if (this.tradeReady.length < this.players.length) return;
    this.phase = 'play';
    this.tradeOffers = [];
    this.tradeReady = [];
    this.round++;
    this.addLog(`====== ${this.roundLabel()} 開始 ======`);
    this.drawEvent();
    this.beginTurn();
  }

  doTradeOffer(fromId, toId, give, receive) {
    if (this.over || this.phase !== 'trade') return { ok: false, msg: '現在不是交易環節' };
    const from = this.players[fromId];
    const to = this.players[toId];
    if (!to || toId === fromId) return { ok: false, msg: '交易對象不合法' };
    if (this.tradeDone.includes(fromId)) return { ok: false, msg: '你本環節已成交一次,無法再交易' };
    if (this.tradeDone.includes(toId)) return { ok: false, msg: '對方本環節已成交一次,無法再交易' };
    if ((this.tradeOfferCount[fromId] || 0) >= RULES.tradeMaxOffers)
      return { ok: false, msg: `每人最多提出 ${RULES.tradeMaxOffers} 次交易` };
    const clean = c => {
      const out = zeroRes();
      for (const k of RES_KEYS) {
        const v = Math.floor(Number(c?.[k]) || 0);
        if (v < 0 || v > 99) return null;
        out[k] = v;
      }
      return out;
    };
    const g = clean(give), r = clean(receive);
    if (!g || !r || totalRes(g) + totalRes(r) === 0) return { ok: false, msg: '請填寫交換的資源' };
    if (!canPay(from, g)) return { ok: false, msg: '你的資源不足' };
    this.tradeOfferCount[fromId] = (this.tradeOfferCount[fromId] || 0) + 1;
    const offer = { id: this.nextOfferId++, fromId, toId, give: g, receive: r };
    // AI 對象:即時評估 — 自利型要佔便宜才肯、合作型小虧也接受
    if (to.isAI) {
      const st = to.strategy;
      const greed = st ? 1 + (st.selfish - st.cooperative) * 0.4 : 1;
      if (canPay(to, r) && totalRes(g) >= totalRes(r) * greed) {
        this.execTrade(offer);
      } else {
        this.addLog(`🤝 ${to.name} 婉拒了 ${from.name} 的交易提案`);
      }
      return { ok: true };
    }
    this.tradeOffers.push(offer);
    this.addLog(`🤝 ${from.name} 向 ${to.name} 提案:以 ${resStr(g)} 換 ${resStr(r)}`);
    return { ok: true };
  }

  execTrade(offer) {
    const from = this.players[offer.fromId];
    const to = this.players[offer.toId];
    pay(from, offer.give); pay(to, offer.receive);
    addRes(from.res, offer.receive); addRes(to.res, offer.give);
    // 每人每環節只能成交一次(含接受):雙方標記,撤掉他們其餘的提案
    this.tradeDone.push(offer.fromId, offer.toId);
    this.tradeOffers = this.tradeOffers.filter(o =>
      !this.tradeDone.includes(o.fromId) && !this.tradeDone.includes(o.toId));
    this.addLog(`✅ 成交:${from.name} 以 ${resStr(offer.give)} 換得 ${to.name} 的 ${resStr(offer.receive)}`);
  }

  doTradeRespond(playerId, offerId, accept) {
    if (this.phase !== 'trade') return { ok: false, msg: '現在不是交易環節' };
    const i = this.tradeOffers.findIndex(o => o.id === offerId);
    if (i < 0) return { ok: false, msg: '提案不存在或已失效' };
    const offer = this.tradeOffers[i];
    if (offer.toId !== playerId) return { ok: false, msg: '這不是給你的提案' };
    this.tradeOffers.splice(i, 1);
    if (!accept) {
      this.addLog(`🤝 ${this.players[playerId].name} 婉拒了交易提案`);
      return { ok: true };
    }
    if (this.tradeDone.includes(playerId))
      return { ok: false, msg: '你本環節已成交一次,無法再接受交易' };
    if (this.tradeDone.includes(offer.fromId))
      return { ok: false, msg: '提案方本環節已成交,提案失效' };
    if (!canPay(this.players[offer.fromId], offer.give) || !canPay(this.players[offer.toId], offer.receive))
      return { ok: false, msg: '其中一方資源已不足,交易取消' };
    this.execTrade(offer);
    return { ok: true };
  }

  doTradeCancel(playerId, offerId) {
    if (this.phase !== 'trade') return { ok: false, msg: '現在不是交易環節' };
    const i = this.tradeOffers.findIndex(o => o.id === offerId && o.fromId === playerId);
    if (i < 0) return { ok: false, msg: '提案不存在' };
    this.tradeOffers.splice(i, 1);
    return { ok: true };
  }

  doTradeReady(playerId, all = false) {
    if (this.phase !== 'trade') return { ok: false, msg: '現在不是交易環節' };
    if (all) { // 上帝模式:一人控全部角色
      this.tradeReady = this.players.map(p => p.id);
    } else if (!this.tradeReady.includes(playerId)) {
      this.tradeReady.push(playerId);
      this.addLog(`🤝 ${this.players[playerId].name} 結束交易(${this.tradeReady.length}/${this.players.length})`);
    }
    this.checkTradeDone();
    return { ok: true };
  }

  // ---------- 移動(相鄰 1🛢️;搭飛機直達任一城市,費用 5 倍) ----------
  moveCostTo(p, rid) {
    if (rid === p.pos) return null;
    const adjacent = this.adj[p.pos].includes(rid);
    if (adjacent && p.char.perk === 'transport' && !p.usedFreeMove)
      return { oil: 0, free: true, plane: false };
    let oil = adjacent ? RULES.moveOilCost : RULES.planeOilCost;
    if (p.faction === 'JP') oil = Math.floor(oil * RULES.jpMoveHalf); // 日本優勢:油電混合
    return { oil, free: false, plane: !adjacent };
  }

  canMoveTo(rid) {
    const p = this.cur();
    if (this.over || this.phase === 'trade' || !this.regions[rid]) return false;
    if (p.turnFlags.forfeitMove) return false; // 本回合已放棄行動換作戰卡
    const mc = this.moveCostTo(p, rid);
    if (!mc) return false;
    if (mc.free) return true;
    return p.ap >= 1 && p.res.oil >= mc.oil;
  }

  doMove(rid) {
    const p = this.cur();
    if (!this.canMoveTo(rid)) return { ok: false, msg: '無法移動到該城市(行動點或石油不足)' };
    const mc = this.moveCostTo(p, rid);
    if (mc.free) p.usedFreeMove = true;
    else { p.ap -= 1; p.res.oil -= mc.oil; }
    p.turnFlags.moved = true;
    p.pos = rid;
    this.addLog(`${p.name} ${mc.plane ? `✈️ 搭飛機直飛(🛢️${mc.oil})` : '移動'}到 ${this.regions[rid].name}${mc.free ? '(免費移動)' : ''}`);
    return { ok: true };
  }

  // ---------- 發展科技卡(從手牌打出) ----------
  /** 某張手牌科技卡可否在目前城市部署 */
  canPlayTech(p, card, rid = p.pos) {
    const r = this.regions[rid];
    if (card.tier > r.level)
      return { ok: false, msg: `城市等級不足(${r.name} Lv.${r.level},${card.tier}階卡需 Lv.${card.tier})` };
    if (r.builtRound && this.round < r.builtRound + RULES.cityBuildCooldown)
      return { ok: false, msg: `${r.name} 今年已建造過,須過一年(第 ${Math.ceil((r.builtRound + RULES.cityBuildCooldown) / 4)} 年起)才可重新建造` };
    const old = this.ownCardAt(p, rid);
    if (old) {
      if (card.tier <= old.tier)
        return { ok: false, msg: `此城已有你的【${old.name}】${old.tier}階,只能用更高階科技卡替換` };
    } else if (r.cards.length >= RULES.maxCardsPerRegion) {
      return { ok: false, msg: '此城市科技卡已滿' };
    }
    return { ok: true };
  }

  doPlayTech(handIdx) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    const card = p.hand[handIdx];
    if (!card || card.kind !== 'tech') return { ok: false, msg: '無此科技卡' };
    if (p.turnFlags.forfeitTech) return { ok: false, msg: '你本回合已放棄打出科技卡的權利' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    const chk = this.canPlayTech(p, card);
    if (!chk.ok) return chk;
    const cost = this.developCostFor(p, card);
    if (!canPay(p, cost)) return { ok: false, msg: `資源不足(需要 ${resStr(cost)})` };

    p.ap -= 1;
    pay(p, cost);
    p.hand.splice(handIdx, 1);
    p.turnFlags.playedTech = true;

    // 消耗一次竊取情報
    const intelIdx = p.intel.findIndex(it => it.cat === card.cat);
    if (intelIdx >= 0) {
      this.addLog(`🧬 ${p.name} 動用了竊取的${TECH_CATEGORIES[card.cat].name}情報,降低了研發成本`);
      p.intel.splice(intelIdx, 1);
    }

    // 晶片稅(金錢)
    const twPlayer = this.players.find(q => q.faction === 'TW');
    if (twPlayer && twPlayer.id !== p.id) {
      const levy = Math.min(RULES.chipLevy, p.res.money);
      p.res.money -= levy;
      twPlayer.res.money += levy;
      if (levy > 0) this.addLog(`${p.name} 支付晶片稅 💰${levy} 給 ${twPlayer.name}`);
    }

    const r = this.regions[p.pos];
    // 一城一卡:替換時移除舊卡(扣回其科技力;同類型已在費用折舊抵免)
    const old = this.ownCardAt(p, p.pos);
    if (old) {
      r.cards = r.cards.filter(c => c.uid !== old.uid);
      this.removeTechGain(p, old.techApplied || 0);
      delete old.owner; delete old.techApplied; delete old.opsHit;
      this.discardPile.push(old);
      this.addLog(`${p.name} 拆除了 ${r.name} 的【${old.name}】${old.cat === card.cat ? '(同類型折舊抵免費用)' : ''}`);
    }

    card.owner = p.id;
    r.cards.push(card);
    r.builtRound = this.round; // 此城一年內不可再建造

    const gain = this.techValueOf(p, card, p.pos);
    const side = this.applyTechGain(p, gain);
    if (side) {
      this.addLog(`${p.name} 在 ${r.name} 部署【${card.name}】(${card.tier}階,${resStr(cost)}),${FACTIONS[side].name}科技力 +${gain} 點`);
    } else {
      this.addLog(`${p.name} 在 ${r.name} 部署【${card.name}】(${card.tier}階,${resStr(cost)}),神山儲備增加(秘密)`);
    }
    card.techApplied = gain; // 被毀/拆除時要扣回的量
    this.checkVictory();
    return { ok: true };
  }

  doDraw() {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    const cost = this.drawCost(p);
    if (!canPay(p, cost)) return { ok: false, msg: `資源不足(需要 ${resStr(cost)})` };
    if (p.hand.length >= RULES.handLimit) return { ok: false, msg: '手牌已滿' };
    p.ap -= 1;
    pay(p, cost);
    this.drawCardFor(p);
    this.addLog(`${p.name} 抽了一張卡`);
    return { ok: true };
  }

  // ---------- 放棄權利換取資源(每回合各一次,不耗 AP;收益隨陣營科技力提高) ----------
  /** kind: 'tech' 放棄打出科技卡→電力 / 'ops' 放棄打出作戰卡→金錢 / 'move' 放棄行動(移動)→石油 */
  doForfeit(kind) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    const f = p.turnFlags;
    const gain = this.forfeitGainOf(p);
    if (kind === 'tech') {
      if (f.forfeitTech) return { ok: false, msg: '本回合已放棄過' };
      if (f.playedTech) return { ok: false, msg: '本回合已打出過科技卡,無法放棄該權利' };
      f.forfeitTech = true;
      p.res.power += gain;
      this.addLog(`♻️ ${p.name} 放棄本回合打出科技卡的權利,換得 ⚡${gain}`);
      return { ok: true };
    }
    if (kind === 'ops') {
      if (f.forfeitOps) return { ok: false, msg: '本回合已放棄過' };
      if (f.playedOps) return { ok: false, msg: '本回合已打出過作戰卡,無法放棄該權利' };
      f.forfeitOps = true;
      p.res.money += gain;
      this.addLog(`♻️ ${p.name} 放棄本回合打出作戰卡的權利,換得 💰${gain}`);
      return { ok: true };
    }
    if (kind === 'move') {
      if (f.forfeitMove) return { ok: false, msg: '本回合已放棄過' };
      if (f.moved) return { ok: false, msg: '本回合已移動過,無法放棄行動' };
      f.forfeitMove = true;
      p.res.oil += gain;
      this.addLog(`♻️ ${p.name} 放棄本回合的行動(移動),換得 🛢️${gain}`);
      return { ok: true };
    }
    return { ok: false, msg: '未知的放棄類型' };
  }

  // ---------- 金錢兌換(每回合一次,不可反向) ----------
  doExchange(res, amount) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    if (p.turnFlags.exchanged) return { ok: false, msg: '本回合已兌換過' };
    if (res !== 'power' && res !== 'oil') return { ok: false, msg: '只能用金錢換取石油或電力' };
    const n = Math.floor(Number(amount) || 0);
    if (n < 1 || n > RULES.exchangeMax) return { ok: false, msg: `兌換數量需為 1~${RULES.exchangeMax}` };
    const cost = n * RULES.exchangeRate;
    if (p.res.money < cost) return { ok: false, msg: `金錢不足(需要 💰${cost})` };
    p.turnFlags.exchanged = true;
    p.res.money -= cost;
    p.res[res] += n;
    const icon = res === 'power' ? '⚡' : '🛢️';
    this.addLog(`💱 ${p.name} 用 💰${cost} 兌換了 ${icon}${n}`);
    return { ok: true };
  }

  // ---------- 升級城市(電力;城市等級 ≥ 科技卡階級才能建造) ----------
  upgradeCostAt(p, rid) {
    const r = this.regions[rid];
    let cost = r.level * RULES.cityUpgradePower;
    if (p.faction === 'KR') cost = Math.ceil(cost * RULES.krUpgradeHalf); // 韓國優勢:基建狂魔
    return cost;
  }

  doUpgradeCity() {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    const r = this.regions[p.pos];
    if (r.level >= RULES.cityMaxLevel) return { ok: false, msg: '城市已達最高等級' };
    const cost = this.upgradeCostAt(p, p.pos);
    if (p.res.power < cost) return { ok: false, msg: `電力不足(需要 ⚡${cost})` };
    p.ap -= 1;
    p.res.power -= cost;
    r.level += 1;
    this.addLog(`⬆️ ${p.name} 用 ⚡${cost} 將 ${r.name} 升級到 Lv.${r.level}`);
    return { ok: true };
  }

  // ---------- 作戰卡 ----------
  /** 合法目標清單(每張科技卡只能被鎖定一次;只能對兩格內的城市使用) */
  cardTargets(type) {
    const p = this.cur();
    const card = OPS_CARDS[type];
    if (!card) return [];
    const mySide = this.secretSideOf(p);
    const inRange = this.regionsWithin(p.pos, RULES.opsRange);

    if (card.cat === 'spy' || card.cat === 'steal') {
      const targets = [];
      for (const rid in this.regions) {
        if (!inRange.has(rid)) continue;
        for (const c of this.regions[rid].cards) {
          if (c.owner === p.id) continue;
          if (c.opsHit) continue; // 已被作戰卡鎖定過
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
        .filter(r => inRange.has(r.id) && r.fakeUntilRound <= this.round)
        .map(r => ({ regionId: r.id, label: r.name }));
    }
    return [];
  }

  doPlayCard(handIdx, target) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    const hc = p.hand[handIdx];
    if (!hc || hc.kind !== 'ops') return { ok: false, msg: '無此作戰卡' };
    if (p.turnFlags.forfeitOps) return { ok: false, msg: '你本回合已放棄打出作戰卡的權利' };
    const type = hc.type;
    const card = OPS_CARDS[type];
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    const cost = this.opsCostFor(p, type);
    if (!canPay(p, cost)) return { ok: false, msg: `資源不足(需要 ${resStr(cost)})` };

    // 驗證目標仍合法
    const valid = this.cardTargets(type);
    let chosen = null;
    if (card.cat === 'fake') chosen = valid.find(t => t.regionId === target?.regionId);
    else chosen = valid.find(t => t.uid === target?.uid);
    if (!chosen) return { ok: false, msg: '目標不合法或已消失' };

    p.ap -= 1;
    pay(p, cost);
    p.hand.splice(handIdx, 1);
    p.turnFlags.playedOps = true;
    this.discardPile.push(hc);

    if (card.cat === 'spy') {
      const r = this.regions[chosen.regionId];
      const tc = r.cards.find(c => c.uid === chosen.uid);
      const owner = this.players[tc.owner];
      r.cards = r.cards.filter(c => c.uid !== tc.uid);
      const loss = tc.techApplied || tc.tech;
      delete tc.owner; delete tc.techApplied; delete tc.opsHit;
      this.discardPile.push(tc);
      const ownerSide = this.removeTechGain(owner, loss);
      if (ownerSide) {
        this.addLog(`💣 ${p.name} 用【${card.name}】摧毀了 ${owner.name} 在 ${r.name} 的【${tc.name}】!${FACTIONS[ownerSide].name}科技力 -${loss} 點`);
      } else {
        this.addLog(`💣 ${p.name} 用【${card.name}】摧毀了 ${owner.name} 在 ${r.name} 的【${tc.name}】!神山儲備受損(秘密)`);
      }
      this.checkVictory();
      return { ok: true };
    }

    if (card.cat === 'steal') {
      const r = this.regions[chosen.regionId];
      const tc = r.cards.find(c => c.uid === chosen.uid);
      const owner = this.players[tc.owner];
      tc.opsHit = true; // 每張科技卡只能被鎖定一次
      const amount = tc.tier * card.intelPerTier; // 等級越高減得越多
      const ratio = card.intelSpread === 'even' ? { money: 1, power: 1, oil: 1 } : this.ratioOf(tc);
      const gain = splitCost(amount, ratio);
      p.intel.push({ cat: tc.cat, gain });
      this.addLog(`🕵️ ${p.name} 用【${card.name}】竊取了 ${owner.name}【${tc.name}】的情報:下次發展${TECH_CATEGORIES[tc.cat].name}科技卡花費 -${resStr(gain)}`);
      return { ok: true };
    }

    if (card.cat === 'fake') {
      const r = this.regions[chosen.regionId];
      r.fakeUntilRound = this.round + card.dur;
      r.fakeMult = card.mult;
      this.addLog(`📰 ${p.name} 對 ${r.name} 發動【${card.name}】,${card.dur} 輪內該城發展科技花費 ×${card.mult}!`);
      return { ok: true };
    }
    return { ok: false, msg: '未知卡片' };
  }

  // ---------- 台灣專屬 ----------
  doReveal() {
    const p = this.cur();
    if (p.faction !== 'TW') return { ok: false, msg: '只有台灣可以表態' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    if (this.twRevealed) return { ok: false, msg: '已經表態過了' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    p.ap -= 1;
    this.twRevealed = true;
    const side = this.twSupport;
    if (this.chipReserve > 0) {
      this.tech[side] += this.chipReserve;
      this.addLog(`⚡ ${p.name} 公開表態支持${FACTIONS[side].name}!神山儲備 ${this.chipReserve} 點科技力全數注入!(該陣營勝利門檻 +5 年)`);
      this.chipReserve = 0;
    } else {
      this.addLog(`⚡ ${p.name} 公開表態支持${FACTIONS[side].name}!(該陣營勝利門檻 +5 年)`);
    }
    this.checkVictory();
    return { ok: true };
  }

  // ---------- 勝負 ----------
  wealthOf(p) { return totalRes(p.res); }

  checkVictory() {
    if (this.over) return;
    const lead = this.lead();
    let side = null, reason = '';
    if (lead >= this.usThreshold()) {
      side = 'US';
      reason = `米國科技力領先 ${lead} 點(${this.yearsOf(lead)} 年,門檻 ${this.usThreshold() / RULES.pointsPerYear} 年),米國獲勝!`;
    } else if (lead <= this.cnThreshold()) {
      side = 'CN';
      reason = this.cnThreshold() < 0
        ? `牆國科技力反超 ${this.yearsOf(-lead)} 年,牆國獲勝!`
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
    const jpLeadPts = RULES.jpWinLead * RULES.pointsPerYear;
    let winners = [];
    let reason = `3 年(${RULES.maxRounds} 季)結束,米牆雙方和局(差距 ${this.yearsOf(lead)} 年)。`;
    if (jp && lead >= jpLeadPts) {
      winners.push(jp.id);
      reason += ` 米國領先 ${this.yearsOf(lead)} 年(≥5) → 日本達成勝利條件!`;
    }
    if (kr && lead < jpLeadPts) {
      winners.push(kr.id);
      reason += ` 米國領先不足 5 年且雙方和局 → 韓國達成勝利條件!`;
    }
    if (winners.length === 0) {
      const richest = [...this.players].sort((a, b) => this.wealthOf(b) - this.wealthOf(a))[0];
      winners = [richest.id];
      reason += ` 無陣營達成勝利 → 資源最雄厚的 ${richest.name} 獲得商業勝利!`;
    }
    this.concludeWinners(winners, reason);
  }

  concludeWinners(winnerIds, reason) {
    this.over = true;
    const ws = winnerIds.map(id => this.players[id]);
    const champion = [...ws].sort((a, b) => this.wealthOf(b) - this.wealthOf(a))[0];
    this.result = { winners: winnerIds, champion: champion.id, reason, twSupport: this.twSupport };
    if (ws.length > 1) {
      this.addLog(reason);
      this.addLog(`👑 多位贏家中資源最多者為 ${champion.name}(總資源 ${this.wealthOf(champion)}),奪得最終勝利!`);
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
        id: rid, fakeUntilRound: r.fakeUntilRound, fakeMult: r.fakeMult,
        country: r.country, level: r.level, builtRound: r.builtRound,
        cards: r.cards.map(c => ({
          uid: c.uid, owner: c.owner, cat: c.cat, tier: c.tier, name: c.name,
          tech: c.tech, def: c.def, trade: c.trade, effDef: this.effDef(rid, c),
          special: c.special, opsHit: !!c.opsHit,
        })),
      };
    }
    const ev = this.activeEvent ? EVENT_CARDS.find(e => e.id === this.activeEvent) : null;
    return {
      players: this.players.map(p => ({
        id: p.id, name: p.name, charId: p.char.id, faction: p.faction,
        res: { ...p.res }, pos: p.pos, ap: p.ap, handCount: p.hand.length,
        income: this.incomeOf(p), isAI: p.isAI,
      })),
      hasTW: this.hasTW,
      regions,
      tech: this.tech,
      round: this.round, maxRounds: RULES.maxRounds, roundLabel: this.roundLabel(),
      event: ev ? { id: ev.id, name: ev.name, icon: ev.icon, desc: ev.desc } : null,
      turnIdx: this.turnIdx,
      usThreshold: this.usThreshold(), cnThreshold: this.cnThreshold(),
      twRevealed: this.twRevealed,
      twSupportPublic: this.twRevealed ? this.twSupport : null,
      deckCount: this.deck.length + this.discardPile.length,
      phase: this.phase,
      tradeOffers: this.phase === 'trade' ? this.tradeOffers : [],
      tradeReady: this.phase === 'trade' ? [...this.tradeReady] : [],
      tradeOfferCount: this.phase === 'trade' ? { ...this.tradeOfferCount } : {},
      tradeDone: this.phase === 'trade' ? [...this.tradeDone] : [],
      log: this.log.slice(-60),
      over: this.over, result: this.result,
    };
  }

  // ---------- 存檔/讀檔 ----------
  serialize() {
    const regions = {};
    for (const rid in this.regions)
      regions[rid] = {
        cards: this.regions[rid].cards,
        fakeUntilRound: this.regions[rid].fakeUntilRound,
        fakeMult: this.regions[rid].fakeMult,
        level: this.regions[rid].level,
        builtRound: this.regions[rid].builtRound,
      };
    return {
      version: 2,
      players: this.players.map(p => ({
        id: p.id, name: p.name, charId: p.char.id, res: p.res, intel: p.intel,
        hand: p.hand, pos: p.pos, ap: p.ap, usedFreeMove: p.usedFreeMove,
        turnFlags: p.turnFlags, isAI: p.isAI, strategy: p.strategy || null,
      })),
      regions,
      deck: this.deck, discardPile: this.discardPile,
      eventDeck: this.eventDeck, activeEvent: this.activeEvent,
      tech: this.tech, round: this.round, turnIdx: this.turnIdx,
      twSupport: this.twSupport, twRevealed: this.twRevealed,
      chipReserve: this.chipReserve,
      phase: this.phase, tradeOffers: this.tradeOffers,
      tradeReady: this.tradeReady, nextOfferId: this.nextOfferId,
      tradeOfferCount: this.tradeOfferCount, tradeDone: this.tradeDone,
      log: this.log,
      over: this.over, result: this.result, cardUid,
    };
  }

  static fromSave(d) {
    if (d.version !== 2) throw new Error('存檔版本不相容(舊版規則存檔無法載入)');
    const g = Object.create(Game.prototype);
    g.regions = {};
    for (const r of REGIONS)
      g.regions[r.id] = { ...r, cards: [], fakeUntilRound: 0, fakeMult: 1, level: r.startLevel || 1, builtRound: 0 };
    for (const rid in d.regions) if (g.regions[rid]) Object.assign(g.regions[rid], d.regions[rid]);
    g.adj = {};
    for (const r of REGIONS) g.adj[r.id] = [];
    for (const [a, b] of EDGES) { g.adj[a].push(b); g.adj[b].push(a); }
    g.players = d.players.map(p => ({
      ...p, intel: p.intel || [], strategy: p.strategy || null,
      turnFlags: p.turnFlags || emptyTurnFlags(),
      char: CHARACTERS.find(c => c.id === p.charId),
      faction: CHARACTERS.find(c => c.id === p.charId).faction,
    }));
    g.hasTW = g.players.some(p => p.faction === 'TW');
    g.deck = d.deck; g.discardPile = d.discardPile;
    g.eventDeck = d.eventDeck; g.activeEvent = d.activeEvent;
    g.tech = d.tech; g.round = d.round; g.turnIdx = d.turnIdx;
    g.twSupport = d.twSupport; g.twRevealed = d.twRevealed;
    g.chipReserve = d.chipReserve;
    g.phase = d.phase || 'play';
    g.tradeOffers = d.tradeOffers || [];
    g.tradeReady = d.tradeReady || [];
    g.tradeOfferCount = d.tradeOfferCount || {};
    g.tradeDone = d.tradeDone || [];
    g.nextOfferId = d.nextOfferId || 1;
    g.log = d.log;
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
      hand: p.hand.map(c => {
        if (c.kind === 'ops') {
          return { kind: 'ops', uid: c.uid, ...OPS_CARDS[c.type], myCost: this.opsCostFor(p, c.type) };
        }
        const chk = this.canPlayTech(p, c);
        return {
          kind: 'tech', uid: c.uid, cat: c.cat, tier: c.tier, name: c.name, desc: c.desc,
          tech: c.tech, def: c.def, trade: c.trade, special: c.special,
          myCost: this.developCostFor(p, c), playMsg: chk.ok ? null : chk.msg,
        };
      }),
      drawCost: this.drawCost(p),
      intel: p.intel.map(it => ({ cat: it.cat, gain: it.gain })),
      turnFlags: { ...p.turnFlags },
      forfeitGain: this.forfeitGainOf(p),
      techBonus: this.techBonusOf(p),
    };
    if (p.faction === 'TW') {
      priv.twSupport = this.twSupport;
      priv.chipReserve = this.chipReserve;
    }
    if (this.turnIdx === playerId && !this.over && this.phase === 'play') {
      priv.targets = {};
      for (const t of ['spy1', 'spy2', 'steal1', 'steal2', 'fake1', 'fake2'])
        priv.targets[t] = this.cardTargets(t);
      priv.specialty = this.specialtyOf(p);
      const r = this.regions[p.pos];
      priv.upgrade = {
        level: r.level,
        max: RULES.cityMaxLevel,
        cost: r.level < RULES.cityMaxLevel ? this.upgradeCostAt(p, p.pos) : null,
      };
      priv.moveTargets = REGIONS
        .filter(r => r.id !== p.pos && this.canMoveTo(r.id))
        .map(r => {
          const mc = this.moveCostTo(p, r.id);
          return { regionId: r.id, oil: mc.oil, plane: mc.plane, free: mc.free };
        });
    }
    return priv;
  }
}
