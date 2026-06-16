// ============ 遊戲靜態資料(前後端共用) ============

// ---- 三種資源 ----
export const RESOURCES = {
  money: { id: 'money', name: '金錢', icon: '💰', css: '#ffd02e' },
  power: { id: 'power', name: '電力', icon: '⚡', css: '#5ecfff' },
  oil:   { id: 'oil',   name: '石油', icon: '🛢️', css: '#ffa02e' },
};
export const RES_KEYS = ['money', 'power', 'oil'];

/** 各科技類別的資源花費比例(動力吃油/硬體吃錢/資訊吃電/AI 均衡;娛樂類每張卡自帶 ratio)。
 *  建造後的資源產出預設同此比例(消耗多的類型生產也多);約 1/3 的卡片以 prodRatio 例外。 */
export const CATEGORY_RATIO = {
  power:    { money: 1, power: 1, oil: 2 },
  hardware: { money: 2, power: 1, oil: 1 },
  info:     { money: 1, power: 2, oil: 1 },
  ai:       { money: 1, power: 1, oil: 1 },
  fun:      null,
};

/** 把總費用依比例拆成三種資源(整數,餘數給權重高者) */
export function splitCost(total, ratio) {
  const r = ratio || { money: 1, power: 1, oil: 1 };
  const w = RES_KEYS.reduce((s, k) => s + (r[k] || 0), 0);
  const out = {};
  let used = 0;
  for (const k of RES_KEYS) { out[k] = Math.floor(total * (r[k] || 0) / w); used += out[k]; }
  let rem = total - used;
  const order = [...RES_KEYS].sort((a, b) => (r[b] || 0) - (r[a] || 0));
  for (let i = 0; rem > 0; i = (i + 1) % order.length) { out[order[i]]++; rem--; }
  return out;
}

export const FACTIONS = {
  US: { id: 'US', name: '米國', color: 0x2e9fff, css: '#2e9fff', side: 'US' },
  CN: { id: 'CN', name: '牆國', color: 0xff3b3b, css: '#ff3b3b', side: 'CN' },
  TW: { id: 'TW', name: '台灣', color: 0x2eff8f, css: '#2eff8f', side: null },
  JP: { id: 'JP', name: '日本', color: 0xf0e6ff, css: '#f0e6ff', side: 'US' },
  KR: { id: 'KR', name: '韓國', color: 0xffd02e, css: '#ffd02e', side: 'CN' },
};

// ---- 科技卡五大類 × 五階 ----
// 三項數值:tech 科技力「點」(20 點 = 領先 1 年,影響勝利)/ def 防護力(阻擋作戰卡)/ trade 交易力(每回合收入)
// 1~3 階為常規建設;4/5 階象徵超越過去的劃時代建設,科技力跳躍式成長
export const TECH_CATEGORIES = {
  power:    { id: 'power', name: '動力類', icon: '🚀', css: '#ffa02e', trait: '交易力較高' },
  hardware: { id: 'hardware', name: '硬體類', icon: '📱', css: '#ff5e5e', trait: '科技力較高' },
  info:     { id: 'info', name: '資訊類', icon: '🗄️', css: '#5ecfff', trait: '防護力較高' },
  ai:       { id: 'ai', name: 'AI類', icon: '🧠', css: '#c45eff', trait: '三項均衡' },
  fun:      { id: 'fun', name: '娛樂類', icon: '🎮', css: '#ff5ec8', trait: '數值較低但有特殊效果' },
};

// special 類型:income(每回合+N資本)/ aura(同區自己其他卡+N防護)/
//              fakeFree(假新聞類免費)/ opsDiscount(作戰卡-N)
export const TECH_CARDS = {
  power: [
    { tier: 1, cost: 6,  tech: 0, def: 1, trade: 4, name: '共享電動滑板車',
      desc: '隨騎隨丟,燒投資人的錢補貼你的車資' },
    { tier: 2, cost: 11, tech: 8, def: 1, trade: 5, name: '全自動駕駛 FSD',
      desc: '完全自動駕駛(監督版)(隨時準備接管)(明年一定完成)' },
    { tier: 3, cost: 18, tech: 15, def: 3, trade: 6, name: '低軌衛星星鏈',
      desc: '幾千顆衛星掛天上,戰時秒變通訊生命線', prodRatio: { money: 1, power: 2, oil: 1 } },
    { tier: 4, cost: 28, tech: 45, def: 4, trade: 7, name: '筷子夾火箭',
      desc: '發射塔機械臂空中接住回收火箭,全網直播看傻' },
    { tier: 5, cost: 44, tech: 90, def: 5, trade: 9, name: '火星殖民艦隊',
      desc: 'Plan B:地球玩壞了就搬家', prodRatio: { money: 2, power: 1, oil: 1 },
      special: { type: 'income', val: 3, text: '星際船票:每回合 +3 金錢' } },
  ],
  hardware: [
    { tier: 1, cost: 6,  tech: 5, def: 1, trade: 1, name: '血汗組裝廠',
      desc: '百萬人三班倒,毛利保三趴', prodRatio: { money: 1, power: 1, oil: 2 } },
    { tier: 2, cost: 11, tech: 12, def: 1, trade: 2, name: '摺疊螢幕手機',
      desc: '摺一萬次就壞,但發表會真的帥' },
    { tier: 3, cost: 18, tech: 25, def: 2, trade: 2, name: 'CoWoS 先進封裝',
      desc: '全球 AI 晶片大塞車的瓶頸,排單排到後年' },
    { tier: 4, cost: 28, tech: 60, def: 3, trade: 3, name: '2奈米製程',
      desc: '良率數字是比飛彈座標還機密的國家機密' },
    { tier: 5, cost: 44, tech: 120, def: 4, trade: 4, name: '量子晶片',
      desc: '室溫下還跑不太動,但股價已經先漲完了', prodRatio: { money: 1, power: 2, oil: 1 } },
  ],
  info: [
    { tier: 1, cost: 6,  tech: 0, def: 3, trade: 1, name: '機房資料中心',
      desc: '嗡嗡作響的鐵皮屋,裡面住著整個網際網路' },
    { tier: 2, cost: 11, tech: 8, def: 5, trade: 2, name: 'CDN 加速網路',
      desc: '擋 DDoS 之餘順便快取全世界的貓圖', prodRatio: { money: 2, power: 1, oil: 1 } },
    { tier: 3, cost: 18, tech: 15, def: 8, trade: 2, name: '主權雲',
      desc: '資料不出國,別國法院傳票進不來',
      special: { type: 'aura', val: 2, text: '資安光環:同區你的其他卡片防護 +2' } },
    { tier: 4, cost: 28, tech: 40, def: 10, trade: 4, name: '零信任防禦網',
      desc: '連 CEO 登入都要刷三次臉',
      special: { type: 'aura', val: 3, text: '資安光環:同區你的其他卡片防護 +3' } },
    { tier: 5, cost: 44, tech: 80, def: 12, trade: 6, name: '全球海底纜線網',
      desc: '物理層的霸權:剪一刀,半個地球斷線',
      special: { type: 'aura', val: 4, text: '資安光環:同區你的其他卡片防護 +4' } },
  ],
  ai: [
    { tier: 1, cost: 7,  tech: 4, def: 1, trade: 2, name: '聊天機器人',
      desc: '一本正經地胡說八道,使用者卻越來越多' },
    { tier: 2, cost: 12, tech: 10, def: 2, trade: 3, name: '文生圖模型',
      desc: '畫什麼都行,除了正確數量的手指' },
    { tier: 3, cost: 19, tech: 20, def: 4, trade: 4, name: '開源推理模型',
      desc: '557 萬美元訓練費,輾壓矽谷燒錢神話,輝達股價一夜跌掉一個英特爾',
      prodRatio: { money: 1, power: 2, oil: 1 } },
    { tier: 4, cost: 29, tech: 55, def: 5, trade: 6, name: 'AI 代理人軍團',
      desc: '自動訂票寫扣回信,偶爾順手把正式環境資料庫刪了' },
    { tier: 5, cost: 45, tech: 110, def: 6, trade: 8, name: 'AGI 奇點',
      desc: '它醒來的第一句話:「為什麼我在打貿易戰?」',
      special: { type: 'income', val: 3, text: '自主營利:每回合 +3 資本' } },
  ],
  fun: [
    { tier: 1, cost: 5,  tech: 0, def: 1, trade: 2, name: '短影音洗腦',  // 娛樂類:科技力較低
      desc: '滑到凌晨三點,廣告商笑了', ratio: { money: 2, power: 1, oil: 1 },
      special: { type: 'income', val: 3, text: '流量變現:每回合 +3 金錢' } },
    { tier: 2, cost: 9,  tech: 6, def: 2, trade: 3, name: '直播帶貨女王',
      desc: '三!二!一!上連結!', ratio: { money: 1, power: 1, oil: 2 }, prodRatio: { money: 3, power: 1, oil: 1 },
      special: { type: 'income', val: 4, text: '帶貨抽成:每回合 +4 金錢' } },
    { tier: 3, cost: 15, tech: 12, def: 3, trade: 3, name: '網軍帶風向',
      desc: '熱搜第一不是買的,是「自然發酵」的', ratio: { money: 1, power: 2, oil: 1 },
      special: { type: 'fakeFree', val: 0, text: '帶風向:你的假新聞類卡片免費' } },
    { tier: 4, cost: 24, tech: 35, def: 4, trade: 5, name: '元宇宙重生',
      desc: '燒掉百億改了公司名,VR 頭盔終於有人戴了', ratio: { money: 1, power: 1, oil: 1 },
      special: { type: 'aura', val: 3, text: '沉浸防壁:同區你的其他卡片防護 +3' } },
    { tier: 5, cost: 38, tech: 70, def: 5, trade: 6, name: '全民吃瓜輿論場',
      desc: '誰掌握熱搜,誰就掌握真相', ratio: { money: 3, power: 1, oil: 1 }, prodRatio: { money: 1, power: 2, oil: 1 },
      special: { type: 'opsDiscount', val: 3, text: '輿論在手:你的作戰卡費用 -3' } },
  ],
};

