// 無頭模擬:隨機跑完整局,驗證邏輯不會崩潰
import { Game } from '../server/game.js';
import { botStep } from '../server/bot.js';
import { RES_KEYS, REGIONS, RULES, CHARACTERS } from '../public/js/data.js';

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
// 全部流通中的卡(開局時:公共牌庫 + 各家手牌 = 完整 1~3 階公牌;另含獨立的 4/5 階疊)。
// 公牌變小後,直接 g.deck.find 指定類別/階級可能抽不到,改從完整流通池挑代表卡。
function pool(g) { return [...g.deck, ...g.players.flatMap(p => p.hand), ...g.tier4Deck, ...g.tier5Deck]; }

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
      const acts = ['move', 'plane', 'playTech', 'upgradeCard', 'playOps', 'forfeit', 'exchange', 'upgrade', 'end', 'end'];
      if (p.faction === 'TW') acts.push('reveal');
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
      } else if (a === 'upgradeCard') {
        // 隨機嘗試捨牌升階(2 張 4 階 → 5 階;或加總 6 的兩張 → 4 階)
        const t4 = p.hand.map((c, i) => [c, i]).filter(([c]) => c.kind === 'tech' && c.tier === 4).map(([, i]) => i);
        if (t4.length >= 2) g.doUpgradeCard(t4.slice(0, 2), 5);
        else {
          const lows = p.hand.map((c, i) => [c, i]).filter(([c]) => c.kind === 'tech' && c.tier <= 3);
          outer: for (let i = 0; i < lows.length; i++)
            for (let j = i + 1; j < lows.length; j++)
              if (lows[i][0].tier + lows[j][0].tier === 6) { g.doUpgradeCard([lows[i][1], lows[j][1]], 4); break outer; }
        }
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
  const P = pool(g);
  const t1 = P.find(c => c.kind === 'tech' && c.tier === 1);
  const t3 = P.find(c => c.kind === 'tech' && c.tier === 3 && c.cat === t1.cat);
  const t1b = P.find(c => c.kind === 'tech' && c.tier === 1 && c.uid !== t1.uid);
  p.hand = [t1, t3, t1b];
  if (!g.doPlayTech(0).ok) throw new Error('部署 1 階失敗');
  if (g.doPlayTech(1).ok) throw new Error('建造冷卻/一城一卡:同城立即再蓋應失敗');
  g.regions[p.pos].builtRound = -10; // 跳過一年建造冷卻,單測升階替換
  if (g.doPlayTech(1).ok) throw new Error('一城一卡:同城再蓋低/同階應失敗');
  g.regions[p.pos].level = 3; // 全城 Lv.2 起跳;手動升到 Lv.3 以測 3 階升階替換
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
  const card = pool(g).find(c => c.kind === 'tech' && c.cat !== 'hardware'); // 避開角色折扣干擾
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
  const high = pool(g).find(c => c.kind === 'tech' && c.tier === lv + 1); // 4/5 階已移出公共牌庫
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

// 作戰卡 debuff:間諜減科技力(不拆卡)/竊取收益(每回合轉移)/假新聞折舊陷阱(改建時施法者得利)
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  g.activeEvent = null; // 排除隨機事件對收入(竊取守恆)計算的干擾
  const us = g.players.find(q => q.faction === 'US'); // jensen 在矽谷
  const cn = g.players.find(q => q.faction === 'CN');
  const sum = c => RES_KEYS.reduce((s, k) => s + c[k], 0);
  g.turnIdx = us.id; us.ap = 3; us.res = { money: 99, power: 99, oil: 99 };

  // ---- 間諜:削科技力但卡片仍在 ----
  g.regions.shanghai.cards.push({ uid: 90001, kind: 'tech', cat: 'ai', tier: 3, name: '科技卡',
    tech: 20, def: 0, trade: 6, cost: 19, owner: cn.id, techApplied: 20, special: null });
  const cnTechBefore = g.tech.CN;
  us.hand = [{ kind: 'ops', type: 'spy2' }];
  const spyT = g.cardTargets('spy2').find(t => t.uid === 90001);
  if (!spyT) throw new Error('間諜應有合法目標');
  if (!g.doPlayCard(0, spyT).ok) throw new Error('間諜施放失敗');
  const c1 = g.regions.shanghai.cards.find(c => c.uid === 90001);
  if (!c1) throw new Error('間諜不應拆卡,卡片應仍在場');
  if (c1.debuff?.type !== 'tech' || c1.debuff.val !== 20 || c1.techApplied !== 0)
    throw new Error('間諜 debuff 應削減科技力 20:' + JSON.stringify(c1.debuff));
  if (g.tech.CN !== cnTechBefore - 20) throw new Error('間諜應扣回陣營科技力 20');

  // ---- 竊取:每回合把收益從對手轉給施法者(守恆) ----
  g.regions.hsinchu.cards.push({ uid: 90002, kind: 'tech', cat: 'ai', tier: 3, name: '金流卡',
    tech: 0, def: 0, trade: 9, cost: 19, owner: cn.id, techApplied: 0, special: null });
  us.ap = 3; us.hand = [{ kind: 'ops', type: 'steal2' }];
  const usInc0 = sum(g.incomeOf(us)), cnInc0 = sum(g.incomeOf(cn));
  const stT = g.cardTargets('steal2').find(t => t.uid === 90002);
  if (!stT) throw new Error('竊取應有合法目標');
  if (!g.doPlayCard(0, stT).ok) throw new Error('竊取施放失敗');
  const c2 = g.regions.hsinchu.cards.find(c => c.uid === 90002);
  if (c2?.debuff?.type !== 'drain' || c2.debuff.by !== us.id) throw new Error('竊取應植入 drain debuff');
  const usInc1 = sum(g.incomeOf(us)), cnInc1 = sum(g.incomeOf(cn));
  if (!(usInc1 > usInc0) || !(cnInc1 < cnInc0)) throw new Error('竊取應使施法者收入增加、對手減少');
  if (usInc1 - usInc0 !== cnInc0 - cnInc1) throw new Error('竊取的收益應守恆');

  // ---- 假新聞:折舊陷阱,對手同類改建該卡時,部分折舊資源轉移給施法者 ----
  g.regions.shenzhen.cards.push({ uid: 90003, kind: 'tech', cat: 'ai', tier: 2, name: '陷阱卡',
    tech: 10, def: 0, trade: 3, cost: 12, owner: cn.id, techApplied: 10, special: null });
  g.turnIdx = us.id; us.ap = 3; us.hand = [{ kind: 'ops', type: 'fake1' }];
  const fkT = g.cardTargets('fake1').find(t => t.uid === 90003);
  if (!fkT) throw new Error('假新聞應有合法目標');
  if (!g.doPlayCard(0, fkT).ok) throw new Error('假新聞施放失敗');
  const c3 = g.regions.shenzhen.cards.find(c => c.uid === 90003);
  if (c3?.debuff?.type !== 'leak' || c3.debuff.by !== us.id) throw new Error('假新聞應植入 leak debuff');
  const expectTransfer = c3.debuff.val; // min(floor(12×0.5)=6, potency4×opsDeprecLeak)
  if (expectTransfer <= 0) throw new Error('折舊轉移額應 > 0');
  // 牆國移到深圳同類(AI)改建該卡:部分折舊資源由 cn 轉移給施法者 jensen
  g.turnIdx = cn.id; cn.ap = 3; cn.pos = 'shenzhen';
  cn.res = { money: 999, power: 999, oil: 999 };
  g.regions.shenzhen.level = 3; g.regions.shenzhen.builtRound = -10;
  cn.hand = [{ uid: 90004, kind: 'tech', cat: 'ai', tier: 3, name: '升級卡', tech: 20, def: 0, trade: 4, cost: 19 }];
  const usResBefore = RES_KEYS.reduce((s, k) => s + us.res[k], 0);
  if (!g.doPlayTech(0).ok) throw new Error('牆國同類改建失敗');
  const usResAfter = RES_KEYS.reduce((s, k) => s + us.res[k], 0);
  if (usResAfter - usResBefore !== expectTransfer)
    throw new Error('假新聞應把部分折舊資源轉移給施法者:' + JSON.stringify({ before: usResBefore, after: usResAfter, expectTransfer }));
  console.log('✅ 作戰卡 debuff(間諜減科技力/竊取收益/假新聞折舊資源轉移) 通過');
}

