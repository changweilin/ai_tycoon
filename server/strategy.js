// ============ AI 策略性格(六軸傾向比重)與梗名產生器 ============
// 每軸 0~1:數值越高該傾向越強。兩兩成對但不互斥(可以又攻又守 = 全能型)。
//   shortTerm  短期策略:重視眼前收入/便宜卡,常放棄權利換資源
//   longTerm   長期策略:存資源憋大招,偏好高階卡與城市升級
//   aggressive 攻擊型:作戰卡出手門檻低,專打高科技力目標
//   defensive  防守型:偏好防護/光環卡,留老本,避免冒險
//   selfish    自利型:交易要佔便宜,優先打擊領先者
//   cooperative合作型:接受公平交易,作戰時避開可結盟對象

export const STRATEGY_AXES = ['shortTerm', 'longTerm', 'aggressive', 'defensive', 'selfish', 'cooperative'];

/** 隨機產生一組策略傾向(成對軸做輕度互斥拉扯,讓性格更鮮明) */
export function randomStrategy(rng = Math.random) {
  const s = {};
  for (const axis of STRATEGY_AXES) s[axis] = Math.round(rng() * 100) / 100;
  // 成對軸:把較弱的一邊往下壓,避免每隻 AI 都是不痛不癢的中庸型
  for (const [a, b] of [['shortTerm', 'longTerm'], ['aggressive', 'defensive'], ['selfish', 'cooperative']]) {
    if (s[a] >= s[b]) s[b] = Math.round(s[b] * 0.6 * 100) / 100;
    else s[a] = Math.round(s[a] * 0.6 * 100) / 100;
  }
  return s;
}

/** 預設(中庸)策略:沒有設定 strategy 的舊存檔/測試用 */
export function neutralStrategy() {
  const s = {};
  for (const axis of STRATEGY_AXES) s[axis] = 0.5;
  return s;
}

// 各軸代表性網路梗名(主導軸決定暱稱風格)
const MEME_NAMES = {
  shortTerm: ['先爽再說哥', 'YOLO仔', '月光戰士', '及時行樂派', '衝動購物魔人', '今朝有酒今朝醉'],
  longTerm: ['存股老司機', '十年磨一鍵', '時間的朋友', '佛系種田仔', '養老金大師', '長期飯票'],
  aggressive: ['出征戰狼', '鍵盤俠本俠', '歸剛欸', '是在哈囉', '全武行課長', '輸贏啦'],
  defensive: ['烏龜流宗師', '苟到最後', '穩穩的幸福', '龜苓膏大王', '防禦工事狂', '套牢也不賣'],
  selfish: ['都是我的啦', '自肥仔', '雨我無瓜', '反正我很閒', '躺平收租公', '吃獨食大師'],
  cooperative: ['工具人之光', '雙贏就是贏兩次', '好人卡收藏家', '互惠互利姐', '揪團仔', '世界和平大使'],
};

/**
 * 依策略傾向產生 AI 暱稱:[AI] + 主導軸梗名。
 * @param {object} strategy 六軸傾向
 * @param {Set<string>} usedNames 已用過的名字(避免同局重複)
 */
export function strategyNickname(strategy, usedNames = new Set(), rng = Math.random) {
  const dominant = STRATEGY_AXES.reduce((a, b) => (strategy[b] > strategy[a] ? b : a));
  const pool = MEME_NAMES[dominant];
  const avail = pool.filter(n => !usedNames.has(n));
  const base = (avail.length ? avail : pool)[Math.floor(rng() * (avail.length ? avail.length : pool.length))];
  let name = base, i = 2;
  while (usedNames.has(name)) name = `${base}${i++}號`;
  usedNames.add(name);
  return `[AI]${name}`;
}

/** 策略摘要字串(模擬器報表用):取最強兩軸 */
export function strategyLabel(strategy) {
  const top = [...STRATEGY_AXES].sort((a, b) => strategy[b] - strategy[a]).slice(0, 2);
  const zh = { shortTerm: '短期', longTerm: '長期', aggressive: '攻擊', defensive: '防守', selfish: '自利', cooperative: '合作' };
  return top.map(a => `${zh[a]}${Math.round(strategy[a] * 10)}`).join('/');
}
