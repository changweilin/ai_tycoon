// ============ AI 對戰批次模擬器 ============
// 快速無頭模擬大量 AI 對局,輸出勝率/局長/策略傾向統計,供調整遊戲參數用。
//
// 用法:
//   node test/simulator.js                          # 預設 4 人 ×100 局
//   node test/simulator.js --games 500 --players 6  # 6 人 ×500 局
//   node test/simulator.js --seats jensen,ren,tsmc  # 指定固定陣容
//   node test/simulator.js --rules config/test.json # 用另一份參數檔做 A/B 測試
//   node test/simulator.js --json out.json          # 結果另存 JSON(批次訓練/比較用)
import { Game } from '../server/game.js';
import { botStep } from '../server/bot.js';
import { loadRulesConfig } from '../server/config.js';
import { randomStrategy, strategyNickname, strategyLabel, STRATEGY_AXES } from '../server/strategy.js';
import { CHARACTERS, RULES } from '../public/js/data.js';
import fs from 'fs';

// ---------- 參數解析 ----------
function parseArgs(argv) {
  const a = { games: 100, players: 4, seats: null, rules: null, json: null, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--games') a.games = parseInt(argv[++i], 10);
    else if (k === '--players') a.players = parseInt(argv[++i], 10);
    else if (k === '--seats') a.seats = argv[++i].split(',').map(s => s.trim());
    else if (k === '--rules') a.rules = argv[++i];
    else if (k === '--json') a.json = argv[++i];
    else if (k === '--quiet') a.quiet = true;
    else { console.error(`未知參數:${k}`); process.exit(1); }
  }
  return a;
}
const args = parseArgs(process.argv);

const cfg = loadRulesConfig(args.rules);
console.log(cfg ? `⚙️ 參數檔:${cfg.path}` : '⚙️ 使用內建預設參數');

// ---------- 陣容 ----------
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** 隨機抽出符合陣容限制的角色組合(米/牆必有;3 人以上含台灣;6 人以上可含日韓) */
function randomLineup(total) {
  const pick = (faction, chosen) =>
    rand(CHARACTERS.filter(c => c.faction === faction && !chosen.includes(c.id)).map(c => c.id));
  const chosen = [pick('US', []), ];
  chosen.push(pick('CN', chosen));
  if (total >= 3) chosen.push('tsmc');
  if (total >= RULES.jpkrMinPlayers) { // 與 server buildLineup 一致:6 人以上日韓成對加入
    chosen.push('toyota');
    if (chosen.length < total) chosen.push('lee');
  }
  let toggle = Math.random() < 0.5 ? 0 : 1;
  while (chosen.length < total) {
    const f = toggle++ % 2 === 0 ? 'US' : 'CN';
    const next = pick(f, chosen) || pick(f === 'US' ? 'CN' : 'US', chosen);
    if (!next) break;
    chosen.push(next);
  }
  return chosen.slice(0, total);
}

// ---------- 單局模擬 ----------
function runOne(lineup) {
  const usedNames = new Set();
  // 洗牌座位順序:讓「先攻/後攻」與「陣營」脫鉤,才能分析先後手優勢
  const order = [...lineup];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const seats = order.map(id => {
    const strategy = randomStrategy();
    return { charId: id, playerName: strategyNickname(strategy, usedNames), isAI: true, strategy };
  });
  const g = new Game(seats);
  let steps = 0;
  while (!g.over && steps++ < 5000) botStep(g);
  if (!g.over) throw new Error(`對局未在 5000 步內結束(陣容 ${lineup.join(',')})`);
  return g;
}

// ---------- 批次統計 ----------
const stats = {
  games: args.games,
  byChampionFaction: {}, byChampionChar: {}, byWinnerFaction: {},
  reasons: { US: 0, CN: 0, timeout: 0 },
  rounds: [], leads: [],
  bySeat: {},        // 座位(行動順序)→ {games, wins}:先攻後攻優勢
  bySideCount: {},   // 'US x v CN y' → {games, usWin, cnWin, none}:陣營人數差優勢
  firstSeatSide: { US: { games: 0, wins: 0 }, CN: { games: 0, wins: 0 } }, // 先攻者所屬陣營的勝率
  axisChampion: Object.fromEntries(STRATEGY_AXES.map(a => [a, 0])),
  axisAll: Object.fromEntries(STRATEGY_AXES.map(a => [a, 0])),
  axisHighWin: Object.fromEntries(STRATEGY_AXES.map(a => [a, { games: 0, wins: 0 }])),
  champions: [],
};

