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

// ---- 灰色作戰卡三大類 ----
// atk 攻擊力:需 >= 目標科技卡的有效防護力才能成功
// 每張科技卡只能被灰色作戰卡鎖定一次
export const OPS_CARDS = {
  spy1:   { id: 'spy1', cat: 'spy', name: '商業間諜', cost: 7, atk: 4, icon: '💣',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: '摧毀一張敵對科技卡(攻擊力4,需≥目標有效防護力),該陣營損失其科技力' },
  spy2:   { id: 'spy2', cat: 'spy', name: '王牌特工', cost: 12, atk: 7, icon: '🕶️',
    ratio: { money: 2, power: 1, oil: 1 },
    desc: '摧毀一張敵對科技卡(攻擊力7),該陣營損失其科技力' },
  steal1: { id: 'steal1', cat: 'steal', name: '駭客入侵', cost: 9, atk: 4, icon: '🕵️',
    ratio: { money: 1, power: 2, oil: 1 }, intelPerTier: 2, intelSpread: 'ratio',
    desc: '竊取一張敵對科技卡的情報(攻擊力4):下次發展同類型科技卡時,花費減少 目標階級×2(依該類資源比例)' },
  steal2: { id: 'steal2', cat: 'steal', name: '供應鏈滲透', cost: 13, atk: 7, icon: '🧬',
    ratio: { money: 1, power: 2, oil: 1 }, intelPerTier: 3, intelSpread: 'even',
    desc: '竊取一張敵對科技卡的情報(攻擊力7):下次發展同類型科技卡時,花費減少 目標階級×3(三種資源平均)' },
  fake1:  { id: 'fake1', cat: 'fake', name: '假新聞', cost: 6, atk: 0, icon: '📰',
    ratio: { money: 2, power: 1, oil: 1 }, mult: 1.5, dur: 1,
    desc: '指定一個城市,1 輪內該城市發展科技卡花費 +50%' },
  fake2:  { id: 'fake2', cat: 'fake', name: '認知作戰', cost: 10, atk: 0, icon: '📡',
    ratio: { money: 2, power: 1, oil: 1 }, mult: 2, dur: 2,
    desc: '指定一個城市,2 輪內該城市發展科技卡花費 ×2' },
};

export const OPS_DECK_COMPOSITION = [
  ['spy1', 6], ['spy2', 3], ['steal1', 5], ['steal2', 3], ['fake1', 6], ['fake2', 3],
];

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

