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
    for (const r of REGIONS) this.regions[r.id] = { ...r, cards: [], fakeUntilRound: 0, fakeMult: 1 };
    this.adj = {};
    for (const r of REGIONS) this.adj[r.id] = [];
    for (const [a, b] of EDGES) { this.adj[a].push(b); this.adj[b].push(a); }

    this.players = seats.map((s, i) => {
      const ch = CHARACTERS.find(c => c.id === s.charId);
      return {
        id: i, name: s.playerName || ch.name, char: ch, faction: ch.faction,
        res: { ...RULES.startResources }, hand: [], intel: [], pos: ch.home,
        ap: 0, usedFreeMove: false, isAI: !!s.isAI,
      };
    });
    this.hasTW = this.players.some(p => p.faction === 'TW');

    this.tech = { ...RULES.techStart };
    this.round = 1;
    this.turnIdx = 0;

    // 混合牌庫:科技卡 + 灰色作戰卡全部洗成一疊
    this.deck = [];
    this.discardPile = [];
    for (const catId in TECH_CATEGORIES) {
      for (const def of TECH_CARDS[catId]) {
        const copies = TIER_COPIES[def.tier - 1];
        for (let i = 0; i < copies; i++) this.deck.push(makeTechCard(catId, def));
      }
    }
    for (const [type, n] of OPS_DECK_COMPOSITION)
      for (let i = 0; i < n; i++) this.deck.push(makeOpsCard(type));
    shuffle(this.deck);

    // 集體事件卡牌庫
    this.eventDeck = shuffle(EVENT_CARDS.map(e => e.id));
    this.activeEvent = null;

    this.twSupport = Math.random() < 0.5 ? 'US' : 'CN';
    this.twRevealed = false;
    this.twJoined = null;
    this.chipReserve = 0;

    this.log = [];
    this.over = false;
    this.result = null;

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
  usThreshold() {
    return RULES.usWinLead + (this.twRevealed && this.twSupport === 'US' ? RULES.twRevealPenalty : 0);
  }
  cnThreshold() {
    return RULES.cnWinLead - (this.twRevealed && this.twSupport === 'CN' ? RULES.twRevealPenalty : 0);
  }

  /** 角色擅長的科技卡類別 */
  specialtyOf(p) { return INDUSTRY_CATEGORY[p.char.industry]; }

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

  /** 作戰卡費用(三種資源) */
  opsCostFor(p, type) {
    const c = OPS_CARDS[type];
    if (c.cat === 'fake' && (p.char.perk === 'media' || this.hasFakeFree(p))) return zeroRes();
    let cost = c.cost;
    if (p.faction === 'CN') cost -= RULES.cnOpsDiscount;
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

  /** 卡片實際科技力(含加成),用於上場/被毀時的科技結算 */
  techValueOf(p, card, rid) {
    let v = card.tech;
    if (this.regions[rid].chipBonus) v += 1;        // 新竹晶片重鎮
    if (card.cat === this.specialtyOf(p)) v += RULES.specialtyTechBonus; // 擅長領域 +1
    if (p.char.perk === 'chip' && card.cat === 'hardware') v += 1; // 神山硬體+1
    if (p.faction === 'US' && card.tier >= 4) v += 1;              // 米國:尖端科技領先
    const ev = this.eventEffect();
    if (ev?.type === 'techDelta') v += ev.val;                     // 事件:科技力增減
    return Math.max(0, v);
  }

  // ---------- 回合流程 ----------
  /** 收入(三種資源):基礎 + 場上卡片交易力(依類別比例) */
  incomeOf(p) {
    const inc = { ...RULES.baseIncome };
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards)
        if (c.owner === p.id) {
          addRes(inc, splitCost(c.trade, this.ratioOf(c)));
          if (c.special?.type === 'income') inc.money += c.special.val;
        }
    if (p.char.perk === 'info' || p.char.perk === 'auto') inc.money += 2;
    const ev = this.eventEffect();
    if (ev?.type === 'resZero') inc[ev.res] = 0;
    if (ev?.type === 'resHalf') inc[ev.res] = Math.floor(inc[ev.res] / 2);
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
    const income = this.incomeOf(p);
    addRes(p.res, income);
    this.addLog(`${p.name} 開始回合,獲得收入 ${resStr(income)}(行動點 ${p.ap})`);
  }

  endTurn() {
    if (this.over) return;
    this.turnIdx++;
    if (this.turnIdx >= this.players.length) {
      this.turnIdx = 0;
      this.round++;
      if (this.round > RULES.maxRounds) { this.endGameByRounds(); return; }
      this.addLog(`====== ${this.roundLabel()} 開始 ======`);
      this.drawEvent();
    }
    this.beginTurn();
  }

  // ---------- 移動(相鄰 1🛢️;搭飛機直達任一城市,費用 5 倍) ----------
  moveCostTo(p, rid) {
    if (rid === p.pos) return null;
    const adjacent = this.adj[p.pos].includes(rid);
    if (adjacent && p.char.perk === 'transport' && !p.usedFreeMove)
      return { oil: 0, free: true, plane: false };
    return { oil: adjacent ? RULES.moveOilCost : RULES.planeOilCost, free: false, plane: !adjacent };
  }

  canMoveTo(rid) {
    const p = this.cur();
    if (this.over || !this.regions[rid]) return false;
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
    p.pos = rid;
    this.addLog(`${p.name} ${mc.plane ? `✈️ 搭飛機直飛(🛢️${mc.oil})` : '移動'}到 ${this.regions[rid].name}${mc.free ? '(免費移動)' : ''}`);
    return { ok: true };
  }

  // ---------- 發展科技卡(從手牌打出) ----------
  /** 某張手牌科技卡可否在目前城市部署 */
  canPlayTech(p, card, rid = p.pos) {
    const r = this.regions[rid];
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
    const card = p.hand[handIdx];
    if (!card || card.kind !== 'tech') return { ok: false, msg: '無此科技卡' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    const chk = this.canPlayTech(p, card);
    if (!chk.ok) return chk;
    const cost = this.developCostFor(p, card);
    if (!canPay(p, cost)) return { ok: false, msg: `資源不足(需要 ${resStr(cost)})` };

    p.ap -= 1;
    pay(p, cost);
    p.hand.splice(handIdx, 1);

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
      const oldSide = this.sideOf(p);
      const loss = old.techApplied || 0;
      if (oldSide) this.tech[oldSide] = Math.max(0, this.tech[oldSide] - loss);
      else this.chipReserve = Math.max(0, this.chipReserve - loss);
      delete old.owner; delete old.techApplied; delete old.opsHit;
      this.discardPile.push(old);
      this.addLog(`${p.name} 拆除了 ${r.name} 的【${old.name}】${old.cat === card.cat ? '(同類型折舊抵免費用)' : ''}`);
    }

    card.owner = p.id;
    r.cards.push(card);

    const gain = this.techValueOf(p, card, p.pos);
    const side = this.sideOf(p);
    if (side) {
      this.tech[side] += gain;
      this.addLog(`${p.name} 在 ${r.name} 部署【${card.name}】(${card.tier}階,${resStr(cost)}),${FACTIONS[side].name}科技力 +${gain} 年`);
    } else {
      this.chipReserve += gain;
      this.addLog(`${p.name} 在 ${r.name} 部署【${card.name}】(${card.tier}階,${resStr(cost)}),神山儲備增加(秘密)`);
    }
    card.techApplied = gain; // 被毀/拆除時要扣回的量
    this.checkVictory();
    return { ok: true };
  }

  doDraw() {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
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

  // ---------- 棄卡換資源 ----------
  /** 棄 1 張卡換 5 單一資源;科技+作戰各棄 1 張換三種資源各 5 */
  doDiscard(idxs, res) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (!Array.isArray(idxs) || idxs.length < 1 || idxs.length > 2)
      return { ok: false, msg: '請選擇 1~2 張卡' };
    const uniq = [...new Set(idxs.map(i => parseInt(i, 10)))];
    if (uniq.length !== idxs.length) return { ok: false, msg: '卡片重複' };
    const cards = uniq.map(i => p.hand[i]);
    if (cards.some(c => !c)) return { ok: false, msg: '無此卡片' };

    const gain = zeroRes();
    if (cards.length === 1) {
      if (!RES_KEYS.includes(res)) return { ok: false, msg: '請指定要換的資源' };
      gain[res] = RULES.discardGain;
    } else {
      const kinds = new Set(cards.map(c => c.kind));
      if (!(kinds.has('tech') && kinds.has('ops')))
        return { ok: false, msg: '需科技卡與作戰卡各一張才能換三種資源' };
      for (const k of RES_KEYS) gain[k] = RULES.discardGain;
    }
    // 從大索引開始移除,避免位移
    uniq.sort((a, b) => b - a).forEach(i => p.hand.splice(i, 1));
    for (const c of cards) this.discardPile.push(c);
    addRes(p.res, gain);
    const names = cards.map(c => c.kind === 'tech' ? c.name : OPS_CARDS[c.type].name).join('】【');
    this.addLog(`♻️ ${p.name} 棄掉【${names}】換得 ${resStr(gain)}`);
    return { ok: true };
  }

  // ---------- 作戰卡 ----------
  /** 合法目標清單(每張科技卡只能被作戰卡鎖定一次) */
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
        .filter(r => r.fakeUntilRound <= this.round)
        .map(r => ({ regionId: r.id, label: r.name }));
    }
    return [];
  }

  doPlayCard(handIdx, target) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    const hc = p.hand[handIdx];
    if (!hc || hc.kind !== 'ops') return { ok: false, msg: '無此作戰卡' };
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
    this.discardPile.push(hc);

    if (card.cat === 'spy') {
      const r = this.regions[chosen.regionId];
      const tc = r.cards.find(c => c.uid === chosen.uid);
      const owner = this.players[tc.owner];
      r.cards = r.cards.filter(c => c.uid !== tc.uid);
      const ownerSide = this.sideOf(owner);
      const loss = tc.techApplied || tc.tech;
      delete tc.owner; delete tc.techApplied; delete tc.opsHit;
      this.discardPile.push(tc);
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
    if (!canPay(p, RULES.twJoinCost)) return { ok: false, msg: `需要 ${resStr(RULES.twJoinCost)}` };
    p.ap -= 1;
    pay(p, RULES.twJoinCost);
    this.twJoined = this.twSupport;
    this.addLog(`🏆 ${p.name} 正式加入${FACTIONS[this.twSupport].name}!神山歸位,大局已定!`);
    this.checkVictory();
    return { ok: true };
  }

  // ---------- 勝負 ----------
  wealthOf(p) { return totalRes(p.res); }

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
    let reason = `3 年(${RULES.maxRounds} 季)結束,米牆雙方和局(差距 ${lead} 年)。`;
    if (jp && lead >= RULES.jpWinLead && !this.twJoined) {
      winners.push(jp.id);
      reason += ` 米國領先 ${lead} 年(≥5)且台灣未加入任一方 → 日本達成勝利條件!`;
    }
    if (kr && lead < RULES.jpWinLead) {
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
        id: rid, fakeUntilRound: r.fakeUntilRound, fakeMult: r.fakeMult, country: r.country,
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
      twJoined: this.twJoined,
      deckCount: this.deck.length + this.discardPile.length,
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
      };
    return {
      version: 2,
      players: this.players.map(p => ({
        id: p.id, name: p.name, charId: p.char.id, res: p.res, intel: p.intel,
        hand: p.hand, pos: p.pos, ap: p.ap, usedFreeMove: p.usedFreeMove, isAI: p.isAI,
      })),
      regions,
      deck: this.deck, discardPile: this.discardPile,
      eventDeck: this.eventDeck, activeEvent: this.activeEvent,
      tech: this.tech, round: this.round, turnIdx: this.turnIdx,
      twSupport: this.twSupport, twRevealed: this.twRevealed,
      twJoined: this.twJoined, chipReserve: this.chipReserve,
      log: this.log,
      over: this.over, result: this.result, cardUid,
    };
  }

  static fromSave(d) {
    if (d.version !== 2) throw new Error('存檔版本不相容(舊版規則存檔無法載入)');
    const g = Object.create(Game.prototype);
    g.regions = {};
    for (const r of REGIONS) g.regions[r.id] = { ...r, cards: [], fakeUntilRound: 0, fakeMult: 1 };
    for (const rid in d.regions) Object.assign(g.regions[rid], d.regions[rid]);
    g.adj = {};
    for (const r of REGIONS) g.adj[r.id] = [];
    for (const [a, b] of EDGES) { g.adj[a].push(b); g.adj[b].push(a); }
    g.players = d.players.map(p => ({
      ...p, intel: p.intel || [],
      char: CHARACTERS.find(c => c.id === p.charId),
      faction: CHARACTERS.find(c => c.id === p.charId).faction,
    }));
    g.hasTW = g.players.some(p => p.faction === 'TW');
    g.deck = d.deck; g.discardPile = d.discardPile;
    g.eventDeck = d.eventDeck; g.activeEvent = d.activeEvent;
    g.tech = d.tech; g.round = d.round; g.turnIdx = d.turnIdx;
    g.twSupport = d.twSupport; g.twRevealed = d.twRevealed;
    g.twJoined = d.twJoined; g.chipReserve = d.chipReserve;
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
    };
    if (p.faction === 'TW') {
      priv.twSupport = this.twSupport;
      priv.chipReserve = this.chipReserve;
    }
    if (this.turnIdx === playerId && !this.over) {
      priv.targets = {};
      for (const t of ['spy1', 'spy2', 'steal1', 'steal2', 'fake1', 'fake2'])
        priv.targets[t] = this.cardTargets(t);
      priv.specialty = this.specialtyOf(p);
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
