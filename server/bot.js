// ============ AI 玩家(啟發式機器人) ============
import { RULES, TECH_CATEGORIES } from '../public/js/data.js';

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/**
 * 執行 AI 的「一步」行動。回傳 false 表示已結束回合。
 * 由伺服器以計時器逐步呼叫,讓人類玩家看得到 AI 的動作。
 */
export function botStep(g) {
  if (g.over) return false;
  const p = g.cur();

  // 待選研發卡:挑性價比最高且付得起的
  if (g.pendingOffer && g.pendingOffer.playerId === p.id) {
    let best = -1, bestScore = -1;
    g.pendingOffer.cards.forEach((c, i) => {
      const cost = g.developCostFor(p, c);
      if (p.capital < cost) return;
      const score = (c.tech * 2 + c.trade * 1.5 + c.def * 0.8 + (c.special ? 3 : 0)) / Math.max(1, cost);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    g.doDevelopPick(best);
    return true;
  }

  // 台灣 AI:儲備夠多或時間不多就表態;錢夠就加入終結遊戲
  if (p.faction === 'TW' && p.ap > 0) {
    if (g.twRevealed && !g.twJoined && p.capital >= RULES.twJoinCost + 10) {
      g.doJoin();
      return !g.over;
    }
    const revealRound = g.players.length > 5 ? 8 : 7;
    if (!g.twRevealed && (g.chipReserve >= 4 || g.round >= revealRound)) {
      g.doReveal();
      return !g.over;
    }
  }

  if (p.ap <= 0) { g.endTurn(); return false; }

  // 1. 有好目標就打作戰卡(優先打掉高科技力的卡)
  const opsOrder = ['spy2', 'steal2', 'spy1', 'steal1'];
  for (const type of opsOrder) {
    const idx = p.hand.indexOf(type);
    if (idx < 0) continue;
    const cost = g.opsCostFor(p, type);
    if (p.capital < cost + 6) continue; // 留點老本
    const targets = g.cardTargets(type);
    if (!targets.length) continue;
    const best = targets.reduce((a, b) => (b.tech > a.tech ? b : a));
    if (best.tech >= 2) {
      const r = g.doPlayCard(idx, best);
      return r.ok ? !g.over : true;
    }
  }
  // 假新聞:手牌快滿時丟出去封鎖敵人最多卡的區域
  for (const type of ['fake1', 'fake2']) {
    const idx = p.hand.indexOf(type);
    if (idx < 0 || p.hand.length < RULES.handLimit - 1) continue;
    const cost = g.opsCostFor(p, type);
    if (p.capital < cost) continue;
    const targets = g.cardTargets(type);
    if (targets.length) { g.doPlayCard(idx, rand(targets)); return !g.over; }
  }

  // 2. 研發(優先擅長領域;偶爾跨領域補短板)
  const chk = g.developCheck();
  if (chk.ok && p.capital >= 8) {
    let cat = g.specialtyOf(p);
    if (Math.random() < 0.25) {
      const side = g.secretSideOf(p);
      cat = side === 'CN' && Math.random() < 0.5 ? 'hardware' : rand(Object.keys(TECH_CATEGORIES));
    }
    if (g.techDecks[cat].length + g.techDiscards[cat].length === 0) cat = g.specialtyOf(p);
    const r = g.doDevelopStart(cat);
    if (r.ok) return true;
  }

  // 3. 手牌少且有錢就抽卡
  if (p.hand.length < 3 && p.capital >= g.drawCost(p) + 12 && p.hand.length < RULES.handLimit) {
    const r = g.doDraw();
    if (r.ok) return true;
  }

  // 4. 這區蓋不了就移動到有空位的相鄰區
  if (!chk.ok) {
    const options = g.adj[p.pos].filter(rid => {
      if (!g.canMoveTo(rid)) return false;
      const r = g.regions[rid];
      return r.blockedUntilRound <= g.round &&
        r.cards.length < RULES.maxCardsPerRegion &&
        r.cards.filter(c => c.owner === p.id).length < RULES.maxOwnCardsPerRegion;
    });
    if (options.length) { g.doMove(rand(options)); return true; }
  }

  g.endTurn();
  return false;
}