// ---- 環太平洋地圖 ----
// country:城市所屬國家。米國玩家在牆國地盤(及反之)發展科技花費加倍,其他國家不在此限。
// startLevel:城市初始等級;城市等級 ≥ 科技卡階級才能建造,用電力升級。
export const REGIONS = [
  // 米國(6 城)
  { id: 'seattle',  name: '西雅圖',   x: 11,  z: -7, tag: '雲端走廊', country: 'US', startLevel: 2 },
  { id: 'sv',       name: '矽谷',     x: 12.5, z: -2.5, tag: '科技聖地', country: 'US', startLevel: 3 },
  { id: 'austin',   name: '奧斯汀',   x: 14,  z: 2.5, tag: '火箭基地', country: 'US', startLevel: 2 },
  { id: 'nyc',      name: '紐約',     x: 17.5, z: -3.5, tag: '華爾街', country: 'US', startLevel: 2 },
  { id: 'phoenix',  name: '鳳凰城',   x: 16,  z: 1.5, tag: '晶片新廠', country: 'US', startLevel: 1 },
  { id: 'la',       name: '洛杉磯',   x: 11.5, z: 6, tag: '好萊塢', country: 'US', startLevel: 2 },
  // 牆國(6 城)
  { id: 'beijing',  name: '北京',     x: -11, z: -6.5, tag: '中關村', country: 'CN', startLevel: 3 },
  { id: 'shanghai', name: '上海',     x: -9,  z: -2.5, tag: '魔都', country: 'CN', startLevel: 2 },
  { id: 'shenzhen', name: '深圳',     x: -10.5, z: 1.5, tag: '硬體矽谷', country: 'CN', startLevel: 2 },
  { id: 'hangzhou', name: '杭州',     x: -12.5, z: -4.5, tag: '電商之都', country: 'CN', startLevel: 2 },
  { id: 'wuhan',    name: '武漢',     x: -13.5, z: -1, tag: '光谷', country: 'CN', startLevel: 1 },
  { id: 'chengdu',  name: '成都',     x: -14.5, z: 2.5, tag: '遊戲山城', country: 'CN', startLevel: 1 },
  // 東亞高科技城
  { id: 'tokyo',    name: '東京',     x: -3.5, z: -5.5, tag: '電子街', country: 'JP', startLevel: 3 },
  { id: 'seoul',    name: '首爾',     x: -6.5, z: -7.5, tag: '財閥都心', country: 'KR', startLevel: 3 },
  { id: 'hsinchu',  name: '新竹',     x: -6,  z: -1, tag: '護國神山', chipBonus: true, country: 'TW', startLevel: 3 },
  // 中立 — 北美/歐洲側(平衡米國鄰近城市數量)
  { id: 'toronto',  name: '多倫多',   x: 19.5, z: -8, tag: '楓葉AI谷', country: null, startLevel: 2 },
  { id: 'mexico',   name: '墨西哥城', x: 13.5, z: 9.5, tag: '近岸製造', country: null, startLevel: 1 },
  { id: 'london',   name: '倫敦',     x: 22, z: -3.5, tag: '金融科技城', country: null, startLevel: 2 },
  // 中立 — 亞太側(6 城)
  { id: 'hanoi',    name: '河內',     x: -10, z: 5.5, tag: '世界工廠2.0', country: null, startLevel: 1 },
  { id: 'singapore',name: '新加坡',   x: -7,  z: 8.5, tag: '中立樞紐', country: null, startLevel: 2 },
  { id: 'sydney',   name: '雪梨',     x: -1,  z: 10, tag: '南方節點', country: null, startLevel: 2 },
  { id: 'bangkok',  name: '曼谷',     x: -12, z: 5.5, tag: '東協門戶', country: null, startLevel: 1 },
  { id: 'bangalore',name: '班加羅爾', x: -12, z: 9, tag: '印度矽谷', country: null, startLevel: 1 },
  { id: 'dubai',    name: '杜拜',     x: -16, z: 6, tag: '石油金庫', country: null, startLevel: 2 },
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

export const EDGES = [
  ['seattle', 'sv'], ['sv', 'austin'],
  ['seattle', 'tokyo'], ['sv', 'tokyo'], ['sv', 'hsinchu'],
  ['tokyo', 'seoul'], ['seoul', 'beijing'], ['beijing', 'shanghai'],
  ['shanghai', 'shenzhen'], ['shanghai', 'tokyo'], ['shanghai', 'hsinchu'],
  ['shenzhen', 'hsinchu'], ['shenzhen', 'hanoi'],
  ['hsinchu', 'singapore'], ['hanoi', 'singapore'],
  ['singapore', 'sydney'], ['sydney', 'austin'],
  // 米國擴增
  ['seattle', 'nyc'], ['nyc', 'phoenix'], ['phoenix', 'austin'],
  ['sv', 'la'], ['la', 'austin'], ['la', 'sydney'],
  // 牆國擴增
  ['beijing', 'hangzhou'], ['hangzhou', 'shanghai'],
  ['hangzhou', 'wuhan'], ['wuhan', 'shenzhen'],
  ['wuhan', 'chengdu'], ['chengdu', 'shenzhen'],
  // 中立擴增
  ['hanoi', 'bangkok'], ['bangkok', 'singapore'],
  ['singapore', 'bangalore'], ['bangalore', 'dubai'], ['dubai', 'chengdu'],
  // 北美/歐洲中立城(平衡米國鄰近城市)
  ['toronto', 'nyc'], ['toronto', 'seattle'], ['toronto', 'london'], ['london', 'nyc'],
  ['mexico', 'la'], ['mexico', 'austin'], ['mexico', 'phoenix'],
  // 新增航線:後方城市更易參戰(雙方平衡;飛機僅可跨 3 格)
  ['phoenix', 'la'], ['nyc', 'austin'],            // 米國後方
  ['beijing', 'wuhan'], ['chengdu', 'hanoi'], ['seoul', 'shanghai'], // 牆國後方
];

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
  opsDistSurcharge: 0.5,   // 每多一個航線(超過 1 格)費用 +50%
  cardUpgradeAp: 1,        // 捨牌升階(換 4/5 階卡)消耗的行動點
  tier4DiscardSum: 6,      // 捨棄科技卡階級加總達此值 → 抽 1 張 4 階卡
  tier5DiscardCount: 2,    // 捨棄此張數的 4 階卡 → 抽 1 張 5 階卡
  deckScale: { 2: 0.5, 3: 0.5, 4: 0.75, 5: 0.75, 6: 1, 7: 1, 8: 1 }, // 牌庫數量依人數調整
  specialtyDiscount: 0.2,  // 擅長領域研發費用 -20%
  specialtyTechBonus: 5,   // 擅長領域部署科技力 +5 點
  pointsPerYear: 20,       // 科技力領先 1 年 = 領先 20 點
  // 各國初始科技力(點):米國 200、牆國 120、其他國家 150(CN=120 為模擬平衡值)
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