// 科技力點數制驗證(初始值/門檻/日韓計入)
{
  // 6 人 → deckScale=1 → gapMult=1 → 牆國為基準值 techStart.CN
  const g = new Game([
    { charId: 'musk' }, { charId: 'jensen' }, { charId: 'jack' },
    { charId: 'ren' }, { charId: 'tsmc' }, { charId: 'toyota' },
  ]);
  // 6 人 → CN=120,台日韓 = 米牆中間值 round((200+120)/2)=160
  const mid = Math.round((200 + RULES.techStart.CN) / 2);
  if (g.tech.US !== 200 || g.tech.CN !== RULES.techStart.CN || g.tech.TW !== mid || g.tech.JP !== mid || g.tech.KR !== mid)
    throw new Error('初始科技力錯誤(台日韓應為米牆中間值):' + JSON.stringify(g.tech));
  if (g.usThreshold() !== 10 * RULES.pointsPerYear) throw new Error('米國勝利門檻應為 200 點');
  const jp = g.players.find(q => q.faction === 'JP');
  g.applyTechGain(jp, 10);
  if (g.tech.JP !== mid + 10 || g.tech.US !== 210) throw new Error('日本科技應同時計入本國與米國');
  g.removeTechGain(jp, 10);
  if (g.tech.JP !== mid || g.tech.US !== 200) throw new Error('扣回不對稱');
  console.log(`✅ 科技力點數制(200/${RULES.techStart.CN}/台日韓${mid},1年=20點) 通過`);

  // 小局讓分縮放:3 人 deckScale=0.5 → gapMult=0.75 → 開局差距縮小(否則牆國追不上)
  const g3 = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const fullGap = 200 - RULES.techStart.CN;
  const expectGap = Math.round(fullGap * (0.5 + 0.5 * RULES.deckScale[3]));
  if (g3.startLead !== expectGap || g3.tech.CN !== 200 - expectGap)
    throw new Error('小局讓分縮放錯誤:' + JSON.stringify({ startLead: g3.startLead, cn: g3.tech.CN, expectGap }));
  console.log(`✅ 小局讓分縮放(3人開局差距 ${expectGap} 點,而非 ${fullGap}) 通過`);
}

