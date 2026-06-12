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

  // 1. 打出手上最划算且付得起的科技卡
  let bestIdx = -1, bestScore = -1;
  p.hand.forEach((c, i) => {
    if (c.kind !== 'tech') return;
    if (!g.canPlayTech(p, c).ok) return;
    const cost = g.developCostFor(p, c);
    if (!canPay(p, cost)) return;
    const score = (c.tech * 2 + c.trade * 1.5 + c.def * 0.8 + (c.special ? 3 : 0)
      + (c.cat === g.specialtyOf(p) ? 2 : 0)) / Math.max(1, totalRes(cost));
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  if (bestIdx >= 0) {
    const r = g.doPlayTech(bestIdx);
    if (r.ok) return !g.over;
  }

  // 2. 有好目標就打作戰卡(優先打掉/竊取高科技力的卡)
  const opsOrder = ['spy2', 'steal2', 'spy1', 'steal1'];
  for (const type of opsOrder) {
    const idx = p.hand.findIndex(c => c.kind === 'ops' && c.type === type);
    if (idx < 0) continue;
    const cost = g.opsCostFor(p, type);
    if (!canPay(p, cost) || totalRes(p.res) < totalRes(cost) + 6) continue; // 留點老本
    const targets = g.cardTargets(type);
    if (!targets.length) continue;
    const best = targets.reduce((a, b) => (b.tech > a.tech ? b : a));
    if (best.tech >= 2) {
      const r = g.doPlayCard(idx, best);
      return r.ok ? !g.over : true;
    }
  }
  // 假新聞:手牌快滿時丟出去加重敵人發展成本
  for (const type of ['fake1', 'fake2']) {
    const idx = p.hand.findIndex(c => c.kind === 'ops' && c.type === type);
    if (idx < 0 || p.hand.length < RULES.handLimit - 1) continue;
    if (!canPay(p, g.opsCostFor(p, type))) continue;
    const targets = g.cardTargets(type);
    if (targets.length) { g.doPlayCard(idx, rand(targets)); return !g.over; }
  }

  // 3. 資源乾涸:棄卡換資源(科技+作戰各一張優先,換三種)
  const scarce = RES_KEYS.filter(k => p.res[k] < 3);
  if (scarce.length && p.hand.length >= 2) {
    const techIdx = p.hand.findIndex(c => c.kind === 'tech');
    const opsIdx = p.hand.findIndex(c => c.kind === 'ops');
    let r;
    if (techIdx >= 0 && opsIdx >= 0 && scarce.length >= 2) r = g.doDiscard([techIdx, opsIdx]);
    else r = g.doDiscard([p.hand.length - 1], scarce[0]);
    if (r.ok) return true;
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