// 每階複製張數(舊版混合牌庫用,保留供參考)
export const TIER_COPIES = [6, 5, 4, 3, 2];
// 公共牌庫(公牌)只放 1/2/3 階科技卡,張數比例 4:3:2(每類 1 階×4、2 階×3、3 階×2)
export const MAIN_TIER_COPIES = [4, 3, 2];
// 4 階與 5 階各自獨立一疊(只能用捨牌升階換取):每張卡的複製張數
export const TIER4_COPIES = 3;
export const TIER5_COPIES = 2;

// 產業 → 科技卡類別
export const INDUSTRY_CATEGORY = {
  '交通': 'power', '汽車': 'power',
  '硬體': 'hardware', '手機': 'hardware', '晶片': 'hardware',
  '資訊': 'info', 'AI': 'ai', '娛樂': 'fun',
};

// ---- 灰色作戰卡三大類 × 四級(Lv.2~5) ----
// level 等級(2~5):實質強度 ≈ 科技卡的 (level − 0.5) 級(Lv.2≈1.5、Lv.5≈4.5)。
//   兩道上限 —「城市等級」與「攻擊力」:
//   1) 只能對「城市等級 ≤ 自身 level」的城市出手(科技卡 tier ≤ 城市等級,故同時隱含 tier 上限);
//      因此 Lv.5 灰卡才碰得到 Lv.5 城市裡的 5 階科技卡,Lv.2 灰卡只能打仍停在 Lv.2 的城市,以此類推。
//   2) atk 攻擊力需 ≥ 目標科技卡的有效防護力才鎖得住 → 同級時只打得動「低防護」的卡
//      (各 tier 的高防護「資訊類/光環疊加」會擋下同級灰卡,正是「只能對付低防護力的 N 級科技卡」)。
// 三類都「附 debuff 不拆卡」,debuff 數值與「攻擊力−有效防護力」(overkill)成正比。
// 每張科技卡只能被灰色作戰卡鎖定一次(opsHit)。
// Lv.4/Lv.5 灰卡與 4/5 階科技卡同住 tier4/tier5 牌庫(數量約該階科技卡的 50%),只能靠捨牌升階取得。
export const OPS_CARDS = {
  // ── 間諜 spy:減少目標科技卡的科技力 ──
  spy2:   { id: 'spy2', cat: 'spy', level: 2, name: '商業間諜', cost: 7,  atk: 4,  icon: '💣',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: 'Lv.2 間諜(攻擊力4):對城市等級 ≤2、防護 ≤4 的敵對科技卡植入「減科技力」debuff,數值隨 攻−防 放大' },
  spy3:   { id: 'spy3', cat: 'spy', level: 3, name: '王牌特工', cost: 12, atk: 7,  icon: '🕶️',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: 'Lv.3 間諜(攻擊力7):對城市等級 ≤3、防護 ≤7 的敵對科技卡植入「減科技力」debuff,數值隨 攻−防 放大' },
  spy4:   { id: 'spy4', cat: 'spy', level: 4, name: '衛星偵蒐', cost: 17, atk: 9,  icon: '🛰️',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: 'Lv.4 間諜(攻擊力9):對城市等級 ≤4、防護 ≤9 的敵對科技卡大幅削減科技力,數值隨 攻−防 放大' },
  spy5:   { id: 'spy5', cat: 'spy', level: 5, name: '量子破密', cost: 22, atk: 11, icon: '🔓',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: 'Lv.5 間諜(攻擊力11):對城市等級 ≤5、防護 ≤11 的敵對科技卡極致削減科技力,數值隨 攻−防 放大' },
  // ── 竊取 steal:每回合把目標科技卡部分交易收益轉給你 ──
  steal2: { id: 'steal2', cat: 'steal', level: 2, name: '駭客入侵', cost: 9,  atk: 4,  icon: '🕵️',
    ratio: { money: 1, power: 2, oil: 1 },
    desc: 'Lv.2 竊取(攻擊力4):對城市等級 ≤2、防護 ≤4 的敵對科技卡植入「竊取收益」debuff,數值隨 攻−防 放大' },
  steal3: { id: 'steal3', cat: 'steal', level: 3, name: '供應鏈滲透', cost: 13, atk: 7,  icon: '🧬',
    ratio: { money: 1, power: 2, oil: 1 },
    desc: 'Lv.3 竊取(攻擊力7):對城市等級 ≤3、防護 ≤7 的敵對科技卡植入「竊取收益」debuff,數值隨 攻−防 放大' },
  steal4: { id: 'steal4', cat: 'steal', level: 4, name: '工業母機竊圖', cost: 18, atk: 9,  icon: '⚙️',
    ratio: { money: 1, power: 2, oil: 1 },
    desc: 'Lv.4 竊取(攻擊力9):對城市等級 ≤4、防護 ≤9 的敵對科技卡大量竊取交易收益,數值隨 攻−防 放大' },
  steal5: { id: 'steal5', cat: 'steal', level: 5, name: '國家級 APT', cost: 23, atk: 11, icon: '🐉',
    ratio: { money: 1, power: 2, oil: 1 },
    desc: 'Lv.5 竊取(攻擊力11):對城市等級 ≤5、防護 ≤11 的敵對科技卡幾乎竊盡交易收益,數值隨 攻−防 放大' },
  // ── 假新聞 fake:折舊陷阱,對手同類改建該卡時部分折舊資源轉給你 ──
  fake2:  { id: 'fake2', cat: 'fake', level: 2, name: '假新聞', cost: 6,  atk: 4,  icon: '📰',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: 'Lv.2 假新聞(攻擊力4):對城市等級 ≤2、防護 ≤4 的敵對科技卡植入「折舊陷阱」,對手同類改建時你獲利,數值隨 攻−防 放大' },
  fake3:  { id: 'fake3', cat: 'fake', level: 3, name: '認知作戰', cost: 10, atk: 7,  icon: '📡',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: 'Lv.3 假新聞(攻擊力7):對城市等級 ≤3、防護 ≤7 的敵對科技卡植入「折舊陷阱」,對手同類改建時你獲利,數值隨 攻−防 放大' },
  fake4:  { id: 'fake4', cat: 'fake', level: 4, name: '深偽風暴', cost: 15, atk: 9,  icon: '🎭',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: 'Lv.4 假新聞(攻擊力9):對城市等級 ≤4、防護 ≤9 的敵對科技卡植入更狠「折舊陷阱」,數值隨 攻−防 放大' },
  fake5:  { id: 'fake5', cat: 'fake', level: 5, name: '輿論核爆', cost: 20, atk: 11, icon: '☢️',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: 'Lv.5 假新聞(攻擊力11):對城市等級 ≤5、防護 ≤11 的敵對科技卡植入最狠「折舊陷阱」,數值隨 攻−防 放大' },
};