// 終局必分陣營勝負:打滿後不再有「比誰有錢」的商業勝利(僵局以開局讓分線判定)
{
  let commercial = 0;
  for (let t = 0; t < 60; t++) {
    const g = new Game([
      { charId: 'jensen', isAI: true }, { charId: 'ren', isAI: true }, { charId: 'tsmc', isAI: true },
    ]);
    let guard = 0;
    while (!g.over && guard++ < 8000) {
      if (g.phase === 'trade') { for (const q of g.players) g.doTradeReady(q.id); continue; }
      botStep(g);
    }
    if (g.result?.reason?.includes('商業勝利')) commercial++;
  }
  if (commercial > 3) throw new Error(`商業勝利過多(${commercial}/60),終局判定未必分陣營勝負`);
  console.log(`✅ 終局必分陣營勝負(60 局僅 ${commercial} 局落入商業勝利) 通過`);
}

// 台灣:開局可秘密選邊 + 轉向一次(神山儲備折半)
{
  const g = new Game([
    { charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' },
  ]);
  const twId = g.players.findIndex(p => p.faction === 'TW');
  if (g.twSupport !== null) throw new Error('有人類台灣時開局立場應為未定');
  if (!g.doChooseSide(twId, 'US').ok || g.twSupport !== 'US') throw new Error('秘密選邊失敗');
  if (g.doChooseSide(twId, 'CN').ok) throw new Error('選邊後不應能再次直接選邊');
  // 輪到台灣才能轉向
  g.turnIdx = twId; g.players[twId].ap = 3; g.chipReserve = 10;
  if (!g.doPivot().ok || g.twSupport !== 'CN' || g.chipReserve !== 5)
    throw new Error('轉向應改立場並折半神山儲備:' + JSON.stringify({ s: g.twSupport, r: g.chipReserve }));
  if (g.doPivot().ok) throw new Error('整局只能轉向一次');
  console.log('✅ 台灣秘密選邊 + 轉向一次(儲備折半) 通過');
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

// 每個角色起始城市皆不同
{
  const homes = CHARACTERS.map(c => c.home);
  if (new Set(homes).size !== homes.length) throw new Error('角色起始城市有重複:' + homes.join(','));
  for (const c of CHARACTERS)
    if (!REGIONS.find(r => r.id === c.home)) throw new Error(`角色 ${c.id} 的起始城市 ${c.home} 不存在`);
  console.log('✅ 每個角色起始城市皆不同 通過');
}

// 公牌:公共牌庫只含 1/2/3 階;4/5 階各自獨立一疊
{
  const g = new Game([{ charId: 'musk' }, { charId: 'jensen' }, { charId: 'jack' },
    { charId: 'ren' }, { charId: 'tsmc' }, { charId: 'toyota' }]); // 6 人 scale=1,比例精準
  if (g.deck.some(c => c.kind === 'tech' && c.tier > 3)) throw new Error('公牌出現 4/5 階卡');
  if (g.tier4Deck.some(c => c.tier !== 4) || g.tier5Deck.some(c => c.tier !== 5)) throw new Error('高階疊混入錯誤階級');
  // 公牌總量(牌庫 + 已抽到各家手牌)的 1/2/3 階比例應為 4:3:2;高階卡不在公牌
  const tc = { 1: 0, 2: 0, 3: 0 };
  const all = [...g.deck, ...g.players.flatMap(p => p.hand)];
  if (all.some(c => c.kind === 'tech' && c.tier > 3)) throw new Error('公牌循環中出現 4/5 階卡');
  for (const c of all) if (c.kind === 'tech') tc[c.tier]++;
  // 5 類 × (4,3,2) = 20:15:10
  if (tc[1] !== 20 || tc[2] !== 15 || tc[3] !== 10)
    throw new Error('公牌 1/2/3 階比例非 4:3:2:' + JSON.stringify(tc));
  console.log('✅ 公牌只含 1/2/3 階(20:15:10 = 4:3:2)、4/5 階獨立疊 通過');
}

// 每回合自動抽一張卡(算力 perk 抽兩張) + 行動點每回合重置
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  // jensen(算力 perk):開局手牌 = startHand + 自動抽 2
  if (g.players[0].hand.length !== RULES.startHand + 2) throw new Error('算力 perk 開局未多抽一張');
  // ren(無此 perk):輪到他時自動抽 1,行動點重置為 3
  g.cur().ap = 0; g.endTurn();
  const ren = g.cur();
  // 行動點每回合重置為當輪上限(可能受事件 apDelta 影響,故與 apPerTurn() 比對)
  if (ren.ap !== g.apPerTurn()) throw new Error(`行動點未每回合重置(${ren.ap} ≠ ${g.apPerTurn()})`);
  if (ren.hand.length !== RULES.startHand + 1) throw new Error('一般角色每回合未自動抽一張');
  console.log('✅ 行動點每回合重置 + 每回合自動抽一張(算力 perk 抽兩張) 通過');
}

// 捨牌升階:加總 6 → 4 階卡;2 張 4 階 → 5 階卡
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const p = g.cur(); p.ap = 3;
  const t4pool = g.tier4Deck.length, t5pool = g.tier5Deck.length;
  // 兩張 3 階(加總 6)→ 4 階
  const t3s = pool(g).filter(c => c.kind === 'tech' && c.tier === 3).slice(0, 2);
  p.hand = [...t3s];
  if (!g.doUpgradeCard([0, 1], 4).ok) throw new Error('加總 6 換 4 階失敗');
  if (g.tier4Deck.length !== t4pool - 1) throw new Error('4 階卡庫未減少');
  if (p.hand.length !== 1 || p.hand[0].tier !== 4) throw new Error('未換得 4 階卡');
  // 加總非 6 應失敗
  const oneT3 = pool(g).find(c => c.kind === 'tech' && c.tier === 3);
  p.hand.push(oneT3);
  if (g.doUpgradeCard([1], 4).ok) throw new Error('加總非 6 不應能換 4 階');
  // 2 張 4 階 → 5 階
  p.ap = 3;
  const fourA = g.tier4Deck.pop(), fourB = g.tier4Deck.pop();
  p.hand = [fourA, fourB];
  if (!g.doUpgradeCard([0, 1], 5).ok) throw new Error('2 張 4 階換 5 階失敗');
  if (g.tier5Deck.length !== t5pool - 1) throw new Error('5 階卡庫未減少');
  if (p.hand.length !== 1 || p.hand[0].tier !== 5) throw new Error('未換得 5 階卡');
  if (g.doUpgradeCard([], 5).ok) throw new Error('空手不應能換 5 階');
  console.log('✅ 捨牌升階(加總6→4階;2張4階→5階) 通過');
}

