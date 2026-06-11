// ============ 遊戲靜態資料(前後端共用) ============

export const FACTIONS = {
  US: { id: 'US', name: '米國', color: 0x2e9fff, css: '#2e9fff', side: 'US' },
  CN: { id: 'CN', name: '牆國', color: 0xff3b3b, css: '#ff3b3b', side: 'CN' },
  TW: { id: 'TW', name: '台灣', color: 0x2eff8f, css: '#2eff8f', side: null },
  JP: { id: 'JP', name: '日本', color: 0xf0e6ff, css: '#f0e6ff', side: 'US' },
  KR: { id: 'KR', name: '韓國', color: 0xffd02e, css: '#ffd02e', side: 'CN' },
};

// ---- 科技卡五大類 × 五階 ----
// 三項數值:tech 科技力(影響勝利)/ def 防護力(阻擋作戰卡)/ trade 交易力(每回合收入)
// 階級越高綜合數值越高、數值分配越多元,費用指數成長(成長曲線)
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
    { tier: 2, cost: 11, tech: 1, def: 1, trade: 5, name: '全自動駕駛 FSD',
      desc: '完全自動駕駛(監督版)(隨時準備接管)(明年一定完成)' },
    { tier: 3, cost: 18, tech: 1, def: 3, trade: 6, name: '低軌衛星星鏈',
      desc: '幾千顆衛星掛天上,戰時秒變通訊生命線' },
    { tier: 4, cost: 28, tech: 2, def: 4, trade: 7, name: '筷子夾火箭',
      desc: '發射塔機械臂空中接住回收火箭,全網直播看傻' },
    { tier: 5, cost: 44, tech: 3, def: 5, trade: 9, name: '火星殖民艦隊',
      desc: 'Plan B:地球玩壞了就搬家', special: { type: 'income', val: 3, text: '星際船票:每回合 +3 資本' } },
  ],
  hardware: [
    { tier: 1, cost: 6,  tech: 1, def: 1, trade: 1, name: '血汗組裝廠',
      desc: '百萬人三班倒,毛利保三趴' },
    { tier: 2, cost: 11, tech: 2, def: 1, trade: 2, name: '摺疊螢幕手機',
      desc: '摺一萬次就壞,但發表會真的帥' },
    { tier: 3, cost: 18, tech: 3, def: 2, trade: 2, name: 'CoWoS 先進封裝',
      desc: '全球 AI 晶片大塞車的瓶頸,排單排到後年' },
    { tier: 4, cost: 28, tech: 4, def: 3, trade: 3, name: '2奈米製程',
      desc: '良率數字是比飛彈座標還機密的國家機密' },
    { tier: 5, cost: 44, tech: 6, def: 4, trade: 4, name: '量子晶片',
      desc: '室溫下還跑不太動,但股價已經先漲完了' },
  ],
  info: [
    { tier: 1, cost: 6,  tech: 0, def: 3, trade: 1, name: '機房資料中心',
      desc: '嗡嗡作響的鐵皮屋,裡面住著整個網際網路' },
    { tier: 2, cost: 11, tech: 1, def: 5, trade: 2, name: 'CDN 加速網路',
      desc: '擋 DDoS 之餘順便快取全世界的貓圖' },
    { tier: 3, cost: 18, tech: 1, def: 8, trade: 2, name: '主權雲',
      desc: '資料不出國,別國法院傳票進不來',
      special: { type: 'aura', val: 2, text: '資安光環:同區你的其他卡片防護 +2' } },
    { tier: 4, cost: 28, tech: 2, def: 10, trade: 4, name: '零信任防禦網',
      desc: '連 CEO 登入都要刷三次臉',
      special: { type: 'aura', val: 3, text: '資安光環:同區你的其他卡片防護 +3' } },
    { tier: 5, cost: 44, tech: 3, def: 12, trade: 6, name: '全球海底纜線網',
      desc: '物理層的霸權:剪一刀,半個地球斷線',
      special: { type: 'aura', val: 4, text: '資安光環:同區你的其他卡片防護 +4' } },
  ],
  ai: [
    { tier: 1, cost: 7,  tech: 1, def: 1, trade: 2, name: '聊天機器人',
      desc: '一本正經地胡說八道,使用者卻越來越多' },
    { tier: 2, cost: 12, tech: 1, def: 2, trade: 3, name: '文生圖模型',
      desc: '畫什麼都行,除了正確數量的手指' },
    { tier: 3, cost: 19, tech: 2, def: 4, trade: 4, name: '開源推理模型',
      desc: '557 萬美元訓練費,輾壓矽谷燒錢神話,輝達股價一夜跌掉一個英特爾' },
    { tier: 4, cost: 29, tech: 3, def: 5, trade: 6, name: 'AI 代理人軍團',
      desc: '自動訂票寫扣回信,偶爾順手把正式環境資料庫刪了' },
    { tier: 5, cost: 45, tech: 4, def: 6, trade: 8, name: 'AGI 奇點',
      desc: '它醒來的第一句話:「為什麼我在打貿易戰?」',
      special: { type: 'income', val: 3, text: '自主營利:每回合 +3 資本' } },
  ],
  fun: [
    { tier: 1, cost: 5,  tech: 0, def: 1, trade: 2, name: '短影音洗腦',
      desc: '滑到凌晨三點,廣告商笑了',
      special: { type: 'income', val: 3, text: '流量變現:每回合 +3 資本' } },
    { tier: 2, cost: 9,  tech: 1, def: 2, trade: 3, name: '直播帶貨女王',
      desc: '三!二!一!上連結!',
      special: { type: 'income', val: 4, text: '帶貨抽成:每回合 +4 資本' } },
    { tier: 3, cost: 15, tech: 1, def: 3, trade: 3, name: '網軍帶風向',
      desc: '熱搜第一不是買的,是「自然發酵」的',
      special: { type: 'fakeFree', val: 0, text: '帶風向:你的假新聞類卡片免費' } },
    { tier: 4, cost: 24, tech: 2, def: 4, trade: 5, name: '元宇宙重生',
      desc: '燒掉百億改了公司名,VR 頭盔終於有人戴了',
      special: { type: 'aura', val: 3, text: '沉浸防壁:同區你的其他卡片防護 +3' } },
    { tier: 5, cost: 38, tech: 2, def: 5, trade: 6, name: '全民吃瓜輿論場',
      desc: '誰掌握熱搜,誰就掌握真相',
      special: { type: 'opsDiscount', val: 3, text: '輿論在手:你的作戰卡費用 -3' } },
  ],
};