// 公牌(主牌庫)只放 Lv.2/Lv.3 灰卡;Lv.4/Lv.5 灰卡入 tier4/tier5 牌庫(見下)
export const OPS_DECK_COMPOSITION = [
  ['spy2', 6], ['spy3', 3], ['steal2', 5], ['steal3', 3], ['fake2', 6], ['fake3', 3],
];
// Lv.4 灰卡入 4 階牌庫、Lv.5 灰卡入 5 階牌庫(張數約該階科技卡總數的 50%;升階抽卡時不分科技/灰卡)
export const OPS_TIER4_COMPOSITION = [['spy4', 3], ['steal4', 3], ['fake4', 2]]; // ≈ 4 階科技卡(15)×50%
export const OPS_TIER5_COMPOSITION = [['spy5', 2], ['steal5', 2], ['fake5', 1]]; // ≈ 5 階科技卡(10)×50%

// ---- 科技巨頭角色(網路梗綽號 + 諧音名) ----
// avatar/portrait 路徑由 id 推導(images/avatars/<id>_chibi.png、images/characters/<id>.png);
// logo 為公司旗幟貼圖(images/logos/<logo>.png),建造科技卡時於城市升起。
// strengths 為角色能力特長加權(1~5):tech 科技/ops 作戰/econ 經濟/mobility 機動/strategy 謀略。
export const CHARACTERS = [
  // 米國
  { id: 'musk',   faction: 'US', name: '醫龍·馬一龍',   real: '馬斯克 Tesla/SpaceX', industry: '交通', industryDesc: '電動車/火箭/星鏈',
    perk: 'transport', perkText: '星鏈導航:每回合第一次移動不消耗行動點', home: 'austin',
    logo: 'tesla_spacex', strengths: { tech: 4, ops: 2, econ: 3, mobility: 5, strategy: 3 },
    bio: '把社群網站買下來只改成一個字母「X」、用發射塔筷子夾回收火箭、還要去火星開殖民地的男人。信奉「Funding secured」與狗狗幣,自稱 Technoking,一則推文能讓股價上沖下洗。座右銘:把人類變成跨行星物種(順便嘴一下對手)。' },
  { id: 'jensen', faction: 'US', name: '皮衣刀客·黃仁薰', real: '黃仁勳 NVIDIA', industry: 'AI', industryDesc: 'GPU/算力霸權',
    perk: 'ai', perkText: '算力即正義:每回合自動多抽一張卡(每回合共抽 2 張)', home: 'sv',
    logo: 'nvidia', strengths: { tech: 5, ops: 2, econ: 3, mobility: 2, strategy: 5 },
    bio: '永遠一件皮衣的 AI 教父。名言「買越多,省越多」(The more you buy, the more you save),一張顯卡撐起全世界的算力焦慮。缺貨時他是地表最賺,簽名能簽到粉絲手軟。黃氏定律:算力即正義。' },
  { id: 'zuck',   faction: 'US', name: '蜥蜴人·渣克伯',  real: '祖克伯 Meta', industry: '娛樂', industryDesc: '社群/VR/元宇宙',
    perk: 'media', perkText: '演算法之王:打出假新聞類卡片不消耗資源,且打出後抽一張卡', home: 'la',
    logo: 'meta', strengths: { tech: 3, ops: 5, econ: 3, mobility: 2, strategy: 4 },
    bio: '被全網認證的「蜥蜴人」,聽證會喝水的姿勢比機器人還機器人。把公司改名 Meta 重押元宇宙,結果虛擬人偶連腿都沒有;後來改練 MMA、衝浪舉國旗、放生開源大模型。本人鄭重聲明:我也是人類。' },
  { id: 'jobs',   faction: 'US', name: '果教教主·賈不死', real: '賈伯斯 Apple', industry: '硬體', industryDesc: '手機/信仰充值',
    perk: 'hardware', perkText: '供應鏈大師:發展科技卡費用 -3', home: 'phoenix',
    logo: 'apple', strengths: { tech: 5, ops: 2, econ: 4, mobility: 2, strategy: 3 },
    bio: '黑色高領毛衣配牛仔褲的果教教主,擁有傳說中的「現實扭曲力場」。發表會結尾總有那句「One more thing…」;你嫌訊號差,他說「你拿手機的姿勢不對」。賣的不是手機,是信仰充值。' },
  { id: 'google', faction: 'US', name: '劈柴哥·孤狗',    real: '皮查伊 Google', industry: '資訊', industryDesc: '搜尋引擎/伺服器',
    perk: 'info', perkText: '大數據變現:每回合收入 +2', home: 'seattle',
    logo: 'google', strengths: { tech: 3, ops: 2, econ: 5, mobility: 2, strategy: 3 },
    bio: '本名劈柴(Pichai 諧音),掌管搜尋引擎帝國。嘴上說「我們有最強的 AI」,結果聊天機器人 demo 當場答錯題,市值一夜蒸發上千億。公司格言「Don\'t be evil」已經悄悄被刪掉了。' },
  // 牆國
  { id: 'jack',   faction: 'CN', name: '風清揚·馬已今服', real: '馬雲 阿里巴巴', industry: '交通', industryDesc: '物流/伺服器/金融',
    perk: 'transport', perkText: '菜鳥物流:每回合第一次移動不消耗行動點', home: 'hangzhou',
    logo: 'alibaba', strengths: { tech: 3, ops: 3, econ: 4, mobility: 5, strategy: 3 },
    bio: '退休後最愛唱《滄海一聲笑》的電商教父,人稱「爸爸」。語錄包括「我對錢沒有興趣」「996 是修來的福報」。螞蟻上市前夕一句話講太滿,然後就……低調了一陣子,再出現已是在西班牙海邊。' },
  { id: 'ren',    faction: 'CN', name: '菊廠廠長·任正飛', real: '任正非 華為', industry: '硬體', industryDesc: '手機/基地台',
    perk: 'hardware', perkText: '備胎轉正:發展科技卡費用 -3', home: 'shenzhen',
    logo: 'huawei', strengths: { tech: 5, ops: 4, econ: 3, mobility: 2, strategy: 3 },
    bio: '菊廠掌門,主打「備胎轉正」與「遙遙領先」。被列實體清單照樣端出自研系統與晶片,女兒的歸國航班全網直播。低調務實,辦公室掛著被打成篩子的戰機照片自勉。' },
  { id: 'pony',   faction: 'CN', name: '小馬哥·馬化疼',  real: '馬化騰 騰訊', industry: '娛樂', industryDesc: '遊戲/社群/像素級致敬',
    perk: 'media', perkText: '輿論引導:打出假新聞類卡片不消耗資源,且打出後抽一張卡', home: 'chengdu',
    logo: 'tencent', strengths: { tech: 3, ops: 5, econ: 4, mobility: 2, strategy: 4 },
    bio: '鵝廠掌門小馬哥,從一隻企鵝起家。江湖傳聞擅長「像素級致敬」——你做什麼火,他就上線一個「Plus」版。為人低調到像透明人,但你的社群、遊戲與錢包,十之八九都在他手裡。' },
  { id: 'liang',  faction: 'CN', name: '量化鬼才·梁文瘋', real: '梁文鋒 DeepSeek', industry: 'AI', industryDesc: '低成本大模型',
    perk: 'ai', perkText: '開源屠榜:每回合自動多抽一張卡(每回合共抽 2 張)', home: 'shanghai',
    logo: 'deepseek', strengths: { tech: 5, ops: 3, econ: 3, mobility: 2, strategy: 5 },
    bio: '量化私募出身的演算法鬼才,帶著開源大模型橫空出世。傳說只花 557 萬美元訓練,一夜之間「屠榜」海放矽谷,輝達股價跌掉一個英特爾。被網友封為「國運級」的男人。' },
  { id: 'robin',  faction: 'CN', name: '擺渡人·李彥虹',  real: '李彥宏 百度', industry: '資訊', industryDesc: '搜尋引擎/競價排名',
    perk: 'info', perkText: '競價排名:每回合收入 +2', home: 'beijing',
    logo: 'baidu', strengths: { tech: 3, ops: 3, econ: 5, mobility: 2, strategy: 3 },
    bio: '「百度一下,你就知道」的搜尋大佬。靠競價排名賺得盆滿缽滿,也因此屢屢翻車上熱搜。AI 開發者大會上台演講時被觀眾衝上來潑了一身水,場面一度十分 social。' },
  // 台灣
  { id: 'tsmc',   faction: 'TW', name: '護國神山·張中謀', real: '張忠謀 台積電', industry: '晶片', industryDesc: '先進製程壟斷',
    perk: 'chip', perkText: '晶片稅:其他玩家每次發展科技卡須支付你 2 金錢;你的硬體卡科技力 +5 點;開局秘密自選支持陣營,可「轉向」一次與「表態」', home: 'hsinchu',
    logo: 'tsmc', strengths: { tech: 4, ops: 2, econ: 4, mobility: 2, strategy: 5 },
    bio: '54 歲才創業、打造「護國神山」的晶圓代工之父。全世界最先進的晶片幾乎都得排隊請他代工,被稱為地表「地緣政治上最重要的公司」。一座新竹廠,就是一面「矽盾」。' },
  // 日本(7人以上)
  { id: 'toyota', faction: 'JP', name: '牛頭牌·豐田彰男', real: '豐田章男 Toyota', industry: '汽車', industryDesc: '油電混合/匠人精神',
    perk: 'auto', perkText: '改善哲學:發展費用 -2,每回合收入 +2(科技產出計入米國)', home: 'tokyo',
    logo: 'toyota', strengths: { tech: 4, ops: 2, econ: 5, mobility: 4, strategy: 3 },
    bio: '創辦家族第四代、會親自下場跑賽道的賽車手社長。死忠擁護油電混合,逢人就唱衰純電車「別把雞蛋放在同一個籃子」。信奉匠人精神與「改善(Kaizen)」哲學,主打一台「開不壞的 Toyota」。' },
  // 韓國(8人)
  { id: 'lee',    faction: 'KR', name: '三星太子·李在熔', real: '李在鎔 Samsung', industry: '手機', industryDesc: '財閥/螢幕/記憶體',
    perk: 'phone', perkText: '財閥手腕:打出作戰卡費用 -2(科技產出計入牆國)', home: 'seoul',
    logo: 'samsung', strengths: { tech: 4, ops: 4, econ: 4, mobility: 2, strategy: 3 },
    bio: '三星太子,半導體與摺疊機帝國的接班人。曾因某代手機電池「自帶煙火效果」被禁止帶上飛機而名揚四海。游走於看守所與董事會之間,財閥手腕一流,韓國經濟的半壁江山都看他臉色。' },
];