// 作戰卡:航線距離加成(每多 1 格 +50%) + 牆國攻擊範圍 +1
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const sum = c => RES_KEYS.reduce((s, k) => s + c[k], 0);
  const us = g.players.find(q => q.faction === 'US');
  const cn = g.players.find(q => q.faction === 'CN');
  const base = sum(g.opsCostFor(us, 'spy2', 0));
  const d2 = sum(g.opsCostFor(us, 'spy2', 2)); // +50%
  const d3 = sum(g.opsCostFor(us, 'spy2', 3)); // +100%
  if (d2 <= base || d3 <= d2) throw new Error('航線距離未逐格加費:' + JSON.stringify({ base, d2, d3 }));
  // 範圍:US=opsRange、CN=opsRange+bonus
  if (g.opsRangeFor(us) !== RULES.opsRange) throw new Error('米國攻擊範圍錯誤');
  if (g.opsRangeFor(cn) !== RULES.opsRange + RULES.cnOpsRangeBonus) throw new Error('牆國攻擊範圍未 +1');
  console.log('✅ 作戰卡航線距離加成(每多1格+50%)+ 牆國範圍+1 通過');
}

// 飛機只能跨 planeRange 格;超過無法直達
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const p = g.cur(); // jensen 在矽谷
  p.res.oil = 99; p.ap = 3;
  const dist = g.distancesFrom(p.pos);
  let testedNear = false, testedFar = false;
  for (const r of REGIONS) {
    const d = dist[r.id];
    if (d == null || d === 0 || g.adj[p.pos].includes(r.id)) continue;
    if (d <= RULES.planeRange) { if (!g.canMoveTo(r.id)) throw new Error(`${r.id}(${d}格)應可搭機`); testedNear = true; }
    else { if (g.canMoveTo(r.id)) throw new Error(`${r.id}(${d}格)超出航程不應可搭機`); testedFar = true; }
  }
  if (!testedNear || !testedFar) throw new Error('飛機航程測試未涵蓋遠近兩種情況');
  console.log(`✅ 飛機僅可跨 ${RULES.planeRange} 格(超過無法直達) 通過`);
}

