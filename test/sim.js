// 無頭模擬:隨機跑完整局,驗證邏輯不會崩潰
import { Game } from '../server/game.js';
import { botStep } from '../server/bot.js';
import { TECH_CATEGORIES } from '../public/js/data.js';

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
const CATS = Object.keys(TECH_CATEGORIES);

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
    while (!g.over && guard++ < 4000) {
      const p = g.cur();
      const acts = ['move', 'develop', 'draw', 'play', 'end', 'end'];
      if (p.faction === 'TW') acts.push('reveal', 'join');
      const a = rand(acts);
      if (a === 'move') {
        const t = g.adj[p.pos].filter(r => g.canMoveTo(r));
        if (t.length) g.doMove(rand(t));
      } else if (a === 'develop') {
        const r = g.doDevelopStart(Math.random() < 0.5 ? g.specialtyOf(p) : rand(CATS));
        if (r.ok && g.pendingOffer) {
          const offer = g.pendingOffer.cards;
          const affordable = offer.map((c, i) => [c, i]).filter(([c]) => p.capital >= g.developCostFor(p, c));
          g.doDevelopPick(affordable.length ? rand(affordable)[1] : -1);
        }
      } else if (a === 'draw') {
        g.doDraw();
      } else if (a === 'play') {
        if (p.hand.length) {
          const idx = Math.floor(Math.random() * p.hand.length);
          const targets = g.cardTargets(p.hand[idx]);
          if (targets.length) g.doPlayCard(idx, rand(targets));
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
    }
    if (guard >= 4000) throw new Error('疑似無限循環!');
    if (!g.over || !g.result) throw new Error('遊戲未正常結束');
  }
  console.log(`✅ ${seats.length} 人隨機局 ×30 通過`);
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
