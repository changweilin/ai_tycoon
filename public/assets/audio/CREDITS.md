# 音效素材出處(Freesound)

本資料夾的所有音效 / 背景音樂皆取自 [Freesound](https://freesound.org/),使用其 128 kbps MP3 預覽檔,
且**全部為 CC0 / 公眾領域(無須標示、可商用)**。對應用途定義於 `public/js/audio.js`。

## 背景音樂

| 檔案 | 用途 | 作者 | 原始名稱 (Freesound #) | 連結 |
|------|------|------|------------------------|------|
| `lobby.mp3` | 大廳 / 等待開局背景樂(循環) | cabled_mess | Cyberpunk 24042017_Snippet 75bpm [loop] (#393330) | https://freesound.org/people/cabled_mess/sounds/393330/ |

## 集體事件(六大情境,相似事件共用 — 見 `audio.js` 的 `EVENT_SOUND`)

| 檔案 | 情境 | 對應事件 | 作者 | 原始名稱 (Freesound #) | 連結 |
|------|------|----------|------|------------------------|------|
| `event_war.mp3` | ⚔️ 戰爭 / 網戰 | 烏俄戰爭、駭客大會 | Alxy | missile lock on sound (#189327) | https://freesound.org/people/Alxy/sounds/189327/ |
| `event_disaster.mp3` | ☢️ 天災 / 事故 / 全球危機 | 福島核災、全球大停電、太空梭折戟、運河大堵塞、世紀疫情 | chungus43A | Alarm/Siren Sound 01 (#610056) | https://freesound.org/people/chungus43A/sounds/610056/ |
| `event_finance.mp3` | 📉 金融崩跌 / 供給衝擊 | 金融海嘯、OPEC 減產 | Beetlemuse | False C (#692847) | https://freesound.org/people/Beetlemuse/sounds/692847/ |
| `event_restrict.mp3` | 🚫 管制 / 漲價 / 醜聞 | 晶片禁令、關稅大戰、稜鏡門風暴、AI 寒冬、元宇宙泡沫 | FartMuffin | tension sting (#506295) | https://freesound.org/people/FartMuffin/sounds/506295/ |
| `event_techboom.mp3` | 🤖 科技突破利多 | AI 元年、聊天機器人爆紅、開源運動、太空旅遊熱 | GameAudio | Spacey 1up / Power up (#220173) | https://freesound.org/people/GameAudio/sounds/220173/ |
| `event_boom.mp3` | 📈 經濟 / 能源繁榮利多 | 景氣復甦、頁岩油革命、綠能補貼、量化寬鬆、黑色星期五、元宇宙演唱會 | deadrobotmusic | Notification Sound 1 (#750607) | https://freesound.org/people/deadrobotmusic/sounds/750607/ |

## 卡片 / 行動特效

| 檔案 | 用途 | 作者 | 原始名稱 (Freesound #) | 連結 |
|------|------|------|------------------------|------|
| `build.mp3` | 部署科技卡 | Jofae | Sci Fi Interface (#367997) | https://freesound.org/people/Jofae/sounds/367997/ |
| `attack.mp3` | 間諜 / 摧毀(作戰卡) | Jofae | Cinematic Low Pitch Impact (#408141) | https://freesound.org/people/Jofae/sounds/408141/ |
| `steal.mp3` | 竊取收益(作戰卡) | SoundDesignForYou | Coin Pickup SFX [2] (#646672) | https://freesound.org/people/SoundDesignForYou/sounds/646672/ |
| `fake.mp3` | 假新聞 / 折舊陷阱(作戰卡) | plasterbrain | Minimalist Sci-Fi UI Error (#423166) | https://freesound.org/people/plasterbrain/sounds/423166/ |
| `move.mp3` | 移動(鐵路 / 航運 / 飛機) | florianreichelt | Woosh (#683096) | https://freesound.org/people/florianreichelt/sounds/683096/ |
| `draw.mp3` | 抽卡 / 捨牌升階 | el_boss | Playing Card Deal Variation 2 (#571576) | https://freesound.org/people/el_boss/sounds/571576/ |
| `upgrade.mp3` | 升級城市 | qubodup | Level Up (#442943) | https://freesound.org/people/qubodup/sounds/442943/ |

## 介面

| 檔案 | 用途 | 作者 | 原始名稱 (Freesound #) | 連結 |
|------|------|------|------------------------|------|
| `click.mp3` | 按鈕點擊(全域) | el_boss | UI Button Click (#677861) | https://freesound.org/people/el_boss/sounds/677861/ |
| `turn.mp3` | 輪到你 / 進入交易環節 | Jofae | Chime Notification (#380482) | https://freesound.org/people/Jofae/sounds/380482/ |

## 結算

| 檔案 | 用途 | 作者 | 原始名稱 (Freesound #) | 連結 |
|------|------|------|------------------------|------|
| `win.mp3` | 勝利 | Bastianhallo | Level up (#682633) | https://freesound.org/people/Bastianhallo/sounds/682633/ |
| `lose.mp3` | 落敗 | Mountain_Man | Game Over Arcade (#382310) | https://freesound.org/people/Mountain_Man/sounds/382310/ |

---

所有素材皆為 **CC0**,無強制標示義務;上表保留出處作為禮貌性致謝。

## 更換音效

把同名 `.mp3` 換成新檔即可。對應關係定義於 `public/js/audio.js`:
事件 → 情境音在 `EVENT_SOUND`,fx → 音效在 `FX_SOUND`,檔名在 `FILES`。