// 鐵路/航運(含越洋海運)限相鄰便宜移動;飛機專用航線只能搭機橫跨
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'ren' }, { charId: 'tsmc' }]);
  const p = g.cur(); // jensen 在矽谷 sv
  p.res.oil = 99; p.ap = 3;
  // sv→seattle 鐵路相鄰:便宜移動(1🛢️,非飛機)
  if (!g.adj.sv.includes('seattle')) throw new Error('sv-seattle 應為鐵路相鄰');
  const mcRail = g.moveCostTo(p, 'seattle');
  if (!mcRail || mcRail.plane || mcRail.oil !== RULES.moveOilCost) throw new Error('鐵路相鄰應為便宜移動');
  // 越洋海運:seattle↔tokyo 是海運,屬「相鄰」便宜移動(非飛機)
  if (!g.adj.seattle.includes('tokyo')) throw new Error('seattle-tokyo 越洋海運應為相鄰');
  p.pos = 'seattle';
  const mcSea = g.moveCostTo(p, 'tokyo');
  if (!mcSea || mcSea.plane || mcSea.oil !== RULES.moveOilCost) throw new Error('越洋海運應為便宜相鄰移動(非飛機)');
  p.pos = 'sv';
  // sv→tokyo 是飛機專用航線:不算相鄰,須搭飛機(5🛢️)
  if (g.adj.sv.includes('tokyo')) throw new Error('sv-tokyo 飛機專用邊不應算相鄰');
  if (!g.planeAdj.sv.includes('tokyo')) throw new Error('sv-tokyo 應存在於飛機圖');
  const mcAir = g.moveCostTo(p, 'tokyo');
  if (!mcAir || !mcAir.plane || mcAir.oil !== RULES.planeOilCost) throw new Error('飛機專用航線應只能搭飛機(5🛢️)');
  // 飛機可橫跨多城:planeRange 內的非相鄰城市仍可直達
  const dist = g.distancesFrom('sv', RULES.planeRange);
  const far = REGIONS.find(r => dist[r.id] === RULES.planeRange && !g.adj.sv.includes(r.id));
  if (far && !g.canMoveTo(far.id)) throw new Error('planeRange 內的非相鄰城市應可搭飛機橫跨');
  // 飛機圖含飛機專用航線,嚴格多於鐵路/海運圖
  const railCount = Object.values(g.adj).reduce((s, a) => s + a.length, 0);
  const planeCount = Object.values(g.planeAdj).reduce((s, a) => s + a.length, 0);
  if (railCount >= planeCount) throw new Error('飛機圖應比鐵路/海運圖多了飛機專用航線');
  console.log('✅ 鐵路/航運(含越洋海運)限相鄰、飛機專用航線只能搭機橫跨 通過');
}

