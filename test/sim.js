// 無頭模擬:隨機跑完整局,驗證邏輯不會崩潰
import { Game } from '../server/game.js';
import { botStep } from '../server/bot.js';
import { RES_KEYS, REGIONS } from '../public/js/data.js';

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const seatSets = [
  ['jensen', 'ren'],                 // 雙人米牆對決(無台灣)
  ['jensen', 'ren', 'tsmc'],
  ['musk', 'jensen', 'jack', 'liang', 'tsmc'],
  ['musk', 'jensen', 'zuck', 'jack', 'ren', 'tsmc', 'toyota', 'lee'],
];

for (const seats of seatSets) {
  for (let trial = 0; trial < 30; trial++) {
    const g = new Game(seats.map(c => ({ charId: c, playerName: c })));
    let guard = 0;
    while (!g.over && guard++ < 6000) {
      const p = g.cur();
      const acts = ['move', 'plane', 'playTech', 'draw', 'playOps', 'discard', 'end', 'end'];
      if (p.faction === 'TW') acts.push('reveal', 'join');
      const a = rand(acts);
      if (a === 'move') {
        const t = g.adj[p.pos].filter(r => g.canMoveTo(r));
        if (t.length) g.doMove(rand(t));
      } else if (a === 'plane') {
        const t = REGIONS.map(r => r.id).filter(r => g.canMoveTo(r));
        if (t.length) g.doMove(rand(t));
      } else if (a === 'playTech') {
        const idxs = p.hand.map((c, i) => [c, i]).filter(([c]) => c.kind === 'tech');
        if (idxs.length) g.doPlayTech(rand(idxs)[1]);
      } else if (a === 'draw') {
        g.doDraw();
      } else if (a === 'playOps') {
        const idxs = p.hand.map((c, i) => [c, i]).filter(([c]) => c.kind === 'ops');
        if (idxs.length) {
          const [c, idx] = rand(idxs);
          const targets = g.cardTargets(c.type);
          if (targets.length) g.doPlayCard(idx, rand(targets));
        }
      } else if (a === 'discard') {
        if (p.hand.length >= 2 && Math.random() < 0.5) {
          const ti = p.hand.findIndex(c => c.kind === 'tech');
          const oi = p.hand.findIndex(c => c.kind === 'ops');
          if (ti >= 0 && oi >= 0) g.doDiscard([ti, oi]);
        } else if (p.hand.length) {
          g.doDiscard([Math.floor(Math.random() * p.hand.length)], rand(RES_KEYS));
        }
      } else if (a === 'reveal') {
        g.doReveal();
      } else if (a === 'join') {
        g.doJoin();
      } else {
        g.endTurn();
      }
      g.publicState();
      g.privateStateFor(g.turnIdx);
      for (const q of g.players)
        for (const k of RES_KEYS)
          if (q.res[k] < 0) throw new Error(`資源變負數:${q.name} ${k}=${q.res[k]}`);
    }
    if (guard >= 6000) throw new Error('疑似無限循環!');
    if (!g.over || !g.result) throw new Error('遊戲未正常結束');
  }
  console.log(`✅ ${seats.length} 人隨機局 ×30 通過`);
}

// 規則重點驗證:一城一卡/升階替換/折舊
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const p = g.cur();
  p.res = { money: 999, power: 999, oil: 999 };
  // 塞一張 1 階與一張 3 階同類科技卡進手牌
  const t1 = g.deck.find(c => c.kind === 'tech' && c.tier === 1);
  const t3 = g.deck.find(c => c.kind === 'tech' && c.tier === 3 && c.cat === t1.cat);
  const t1b = g.deck.find(c => c.kind === 'tech' && c.tier === 1 && c.uid !== t1.uid);
  p.hand = [t1, t3, t1b];
  if (!g.doPlayTech(0).ok) throw new Error('部署 1 階失敗');
  if (g.doPlayTech(1).ok) throw new Error('一城一卡:同城再蓋低/同階應失敗');
  p.ap = 3;
  const costFull = g.developCostFor(p, t3);
  const r2 = g.doPlayTech(0); // t3(升階替換,同類折舊)
  if (!r2.ok) throw new Error('升階替換失敗:' + r2.msg);
  const cards = g.regions[p.pos].cards.filter(c => c.owner === p.id);
  if (cards.length !== 1 || cards[0].tier !== 3) throw new Error('替換後場上應只剩 3 階卡');
  console.log('✅ 一城一卡/升階替換/折舊 通過', JSON.stringify(costFull));
}

// 敵對地盤加倍驗證
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const us = g.players.find(q => q.faction === 'US');
  const card = g.deck.find(c => c.kind === 'tech' && c.cat !== 'hardware'); // 避開角色折扣干擾
  const costHome = g.developCostFor(us, card, 'sv');
  const costRival = g.developCostFor(us, card, 'beijing');
  const sum = c => RES_KEYS.reduce((s, k) => s + c[k], 0);
  if (sum(costRival) < sum(costHome) * 2 - 2) throw new Error(`敵對地盤未加倍:${sum(costHome)} → ${sum(costRival)}`);
  console.log('✅ 敵對地盤費用加倍 通過');
}

// 存檔/讀檔 roundtrip
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  for (let i = 0; i < 10; i++) botStep(g);
  const d = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = Game.fromSave(d);
  g2.publicState();
  g2.privateStateFor(g2.turnIdx);
  let guard = 0;
  while (!g2.over && guard++ < 3000) botStep(g2);
  if (!g2.over) throw new Error('讀檔後對局未能跑完');
  console.log('✅ 存檔/讀檔 roundtrip 通過');
}

// AI 機器人全自動對局
for (const seats of seatSets) {
  const tally = {};
  for (let trial = 0; trial < 20; trial++) {
    const g = new Game(seats.map(c => ({ charId: c, playerName: c, isAI: true })));
    let guard = 0;
    while (!g.over && guard++ < 3000) botStep(g);
    if (!g.over) throw new Error('AI 對局未結束');
    const champ = g.players[g.result.champion].name;
    tally[champ] = (tally[champ] || 0) + 1;
  }
  console.log(`✅ ${seats.length} 人 AI 全自動局 ×20 通過,冠軍分布:`,
    Object.entries(tally).map(([k, v]) => `${k}×${v}`).join(' '));
}
console.log('全部模擬通過 🎉');
