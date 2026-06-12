// 無頭模擬:隨機跑完整局,驗證邏輯不會崩潰
import { Game } from '../server/game.js';
import { botStep } from '../server/bot.js';
import { RES_KEYS, REGIONS, RULES } from '../public/js/data.js';

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
    while (!g.over && guard++ < 8000) {
      if (g.phase === 'trade') {
        // 隨機丟一個提案再全員結束交易
        if (Math.random() < 0.3 && g.players.length >= 2) {
          const a = Math.floor(Math.random() * g.players.length);
          let b = (a + 1) % g.players.length;
          g.doTradeOffer(a, b, { money: 1, power: 0, oil: 0 }, { money: 0, power: 1, oil: 0 });
          const offer = g.tradeOffers[0];
          if (offer) g.doTradeRespond(offer.toId, offer.id, Math.random() < 0.5);
        }
        for (const q of g.players) g.doTradeReady(q.id);
        continue;
      }
      const p = g.cur();
      const acts = ['move', 'plane', 'playTech', 'draw', 'playOps', 'forfeit', 'exchange', 'upgrade', 'end', 'end'];
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
      } else if (a === 'forfeit') {
        g.doForfeit(rand(['tech', 'ops', 'move']));
      } else if (a === 'exchange') {
        g.doExchange(rand(['power', 'oil']), 1 + Math.floor(Math.random() * 5));
      } else if (a === 'upgrade') {
        g.doUpgradeCity();
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
  if (g.doPlayTech(1).ok) throw new Error('建造冷卻/一城一卡:同城立即再蓋應失敗');
  g.regions[p.pos].builtRound = -10; // 跳過一年建造冷卻,單測升階替換
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

// 放棄權利驗證(收益 = forfeitBase + 陣營科技力紅利)
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const p = g.cur();
  const gain = g.forfeitGainOf(p);
  if (gain !== RULES.forfeitBase + Math.floor(g.tech[p.faction] / RULES.techIncomeDivisor))
    throw new Error('放棄收益計算錯誤');
  const pw = p.res.power, mo = p.res.money, oil = p.res.oil;
  if (!g.doForfeit('tech').ok) throw new Error('放棄科技失敗');
  if (p.res.power !== pw + gain) throw new Error('放棄科技未獲得電力');
  if (g.doForfeit('tech').ok) throw new Error('同回合不可重複放棄科技');
  const ti = p.hand.findIndex(c => c.kind === 'tech');
  if (ti >= 0) {
    p.res = { money: 999, power: 999, oil: 999 };
    if (g.doPlayTech(ti).ok) throw new Error('放棄後仍能打出科技卡');
    p.res = { money: mo, power: pw + gain, oil };
  }
  if (!g.doForfeit('ops').ok) throw new Error('放棄作戰失敗');
  if (p.res.money !== mo + gain) throw new Error('放棄作戰未獲得金錢');
  if (!g.doForfeit('move').ok) throw new Error('放棄行動失敗');
  if (p.res.oil !== oil + gain) throw new Error('放棄行動未獲得石油');
  if (g.canMoveTo(g.adj[p.pos][0])) throw new Error('放棄行動後仍能移動');
  console.log('✅ 放棄權利換資源 通過');
}

