// ============ 音效 / 背景音樂管理 ============
// 素材來源:Freesound(皆為 CC0 / 公眾領域,清單見 assets/audio/CREDITS.md)
// 設計:HTMLAudioElement;背景音樂單軌循環,音效以 cloneNode 播放可重疊。
// 瀏覽器在使用者第一次互動前禁止自動播放 → 首次點擊/按鍵時 unlock。

const BASE = 'assets/audio/';

// 各情境檔名(同一檔可被多個事件 / 動作共用)
const FILES = {
  lobby:    'lobby.mp3',           // 大廳 / 等待開局背景樂(循環)
  // 集體事件六大情境(相似事件共用,見 EVENT_SOUND)
  war:      'event_war.mp3',       // ⚔️ 戰爭 / 網戰:軍事警報
  disaster: 'event_disaster.mp3',  // ☢️ 天災 / 重大事故 / 全球危機:緊急警笛
  finance:  'event_finance.mp3',   // 📉 金融崩跌 / 供給衝擊:下挫負面
  restrict: 'event_restrict.mp3',  // 🚫 管制 / 漲價 / 醜聞:緊張警示
  techboom: 'event_techboom.mp3',  // 🤖 科技突破利多:科技揚升
  boom:     'event_boom.mp3',      // 📈 經濟 / 能源繁榮:正向提示
  // 卡片 / 行動特效
  build:    'build.mp3',           // 部署科技卡
  attack:   'attack.mp3',          // 間諜 / 摧毀(spy + destroy 共用)
  steal:    'steal.mp3',           // 竊取收益
  fake:     'fake.mp3',            // 假新聞 / 折舊陷阱
  move:     'move.mp3',            // 移動(鐵路 / 航運 / 飛機)
  draw:     'draw.mp3',            // 抽卡
  upgrade:  'upgrade.mp3',         // 升級城市
  // 介面
  click:    'click.mp3',           // 按鈕點擊
  turn:     'turn.mp3',            // 輪到你 / 進入交易環節提示
  // 結算
  win:      'win.mp3',             // 勝利
  lose:     'lose.mp3',            // 落敗
};

// 事件卡 id → 六大情境音(相似事件共用)
const EVENT_SOUND = {
  // ⚔️ 戰爭 / 網戰
  war: 'war', defcon: 'war',
  // ☢️ 天災 / 重大事故 / 全球危機(含疫情、物流癱瘓)
  fukushima: 'disaster', blackout: 'disaster', shuttle: 'disaster', suez: 'disaster', covid: 'disaster',
  // 📉 金融崩跌 / 供給衝擊
  lehman: 'finance', opec: 'finance',
  // 🚫 管制 / 漲價 / 醜聞
  chipban: 'restrict', tariff: 'restrict', prism: 'restrict', aiwinter: 'restrict', bubble: 'restrict',
  // 🤖 科技突破利多
  aiboom: 'techboom', gptboom: 'techboom', oss: 'techboom', spacefad: 'techboom',
  // 📈 經濟 / 能源繁榮利多
  recovery: 'boom', shale: 'boom', greensub: 'boom', qe: 'boom', blackfri: 'boom', concert: 'boom',
};

// fx 類型 → 音效(spy/destroy 共用 attack)
const FX_SOUND = {
  build: 'build', spy: 'attack', destroy: 'attack',
  steal: 'steal', fake: 'fake', move: 'move', draw: 'draw', upgrade: 'upgrade',
};

// 各音效音量(背景樂較輕,提示音較明顯)
const VOL = {
  lobby: 0.4,
  war: 0.7, disaster: 0.7, finance: 0.65, restrict: 0.6, techboom: 0.6, boom: 0.6,
  build: 0.55, attack: 0.7, steal: 0.5, fake: 0.6, move: 0.4, draw: 0.45, upgrade: 0.55,
  click: 0.35, turn: 0.6,
  win: 0.75, lose: 0.7,
};