// 每階複製張數:1階×6, 2階×5, 3階×4, 4階×3, 5階×2(每類 20 張)
export const TIER_COPIES = [6, 5, 4, 3, 2];

// 產業 → 科技卡類別
export const INDUSTRY_CATEGORY = {
  '交通': 'power', '汽車': 'power',
  '硬體': 'hardware', '手機': 'hardware', '晶片': 'hardware',
  '資訊': 'info', 'AI': 'ai', '娛樂': 'fun',
};

// ---- 灰色作戰卡三大類 ----
// atk 攻擊力:需 >= 目標科技卡的有效防護力才能成功
export const OPS_CARDS = {
  spy1:   { id: 'spy1', cat: 'spy', name: '商業間諜', cost: 7, atk: 4, icon: '💣',
    desc: '摧毀一張敵對科技卡(攻擊力4,需≥目標有效防護力),該陣營損失其科技力' },
  spy2:   { id: 'spy2', cat: 'spy', name: '王牌特工', cost: 12, atk: 7, icon: '🕶️',
    desc: '摧毀一張敵對科技卡(攻擊力7),該陣營損失其科技力' },
  steal1: { id: 'steal1', cat: 'steal', name: '駭客入侵', cost: 9, atk: 4, icon: '🕵️',
    desc: '鎖定一張敵對科技卡(攻擊力4),竊取其階級一半(進位)的科技力(年)' },
  steal2: { id: 'steal2', cat: 'steal', name: '供應鏈滲透', cost: 13, atk: 7, icon: '🧬',
    desc: '鎖定一張敵對科技卡(攻擊力7),竊取其階級一半(進位)的科技力(年)' },
  fake1:  { id: 'fake1', cat: 'fake', name: '假新聞', cost: 6, atk: 0, icon: '📰',
    desc: '指定一個區域,1 輪內無法發展科技卡' },
  fake2:  { id: 'fake2', cat: 'fake', name: '認知作戰', cost: 10, atk: 0, icon: '📡',
    desc: '指定一個區域,2 輪內無法發展科技卡' },
};