// 牆國作戰卡半價 / 金錢兌換 / 城市等級 / 交易環節驗證
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const sum = c => RES_KEYS.reduce((s, k) => s + c[k], 0);
  const us = g.players.find(q => q.faction === 'US');
  const cn = g.players.find(q => q.faction === 'CN');
  if (sum(g.opsCostFor(cn, 'spy1')) !== Math.ceil(sum(g.opsCostFor(us, 'spy1')) / 2))
    throw new Error('牆國作戰卡未半價');

  // 金錢兌換:2💰=1,每回合一次,不可反向
  const p = g.cur();
  p.res = { money: 10, power: 0, oil: 0 };
  if (g.doExchange('money', 1).ok) throw new Error('不可換金錢');
  if (!g.doExchange('power', 3).ok) throw new Error('兌換失敗');
  if (p.res.money !== 4 || p.res.power !== 3) throw new Error('兌換結果錯誤');
  if (g.doExchange('oil', 1).ok) throw new Error('每回合只能兌換一次');

  // 城市等級限制與升級
  p.res = { money: 999, power: 999, oil: 999 };
  const lv = g.regions[p.pos].level;
  const high = g.deck.find(c => c.kind === 'tech' && c.tier === lv + 1);
  if (g.canPlayTech(p, high).ok) throw new Error('城市等級不足仍可建造');
  if (!g.doUpgradeCity().ok) throw new Error('升級城市失敗');
  if (g.regions[p.pos].level !== lv + 1) throw new Error('升級後等級錯誤');
  if (!g.canPlayTech(p, high).ok) throw new Error('升級後應可建造對應階級');

  // 交易環節:任意比值交換;每人最多提案 3 次、成交 1 次(含接受)
  g.phase = 'trade';
  g.tradeReady = [];
  g.tradeOfferCount = {};
  g.tradeDone = [];
  const a = g.players[0], b = g.players[1], c = g.players[2];
  a.res = { money: 10, power: 0, oil: 0 };
  b.res = { money: 0, power: 10, oil: 0 };
  c.res = { money: 10, power: 10, oil: 10 };
  // 提案上限:c 對 a 提 3 次都被婉拒,第 4 次應失敗
  for (let i = 0; i < 3; i++) {
    const r = g.doTradeOffer(2, 0, { money: 1, power: 0, oil: 0 }, { money: 2, power: 0, oil: 0 });
    if (!r.ok) throw new Error(`第 ${i + 1} 次提案應成功:` + r.msg);
    g.doTradeRespond(0, g.tradeOffers[0].id, false);
  }
  if (g.doTradeOffer(2, 0, { money: 1, power: 0, oil: 0 }, { money: 1, power: 0, oil: 0 }).ok)
    throw new Error('第 4 次提案應失敗(每人最多 3 次)');
  // 成交一次
  const ro = g.doTradeOffer(0, 1, { money: 6, power: 0, oil: 0 }, { money: 0, power: 2, oil: 0 });
  if (!ro.ok) throw new Error('交易提案失敗:' + ro.msg);
  const offer = g.tradeOffers[0];
  if (!offer) throw new Error('提案未建立');
  if (!g.doTradeRespond(1, offer.id, true).ok) throw new Error('接受交易失敗');
  if (a.res.money !== 4 || a.res.power !== 2 || b.res.money !== 6 || b.res.power !== 8)
    throw new Error('交易結算錯誤');
  // 成交後雙方都不能再交易(含接受)
  if (g.doTradeOffer(0, 2, { money: 1, power: 0, oil: 0 }, { money: 1, power: 0, oil: 0 }).ok)
    throw new Error('已成交者不應能再提案');
  if (g.doTradeOffer(2, 1, { money: 1, power: 0, oil: 0 }, { money: 1, power: 0, oil: 0 }).ok)
    throw new Error('不應能對已成交者提案');
  const roundBefore = g.round;
  for (const q of g.players) g.doTradeReady(q.id);
  if (g.phase !== 'play' || g.round !== roundBefore + 1) throw new Error('交易結束後未進入下一季');
  console.log('✅ 牆國半價/兌換/城市等級/交易環節(提案3次/成交1次) 通過');
}

// 作戰卡兩格射程驗證
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const p = g.cur(); // jensen 在矽谷
  const enemy = g.players.find(q => q.faction === 'CN');
  const mk = (uid, rid) => g.regions[rid].cards.push({
    uid, kind: 'tech', cat: 'ai', tier: 1, name: `測試${uid}`, tech: 1, def: 0, trade: 0,
    owner: enemy.id, techApplied: 1, special: null,
  });
  mk(9001, 'shanghai'); // 矽谷 → 新竹 → 上海 = 2 格內
  mk(9002, 'beijing');  // 3 格外
  const uids = g.cardTargets('spy2').map(t => t.uid);
  if (!uids.includes(9001)) throw new Error('兩格內目標應合法');
  if (uids.includes(9002)) throw new Error('兩格外目標應不合法');
  if (g.cardTargets('fake1').some(t => t.regionId === 'beijing')) throw new Error('假新聞超出射程應不合法');
  console.log('✅ 作戰卡兩格射程 通過');
}

// 科技力點數制驗證(初始值/門檻/日韓計入)
{
  const g = new Game([
    { charId: 'musk' }, { charId: 'jensen' }, { charId: 'jack' },
    { charId: 'ren' }, { charId: 'tsmc' }, { charId: 'toyota' },
  ]);
  if (g.tech.US !== 200 || g.tech.CN !== 100 || g.tech.TW !== 150 || g.tech.JP !== 150 || g.tech.KR !== 150)
    throw new Error('初始科技力錯誤:' + JSON.stringify(g.tech));
  if (g.usThreshold() !== 10 * RULES.pointsPerYear) throw new Error('米國勝利門檻應為 200 點');
  const jp = g.players.find(q => q.faction === 'JP');
  g.applyTechGain(jp, 10);
  if (g.tech.JP !== 160 || g.tech.US !== 210) throw new Error('日本科技應同時計入本國與米國');
  g.removeTechGain(jp, 10);
  if (g.tech.JP !== 150 || g.tech.US !== 200) throw new Error('扣回不對稱');
  console.log('✅ 科技力點數制(200/100/150,1年=20點) 通過');
}

// 存檔/讀檔 roundtrip
{
  const seats = [{ charId: 'jensen', isAI: true }, { charId: 'ren', isAI: true }, { charId: 'tsmc', isAI: true }];
  const g = new Game(seats);
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