const t0 = Date.now();
for (let i = 0; i < args.games; i++) {
  const lineup = args.seats || randomLineup(args.players);
  const g = runOne(lineup);
  const champ = g.players[g.result.champion];

  stats.byChampionFaction[champ.faction] = (stats.byChampionFaction[champ.faction] || 0) + 1;
  stats.byChampionChar[champ.char.id] = (stats.byChampionChar[champ.char.id] || 0) + 1;
  for (const id of g.result.winners) {
    const f = g.players[id].faction;
    stats.byWinnerFaction[f] = (stats.byWinnerFaction[f] || 0) + 1;
  }
  const lead = g.lead();
  let sideWon = null;
  if (lead >= g.usThreshold()) { stats.reasons.US++; sideWon = 'US'; }
  else if (lead <= g.cnThreshold()) { stats.reasons.CN++; sideWon = 'CN'; }
  else stats.reasons.timeout++;
  if (g.result?.reason?.includes('商業勝利')) stats.reasons.commercial = (stats.reasons.commercial || 0) + 1;
  stats.rounds.push(g.round);
  stats.leads.push(lead);

  // 先攻後攻:各座位的冠軍率
  for (const p of g.players) {
    const seat = (stats.bySeat[p.id] ||= { games: 0, wins: 0 });
    seat.games++;
    if (p.id === g.result.champion) seat.wins++;
  }
  // 陣營人數組成 vs 哪一方達成門檻(台灣依秘密立場、日→米、韓→牆)
  const sideOf = p => p.faction === 'TW' ? g.twSupport
    : p.faction === 'JP' ? 'US' : p.faction === 'KR' ? 'CN' : p.faction;
  const usN = g.players.filter(p => sideOf(p) === 'US').length;
  const cnN = g.players.length - usN;
  const key = `米${usN} vs 牆${cnN}`;
  const sc = (stats.bySideCount[key] ||= { games: 0, usWin: 0, cnWin: 0, none: 0 });
  sc.games++;
  if (sideWon === 'US') sc.usWin++; else if (sideWon === 'CN') sc.cnWin++; else sc.none++;
  // 先攻者所屬陣營是否獲勝
  const fs = stats.firstSeatSide[sideOf(g.players[0])];
  fs.games++;
  if (sideWon && sideOf(g.players[0]) === sideWon) fs.wins++;

  // 策略傾向 vs 勝負:冠軍的各軸平均 / 全體平均 / 高傾向(>0.6)玩家勝率
  for (const p of g.players) {
    const isChamp = p.id === g.result.champion;
    for (const axis of STRATEGY_AXES) {
      stats.axisAll[axis] += p.strategy[axis];
      if (isChamp) stats.axisChampion[axis] += p.strategy[axis];
      if (p.strategy[axis] > 0.6) {
        stats.axisHighWin[axis].games++;
        if (isChamp) stats.axisHighWin[axis].wins++;
      }
    }
  }
  stats.champions.push({ char: champ.char.id, faction: champ.faction, name: champ.name,
    strategy: champ.strategy, label: strategyLabel(champ.strategy), round: g.round });

  if (!args.quiet && (i + 1) % 50 === 0) console.log(`  …已完成 ${i + 1}/${args.games} 局`);
}
const elapsed = (Date.now() - t0) / 1000;

// ---------- 報表 ----------
const totalPlayers = stats.champions.length === 0 ? 1
  : args.games * (args.seats ? args.seats.length : args.players);
const avg = arr => (arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length));
const pct = (n, d) => `${(n / Math.max(1, d) * 100).toFixed(1)}%`;

console.log(`\n========== 模擬結果(${args.games} 局,${elapsed.toFixed(1)}s,${(args.games / elapsed).toFixed(0)} 局/秒)==========`);
console.log(`平均局長:${avg(stats.rounds).toFixed(1)} 季|平均終局科技差(US−CN):${avg(stats.leads).toFixed(0)} 點`);
console.log(`終局型態:米國門檻勝 ${pct(stats.reasons.US, args.games)}`
  + `|牆國門檻勝 ${pct(stats.reasons.CN, args.games)}|打滿 12 季 ${pct(stats.reasons.timeout, args.games)}`
  + `(其中商業勝利 ${pct(stats.reasons.commercial || 0, args.games)})`);