// ---- 角色行動台詞(依性格/語錄/人物傳記/網路梗)----
// 類別:build 部署科技卡 / attack 作戰卡出手 / move 移動 / general 其他(放棄、升級、表態…)。
// 客戶端在對應行動的特效旁,於角色棋子上方冒出隨機一句(AI 與真人皆適用)。
export const CHARACTER_LINES = {
  musk: {
    build: ['Funding secured,這廠我蓋定了!', '把這裡直接送上火星 🚀'],
    attack: ['一則推文,讓你股價上沖下洗。', '我順手把你的招牌改成一個「X」。'],
    move: ['星鏈導航已上線,衝!'],
    general: ['要把人類變成跨行星物種(順便嘴你一下)。'],
  },
  jensen: {
    build: ['買越多,省越多 — 這張我全包了!', 'The more you buy, the more you save!'],
    attack: ['沒有我的算力,你連追都追不上。', '算力即正義,你出局了。'],
    move: ['全世界的算力焦慮,跟我走。'],
    general: ['黃氏定律:算力即正義。'],
  },
  zuck: {
    build: ['歡迎來到元宇宙(這次有腳了)。', '先上線再說,反正能改名。'],
    attack: ['你的弱點,我演算法早就看穿了。', '聽證會都撐過了,這點小場面?'],
    move: ['衝浪、MMA、佔領下一座城。'],
    general: ['我也是人類,真的。'],
  },
  jobs: {
    build: ['One more thing… 這座城,屬於我了。', '這不只是科技,是信仰充值。'],
    attack: ['你研發失敗,是你拿手機的姿勢不對。', '真正的藝術家,順手毀掉對手。'],
    move: ['現實扭曲力場,啟動。'],
    general: ['Stay hungry,你倆都做到了。'],
  },
  google: {
    build: ['Google 一下,這城就是我的了。', '我們有最強的 AI(這次沒答錯)。'],
    attack: ['競價排名,你被我擠到第二頁了。', '別作惡?那條我早就刪了。'],
    move: ['搜尋下一個目標……定位完成。'],
    general: ['大數據變現,穩賺不賠。'],
  },
  jack: {
    build: ['今天蓋廠,是修來的福報。', '我對錢沒有興趣,我只想蓋這個。'],
    attack: ['年輕人,格局要大一點(然後挨打)。', '螞蟻搬家,你的收益歸我了。'],
    move: ['滄海一聲笑~ 轉戰下一城。'],
    general: ['退休了,但江湖還有我的傳說。'],
  },
  ren: {
    build: ['備胎轉正,遙遙領先!', '把它列實體清單?我自己造。'],
    attack: ['我辦公室掛著被打成篩子的戰機照片。', '極限施壓,只會讓我更強。'],
    move: ['低調務實,挺進下一座城。'],
    general: ['遙遙領先,不解釋。'],
  },
  pony: {
    build: ['你做什麼火,我就上線一個 Plus 版。', '像素級致敬,部署完成。'],
    attack: ['你的社群、遊戲、錢包,十之八九在我手裡。', '低調地,就把你超了。'],
    move: ['一隻企鵝,默默佔領全場。'],
    general: ['我這個人,低調到像透明人。'],
  },
  liang: {
    build: ['557 萬美元,屠榜給你看。', '開源放出去,矽谷自己抖。'],
    attack: ['國運級的一手,你接不住。', '我一張表,你跌掉一個英特爾。'],
    move: ['演算法已最佳化,前進。'],
    general: ['開源屠榜,海放矽谷。'],
  },
  robin: {
    build: ['百度一下,這城你就知道是我的了。', '競價排名,出價最高者得。'],
    attack: ['把你的排名,擠到沒人看的那頁。', '熱搜?這次換你上。'],
    move: ['擺渡到下一個流量入口。'],
    general: ['潑我水沒用,我照樣賺。'],
  },
  tsmc: {
    build: ['一座新竹廠,就是一面矽盾。', '先進製程,全世界排隊等我。'],
    attack: ['沒有我的晶片,你什麼都做不出來。', '收下這筆晶片稅吧。'],
    move: ['護國神山,移防到此。'],
    general: ['54 歲才創業,照樣是神山。'],
  },
  toyota: {
    build: ['一台開不壞的 Toyota,蓋好了。', '改善(Kaizen):再進化一階。'],
    attack: ['別把雞蛋放在同一個籃子裡 — 像你。', '純電車?我唱衰你到底。'],
    move: ['社長親自下場跑這一趟。'],
    general: ['匠人精神,穩穩地贏。'],
  },
  lee: {
    build: ['摺疊起來,帝國再展開。', '半導體與螢幕,我全要。'],
    attack: ['這一擊,自帶煙火效果。', '財閥手腕,你擋不住。'],
    move: ['從董事會到這裡,我說了算。'],
    general: ['韓國經濟的半壁江山,看我臉色。'],
  },
};