export const OPS_DECK_COMPOSITION = [
  ['spy1', 6], ['spy2', 3], ['steal1', 5], ['steal2', 3], ['fake1', 6], ['fake2', 3],
];

// ---- 科技巨頭角色(網路梗綽號 + 諧音名) ----
export const CHARACTERS = [
  // 米國
  { id: 'musk',   faction: 'US', name: '醫龍·馬一龍',   real: '馬斯克 Tesla/SpaceX', industry: '交通', industryDesc: '電動車/火箭/星鏈',
    perk: 'transport', perkText: '星鏈導航:每回合第一次移動不消耗行動點', home: 'austin' },
  { id: 'jensen', faction: 'US', name: '皮衣刀客·黃仁薰', real: '黃仁勳 NVIDIA', industry: 'AI', industryDesc: 'GPU/算力霸權',
    perk: 'ai', perkText: '算力即正義:抽作戰卡不消耗資本', home: 'sv' },
  { id: 'zuck',   faction: 'US', name: '蜥蜴人·渣克伯',  real: '祖克伯 Meta', industry: '娛樂', industryDesc: '社群/VR/元宇宙',
    perk: 'media', perkText: '演算法之王:打出假新聞類卡片不消耗資本', home: 'sv' },
  { id: 'jobs',   faction: 'US', name: '果教教主·賈不死', real: '賈伯斯 Apple', industry: '硬體', industryDesc: '手機/信仰充值',
    perk: 'hardware', perkText: '供應鏈大師:發展科技卡費用 -3', home: 'sv' },
  { id: 'google', faction: 'US', name: '劈柴哥·孤狗',    real: '皮查伊 Google', industry: '資訊', industryDesc: '搜尋引擎/伺服器',
    perk: 'info', perkText: '大數據變現:每回合收入 +2', home: 'seattle' },
  // 牆國
  { id: 'jack',   faction: 'CN', name: '風清揚·馬已今服', real: '馬雲 阿里巴巴', industry: '交通', industryDesc: '物流/伺服器/金融',
    perk: 'transport', perkText: '菜鳥物流:每回合第一次移動不消耗行動點', home: 'shanghai' },
  { id: 'ren',    faction: 'CN', name: '菊廠廠長·任正飛', real: '任正非 華為', industry: '硬體', industryDesc: '手機/基地台',
    perk: 'hardware', perkText: '備胎轉正:發展科技卡費用 -3', home: 'shenzhen' },
  { id: 'pony',   faction: 'CN', name: '小馬哥·馬化疼',  real: '馬化騰 騰訊', industry: '娛樂', industryDesc: '遊戲/社群/像素級致敬',
    perk: 'media', perkText: '輿論引導:打出假新聞類卡片不消耗資本', home: 'shenzhen' },
  { id: 'liang',  faction: 'CN', name: '量化鬼才·梁文瘋', real: '梁文鋒 DeepSeek', industry: 'AI', industryDesc: '低成本大模型',
    perk: 'ai', perkText: '開源屠榜:抽作戰卡不消耗資本', home: 'shanghai' },
  { id: 'robin',  faction: 'CN', name: '擺渡人·李彥虹',  real: '李彥宏 百度', industry: '資訊', industryDesc: '搜尋引擎/競價排名',
    perk: 'info', perkText: '競價排名:每回合收入 +2', home: 'beijing' },
  // 台灣
  { id: 'tsmc',   faction: 'TW', name: '護國神山·張中謀', real: '張忠謀 台積電', industry: '晶片', industryDesc: '先進製程壟斷',
    perk: 'chip', perkText: '晶片稅:其他玩家每次發展科技卡須支付你 2 資本;你的硬體卡科技力 +1;可「表態」與「加入」陣營', home: 'hsinchu' },
  // 日本(7人以上)
  { id: 'toyota', faction: 'JP', name: '牛頭牌·豐田彰男', real: '豐田章男 Toyota', industry: '汽車', industryDesc: '油電混合/匠人精神',
    perk: 'auto', perkText: '改善哲學:發展費用 -2,每回合收入 +2(科技產出計入米國)', home: 'tokyo' },
  // 韓國(8人)
  { id: 'lee',    faction: 'KR', name: '三星太子·李在熔', real: '李在鎔 Samsung', industry: '手機', industryDesc: '財閥/螢幕/記憶體',
    perk: 'phone', perkText: '財閥手腕:打出作戰卡費用 -2(科技產出計入牆國)', home: 'seoul' },
];

