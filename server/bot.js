// ============ AI 玩家(啟發式機器人) ============
import { RULES, RES_KEYS, OPS_CARDS } from '../public/js/data.js';

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function totalRes(c) { return RES_KEYS.reduce((s, k) => s + (c[k] || 0), 0); }
function canPay(p, c) { return RES_KEYS.every(k => p.res[k] >= (c[k] || 0)); }

/**
 * 執行 AI 的「一步」行動。回傳 false 表示已結束回合。
 * 由伺服器以計時器逐步呼叫,讓人類玩家看得到 AI 的動作。
 */
export function botStep(g) {
  if (g.over) return false;
  if (g.phase === 'trade') return false; // AI 在交易環節自動準備完畢,等人類
  const p = g.cur();

  // 台灣 AI:儲備夠多或時間不多就表態;資源夠就加入終結遊戲
  if (p.faction === 'TW' && p.ap > 0) {
    if (g.twRevealed && !g.twJoined && canPay(p, RULES.twJoinCost) && totalRes(p.res) >= totalRes(RULES.twJoinCost) + 10) {
      g.doJoin();
      return !g.over;
    }
    const revealRound = g.players.length > 5 ? 10 : 9;
    if (!g.twRevealed && (g.chipReserve >= 4 || g.round >= revealRound)) {
      g.doReveal();
      return !g.over;
    }
  }

  if (p.ap <= 0) { g.endTurn(); return false; }

  // 0. 金錢換資源(每回合一次):缺電/缺油且金錢充裕就兌換
  if (!p.turnFlags.exchanged && p.res.money >= 12) {
    const scarcer = p.res.power <= p.res.oil ? 'power' : 'oil';
    if (p.res[scarcer] <= 3) {
      const r = g.doExchange(scarcer, 3);
      if (r.ok) return true;
    }
  }

  // 0.5 手上有因城市等級不足而蓋不了的卡 → 升級城市
  const lvlBlocked = p.hand.some(c => c.kind === 'tech'
    && c.tier === g.regions[p.pos].level + 1
    && canPay(p, g.developCostFor(p, c)));
  if (lvlBlocked && p.ap >= 2 && g.regions[p.pos].level < RULES.cityMaxLevel
    && p.res.power >= g.upgradeCostAt(p, p.pos) + 4) {
    const r = g.doUpgradeCity();
    if (r.ok) return true;
  }

  // 1. 打出手上最划算且付得起的科技卡
  let bestIdx = -1, bestScore = -1;
  p.hand.forEach((c, i) => {
    if (p.turnFlags.forfeitTech || c.kind !== 'tech') return;
    if (!g.canPlayTech(p, c).ok) return;
    const cost = g.developCostFor(p, c);
    if (!canPay(p, cost)) return;
    const score = (c.tech * 0.5 + c.trade * 1.5 + c.def * 0.8 + (c.special ? 3 : 0)
      + (c.cat === g.specialtyOf(p) ? 2 : 0)) / Math.max(1, totalRes(cost));
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  if (bestIdx >= 0) {
    const r = g.doPlayTech(bestIdx);
    if (r.ok) return !g.over;
  }

  // 2. 有好目標就打作戰卡(優先打掉/竊取高科技力的卡)
  const opsOrder = p.turnFlags.forfeitOps ? [] : ['spy2', 'steal2', 'spy1', 'steal1'];
  for (const type of opsOrder) {
    const idx = p.hand.findIndex(c => c.kind === 'ops' && c.type === type);
    if (idx < 0) continue;
    const cost = g.opsCostFor(p, type);
    if (!canPay(p, cost) || totalRes(p.res) < totalRes(cost) + 6) continue; // 留點老本
    const targets = g.cardTargets(type);
    if (!targets.length) continue;
    const best = targets.reduce((a, b) => (b.tech > a.tech ? b : a));
    if (best.tech >= 10) {
      const r = g.doPlayCard(idx, best);
      return r.ok ? !g.over : true;
    }
  }
  // 假新聞:手牌快滿時丟出去加重敵人發展成本
  for (const type of ['fake1', 'fake2']) {
    if (p.turnFlags.forfeitOps) break;
    const idx = p.hand.findIndex(c => c.kind === 'ops' && c.type === type);
    if (idx < 0 || p.hand.length < RULES.handLimit - 1) continue;
    if (!canPay(p, g.opsCostFor(p, type))) continue;
    const targets = g.cardTargets(type);
    if (targets.length) { g.doPlayCard(idx, rand(targets)); return !g.over; }
  }

  // 3. 放棄用不到的權利換資源/卡片
  const f = p.turnFlags;
  const anyTechPlayable = p.hand.some(c => c.kind === 'tech'
    && g.canPlayTech(p, c).ok && canPay(p, g.developCostFor(p, c)));
  const anyTechNearby = anyTechPlayable || p.hand.some(c => c.kind === 'tech'
    && canPay(p, g.developCostFor(p, c))
    && g.adj[p.pos].some(rid => g.canPlayTech(p, c, rid).ok));
  if (!f.playedTech && !f.forfeitTech && !anyTechNearby) {
    if (g.doForfeit('tech').ok) return true;
  }
  const anyOpsUseful = p.hand.some(c => c.kind === 'ops' && g.cardTargets(c.type).length
    && canPay(p, g.opsCostFor(p, c.type)));
  if (!f.playedOps && !f.forfeitOps && !anyOpsUseful) {
    if (g.doForfeit('ops').ok) return true;
  }
  if (!f.moved && !f.forfeitMove && anyTechPlayable) {
    if (g.doForfeit('move').ok) return true; // 不需要移動就換石油
  }

  // 4. 手牌少且付得起就抽卡
  if (p.hand.length < 4 && p.hand.length < RULES.handLimit) {
    const dc = g.drawCost(p);
    if (canPay(p, dc) && totalRes(p.res) >= totalRes(dc) + 10) {
      const r = g.doDraw();
      if (r.ok) return true;
    }
  }

  // 5. 這城蓋不了就移動到能蓋的相鄰城市(省油,不搭飛機)
  const anyPlayable = p.hand.some(c => c.kind === 'tech' && g.canPlayTech(p, c).ok);
  if (!anyPlayable && p.hand.some(c => c.kind === 'tech')) {
    const options = g.adj[p.pos].filter(rid => {
      if (!g.canMoveTo(rid)) return false;
      return p.hand.some(c => c.kind === 'tech' && g.canPlayTech(p, c, rid).ok);
    });
    if (options.length) { g.doMove(rand(options)); return true; }
  }

  g.endTurn();
  return false;
}