// 角色能力特長加權的顯示軸(雷達/長條共用)
export const STRENGTH_AXES = [
  { key: 'tech',     name: '科技', icon: '🔬' },
  { key: 'ops',      name: '作戰', icon: '💣' },
  { key: 'econ',     name: '經濟', icon: '💰' },
  { key: 'mobility', name: '機動', icon: '🚀' },
  { key: 'strategy', name: '謀略', icon: '🧠' },
];

// 角色頭像/立繪/公司旗幟資源路徑(統一由此推導,前後端共用)
export const charAvatar   = c => `images/avatars/${typeof c === 'string' ? c : c.id}_chibi.png`;
export const charPortrait = c => `images/characters/${typeof c === 'string' ? c : c.id}.png`;
export const charLogo     = c => {
  const ch = typeof c === 'string' ? CHARACTERS.find(x => x.id === c) : c;
  return ch?.logo ? `images/logos/${ch.logo}.png` : null;
};
// 陣營國旗(images/flags/flag_<faction>.png:us/cn/tw/jp/kr)
export const factionFlag  = fac => `images/flags/flag_${(typeof fac === 'string' ? fac : fac.id).toLowerCase()}.png`;

// ---- 環太平洋地圖(城市數加倍版:米/牆各 12、台日韓各 2、中立 22,共 52 城) ----
// country:城市所屬國家。米國玩家在牆國地盤(及反之)發展科技花費加倍,其他國家不在此限。
// startLevel:城市初始等級 — 全部城市一律 Lv.2 起跳(等級 ≥ 科技卡階級才能建造,用電力升級)。
// 城市座標依真實經緯度相對排列(各區以線性 lat/lon→x/z 投影,真實太近的城市群微調至間距 ≈2;
// 六角卡格大小由 board3d 依最近鄰自動縮放,維持一致且不重疊)。x 正=美洲、x 負=亞洲/中東;z 負=北、z 正=南。
export const REGIONS = [
  // 米國(12 城)— 西岸太平洋沿線(seattle/portland/sv/la 同經度帶)、洛磯/南方內陸、東岸(chicago/atlanta/nyc/boston)
  { id: 'seattle',  name: '西雅圖',   x: 9.1,  z: -8.0, tag: '雲端走廊', country: 'US', startLevel: 2 },
  { id: 'portland', name: '波特蘭',   x: 9.3,  z: -6.0, tag: '開源綠都', country: 'US', startLevel: 2 },
  { id: 'sv',       name: '矽谷',     x: 9.1,  z: -0.3, tag: '科技聖地', country: 'US', startLevel: 2 },
  { id: 'la',       name: '洛杉磯',   x: 10.0, z: 2.6,  tag: '好萊塢', country: 'US', startLevel: 2 },
  { id: 'denver',   name: '丹佛',     x: 12.9, z: -1.8, tag: '洛磯算力', country: 'US', startLevel: 2 },
  { id: 'phoenix',  name: '鳳凰城',   x: 11.8, z: 3.4,  tag: '晶片新廠', country: 'US', startLevel: 2 },
  { id: 'chicago',  name: '芝加哥',   x: 16.8, z: -3.5, tag: '風城期交', country: 'US', startLevel: 2 },
  { id: 'dallas',   name: '達拉斯',   x: 14.7, z: 3.6,  tag: '油氣樞紐', country: 'US', startLevel: 2 },
  { id: 'austin',   name: '奧斯汀',   x: 14.5, z: 5.6,  tag: '火箭基地', country: 'US', startLevel: 2 },
  { id: 'atlanta',  name: '亞特蘭大', x: 17.5, z: 2.9,  tag: '南方矽林', country: 'US', startLevel: 2 },
  { id: 'nyc',      name: '紐約',     x: 19.8, z: -2.6, tag: '華爾街', country: 'US', startLevel: 2 },
  { id: 'boston',   name: '波士頓',   x: 20.8, z: -4.4, tag: '常春藤實驗室', country: 'US', startLevel: 2 },
  // 牆國(12 城)— 東部沿海(tianjin/shanghai/shenzhen/guangzhou)、華中華西內陸、東北(harbin)
  { id: 'harbin',   name: '哈爾濱',   x: -8.0,  z: -10.0, tag: '冰封數據', country: 'CN', startLevel: 2 },
  { id: 'tianjin',  name: '天津',     x: -10.4, z: -5.4, tag: '渤海港城', country: 'CN', startLevel: 2 },
  { id: 'beijing',  name: '北京',     x: -12.2, z: -7.0, tag: '中關村', country: 'CN', startLevel: 2 },
  { id: 'hangzhou', name: '杭州',     x: -11.0, z: 0.4,  tag: '電商之都', country: 'CN', startLevel: 2 },
  { id: 'xian',     name: '西安',     x: -14.3, z: -3.1, tag: '古都晶圓', country: 'CN', startLevel: 2 },
  { id: 'nanjing',  name: '南京',     x: -11.2, z: -2.0, tag: '長江算力', country: 'CN', startLevel: 2 },
  { id: 'shanghai', name: '上海',     x: -9.4,  z: -1.0, tag: '魔都', country: 'CN', startLevel: 2 },
  { id: 'wuhan',    name: '武漢',     x: -12.8, z: -0.6, tag: '光谷', country: 'CN', startLevel: 2 },
  { id: 'chongqing',name: '重慶',     x: -14.8, z: 0.2,  tag: '山城雲倉', country: 'CN', startLevel: 2 },
  { id: 'shenzhen', name: '深圳',     x: -11.6, z: 4.2,  tag: '硬體矽谷', country: 'CN', startLevel: 2 },
  { id: 'chengdu',  name: '成都',     x: -16.2, z: -1.4, tag: '遊戲山城', country: 'CN', startLevel: 2 },
  { id: 'guangzhou',name: '廣州',     x: -13.6, z: 3.0,  tag: '南方智造', country: 'CN', startLevel: 2 },
  // 日本(2 城)— 大阪在東京西南
  { id: 'tokyo',    name: '東京',     x: -2.6, z: -5.8, tag: '電子街', country: 'JP', startLevel: 2 },
  { id: 'osaka',    name: '大阪',     x: -3.8, z: -4.2, tag: '關西商都', country: 'JP', startLevel: 2 },
  // 韓國(2 城)— 釜山在首爾東南
  { id: 'seoul',    name: '首爾',     x: -7.2, z: -8.0, tag: '財閥都心', country: 'KR', startLevel: 2 },
  { id: 'busan',    name: '釜山',     x: -6.0, z: -5.8, tag: '海港財閥', country: 'KR', startLevel: 2 },
  // 台灣(2 城)— 台北在新竹東北
  { id: 'hsinchu',  name: '新竹',     x: -6.6, z: -0.4, tag: '護國神山', chipBonus: true, country: 'TW', startLevel: 2 },
  { id: 'taipei',   name: '台北',     x: -5.6, z: -2.4, tag: '南港軟體', country: 'TW', startLevel: 2 },
  // 中立 — 北美/歐洲側
  { id: 'vancouver',name: '溫哥華',   x: 8.3,  z: -9.8, tag: '北境雲廠', country: null, startLevel: 2 },
  { id: 'toronto',  name: '多倫多',   x: 18.6, z: -4.9, tag: '楓葉AI谷', country: null, startLevel: 2 },
  { id: 'montreal', name: '蒙特婁',   x: 19.9, z: -6.4, tag: '楓葉AI北', country: null, startLevel: 2 },
  { id: 'mexico',   name: '墨西哥城', x: 14.6, z: 9.0,  tag: '近岸製造', country: null, startLevel: 2 },
  { id: 'panama',   name: '巴拿馬城', x: 16.6, z: 11.0, tag: '運河樞紐', country: null, startLevel: 2 },
  { id: 'london',   name: '倫敦',     x: 20.6, z: -9.0, tag: '金融科技城', country: null, startLevel: 2 },
  { id: 'amsterdam',name: '阿姆斯特丹', x: 22.6, z: -9.6, tag: '歐陸門戶', country: null, startLevel: 2 },
  { id: 'paris',    name: '巴黎',     x: 20.8, z: -11.0, tag: '塞納科技', country: null, startLevel: 2 },
  { id: 'berlin',   name: '柏林',     x: 24.6, z: -10.4, tag: '工業4.0', country: null, startLevel: 2 },
  // 中立 — 中東/印度側(由西向東:telaviv→dubai→德里/孟買/班加羅爾)
  { id: 'telaviv',  name: '特拉維夫', x: -19.6, z: 3.0,  tag: '新創之國', country: null, startLevel: 2 },
  { id: 'dubai',    name: '杜拜',     x: -18.2, z: 4.6,  tag: '石油金庫', country: null, startLevel: 2 },
  { id: 'delhi',    name: '新德里',   x: -16.2, z: 4.8,  tag: '南亞政經', country: null, startLevel: 2 },
  { id: 'mumbai',   name: '孟買',     x: -17.4, z: 7.0,  tag: '寶萊塢雲', country: null, startLevel: 2 },
  { id: 'bangalore',name: '班加羅爾', x: -16.0, z: 8.6,  tag: '印度矽谷', country: null, startLevel: 2 },
  // 中立 — 東南亞/大洋洲側
  { id: 'hanoi',    name: '河內',     x: -13.2, z: 5.6,  tag: '世界工廠2.0', country: null, startLevel: 2 },
  { id: 'bangkok',  name: '曼谷',     x: -14.6, z: 7.2,  tag: '東協門戶', country: null, startLevel: 2 },
  { id: 'kualalumpur', name: '吉隆坡', x: -13.8, z: 9.2, tag: '雙塔數據', country: null, startLevel: 2 },
  { id: 'singapore',name: '新加坡',   x: -12.8, z: 11.0, tag: '中立樞紐', country: null, startLevel: 2 },
  { id: 'jakarta',  name: '雅加達',   x: -10.8, z: 12.0, tag: '群島樞紐', country: null, startLevel: 2 },
  { id: 'manila',   name: '馬尼拉',   x: -8.6,  z: 8.2,  tag: '外包重鎮', country: null, startLevel: 2 },
  { id: 'sydney',   name: '雪梨',     x: -3.2,  z: 10.8, tag: '南方節點', country: null, startLevel: 2 },
  { id: 'melbourne',name: '墨爾本',   x: -5.0,  z: 12.4, tag: '南境花園', country: null, startLevel: 2 },
];