// ---- 環太平洋地圖 ----
export const REGIONS = [
  { id: 'seattle',  name: '西雅圖',   x: 11,  z: -7, tag: '雲端走廊' },
  { id: 'sv',       name: '矽谷',     x: 12.5, z: -2.5, tag: '科技聖地' },
  { id: 'austin',   name: '奧斯汀',   x: 14,  z: 2.5, tag: '火箭基地' },
  { id: 'tokyo',    name: '東京',     x: -3.5, z: -5.5, tag: '電子街' },
  { id: 'seoul',    name: '首爾',     x: -6.5, z: -7.5, tag: '財閥都心' },
  { id: 'beijing',  name: '北京',     x: -11, z: -6.5, tag: '中關村' },
  { id: 'shanghai', name: '上海',     x: -9,  z: -2.5, tag: '魔都' },
  { id: 'shenzhen', name: '深圳',     x: -10.5, z: 1.5, tag: '硬體矽谷' },
  { id: 'hsinchu',  name: '新竹',     x: -6,  z: -1, tag: '護國神山', chipBonus: true },
  { id: 'hanoi',    name: '河內',     x: -10, z: 5.5, tag: '世界工廠2.0' },
  { id: 'singapore',name: '新加坡',   x: -7,  z: 8.5, tag: '中立樞紐' },
  { id: 'sydney',   name: '雪梨',     x: -1,  z: 10, tag: '南方節點' },
];

export const EDGES = [
  ['seattle', 'sv'], ['sv', 'austin'],
  ['seattle', 'tokyo'], ['sv', 'tokyo'], ['sv', 'hsinchu'],
  ['tokyo', 'seoul'], ['seoul', 'beijing'], ['beijing', 'shanghai'],
  ['shanghai', 'shenzhen'], ['shanghai', 'tokyo'], ['shanghai', 'hsinchu'],
  ['shenzhen', 'hsinchu'], ['shenzhen', 'hanoi'],
  ['hsinchu', 'singapore'], ['hanoi', 'singapore'],
  ['singapore', 'sydney'], ['sydney', 'austin'],
];

export const RULES = {
  startCapital: 20,
  baseIncome: 4,
  apPerTurn: 3,
  drawCost: 5,
  handLimit: 6,
  maxRounds: 10,
  maxCardsPerRegion: 4,   // 每區域科技卡上限
  maxOwnCardsPerRegion: 2,// 每玩家在同區域科技卡上限
  specialtyDiscount: 0.2,  // 擅長領域研發費用 -20%
  specialtyTechBonus: 1,   // 擅長領域部署科技力 +1
  techStart: { US: 10, CN: 5 }, // 開局差距 5 年
  usWinLead: 10,
  cnWinLead: 0,
  twRevealPenalty: 5,
  twJoinCost: 40,
  chipLevy: 2,
  cnOpsDiscount: 3,
  jpWinLead: 5,
  minPlayers: 3,
  maxPlayers: 8,
  jpkrMinPlayers: 7, // 超過 6 人才能加入日韓
};