class AudioManager {
  constructor() {
    this.muted = localStorage.getItem('ctw_muted') === '1';
    this.unlocked = false;
    this.bank = {};         // name → 預載的 HTMLAudioElement(音效母本)
    this.music = null;      // 目前循環的背景樂元素
    this.musicName = null;
    this.pendingEvent = null; // 解鎖前抽到的事件音(待首次互動後補播,避免事件音被瀏覽器靜默丟棄)
    this._ready = false;
  }

  // 預載素材 + 安裝 unlock / 按鈕點擊聲 / 靜音鈕(於 ui 初始化時呼叫一次)
  init() {
    if (this._ready) return;
    this._ready = true;
    for (const [name, file] of Object.entries(FILES)) {
      const a = new Audio(BASE + file);
      a.preload = 'auto';
      this.bank[name] = a;
    }
    // 首次使用者互動解鎖自動播放
    const unlock = () => {
      this.unlocked = true;
      // 若已要求播放背景樂卻被擋,於此補播
      if (this.musicName && !this.muted) this.playMusic(this.musicName);
      // 解鎖前抽到的集體事件音(例如尚未點擊就在觀戰的玩家),於首次互動後補播當前事件音
      if (this.pendingEvent && !this.muted) this.sfx(this.pendingEvent);
      this.pendingEvent = null;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // 全域按鈕點擊聲(靜音鈕本身除外)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('button');
      if (btn && btn.id !== 'audioToggle') this.sfx('click');
    });
    this._mountToggle();
  }

  // 播放一次性音效(以 clone 播放,可重疊)
  sfx(name, vol) {
    const base = this.bank[name];
    if (!base || this.muted || !this.unlocked) return;
    const a = base.cloneNode();
    a.volume = vol != null ? vol : (VOL[name] ?? 0.6);
    a.play().catch(() => {});
  }

  // 集體事件音(依事件 id 對應六大情境);未解鎖時暫存,待首次互動補播
  event(eventId) {
    const key = EVENT_SOUND[eventId];
    if (!key) return;
    if (!this.unlocked) { this.pendingEvent = key; return; }
    this.sfx(key);
  }

  // 卡片 / 行動特效音(依 fx 類型對應)
  fx(type) {
    const key = FX_SOUND[type];
    if (key) this.sfx(key);
  }

  // 背景樂(循環);切換到不同曲目才重啟
  playMusic(name) {
    this.musicName = name;
    if (this.muted) return;
    if (this.music && this.musicName === name && !this.music.paused) return;
    this.stopMusic(true);
    const base = this.bank[name];
    if (!base) return;
    const a = base.cloneNode();
    a.loop = true;
    a.volume = VOL[name] ?? 0.4;
    this.music = a;
    if (this.unlocked) a.play().catch(() => {}); // 未解鎖時等 unlock 補播
  }

  stopMusic(keepIntent) {
    if (this.music) { this.music.pause(); this.music.currentTime = 0; this.music = null; }
    if (!keepIntent) this.musicName = null;
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('ctw_muted', m ? '1' : '0');
    if (m) this.stopMusic(true);
    else if (this.musicName) this.playMusic(this.musicName);
    this._syncToggle();
  }

  toggleMute() { this.setMuted(!this.muted); }

  // 右下角浮動靜音鈕(自帶樣式,沿用霓虹主題色)
  _mountToggle() {
    if (this._btn) return;
    const b = document.createElement('button');
    b.id = 'audioToggle';
    b.title = '音效開關';
    b.style.cssText = [
      'position:fixed', 'right:14px', 'bottom:14px', 'z-index:9999',
      'width:44px', 'height:44px', 'border-radius:50%', 'cursor:pointer',
      'border:1px solid #00f0ff', 'background:rgba(6,12,24,0.78)',
      'color:#00f0ff', 'font-size:20px', 'line-height:42px', 'text-align:center',
      'box-shadow:0 0 12px rgba(0,240,255,0.45)', 'padding:0',
    ].join(';');
    b.addEventListener('click', () => this.toggleMute());
    document.body.appendChild(b);
    this._btn = b;
    this._syncToggle();
  }

  _syncToggle() {
    if (this._btn) this._btn.textContent = this.muted ? '🔇' : '🔊';
  }
}

export const audio = new AudioManager();