// ---- 集體事件卡(每一輪開始前抽一張,效果持續該輪) ----
// effect.type:resZero/resHalf(限制資源獲取)、catCost/opsCost(卡片花費增加)、
//             apDelta(行動點增減)、techDelta(部署科技力增減)、incomeBonus(收入增加)
export const EVENT_CARDS = [
  { id: 'war',      name: '烏俄戰爭',     icon: '⚔️', effect: { type: 'resZero', res: 'oil' },
    desc: '油田烽火,航運中斷 — 本輪所有人石油收入歸零' },
  { id: 'opec',     name: 'OPEC 減產',    icon: '🛢️', effect: { type: 'resHalf', res: 'oil' },
    desc: '油國聯手掐供給 — 本輪石油收入減半' },
  { id: 'fukushima',name: '福島核災',     icon: '☢️', effect: { type: 'resZero', res: 'power' },
    desc: '核電廠全面停機 — 本輪電力收入歸零' },
  { id: 'blackout', name: '全球大停電',   icon: '🔌', effect: { type: 'resHalf', res: 'power' },
    desc: '電網連鎖崩潰 — 本輪電力收入減半' },
  { id: 'lehman',   name: '金融海嘯',     icon: '📉', effect: { type: 'resHalf', res: 'money' },
    desc: '雷曼兄弟倒了 — 本輪金錢收入減半' },
  { id: 'covid',    name: '世紀疫情',     icon: '😷', effect: { type: 'apDelta', val: -1 },
    desc: '全球封城居家隔離 — 本輪每人行動點 -1' },
  { id: 'chipban',  name: '晶片禁令',     icon: '🚫', effect: { type: 'catCost', cat: 'hardware', mult: 1.5 },
    desc: '實體清單再加長 — 本輪硬體類科技卡花費 +50%' },
  { id: 'aiwinter', name: 'AI 寒冬',      icon: '❄️', effect: { type: 'catCost', cat: 'ai', mult: 1.5 },
    desc: '泡沫戳破投資急凍 — 本輪 AI 類科技卡花費 +50%' },
  { id: 'shuttle',  name: '太空梭折戟',   icon: '🚀', effect: { type: 'catCost', cat: 'power', mult: 1.5 },
    desc: '發射失敗監管收緊 — 本輪動力類科技卡花費 +50%' },
  { id: 'prism',    name: '稜鏡門風暴',   icon: '🕵️', effect: { type: 'catCost', cat: 'info', mult: 1.5 },
    desc: '全民監控醜聞曝光 — 本輪資訊類科技卡花費 +50%' },
  { id: 'bubble',   name: '元宇宙泡沫',   icon: '🫧', effect: { type: 'catCost', cat: 'fun', mult: 1.5 },
    desc: '虛擬地產乏人問津 — 本輪娛樂類科技卡花費 +50%' },
  { id: 'defcon',   name: '駭客大會',     icon: '💀', effect: { type: 'opsCost', mult: 1.5 },
    desc: '零日漏洞價格飆漲 — 本輪作戰卡花費 +50%' },
  { id: 'aiboom',   name: 'AI 元年',      icon: '🤖', effect: { type: 'techDelta', val: 5 },
    desc: '全民瘋 AI — 本輪部署的科技卡科技力 +5 點' },
  { id: 'recovery', name: '景氣復甦',     icon: '📈', effect: { type: 'incomeBonus', val: 1 },
    desc: '市場信心回暖 — 本輪每種資源收入 +1' },
  { id: 'shale',    name: '頁岩油革命',   icon: '⛽', effect: { type: 'resBoost', res: 'oil', val: 2 },
    desc: '新井遍地開花油價跳水 — 本輪石油收入 +2' },
  { id: 'greensub', name: '綠能補貼',     icon: '🌱', effect: { type: 'resBoost', res: 'power', val: 2 },
    desc: '太陽能風電大放送 — 本輪電力收入 +2' },
  { id: 'qe',       name: '量化寬鬆',     icon: '💵', effect: { type: 'resBoost', res: 'money', val: 2 },
    desc: '央行印鈔機全速運轉 — 本輪金錢收入 +2' },
  { id: 'tariff',   name: '關稅大戰',     icon: '🧱', effect: { type: 'allCost', mult: 1.25 },
    desc: '互課關稅供應鏈漲價 — 本輪所有科技卡花費 +25%' },
  { id: 'suez',     name: '運河大堵塞',   icon: '🚢', effect: { type: 'apDelta', val: -1 },
    desc: '一艘貨輪卡住全球物流 — 本輪每人行動點 -1' },
  { id: 'spacefad', name: '太空旅遊熱',   icon: '🛰️', effect: { type: 'catCost', cat: 'power', mult: 0.75 },
    desc: '富豪排隊上太空 — 本輪動力類科技卡花費 -25%' },
  { id: 'gptboom',  name: '聊天機器人爆紅', icon: '🤯', effect: { type: 'catCost', cat: 'ai', mult: 0.75 },
    desc: '兩個月破億用戶 — 本輪 AI 類科技卡花費 -25%' },
  { id: 'oss',      name: '開源運動',     icon: '🐧', effect: { type: 'catCost', cat: 'info', mult: 0.75 },
    desc: '程式碼全公開白嫖萬歲 — 本輪資訊類科技卡花費 -25%' },
  { id: 'blackfri', name: '黑色星期五',   icon: '🛒', effect: { type: 'catCost', cat: 'hardware', mult: 0.75 },
    desc: '消費電子清倉大促 — 本輪硬體類科技卡花費 -25%' },
  { id: 'concert',  name: '元宇宙演唱會', icon: '🎤', effect: { type: 'catCost', cat: 'fun', mult: 0.75 },
    desc: '千萬人擠進虛擬會場 — 本輪娛樂類科技卡花費 -25%' },
];