console.log('\n-- 先攻後攻:各座位冠軍率 --(均等應為 ' + pct(1, args.seats ? args.seats.length : args.players) + ')');
for (const [seat, v] of Object.entries(stats.bySeat))
  console.log(`  第 ${Number(seat) + 1} 位行動 冠軍率 ${pct(v.wins, v.games)}(${v.wins}/${v.games})`);
console.log(`  先攻者陣營達成門檻率:米先攻 ${pct(stats.firstSeatSide.US.wins, stats.firstSeatSide.US.games)}`
  + `(${stats.firstSeatSide.US.games} 局)|牆先攻 ${pct(stats.firstSeatSide.CN.wins, stats.firstSeatSide.CN.games)}(${stats.firstSeatSide.CN.games} 局)`);

console.log('\n-- 陣營人數組成 vs 門檻勝負 --(台灣依秘密立場、日→米、韓→牆)');
for (const [key, v] of Object.entries(stats.bySideCount).sort((a, b) => b[1].games - a[1].games))
  console.log(`  ${key}:${String(v.games).padStart(4)} 局|米勝 ${pct(v.usWin, v.games)}|牆勝 ${pct(v.cnWin, v.games)}|未分勝負 ${pct(v.none, v.games)}`);

console.log('\n-- 冠軍陣營分布 --');
for (const [f, n] of Object.entries(stats.byChampionFaction).sort((a, b) => b[1] - a[1]))
  console.log(`  ${f.padEnd(3)} ${String(n).padStart(4)} (${pct(n, args.games)})`);

console.log('\n-- 贏家陣營分布(含共同贏家,每局可多方)--');
for (const [f, n] of Object.entries(stats.byWinnerFaction).sort((a, b) => b[1] - a[1]))
  console.log(`  ${f.padEnd(3)} ${String(n).padStart(4)} (${pct(n, args.games)})`);

console.log('\n-- 冠軍角色分布 --');
for (const [id, n] of Object.entries(stats.byChampionChar).sort((a, b) => b[1] - a[1])) {
  const ch = CHARACTERS.find(c => c.id === id);
  console.log(`  ${ch.name.padEnd(10)} ${String(n).padStart(4)} (${pct(n, args.games)})`);
}

console.log('\n-- 策略傾向 vs 勝率 --(冠軍平均/全體平均 > 1 表示該傾向有利)');
const zh = { shortTerm: '短期策略', longTerm: '長期策略', aggressive: '攻擊型', defensive: '防守型', selfish: '自利型', cooperative: '合作型' };
for (const axis of STRATEGY_AXES) {
  const champAvg = stats.axisChampion[axis] / Math.max(1, args.games);
  const allAvg = stats.axisAll[axis] / totalPlayers;
  const hw = stats.axisHighWin[axis];
  console.log(`  ${zh[axis]} 冠軍均值 ${champAvg.toFixed(2)} / 全體 ${allAvg.toFixed(2)}(比 ${(champAvg / Math.max(0.01, allAvg)).toFixed(2)})`
    + `|高傾向(>0.6)勝率 ${pct(hw.wins, hw.games)}(${hw.wins}/${hw.games})`);
}

if (args.json) {
  fs.writeFileSync(args.json, JSON.stringify({
    args: { ...args }, rulesPath: cfg?.path || null, elapsed,
    summary: {
      avgRounds: avg(stats.rounds), avgLead: avg(stats.leads),
      reasons: stats.reasons,
      bySeat: stats.bySeat,
      bySideCount: stats.bySideCount,
      firstSeatSide: stats.firstSeatSide,
      byChampionFaction: stats.byChampionFaction,
      byWinnerFaction: stats.byWinnerFaction,
      byChampionChar: stats.byChampionChar,
      axisChampionAvg: Object.fromEntries(STRATEGY_AXES.map(a => [a, stats.axisChampion[a] / Math.max(1, args.games)])),
      axisAllAvg: Object.fromEntries(STRATEGY_AXES.map(a => [a, stats.axisAll[a] / totalPlayers])),
      axisHighWin: stats.axisHighWin,
    },
    champions: stats.champions,
  }, null, 2));
  console.log(`\n💾 詳細結果已輸出:${args.json}`);
}
