// ============ 權威遊戲邏輯(僅在伺服器執行) ============
import {
  FACTIONS, CHARACTERS, REGIONS, EDGES, isAirEdge, RULES,
  TECH_CATEGORIES, TECH_CARDS, MAIN_TIER_COPIES, TIER4_COPIES, TIER5_COPIES, INDUSTRY_CATEGORY,
  OPS_CARDS, OPS_DECK_COMPOSITION, EVENT_CARDS,
  RES_KEYS, CATEGORY_RATIO, splitCost,
} from '../public/js/data.js';

/** 建立兩張鄰接圖:adj = 鐵路/航運(只能到相鄰城市,便宜移動);
 *  planeAdj = 完整連通圖(含跨洋飛機航線,供飛機/作戰卡的 BFS 距離使用) */
function buildAdjacency(target) {
  target.adj = {}; target.planeAdj = {};
  for (const r of REGIONS) { target.adj[r.id] = []; target.planeAdj[r.id] = []; }
  for (const [a, b] of EDGES) {
    target.planeAdj[a].push(b); target.planeAdj[b].push(a);
    if (!isAirEdge(a, b)) { target.adj[a].push(b); target.adj[b].push(a); } // 跨洋邊不算相鄰
  }
}

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
    buildAdjacency(this); // this.adj(鐵路/航運相鄰)+ this.planeAdj(含跨洋航線的完整圖)

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

    // 牌庫與「米牆起跑差距」都依人數縮放:人少 → 總部署量少 → 差距該縮小才追得上。
    // 用溫和曲線(0.5+0.5×scale),避免小局過度補償反讓牆國占優。
    const scale = RULES.deckScale[Math.min(8, Math.max(2, seats.length))] || 1;
    const gapMult = 0.5 + 0.5 * scale;
    this.tech = { ...RULES.techStart };
    this.tech.CN = RULES.techStart.US
      - Math.round((RULES.techStart.US - RULES.techStart.CN) * gapMult);
    // 台日韓開局科技力一律取「米國與(縮放後)牆國的中間值」,確保夾在米牆之間
    const midTech = Math.round((this.tech.US + this.tech.CN) / 2);
    for (const f of ['TW', 'JP', 'KR']) this.tech[f] = midTech;
    this.startLead = this.tech.US - this.tech.CN; // 開局讓分線:終局僵局時用它判定誰贏了冷戰
    this.round = 1;
    this.turnIdx = 0;

    // 公共牌庫(公牌):只放 1/2/3 階科技卡(比例 4:3:2)+ 灰色作戰卡;
    // 4 階與 5 階各自獨立一疊,只能用捨牌升階換取(數量依遊玩人數調整)
    this.deck = [];
    this.discardPile = [];
    this.tier4Deck = [];
    this.tier5Deck = [];
    for (const catId in TECH_CATEGORIES) {
      for (const def of TECH_CARDS[catId]) {
        if (def.tier <= 3) {
          const copies = Math.max(1, Math.round(MAIN_TIER_COPIES[def.tier - 1] * scale));
          for (let i = 0; i < copies; i++) this.deck.push(makeTechCard(catId, def));
        } else if (def.tier === 4) {
          const copies = Math.max(1, Math.round(TIER4_COPIES * scale));
          for (let i = 0; i < copies; i++) this.tier4Deck.push(makeTechCard(catId, def));
        } else {
          const copies = Math.max(1, Math.round(TIER5_COPIES * scale));
          for (let i = 0; i < copies; i++) this.tier5Deck.push(makeTechCard(catId, def));
        }
      }
    }
    for (const [type, n] of OPS_DECK_COMPOSITION) {
      const copies = Math.max(1, Math.round(n * scale));
      for (let i = 0; i < copies; i++) this.deck.push(makeOpsCard(type));
    }
    shuffle(this.deck); shuffle(this.tier4Deck); shuffle(this.tier5Deck);

    // 集體事件卡牌庫
    this.eventDeck = shuffle(EVENT_CARDS.map(e => e.id));
    this.activeEvent = null;

    // 台灣立場:人類玩家在第 1 季內秘密自選(P1-2);AI 或無台灣時隨機
    const twSeat = seats.find(s => CHARACTERS.find(c => c.id === s.charId)?.faction === 'TW');
    this.twSupport = twSeat && !twSeat.isAI ? null : (Math.random() < 0.5 ? 'US' : 'CN');
    this.twChosen = !!this.twSupport;
    this.twRevealed = false;
    this.twPivoted = false;
    this.chipReserve = 0;

    this.log = [];
    this.fx = [];        // 結構化視覺特效饋送(純裝飾,客戶端只播新 id)
    this._fxSeq = 0;
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
  /** 發出一則視覺特效描述子(客戶端依 id 增量播放,上限 40 則) */
  addFx(type, data = {}) {
    this.fx.push({ id: ++this._fxSeq, type, ...data });
    if (this.fx.length > 40) this.fx.shift();
  }

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

  /** 科技力紅利:每 100 點「本國」科技力,每種資源收入 +1、放棄權利收益 +1(封頂,避免後期滾雪球) */
  techBonusOf(p) {
    const bonus = Math.floor((this.tech[p.faction] || 0) / RULES.techIncomeDivisor);
    return Math.min(RULES.techBonusCap ?? Infinity, bonus);
  }
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

  /** from 出發各城市的航線距離(BFS over 完整圖,含跨洋飛機航線),回傳 { rid: dist };
   *  供飛機移動與作戰卡射程使用(鐵路/航運的「相鄰」判定改用 this.adj) */
  distancesFrom(from, maxDist = Infinity) {
    const dist = { [from]: 0 };
    let frontier = [from];
    for (let d = 0; d < maxDist && frontier.length; d++) {
      const next = [];
      for (const rid of frontier)
        for (const n of this.planeAdj[rid])
          if (dist[n] == null) { dist[n] = d + 1; next.push(n); }
      frontier = next;
    }
    return dist;
  }

  /** 灰色作戰卡的攻擊範圍(航線格數):牆國 +1 */
  opsRangeFor(p) {
    return RULES.opsRange + (p.faction === 'CN' ? (RULES.cnOpsRangeBonus || 0) : 0);
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
    this.addFx('event', { event: { id: ev.id, name: ev.name, icon: ev.icon, desc: ev.desc } });
  }

  /** 玩家在場上的科技卡張數(日韓分享終局勝利需 ≥ RULES.spoilerWinCards 張) */
  ownBoardCards(p) {
    let n = 0;
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards)
        if (c.owner === p.id) n++;
    return n;
  }

  /** 台灣立場保險絲:玩家逾期未選(第 1 季結束)或終局結算時仍未選 → 隨機決定 */
  ensureTwSide() {
    if (this.twSupport) return;
    this.twSupport = Math.random() < 0.5 ? 'US' : 'CN';
    this.twChosen = true;
    this.addLog('⏰ 台灣未在第一季選定立場,命運替它擲了硬幣(立場保密)');
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

  /** 作戰卡費用(三種資源);牆國優勢:費用是他國的一半。
   *  dist:目標距離(航線格數)— 每多一個航線(超過 1 格)費用 +50% */
  opsCostFor(p, type, dist = 0) {
    const c = OPS_CARDS[type];
    if (c.cat === 'fake' && (p.char.perk === 'media' || this.hasFakeFree(p))) return zeroRes();
    let cost = c.cost;
    if (p.faction === 'CN') cost = Math.ceil(cost * RULES.cnOpsHalf);
    if (p.char.perk === 'phone') cost -= 2;
    cost -= this.specialSum(p, 'opsDiscount');
    const ev = this.eventEffect();
    if (ev?.type === 'opsCost') cost = Math.ceil(cost * ev.mult);
    cost = Math.max(0, cost);
    const extra = Math.max(0, dist - 1); // 第 1 格內不加成,之後每格 +50%
    if (extra > 0) cost = Math.ceil(cost * (1 + extra * RULES.opsDistSurcharge));
    return splitCost(cost, c.ratio);
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
    return triple;
  }

  /** 把卡片放回對應牌堆:4/5 階各自回獨立疊,其餘(1~3 階科技卡 / 作戰卡)進公共棄牌堆 */
  discardCard(card) {
    if (card.kind === 'tech' && card.tier >= 5) this.tier5Deck.push(card);
    else if (card.kind === 'tech' && card.tier >= 4) this.tier4Deck.push(card);
    else this.discardPile.push(card);
  }

  /** 從公共牌庫(公牌)抽一張到手牌;牌庫空了就把棄牌堆洗回 */
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

  /** 可否從手牌湊出階級加總正好 target 的 1~3 階科技卡(子集和) */
  canFormTierSum(p, target) {
    const reach = new Set([0]);
    for (const c of p.hand) {
      if (c.kind !== 'tech' || c.tier > 3) continue;
      for (const v of [...reach]) if (v + c.tier <= target) reach.add(v + c.tier);
      if (reach.has(target)) return true;
    }
    return reach.has(target);
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

  /** techValueOf 的加權成分拆解(卡面/角色/陣營/效果),供前端點擊加權值顯示明細 */
  techValueParts(p, card, rid) {
    const parts = [['卡面科技力', card.tech]];
    if (this.regions[rid].chipBonus) parts.push(['新竹晶片重鎮', 5]);
    if (card.cat === this.specialtyOf(p)) parts.push([`擅長領域・${p.char.industry}`, RULES.specialtyTechBonus]);
    if (p.char.perk === 'chip' && card.cat === 'hardware') parts.push(['神山硬體加成', 5]);
    if (p.faction === 'US' && card.tier >= 4) parts.push(['米國尖端科技領先', 10]);
    const ev = this.eventEffect();
    if (ev?.type === 'techDelta') {
      const e = EVENT_CARDS.find(x => x.id === this.activeEvent);
      parts.push([`集體事件・${e?.name || ''}`, ev.val]);
    }
    return parts;
  }

  // ---------- 回合流程 ----------
  /** 卡片每回合的資源產出(依建造比例;約 1/3 卡片有 prodRatio 例外) */
  cardProduction(c) { return splitCost(c.trade, c.prodRatio || this.ratioOf(c)); }

  /** 收入(三種資源):基礎(隨陣營科技力提高)+ 場上卡片交易力(依類別比例) */
  incomeOf(p) {
    const inc = { ...RULES.baseIncome };
    const bonus = this.techBonusOf(p);
    for (const k of RES_KEYS) inc[k] += bonus;
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards) {
        const drain = c.debuff?.type === 'drain' ? c.debuff : null;
        if (c.owner === p.id) {
          // 建造後產出資源:被竊取(drain)的部分不歸本人(subRes 已對每種資源下限歸零)
          const prod = this.cardProduction(c);
          if (drain) subRes(prod, drain.amt);
          addRes(inc, prod);
          if (c.special?.type === 'income') inc.money += c.special.val;
        } else if (drain && drain.by === p.id) {
          // 本玩家是竊賊:抽走對手該卡的部分交易收益(上限為該卡實際產出)
          const prod = this.cardProduction(c);
          for (const k of RES_KEYS) inc[k] += Math.min(drain.amt[k] || 0, prod[k]);
        }
      }
    if (p.char.perk === 'info' || p.char.perk === 'auto') inc.money += 2;
    const ev = this.eventEffect();
    if (ev?.type === 'resZero') inc[ev.res] = 0;
    if (ev?.type === 'resHalf') inc[ev.res] = Math.floor(inc[ev.res] / 2);
    if (ev?.type === 'resBoost') inc[ev.res] += ev.val;
    if (ev?.type === 'incomeBonus') for (const k of RES_KEYS) inc[k] += ev.val;
    return inc;
  }

  /** incomeOf 的加權成分拆解(基礎/陣營科技力/建設/竊取/角色perk/事件),明細加總 = 實際收入 */
  incomeParts(p) {
    const parts = [['基礎收入', { ...RULES.baseIncome }]];
    const bonus = this.techBonusOf(p);
    if (bonus > 0) parts.push([`陣營科技力紅利(${this.tech[p.faction] || 0}點)`, { money: bonus, power: bonus, oil: bonus }]);
    const build = zeroRes(), steal = zeroRes();
    for (const rid in this.regions)
      for (const c of this.regions[rid].cards) {
        const drain = c.debuff?.type === 'drain' ? c.debuff : null;
        if (c.owner === p.id) {
          const prod = this.cardProduction(c);
          if (drain) subRes(prod, drain.amt);
          addRes(build, prod);
          if (c.special?.type === 'income') build.money += c.special.val;
        } else if (drain && drain.by === p.id) {
          const prod = this.cardProduction(c);
          for (const k of RES_KEYS) steal[k] += Math.min(drain.amt[k] || 0, prod[k]);
        }
      }
    if (totalRes(build) > 0) parts.push(['建設產出', build]);
    if (totalRes(steal) > 0) parts.push(['竊取對手收益', steal]);
    if (p.char.perk === 'info' || p.char.perk === 'auto') parts.push(['角色 perk・收入 +2', { money: 2, power: 0, oil: 0 }]);
    // 事件對收入的調整(歸零/減半/加成)以差額呈現,確保明細加總 = 實際收入
    const sum = zeroRes();
    for (const [, r] of parts) addRes(sum, r);
    const real = this.incomeOf(p);
    const delta = { money: real.money - sum.money, power: real.power - sum.power, oil: real.oil - sum.oil };
    if (delta.money || delta.power || delta.oil) parts.push(['集體事件調整', delta]);
    return parts;
  }

  apPerTurn() {
    const ev = this.eventEffect();
    return Math.max(1, RULES.apPerTurn + (ev?.type === 'apDelta' ? ev.val : 0));
  }

  /** 每回合自動抽牌張數(算力 perk:每回合多抽一張) */
  autoDrawCount(p) { return p.char.perk === 'ai' ? 2 : 1; }

  beginTurn() {
    const p = this.cur();
    p.ap = this.apPerTurn(); // 行動點每回合重置(補滿)
    p.usedFreeMove = false;
    p.turnFlags = emptyTurnFlags();
    const income = this.incomeOf(p);
    addRes(p.res, income);
    this.addLog(`${p.name} 開始回合,獲得收入 ${resStr(income)}(行動點 ${p.ap})`);
    // 每回合自動抽一張卡(算力 perk 多抽一張);不再有手動抽卡
    let drawn = 0;
    for (let i = 0; i < this.autoDrawCount(p); i++) if (this.drawCardFor(p)) drawn++;
    if (drawn > 0) {
      this.addLog(`🃏 ${p.name} 自動抽了 ${drawn} 張卡`);
      this.addFx('draw', { region: p.pos, charId: p.char.id, faction: p.faction });
    } else if (p.hand.length >= RULES.handLimit) {
      this.addLog(`🃏 ${p.name} 手牌已滿,本回合略過自動抽卡`);
    }
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
    if (this.hasTW) this.ensureTwSide(); // 第 1 季結束仍未選 → 隨機(P1-2 保險絲)
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
    if (!adjacent) {
      // 搭飛機:最多可跨 planeRange 格(航線);超出航程無法直達
      const dist = this.distancesFrom(p.pos, RULES.planeRange);
      if (dist[rid] == null) return null;
    }
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
    const from = p.pos;
    p.pos = rid;
    this.addLog(`${p.name} ${mc.plane ? `✈️ 搭飛機直飛(🛢️${mc.oil})` : '移動'}到 ${this.regions[rid].name}${mc.free ? '(免費移動)' : ''}`);
    this.addFx('move', { from, to: rid, charId: p.char.id, faction: p.faction, plane: !!mc.plane });
    return { ok: true };
  }

  // ---------- 發展科技卡(從手牌打出) ----------
  /** 該城被作戰卡 debuff、且屬於 p 同陣營他人的科技卡(p 在此城無自己的卡時可「改建」之) */
  allyRescueTargetsAt(p, rid = p.pos) {
    const mySide = this.sideOf(p);
    if (mySide == null || this.ownCardAt(p, rid)) return []; // 立場未明 / 一城一卡:不可改建
    return this.regions[rid].cards.filter(c =>
      c.owner !== p.id && c.debuff && this.sideOf(this.players[c.owner]) === mySide);
  }

  /** 某張手牌科技卡可否在目前城市部署;rebuildUid 指定改建同陣營盟友被 debuff 的科技卡 */
  canPlayTech(p, card, rid = p.pos, rebuildUid = null) {
    const r = this.regions[rid];
    if (card.tier > r.level)
      return { ok: false, msg: `城市等級不足(${r.name} Lv.${r.level},${card.tier}階卡需 Lv.${card.tier})` };
    if (r.builtRound && this.round < r.builtRound + RULES.cityBuildCooldown)
      return { ok: false, msg: `${r.name} 今年已建造過,須過一年(第 ${Math.ceil((r.builtRound + RULES.cityBuildCooldown) / 4)} 年起)才可重新建造` };
    if (rebuildUid != null) { // 盟友改建:改建同陣營他人被作戰卡 debuff 的卡
      const tc = r.cards.find(c => c.uid === rebuildUid);
      if (!tc) return { ok: false, msg: '改建目標不存在' };
      if (tc.owner === p.id) return { ok: false, msg: '這是你自己的卡,直接升階即可' };
      if (!tc.debuff) return { ok: false, msg: '只能改建被作戰卡 debuff 的盟友科技卡' };
      const mySide = this.sideOf(p);
      if (mySide == null || this.sideOf(this.players[tc.owner]) !== mySide)
        return { ok: false, msg: '只能改建同陣營盟友的受損科技卡' };
      if (this.ownCardAt(p, rid)) return { ok: false, msg: '你在此城已有科技卡(一城一卡)' };
      if (card.tier < tc.tier) return { ok: false, msg: `改建需 ≥ 原卡階級(${tc.tier} 階)` };
      return { ok: true };
    }
    const old = this.ownCardAt(p, rid);
    if (old) {
      if (card.tier <= old.tier)
        return { ok: false, msg: `此城已有你的【${old.name}】${old.tier}階,只能用更高階科技卡替換` };
    } else if (r.cards.length >= RULES.maxCardsPerRegion) {
      return { ok: false, msg: '此城市科技卡已滿' };
    }
    return { ok: true };
  }

  doPlayTech(handIdx, rebuildUid = null) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    const card = p.hand[handIdx];
    if (!card || card.kind !== 'tech') return { ok: false, msg: '無此科技卡' };
    if (p.turnFlags.forfeitTech) return { ok: false, msg: '你本回合已放棄打出科技卡的權利' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    if (rebuildUid != null) rebuildUid = Number(rebuildUid);
    const chk = this.canPlayTech(p, card, p.pos, rebuildUid);
    if (!chk.ok) return chk;
    const cost = this.developCostFor(p, card);
    if (!canPay(p, cost)) return { ok: false, msg: `資源不足(需要 ${resStr(cost)})` };

    p.ap -= 1;
    pay(p, cost);
    p.hand.splice(handIdx, 1);
    p.turnFlags.playedTech = true;

    // 晶片稅(金錢)
    const twPlayer = this.players.find(q => q.faction === 'TW');
    if (twPlayer && twPlayer.id !== p.id) {
      const levy = Math.min(RULES.chipLevy, p.res.money);
      p.res.money -= levy;
      twPlayer.res.money += levy;
      if (levy > 0) this.addLog(`${p.name} 支付晶片稅 💰${levy} 給 ${twPlayer.name}`);
    }

    const r = this.regions[p.pos];
    if (rebuildUid != null) {
      // 盟友改建:被作戰卡 debuff 的盟友卡可由同陣營他人改建。移除舊卡並清除 debuff;
      // 折舊金額(不被施法者分走)返回給原建設玩家作為補償。
      const tc = r.cards.find(c => c.uid === rebuildUid);
      const owner = this.players[tc.owner];
      const deprec = splitCost(Math.floor((tc.cost || 0) * RULES.depreciationRate), this.ratioOf(tc));
      addRes(owner.res, deprec);
      r.cards = r.cards.filter(c => c.uid !== tc.uid);
      this.removeTechGain(owner, tc.techApplied || 0);
      delete tc.owner; delete tc.techApplied; delete tc.opsHit; delete tc.debuff;
      this.discardCard(tc);
      this.addLog(`🔧 ${p.name} 替盟友 ${owner.name} 改建了 ${r.name} 受損的【${tc.name}】,折舊 ${resStr(deprec)} 返還給 ${owner.name}`);
    } else {
      // 一城一卡:替換自己的舊卡(扣回其科技力;同類型已在費用折舊抵免)
      const old = this.ownCardAt(p, p.pos);
      if (old) {
        // 假新聞「折舊陷阱」:同類改建被植入 debuff 的舊卡時,部分折舊資源由重建者轉移給施法者
        if (old.debuff?.type === 'leak' && old.cat === card.cat) {
          const by = this.players[old.debuff.by];
          if (by && by.id !== p.id && old.debuff.val > 0) {
            const want = splitCost(old.debuff.val, this.ratioOf(old));
            const moved = zeroRes();
            for (const k of RES_KEYS) { moved[k] = Math.min(want[k], p.res[k]); p.res[k] -= moved[k]; by.res[k] += moved[k]; }
            if (totalRes(moved) > 0)
              this.addLog(`📰 ${p.name} 同類改建被植入假新聞的【${old.name}】,部分折舊資源 ${resStr(moved)} 被轉移給 ${by.name}!`);
          }
        }
        r.cards = r.cards.filter(c => c.uid !== old.uid);
        this.removeTechGain(p, old.techApplied || 0);
        delete old.owner; delete old.techApplied; delete old.opsHit; delete old.debuff;
        this.discardCard(old);
        this.addLog(`${p.name} 拆除了 ${r.name} 的【${old.name}】${old.cat === card.cat ? '(同類型折舊抵免費用)' : ''}`);
      }
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
    this.addFx('build', { region: p.pos, cat: card.cat, tier: card.tier, faction: p.faction, charId: p.char.id, name: card.name });
    this.checkVictory();
    return { ok: true };
  }

  /** 捨牌升階(換取 4/5 階卡;每回合自動抽牌,沒有手動抽卡)。
   *  toTier=4:捨棄階級加總正好 tier4DiscardSum(預設 6)的 1~3 階科技卡 → 抽 1 張 4 階卡
   *  toTier=5:捨棄 tier5DiscardCount(預設 2)張 4 階卡 → 抽 1 張 5 階卡 */
  doUpgradeCard(handIdxs, toTier) {
    const p = this.cur();
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    toTier = Number(toTier);
    if (toTier !== 4 && toTier !== 5) return { ok: false, msg: '只能升階到 4 或 5 階' };
    if (p.ap < RULES.cardUpgradeAp) return { ok: false, msg: '行動點不足' };
    const raw = Array.isArray(handIdxs) ? handIdxs.map(Number) : [];
    const idxs = [...new Set(raw)];
    if (idxs.length !== raw.length || idxs.some(i => !Number.isInteger(i) || i < 0 || i >= p.hand.length))
      return { ok: false, msg: '選擇的卡片不合法' };
    const cards = idxs.map(i => p.hand[i]);
    if (cards.some(c => !c || c.kind !== 'tech')) return { ok: false, msg: '只能捨棄科技卡來升階' };
    const pool = toTier === 4 ? this.tier4Deck : this.tier5Deck;
    if (pool.length === 0) return { ok: false, msg: `${toTier} 階卡庫已空,無法升階` };
    if (toTier === 4) {
      if (cards.some(c => c.tier > 3)) return { ok: false, msg: '請用 1~3 階科技卡湊加總' };
      const sum = cards.reduce((s, c) => s + c.tier, 0);
      if (sum !== RULES.tier4DiscardSum)
        return { ok: false, msg: `需捨棄階級加總正好 ${RULES.tier4DiscardSum} 的科技卡(目前 ${sum})` };
    } else {
      if (cards.length !== RULES.tier5DiscardCount || cards.some(c => c.tier !== 4))
        return { ok: false, msg: `需捨棄 ${RULES.tier5DiscardCount} 張 4 階卡` };
    }
    p.ap -= RULES.cardUpgradeAp;
    for (const i of [...idxs].sort((a, b) => b - a)) { // 由大到小移除避免索引位移
      const [c] = p.hand.splice(i, 1);
      this.discardCard(c);
    }
    const nc = pool.pop();
    p.hand.push(nc);
    this.addLog(`⏫ ${p.name} 捨棄 ${cards.length} 張卡,升階抽得【${nc.name}】(${nc.tier}階)`);
    this.addFx('draw', { region: p.pos, charId: p.char.id, faction: p.faction });
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
    this.addFx('upgrade', { region: p.pos, charId: p.char.id, faction: p.faction, name: r.name, level: r.level });
    return { ok: true };
  }

  // ---------- 作戰卡 ----------
  /** debuff 強度預覽(供 UI 標籤):與 max(1, 攻擊力 − 有效防護力) 成正比 */
  opsDebuffText(card, def, tc) {
    const potency = Math.max(1, card.atk - def);
    if (card.cat === 'spy')   return `科技力 -${potency * RULES.opsTechDebuff}`;
    if (card.cat === 'steal') return `每回合竊取收益 ${resStr(splitCost(potency * RULES.opsIncomeDrain, card.ratio))}`;
    const transfer = Math.min(Math.floor((tc.cost || 0) * RULES.depreciationRate), potency * RULES.opsDeprecLeak);
    return `對手同類改建時轉移折舊資源 ${transfer}`; // fake
  }

  /** 合法目標清單(三類作戰卡都鎖定敵對科技卡:攻擊力 ≥ 有效防護力,每卡限一次) */
  cardTargets(type) {
    const p = this.cur();
    const card = OPS_CARDS[type];
    if (!card) return [];
    const mySide = this.secretSideOf(p);
    const dist = this.distancesFrom(p.pos, this.opsRangeFor(p));
    const targets = [];
    for (const rid in this.regions) {
      if (dist[rid] == null) continue;       // 超出航線可及範圍
      for (const c of this.regions[rid].cards) {
        if (c.owner === p.id) continue;
        if (c.opsHit) continue; // 已被作戰卡鎖定過
        const owner = this.players[c.owner];
        if (p.faction !== 'TW' && this.secretSideOf(owner) === mySide) continue; // 不打自己陣營
        const def = this.effDef(rid, c);
        if (card.atk < def) continue; // 攻擊力需 ≥ 有效防護力
        const cost = this.opsCostFor(p, type, dist[rid]);
        targets.push({
          regionId: rid, uid: c.uid, tier: c.tier, tech: c.tech, dist: dist[rid], cost,
          label: `${this.regions[rid].name}(${dist[rid]}格·${resStr(cost)})|${owner.name}【${c.name}】${c.tier}階(防護${def}) → ${this.opsDebuffText(card, def, c)}`,
        });
      }
    }
    return targets;
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

    // 先驗證目標仍合法,費用依目標距離(航線格數)決定;三類作戰卡都鎖定一張敵對科技卡
    const valid = this.cardTargets(type);
    const chosen = valid.find(t => t.uid === target?.uid);
    if (!chosen) return { ok: false, msg: '目標不合法或已消失' };
    const cost = chosen.cost; // 已含航線距離加成(伺服器端重算,不信任客戶端)
    if (!canPay(p, cost)) return { ok: false, msg: `資源不足(需要 ${resStr(cost)})` };

    p.ap -= 1;
    pay(p, cost);
    p.hand.splice(handIdx, 1);
    p.turnFlags.playedOps = true;
    this.discardCard(hc);

    const r = this.regions[chosen.regionId];
    const tc = r.cards.find(c => c.uid === chosen.uid);
    const owner = this.players[tc.owner];
    const def = this.effDef(chosen.regionId, tc);
    const potency = Math.max(1, card.atk - def); // overkill:攻擊力越壓過防護,debuff 越強
    tc.opsHit = true; // 每張科技卡只能被鎖定一次

    if (card.cat === 'spy') {
      // 減少科技力:削減該卡對陣營分數的貢獻(上限為其實際貢獻),不拆卡
      const reduce = Math.min(potency * RULES.opsTechDebuff, tc.techApplied || 0);
      tc.techApplied = (tc.techApplied || 0) - reduce;
      tc.debuff = { type: 'tech', val: reduce, by: p.id, byName: p.name };
      const ownerSide = this.removeTechGain(owner, reduce);
      if (ownerSide)
        this.addLog(`💣 ${p.name} 用【${card.name}】滲透了 ${owner.name} 在 ${r.name} 的【${tc.name}】!${FACTIONS[ownerSide].name}科技力 -${reduce} 點(卡片仍在,但科技力被削)`);
      else
        this.addLog(`💣 ${p.name} 用【${card.name}】滲透了 ${owner.name} 在 ${r.name} 的【${tc.name}】!神山儲備受損 ${reduce} 點(秘密)`);
      this.addFx('spy', { region: chosen.regionId, faction: p.faction, targetFaction: owner.faction, charId: p.char.id, name: tc.name, ops: card.name, val: reduce });
      this.checkVictory();
      return { ok: true };
    }

    if (card.cat === 'steal') {
      // 竊取收益:每回合自該卡交易收益抽走資源,轉給施法者(卡片仍在)
      const amt = splitCost(potency * RULES.opsIncomeDrain, card.ratio);
      tc.debuff = { type: 'drain', amt, by: p.id, byName: p.name };
      this.addLog(`🕵️ ${p.name} 用【${card.name}】滲透了 ${owner.name} 在 ${r.name} 的【${tc.name}】金流:每回合竊取其收益 ${resStr(amt)}`);
      this.addFx('steal', { region: chosen.regionId, faction: p.faction, cat: tc.cat, charId: p.char.id, ops: card.name });
      return { ok: true };
    }

    if (card.cat === 'fake') {
      // 折舊陷阱:對手日後「同類改建(同 cat 升階替換)」該卡時,
      // 部分折舊資源(上限為該卡折舊額)被轉移給施法者(卡片仍在)
      const deprecTotal = Math.floor((tc.cost || 0) * RULES.depreciationRate);
      const val = Math.min(deprecTotal, potency * RULES.opsDeprecLeak);
      tc.debuff = { type: 'leak', potency, val, by: p.id, byName: p.name };
      this.addLog(`📰 ${p.name} 對 ${owner.name} 在 ${r.name} 的【${tc.name}】散布假新聞:對手同類改建此卡時,部分折舊資源(約 ${val})將被轉移給你`);
      this.addFx('fake', { region: chosen.regionId, faction: p.faction, charId: p.char.id, ops: card.name, val });
      // 媒體 perk:輿論操作順便撈情報(打出假新聞後抽一張卡)
      if (p.char.perk === 'media' && this.drawCardFor(p))
        this.addLog(`🎭 ${p.name} 的輿論網路順手撈到一張新情報(抽 1 張卡)`);
      return { ok: true };
    }
    return { ok: false, msg: '未知卡片' };
  }

  // ---------- 台灣專屬 ----------
  /** 開局秘密選邊(P1-2):不耗 AP、不限輪到誰,但只能在第 1 季內選一次 */
  doChooseSide(playerId, side) {
    const p = this.players[playerId];
    if (!p || p.faction !== 'TW') return { ok: false, msg: '只有台灣可以選擇立場' };
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.twSupport) return { ok: false, msg: '立場已決定,之後只能用「轉向」改變' };
    if (this.round > 1) return { ok: false, msg: '已超過第 1 季,立場已由系統隨機決定' };
    if (side !== 'US' && side !== 'CN') return { ok: false, msg: '立場只能是米國或牆國' };
    this.twSupport = side;
    this.twChosen = true;
    this.addLog(`🤫 ${p.name} 已在暗中選定支持的陣營(立場保密)`);
    return { ok: true };
  }

  /** 轉向(P1-2):未表態前限一次,1 AP,秘密改變立場,神山儲備折損一半 */
  doPivot() {
    const p = this.cur();
    if (p.faction !== 'TW') return { ok: false, msg: '只有台灣可以轉向' };
    if (this.over) return { ok: false, msg: '遊戲已結束' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    if (!this.twSupport) return { ok: false, msg: '請先選定秘密立場' };
    if (this.twRevealed) return { ok: false, msg: '已經公開表態,無法轉向' };
    if (this.twPivoted) return { ok: false, msg: '整局只能轉向一次' };
    if (p.ap < 1) return { ok: false, msg: '行動點不足' };
    p.ap -= 1;
    this.twPivoted = true;
    this.twSupport = this.twSupport === 'US' ? 'CN' : 'US';
    this.chipReserve = Math.floor(this.chipReserve * RULES.twPivotReserveKeep);
    this.addLog(`🔄 ${p.name} 暗中重新佈局,秘密立場已經改變!(情報外洩,神山儲備折損一半)`);
    return { ok: true };
  }

  doReveal() {
    const p = this.cur();
    if (p.faction !== 'TW') return { ok: false, msg: '只有台灣可以表態' };
    if (this.phase === 'trade') return { ok: false, msg: '交易環節中' };
    if (!this.twSupport) return { ok: false, msg: '請先選定秘密立場' };
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
      } else if (p.faction === 'JP' || p.faction === 'KR') {
        // 日韓為陣營小弟:所屬陣營獲勝即分享,但需自身場上 ≥ spoilerWinCards 張科技卡(不能躺贏)
        if (FACTIONS[p.faction].side === side && this.ownBoardCards(p) >= RULES.spoilerWinCards)
          winners.push(p.id);
      }
    }
    this.concludeWinners(winners, reason);
  }

  /** 終局結算(P1-1):打滿後必分陣營勝負,±5 年帶決定冷戰結果;商業勝利退場為極端例外。
   *  日韓分享勝利/僵局獨勝皆需自身場上 ≥ spoilerWinCards 張科技卡(P1-3:不能躺贏)。 */
  endGameByRounds() {
    if (this.hasTW) this.ensureTwSide();
    const lead = this.lead();
    const band = RULES.jpWinLead * RULES.pointsPerYear;   // 米國終局帶:領先 ≥5 年(100 點)
    const cnBand = RULES.cnEndLead * RULES.pointsPerYear; // 牆國終局帶:差距 ≤1 年 = 實質追平
    const needCards = RULES.spoilerWinCards;
    const spoilerOk = q => this.ownBoardCards(q) >= needCards;
    const jp = this.players.find(p => p.faction === 'JP');
    const kr = this.players.find(p => p.faction === 'KR');
    let winners = [];
    let forcedChampion = null;
    let reason = `3 年(${RULES.maxRounds} 季)結束。`;
    if (lead >= band) {
      reason += ` 米國以 ${this.yearsOf(lead)} 年的科技領先主導冷戰終局 → 米陣營獲勝!`;
      for (const p of this.players) {
        if (p.faction === 'US') winners.push(p.id);
        else if (p.faction === 'TW' && this.twSupport === 'US') winners.push(p.id);
        else if (p.faction === 'JP' && spoilerOk(p)) winners.push(p.id);
      }
      // 米國贏了冷戰卻沒贏到提前門檻(10 年)= 日本精準押中的劇本:日本奪冠
      if (jp && spoilerOk(jp)) {
        forcedChampion = jp.id;
        reason += ` 米國只贏「剛剛好」— 精準攪局的日本才是最大贏家!`;
      } else if (jp) {
        reason += ` 日本場上科技卡不足 ${needCards} 張,只能看著盟友領獎。`;
      }
    } else if (lead <= cnBand) {
      reason += lead < 0
        ? ` 牆國科技力反超 ${this.yearsOf(-lead)} 年 → 牆陣營獲勝!`
        : ` 牆國把差距壓到 ${this.yearsOf(lead)} 年,實質追平 → 牆陣營獲勝!`;
      for (const p of this.players) {
        if (p.faction === 'CN') winners.push(p.id);
        else if (p.faction === 'TW' && this.twSupport === 'CN') winners.push(p.id);
        else if (p.faction === 'KR' && spoilerOk(p)) winners.push(p.id);
      }
      // 牆國熬到終局才追平 = 韓國左右逢源的劇本:韓國奪冠
      if (kr && spoilerOk(kr)) {
        forcedChampion = kr.id;
        reason += ` 牆國熬到終局才追平 — 左右逢源的韓國才是最大贏家!`;
      } else if (kr) {
        reason += ` 韓國場上科技卡不足 ${needCards} 張,只能看著盟友領獎。`;
      }
    } else if (kr && spoilerOk(kr)) {
      // 僵局帶 + 合格韓國:左右逢源者通吃
      winners = [kr.id];
      reason += ` 米牆差距僅 ${this.yearsOf(lead)} 年陷入僵局 — 韓國在夾縫中左右逢源 → 韓國獨勝!`;
    } else {
      // 僵局帶、無韓國收割:用開局讓分線判定誰真正贏了冷戰
      //（守住/擴大開局領先 → 米陣營;把差距追近到讓分線以下 → 牆陣營)
      const side = lead >= this.startLead ? 'US' : 'CN';
      if (side === 'US')
        reason += ` 米國守住了 ${this.yearsOf(lead)} 年的科技優勢(開局讓分 ${this.yearsOf(this.startLead)} 年)→ 米陣營贏得冷戰!`;
      else
        reason += ` 牆國把差距追近到 ${this.yearsOf(lead)} 年(開局落後 ${this.yearsOf(this.startLead)} 年)→ 牆陣營贏得冷戰!`;
      for (const p of this.players) {
        if (p.faction === side) winners.push(p.id);
        else if (p.faction === 'TW' && this.twSupport === side) winners.push(p.id);
        else if (p.faction === 'JP' && side === 'US' && spoilerOk(p)) winners.push(p.id);
        else if (p.faction === 'KR' && side === 'CN' && spoilerOk(p)) winners.push(p.id);
      }
    }
    if (winners.length === 0) {
      const richest = [...this.players].sort((a, b) => this.wealthOf(b) - this.wealthOf(a))[0];
      winners = [richest.id];
      reason += ` 無人收割冷戰 → 資源最雄厚的 ${richest.name} 獲得商業勝利!`;
    }
    this.concludeWinners(winners, reason, forcedChampion);
  }

  concludeWinners(winnerIds, reason, forcedChampion = null) {
    this.over = true;
    const ws = winnerIds.map(id => this.players[id]);
    const champion = forcedChampion !== null && winnerIds.includes(forcedChampion)
      ? this.players[forcedChampion]
      : [...ws].sort((a, b) => this.wealthOf(b) - this.wealthOf(a))[0];
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
          tech: c.tech, effTech: this.techValueOf(this.players[c.owner], c, rid),
          techBreak: this.techValueParts(this.players[c.owner], c, rid),
          def: c.def, trade: c.trade, effDef: this.effDef(rid, c),
          special: c.special, opsHit: !!c.opsHit, debuff: c.debuff || null,
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
      twPivoted: this.twPivoted,
      twSupportPublic: this.twRevealed ? this.twSupport : null,
      deckCount: this.deck.length + this.discardPile.length,
      tier4Count: this.tier4Deck.length,
      tier5Count: this.tier5Deck.length,
      phase: this.phase,
      tradeOffers: this.phase === 'trade' ? this.tradeOffers : [],
      tradeReady: this.phase === 'trade' ? [...this.tradeReady] : [],
      tradeOfferCount: this.phase === 'trade' ? { ...this.tradeOfferCount } : {},
      tradeDone: this.phase === 'trade' ? [...this.tradeDone] : [],
      log: this.log.slice(-60),
      fx: this.fx,
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
      version: 4,
      players: this.players.map(p => ({
        id: p.id, name: p.name, charId: p.char.id, res: p.res, intel: p.intel,
        hand: p.hand, pos: p.pos, ap: p.ap, usedFreeMove: p.usedFreeMove,
        turnFlags: p.turnFlags, isAI: p.isAI, strategy: p.strategy || null,
      })),
      regions,
      deck: this.deck, discardPile: this.discardPile,
      tier4Deck: this.tier4Deck, tier5Deck: this.tier5Deck,
      eventDeck: this.eventDeck, activeEvent: this.activeEvent,
      tech: this.tech, startLead: this.startLead, round: this.round, turnIdx: this.turnIdx,
      twSupport: this.twSupport, twRevealed: this.twRevealed,
      twChosen: this.twChosen, twPivoted: this.twPivoted,
      chipReserve: this.chipReserve,
      phase: this.phase, tradeOffers: this.tradeOffers,
      tradeReady: this.tradeReady, nextOfferId: this.nextOfferId,
      tradeOfferCount: this.tradeOfferCount, tradeDone: this.tradeDone,
      log: this.log,
      over: this.over, result: this.result, cardUid,
    };
  }

  static fromSave(d) {
    if (d.version !== 4) throw new Error('存檔版本不相容(舊版規則存檔無法載入)');
    const g = Object.create(Game.prototype);
    g.regions = {};
    for (const r of REGIONS)
      g.regions[r.id] = { ...r, cards: [], fakeUntilRound: 0, fakeMult: 1, level: r.startLevel || 1, builtRound: 0 };
    for (const rid in d.regions) if (g.regions[rid]) Object.assign(g.regions[rid], d.regions[rid]);
    buildAdjacency(g); // this.adj(鐵路/航運相鄰)+ this.planeAdj(含跨洋航線的完整圖)
    g.players = d.players.map(p => ({
      ...p, intel: p.intel || [], strategy: p.strategy || null,
      turnFlags: p.turnFlags || emptyTurnFlags(),
      char: CHARACTERS.find(c => c.id === p.charId),
      faction: CHARACTERS.find(c => c.id === p.charId).faction,
    }));
    g.hasTW = g.players.some(p => p.faction === 'TW');
    g.deck = d.deck; g.discardPile = d.discardPile;
    g.tier4Deck = d.tier4Deck || []; g.tier5Deck = d.tier5Deck || [];
    g.eventDeck = d.eventDeck; g.activeEvent = d.activeEvent;
    g.tech = d.tech; g.round = d.round; g.turnIdx = d.turnIdx;
    g.startLead = d.startLead ?? (d.tech.US - d.tech.CN);
    g.twSupport = d.twSupport; g.twRevealed = d.twRevealed;
    g.twChosen = d.twChosen ?? !!d.twSupport;
    g.twPivoted = d.twPivoted || false;
    g.chipReserve = d.chipReserve;
    g.phase = d.phase || 'play';
    g.tradeOffers = d.tradeOffers || [];
    g.tradeReady = d.tradeReady || [];
    g.tradeOfferCount = d.tradeOfferCount || {};
    g.tradeDone = d.tradeDone || [];
    g.nextOfferId = d.nextOfferId || 1;
    g.log = d.log;
    g.fx = []; g._fxSeq = 0; // 特效饋送是 transient,不隨存檔還原
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
          tech: c.tech, effTech: this.techValueOf(p, c, p.pos), techBreak: this.techValueParts(p, c, p.pos),
          def: c.def, trade: c.trade, special: c.special,
          myCost: this.developCostFor(p, c), playMsg: chk.ok ? null : chk.msg,
        };
      }),
      turnFlags: { ...p.turnFlags },
      forfeitGain: this.forfeitGainOf(p),
      techBonus: this.techBonusOf(p),
      incomeBreak: this.incomeParts(p),
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
      // 捨牌升階(換 4/5 階卡)
      const t4count = p.hand.filter(c => c.kind === 'tech' && c.tier === 4).length;
      priv.cardUpgrade = {
        ap: RULES.cardUpgradeAp,
        sum: RULES.tier4DiscardSum,
        need5: RULES.tier5DiscardCount,
        pool4: this.tier4Deck.length,
        pool5: this.tier5Deck.length,
        can4: p.ap >= RULES.cardUpgradeAp && this.tier4Deck.length > 0 && this.canFormTierSum(p, RULES.tier4DiscardSum),
        can5: p.ap >= RULES.cardUpgradeAp && this.tier5Deck.length > 0 && t4count >= RULES.tier5DiscardCount,
      };
      priv.moveTargets = REGIONS
        .filter(r => r.id !== p.pos && this.canMoveTo(r.id))
        .map(r => {
          const mc = this.moveCostTo(p, r.id);
          return { regionId: r.id, oil: mc.oil, plane: mc.plane, free: mc.free };
        });
      // 盟友改建:同陣營他人被作戰卡 debuff 的卡(可用 ≥ 該階手牌科技卡改建之,折舊返還原 owner)
      priv.rescueTargets = this.allyRescueTargetsAt(p, p.pos).map(c => ({
        uid: c.uid, ownerId: c.owner, ownerName: this.players[c.owner].name,
        name: c.name, cat: c.cat, tier: c.tier,
        deprec: resStr(splitCost(Math.floor((c.cost || 0) * RULES.depreciationRate), this.ratioOf(c))),
      }));
    }
    return priv;
  }
}