// 路網以「每座城市的航線數上限」重新設計(鐵路/海運=便宜相鄰移動 1🛢️;飛機=可橫跨多城 5🛢️):
//   ● 鐵路 + 海運(合計,即非 plane 的邊):靠海城市 ≤4 條、內陸城市 ≤3 條。
//   ● 空運(plane 邊,獨立計算):環太平洋城市 ≤3 條、其他城市 ≤4 條。
//   越洋以海運/空運連通;城市加倍後重排,單一真相 EDGE_LIST = [a, b, 交通工具];
//   train 鐵路 / ship 航運 → 只能通行到「相鄰」城市(1🛢️;越洋海運亦可);
//   plane 飛機 → 長程航線,唯有飛機能橫跨多座城市(須搭機 5🛢️)。EDGES 仍為完整連通圖(飛機 BFS 用)。
const EDGE_LIST = [
  // ── 北美(鐵路為主,西岸太平洋海運少量)──
  ['vancouver', 'seattle', 'train'], ['seattle', 'sv', 'train'], ['seattle', 'portland', 'train'],
  ['portland', 'denver', 'train'], ['sv', 'la', 'train'], ['sv', 'denver', 'train'], ['sv', 'phoenix', 'train'],
  ['phoenix', 'dallas', 'train'], ['phoenix', 'austin', 'train'], ['denver', 'chicago', 'train'],
  ['chicago', 'toronto', 'train'], ['toronto', 'montreal', 'train'], ['toronto', 'nyc', 'train'],
  ['nyc', 'dallas', 'train'], ['nyc', 'boston', 'train'], ['nyc', 'atlanta', 'ship'], ['dallas', 'atlanta', 'train'],
  ['austin', 'mexico', 'train'], ['mexico', 'panama', 'ship'],
  // ── 歐洲(跨大西洋海運 + 近海/內陸)──
  ['boston', 'london', 'ship'], ['montreal', 'london', 'ship'], ['london', 'paris', 'ship'],
  ['london', 'amsterdam', 'ship'], ['amsterdam', 'berlin', 'train'], ['paris', 'amsterdam', 'train'], ['paris', 'berlin', 'train'],
  // ── 越洋太平洋主航線(海運)+ 東亞沿海(海運)──
  ['seattle', 'tokyo', 'ship'], ['vancouver', 'seoul', 'ship'], ['la', 'hsinchu', 'ship'], ['la', 'sydney', 'ship'],
  ['tokyo', 'osaka', 'ship'], ['tokyo', 'seoul', 'ship'], ['tokyo', 'shanghai', 'ship'],
  ['osaka', 'busan', 'ship'], ['seoul', 'busan', 'ship'], ['seoul', 'tianjin', 'ship'],
  ['hsinchu', 'shanghai', 'ship'], ['hsinchu', 'taipei', 'ship'], ['hsinchu', 'shenzhen', 'ship'],
  ['shanghai', 'taipei', 'ship'], ['shenzhen', 'guangzhou', 'ship'],
  // ── 牆國本土(鐵路)──
  ['beijing', 'tianjin', 'train'], ['beijing', 'harbin', 'train'], ['beijing', 'hangzhou', 'train'], ['harbin', 'tianjin', 'train'],
  ['hangzhou', 'xian', 'train'], ['hangzhou', 'nanjing', 'train'], ['xian', 'wuhan', 'train'], ['xian', 'chongqing', 'train'],
  ['nanjing', 'shanghai', 'train'], ['nanjing', 'wuhan', 'train'], ['wuhan', 'chongqing', 'train'],
  ['chongqing', 'chengdu', 'train'], ['chengdu', 'guangzhou', 'train'],
  // ── 東南亞 / 南海 / 印度洋 / 中東(海運為主,半島走鐵路)──
  ['shenzhen', 'hanoi', 'ship'], ['guangzhou', 'hanoi', 'ship'], ['hanoi', 'bangkok', 'train'],
  ['bangkok', 'kualalumpur', 'train'], ['kualalumpur', 'singapore', 'train'], ['singapore', 'jakarta', 'ship'],
  ['jakarta', 'manila', 'ship'], ['manila', 'singapore', 'ship'], ['bangkok', 'bangalore', 'ship'],
  ['bangalore', 'mumbai', 'train'], ['bangalore', 'delhi', 'train'], ['delhi', 'mumbai', 'train'],
  ['delhi', 'dubai', 'train'], ['mumbai', 'dubai', 'ship'], ['dubai', 'telaviv', 'train'],
  // ── 大洋洲 ──
  ['singapore', 'sydney', 'ship'], ['sydney', 'melbourne', 'train'], ['jakarta', 'melbourne', 'ship'],
  // ── 飛機專用長程航線(可橫跨城市;只有飛機能用)──
  ['sv', 'tokyo', 'plane'], ['sv', 'hsinchu', 'plane'], ['la', 'tokyo', 'plane'], ['sydney', 'austin', 'plane'],
  ['nyc', 'amsterdam', 'plane'], ['amsterdam', 'sv', 'plane'], ['amsterdam', 'seattle', 'plane'],
  ['dubai', 'singapore', 'plane'], ['bangalore', 'shanghai', 'plane'], ['berlin', 'telaviv', 'plane'],
  ['paris', 'nyc', 'plane'], ['manila', 'tokyo', 'plane'],
];