// 盟友改建:被作戰卡 debuff 的科技卡,同陣營他人可改建,折舊返還原建設玩家
{
  const g = new Game([{ charId: 'jensen' }, { charId: 'zuck' }, { charId: 'ren' }]);
  const us1 = g.players.find(q => q.char.id === 'jensen'); // US
  const us2 = g.players.find(q => q.char.id === 'zuck');   // US 同陣營盟友
  const cn = g.players.find(q => q.faction === 'CN');
  const rid = 'sv';
  // us2 在 sv 有一張被 debuff 的卡(模擬被敵方作戰卡打過)
  g.regions[rid].cards.push({ uid: 70001, kind: 'tech', cat: 'ai', tier: 2, name: '受損卡',
    tech: 12, def: 1, trade: 3, cost: 12, owner: us2.id, techApplied: 12,
    debuff: { type: 'tech', val: 8, by: cn.id, byName: cn.name } });
  g.tech.US += 12; // 模擬 us2 卡的科技力貢獻已在場上
  g.turnIdx = us1.id; us1.ap = 3; us1.pos = rid; us1.res = { money: 999, power: 999, oil: 999 };
  g.regions[rid].builtRound = -10; g.regions[rid].level = 2;
  us1.hand = [{ uid: 70002, kind: 'tech', cat: 'hardware', tier: 2, name: '改建卡', tech: 10, def: 1, trade: 2, cost: 11 }];
  const priv = g.privateStateFor(us1.id);
  if (!priv.rescueTargets.some(t => t.uid === 70001)) throw new Error('應列出盟友受損卡為改建目標');
  // 敵對陣營不可改建(換 cn 嘗試應無此目標)
  g.turnIdx = cn.id; cn.pos = rid;
  if (g.allyRescueTargetsAt(cn, rid).length) throw new Error('敵對陣營不應能改建');
  g.turnIdx = us1.id;
  const ownerResBefore = RES_KEYS.reduce((s, k) => s + us2.res[k], 0);
  if (!g.doPlayTech(0, 70001).ok) throw new Error('盟友改建失敗');
  if (g.regions[rid].cards.some(c => c.uid === 70001)) throw new Error('改建後盟友受損卡應被移除');
  const nc = g.regions[rid].cards.find(c => c.uid === 70002);
  if (!nc || nc.owner !== us1.id) throw new Error('改建後應為改建者(us1)的新卡');
  const ownerResAfter = RES_KEYS.reduce((s, k) => s + us2.res[k], 0);
  const expectDeprec = Math.floor(12 * RULES.depreciationRate); // 6
  if (ownerResAfter - ownerResBefore !== expectDeprec)
    throw new Error('折舊應返還原建設玩家:' + JSON.stringify({ before: ownerResBefore, after: ownerResAfter, expectDeprec }));
  console.log('✅ 盟友改建被 debuff 科技卡(折舊返還原建設玩家) 通過');
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