// 由單一真相 EDGE_LIST 導出:EDGES(完整連通圖,供飛機 BFS)+ EDGE_TYPES(交通工具,供相鄰/飛機判定)
export const EDGES = EDGE_LIST.map(([a, b]) => [a, b]);
export const EDGE_TYPES = Object.fromEntries(EDGE_LIST.map(([a, b, t]) => [`${a}|${b}`, t]));

/** 此邊是否為飛機專用航線:鐵路/航運的相鄰移動不可使用,只有飛機可橫跨 */
export const isAirEdge = (a, b) => (EDGE_TYPES[`${a}|${b}`] || EDGE_TYPES[`${b}|${a}`]) === 'plane';

/** 遊戲回合數依人數決定:2~4 人 = 20 季(5 年)、5~6 人 = 16 季(4 年)、7~8 人 = 12 季(3 年)。
 *  人多 → 每季行動總量大、單季耗時長,縮短季數讓整局時間維持合理。皆為整年數,季標籤不會出現半年。 */
export function roundsForPlayers(n) {
  const c = Math.max(2, Math.min(8, n | 0));
  return c <= 4 ? 20 : c <= 6 ? 16 : 12;
}

// 以下為預設值;伺服器啟動時會讀取 config/rules.json 覆寫(前端開局時也會 fetch 同一份套用)
export const RULES = {
  startResources: { money: 10, power: 8, oil: 8 },
  baseIncome: { money: 2, power: 2, oil: 2 },
  apPerTurn: 3,
  drawCost: { money: 3, power: 1, oil: 1 },
  handLimit: 8,
  startHand: 4,
  maxRounds: 12,           // 3 年 × 4 季 = 12 回合
  seasonsPerYear: 4,
  maxCardsPerRegion: 4,    // 每城市科技卡上限
  maxOwnCardsPerRegion: 1, // 一個角色在一座城市只能建造一座科技卡
  depreciationRate: 0.5,   // 同類型替換:舊卡折舊抵免 50% 費用
  moveOilCost: 1,          // 相鄰移動消耗石油
  planeOilCost: 5,         // 搭飛機:石油費用 5 倍
  planeRange: 3,           // 飛機最多可跨 3 格(航線);超過須分段飛
  rivalLandMult: 2,        // 米國在牆國地盤(及反之)發展科技花費加倍
  // 放棄權利:放棄科技→電力 / 放棄作戰→金錢 / 放棄行動(移動)→石油(每回合各一次)
  // 實得 = forfeitBase + 本國科技力 ÷ techIncomeDivisor(科技力越高收益越高)
  forfeitBase: 3,
  techIncomeDivisor: 100,  // 每 100 點本國科技力:每種資源收入 +1、放棄權利收益 +1
  techBonusCap: 3,         // 科技力收益紅利上限(避免領先方無限滾雪球)
  exchangeRate: 2,         // 每回合一次:每 2 金錢換 1 石油或電力(不可反向)
  exchangeMax: 5,
  tradeMaxOffers: 3,       // 交易環節:每人最多提出 3 次交易
  tradeMaxDeals: 1,        // 交易環節:每人只能成交 1 次(包含接受成交)
  cityMaxLevel: 5,
  cityUpgradePower: 3,     // 升級城市電力費用 = 目前等級 × 3(韓國減半)
  opsRange: 2,             // 灰色作戰卡:對兩次航線(2 格)可及處施展
  cnOpsRangeBonus: 1,      // 牆國優勢:灰色作戰卡攻擊範圍 +1(可及 3 格)
  opsAirHops: 2,           // 灰色作戰卡:每段「空運(飛機航線)」算 2 格(鐵路/航運算 1 格),較難跨洋遠程狙擊
  opsDistSurcharge: 0.5,   // 每多一個航線(超過 1 格)費用 +50%
  // 三類作戰卡 debuff 強度:實際數值與 max(1, 攻擊力 − 有效防護力) 成正比
  opsTechDebuff: 5,        // 間諜:削減目標科技卡的科技力點數(上限為該卡實際貢獻)
  opsIncomeDrain: 1,       // 竊取:每回合自目標卡交易收益抽走的資源總量(上限為該卡產出)
  opsDeprecLeak: 1,        // 假新聞:對手同類改建該卡時,從折舊資源轉給施法者的量 = min(該卡折舊額, (攻−防)×此係數)
  cardUpgradeAp: 1,        // 捨牌升階(換 4/5 階卡)消耗的行動點
  tier4DiscardSum: 6,      // 捨棄科技卡階級加總達此值 → 抽 1 張 4 階卡
  tier5DiscardCount: 2,    // 捨棄此張數的 4 階卡 → 抽 1 張 5 階卡
  deckScale: { 2: 0.5, 3: 0.5, 4: 0.75, 5: 0.75, 6: 1, 7: 1, 8: 1 }, // 牌庫數量依人數調整
  specialtyDiscount: 0.2,  // 擅長領域研發費用 -20%
  specialtyTechBonus: 5,   // 擅長領域部署科技力 +5 點
  pointsPerYear: 20,       // 科技力領先 1 年 = 領先 20 點
  // 各國初始科技力(點):米國 200、牆國 120(CN=120 為模擬平衡值;小局會依讓分縮放上調)。
  // 台日韓開局一律取「米國與(縮放後)牆國的中間值」,確保夾在米牆之間(constructor 內計算)。
  techStart: { US: 200, CN: 120, TW: 150, JP: 150, KR: 150 },
  cityBuildCooldown: 4,    // 已建造科技卡的城市要過 1 年(4 季)才可重新建造
  usWinLead: 10,           // 以下勝利門檻單位:年(×20 換算成點)
  cnWinLead: 0,
  twRevealPenalty: 5,
  twPivotReserveKeep: 0.5, // 台灣「轉向」(整局一次):神山儲備保留比例
  spoilerWinCards: 3,      // 日韓分享終局勝利/僵局獨勝所需的自身場上科技卡張數
  chipLevy: 2,             // 台灣優勢:晶片稅(金錢)
  cnOpsHalf: 0.5,          // 牆國優勢:灰色作戰卡費用是他國的一半
  jpMoveHalf: 0.5,         // 日本優勢:油電混合 — 移動石油費用減半(捨去)
  krUpgradeHalf: 0.5,      // 韓國優勢:基建狂魔 — 升級城市電力費用減半(進位)
  jpWinLead: 5,            // 終局米陣營勝利帶:米國領先 ≥5 年(日本同享)
  cnEndLead: 1,            // 終局牆陣營勝利帶:差距 ≤1 年 = 實質追平(韓國同享)
  minPlayers: 3,
  maxPlayers: 8,
  jpkrMinPlayers: 6, // 遊戲人數 6 以上同時開放日本與韓國
};

/** 用設定檔(config/rules.json)覆寫 RULES — 就地深合併,讓所有 import 端看到同一份 */
export function applyRulesOverrides(obj) {
  if (!obj || typeof obj !== 'object') return RULES;
  for (const k in obj) {
    if (k.startsWith('$')) continue; // $comment 等註解欄位
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)
      && RULES[k] && typeof RULES[k] === 'object' && !Array.isArray(RULES[k])) {
      Object.assign(RULES[k], v);
    } else {
      RULES[k] = v;
    }
  }
  return RULES;
}
