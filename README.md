<div align="center">

# 賽博貿易戰 2049 · Cyber Trade War 2049

**環太平洋科技冷戰陣營對抗桌遊 — 3D 網頁版,支援 LAN／Tailscale 多人連線**
**A Pacific-Rim tech cold-war faction board game — 3D web edition with LAN / Tailscale multiplayer**

<sub>Node.js · WebSocket (`ws`) · Three.js · 零建置前端 (zero-build vanilla JS)</sub>

</div>

---

## 目錄 · Table of Contents

- [專案簡介 · Overview](#專案簡介--overview)
- [核心功能 · Features](#核心功能--features)
- [系統需求與安裝 · Prerequisites & Installation](#系統需求與安裝--prerequisites--installation)
- [快速上手 · Quick Start](#快速上手--quick-start)
- [使用情境 · Usage](#使用情境--usage)
- [專案架構 · Project Structure](#專案架構--project-structure)
- [測試 · Testing](#測試--testing)
- [設定與調校 · Configuration](#設定與調校--configuration)
- [授權條款 · License](#授權條款--license)

---

## 專案簡介 · Overview

**繁中**　2049 年,米國（US）與牆國（CN）的科技冷戰白熱化。玩家化身環太平洋的科技巨頭,在 3D 賽博龐克世界地圖上奔走:同陣營合作拉抬國家科技力,私下又互挖牆角;護國神山（台灣）暗中決定天平倒向哪一邊。這是一款 **3～8 人的陣營對抗桌遊**,以 Node.js 權威伺服器 + 純前端 Three.js 棋盤實作,玩家用手機或筆電連上同一個區網（或 Tailscale）即可同桌對戰。完整規則見 **[RULES.md](RULES.md)**。

**English**　In 2049, the tech cold war between the US (米國) and CN (牆國) reaches its peak. Players take on the roles of Pacific-Rim tech moguls, racing across a 3D cyberpunk world map — cooperating within their bloc to raise national tech level while quietly poaching each other's markets, as Taiwan (the "Silicon Shield") secretly decides which side tips the balance. It's a **3–8 player faction board game** built on an authoritative Node.js server plus a pure-frontend Three.js board. Players join from phones or laptops over the same LAN (or Tailscale) to play at one virtual table. Full rules live in **[RULES.md](RULES.md)**.

---

## 核心功能 · Features

| 功能 · Feature | 說明 · Description |
|---|---|
| 🎭 **陣營桌遊 · Faction gameplay** | 米國／牆國／台灣三大陣營,6 人以上加開日本、韓國;科技卡（五大類 × 五階）、灰色作戰卡、台灣秘密選邊等深度機制。US / CN / TW factions (+ JP / KR at 6+ players) with tech cards, ops cards, and hidden allegiance. |
| 🎮 **四種模式 · Four modes** | 多人連線、單人對 AI、AI 內戰觀賞、上帝模式（一人控全角色）。Multiplayer, single-vs-AI, all-AI spectate, and god mode. |
| 🌐 **區網多人 · LAN multiplayer** | 房間 PIN + QR code 加入;角色 PIN 鎖定（換裝置可認領）;斷線 60 秒寬限自動重連。Room PIN + QR join, per-character PIN lock, 60 s reconnect grace. |
| 🧊 **3D 賽博棋盤 · 3D board** | Three.js 程式生成的環太平洋世界地圖、城市地標、角色棋子、天氣與航線特效,可選掛載 Quaternius CC0 模型。Procedural Three.js world map with optional GLTF models. |
| 🤖 **啟發式 AI · Heuristic AI** | 多種策略性格的 AI 機器人自動補位、出招並播放動畫。Personality-driven AI bots that fill empty seats and act with animations. |
| 💾 **存檔／續戰 · Save & resume** | 每個行動自動暫存,房主可手動存檔、結束遊戲;連線畫面可載入存檔續戰。Per-action autosave, manual save, and load-to-resume. |
| 📱 **HTTPS／WSS · Secure mobile** | 偵測到憑證即在副埠同時提供 HTTPS + WSS,讓手機安全連線(自簽或 Tailscale Serve)。Optional HTTPS + WSS on a side port for mobile. |
| 🪟 **靜態單機版 · Static solo build** | `public/` 可部署成純前端 GitHub Pages 單機版(瀏覽器內跑真引擎 + AI)。Deployable as a serverless single-player web build. |
| 🎚️ **可調數值 · Tunable rules** | `config/rules.json` 集中所有平衡參數,免改程式即可調校。All balance parameters centralized in one JSON file. |

---

## 系統需求與安裝 · Prerequisites & Installation

### 系統需求 · Prerequisites

- **Node.js 18+**（建議 20 LTS;伺服器使用 `node --watch` 與 ES Modules）。**Node.js 18+** (20 LTS recommended).
- **npm**（隨 Node.js 安裝）。Comes with Node.js.
- 唯一執行期相依套件為 [`ws`](https://www.npmjs.com/package/ws);Three.js 與 QR 函式庫由前端走 CDN 載入（首次需網路,之後瀏覽器快取）。The only runtime dependency is `ws`; Three.js and the QR library load from a CDN on first visit.

### 安裝 · Installation

```bash
# 1) 取得原始碼 · Clone the repository
git clone <repository-url>
cd ai_tycoon

# 2) 安裝相依套件 · Install dependencies
npm install
```

---

## 快速上手 · Quick Start

```bash
# 開發模式:改檔自動重啟 · Dev mode (auto-restart on file changes)
npm run dev

# 正式啟動 · Production start
npm start
```

伺服器預設監聽 **HTTP 埠 8520**,啟動後會印出可用的區網網址。
The server listens on **HTTP port 8520** by default and prints reachable LAN URLs on start.

1. 房主開瀏覽器到 `http://localhost:8520` → **建立房間**,設定遊戲名稱與預計人數（2～8）。
   Host opens `http://localhost:8520` → **Create a room**, set game name and expected player count (2–8).
2. 其他玩家連同一個 WiFi/LAN（或 Tailscale）,**掃 QR code 或輸入 4 位數 PIN** 加入。
   Other players on the same network **scan the QR code or enter the 4-digit PIN**.
3. 加入時選 **🎮 遊戲模式** 或 **👁️ 觀戰模式**;首次選角設定**個人 PIN**（之後換裝置／載入存檔皆沿用）。
   Choose **play** or **spectate**; set a personal **PIN** on first character pick (reused across devices and saves).
4. 湊滿 **米／牆／台 至少各 1 人**（6 人以上加開日韓）→ 房主按**開始遊戲**。
   Fill at least one US / CN / TW seat (JP / KR unlock at 6+) → host starts the game.

> 換埠（預設被佔用時）· Change port — 優先序:命令列 > 環境變數 > 預設。
> ```bash
> npm start -- --port 8000              # HTTP 走 8000;HTTPS 副埠自動 = 8001
> ```

---

## 使用情境 · Usage

### 遊戲模式 · Game modes

| 模式 · Mode | 說明 · Description |
|---|---|
| 👥 多人連線 · Multiplayer | 2～8 人；**2 人＝米牆對決**特殊規則（無台灣與晶片稅）。2–8 players; 2-player is a US-vs-CN duel. |
| 🤖 單人對 AI · Single vs AI | 你選一角,**AI 數量 = 預計人數 − 1**。One human, rest are AI. |
| 🍿 AI 內戰 · AI spectate | 全部角色由 AI 操作,觀賞自動對戰。All seats are AI; watch them play. |
| 👁️‍🗨️ 上帝模式 · God mode | 一人輪流控制所有角色,適合試玩與教學。One player controls every seat. |

### 手機 HTTPS 安全連線 · Secure mobile connection

伺服器**一律提供 HTTP（埠 8520）**;若偵測到憑證,**另外**在埠 **8521** 同時提供 **HTTPS + WSS**,兩埠共用同一份房間狀態。`net.js` 會在 https 頁面自動改用 `wss://`,前端零修改。
HTTP is always served on 8520; if a certificate is present, HTTPS + WSS is **also** served on 8521 sharing the same room state.

**A) 自簽憑證 · Self-signed certificate**（最快,單機就能用）

```bash
npm run gen-cert   # 產生 config/{key,cert}.pem(SAN 自動含 localhost / 區網 IP / Tailscale IP)
npm start          # 桌機 http://localhost:8520;手機 https://<IP>:8521(首次需點「進階 → 仍要前往」)
```

**B) Tailscale Serve**（行動裝置最穩,**受信任憑證、零警告**)

```bash
tailscale serve --bg 8520   # 由 Tailscale 終結 TLS,手機開 https://<機器>.<tailnet>.ts.net
```

> 為何需要:**HTTPS 頁面不能連 `ws://`（mixed content 會被擋）**,所以對外走 https 時伺服器也要提供 wss。
> Why: an HTTPS page cannot open a plain `ws://` socket, so HTTPS pages need `wss://`.

### 靜態單機版（GitHub Pages,無需伺服器）· Static single-player build

`public/` 可直接部署成純前端**單機版**:鎖定「加入房間」,只開放**單人對 AI** 與**上帝模式**,遊戲邏輯由 `public/js/localnet.js` 在瀏覽器內驅動真正的引擎（`public/engine/` 由 `npm run build:engine` 從 `server/` 衍生）。
`public/` deploys as a serverless single-player build; game logic runs in-browser via `localnet.js` against the engine copied into `public/engine/`.

```bash
# 本機測試單機版 · Test the solo build locally
npm start
# 開啟 http://localhost:8520/?solo=1
```

推到 `main` 後,`.github/workflows/pages.yml` 會自動重建 `public/engine/`、把 `solo-flag.js` 設為 `true` 並發佈到 GitHub Pages。
Pushing to `main` triggers the Pages workflow, which rebuilds the engine, flips `solo-flag.js` to `true`, and publishes.

---

## 專案架構 · Project Structure

```
ai_tycoon/
├── server/                  # Node 權威端:靜態檔 + WebSocket 房間伺服器
│   ├── server.js            #   HTTP/HTTPS 靜態檔 + WebSocket 房間/連線/存檔
│   ├── game.js              #   權威遊戲邏輯(回合、卡片、勝利判定)
│   ├── bot.js               #   啟發式 AI 行動決策
│   ├── strategy.js          #   AI 策略性格與梗名
│   └── config.js            #   載入 config/rules.json 覆寫數值
├── public/                  # 前端(同時是 GitHub Pages 單機版根目錄)
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── data.js          #   角色/地圖/卡片資料(前後端共用單一真相)
│   │   ├── ui.js            #   連線 → 大廳 → 遊戲流程
│   │   ├── board3d.js       #   Three.js 賽博龐克 3D 棋盤
│   │   ├── net.js           #   WebSocket 客戶端(自動 ws/wss)
│   │   ├── audio.js         #   音效 / 背景音樂
│   │   ├── localnet.js      #   單機版:瀏覽器內驅動引擎 + AI
│   │   └── solo-flag.js     #   單機模式旗標(Pages workflow 設 true)
│   ├── engine/              #   build:engine 由 server/ 衍生(勿手改)
│   └── assets/              #   3D 模型(Quaternius CC0)、音效(Freesound CC0)、圖像
├── config/
│   └── rules.json           # 遊戲數值參數(可調平衡,免改程式)
├── scripts/
│   ├── build-engine.mjs     # 複製 server 引擎 → public/engine
│   └── gen-cert.mjs         # 產生自簽 TLS 憑證
├── test/                    # 模擬 / E2E / 房間 / 重連 / 海岸線回歸測試
├── saves/                   # 自動 + 手動存檔(git 忽略)
├── design/                  # 規則設計文件
├── RULES.md                 # 完整規則書
└── package.json
```

> `server/` 是遊戲引擎的**唯一真實來源**;`public/engine/` 為自動衍生產物,請改 `server/` 內原檔再執行 `npm run build:engine`。
> `server/` is the single source of truth for the engine; `public/engine/` is generated — edit `server/` and rerun `npm run build:engine`.

---

## 測試 · Testing

```bash
npm test            # 完整測試套件:模擬 + E2E + 房間 + 重連
npm run simulate    # 批次平衡模擬(可加 --rules <檔> 套用替代數值)

# 個別測試 · Individual suites
node test/sim.js        # 無頭隨機模擬(3/5/8 人局)· headless random simulation
node test/e2e.js        # 伺服器端對端煙霧測試 · server end-to-end smoke test
node test/rooms.js      # 房間列表/公開私人房 · room browser & visibility
node test/reconnect.js  # 斷線重連/存檔復原 · reconnect & restore
node test/coastline.mjs # 地圖海岸線幾何回歸 · map coastline geometry regression
```

---

## 設定與調校 · Configuration

所有平衡參數集中在 **[`config/rules.json`](config/rules.json)**,修改後重啟伺服器即生效,無須改動程式:
All balance parameters live in **[`config/rules.json`](config/rules.json)**; edit and restart — no code changes needed:

| 參數 · Key | 用途 · Purpose |
|---|---|
| `startResources` / `baseIncome` | 起始資源與每回合基礎收入 · Starting resources & base income |
| `apPerTurn` | 每回合行動點 · Action points per turn |
| `maxRounds` | 終局回合數 · Rounds before endgame |
| `usWinLead` / `cnWinLead` | 米／牆勝利科技差門檻 · Win-lead thresholds |
| `opsTechDebuff` / `opsIncomeDrain` / `opsDeprecLeak` | 三類作戰卡 debuff 係數 · Ops-card debuff coefficients |
| `deckScale` | 依人數縮放牌庫 · Deck size scaling by player count |

> 模擬器可用 `--rules <檔案>` 套用替代設定做批次平衡測試。
> The simulator accepts `--rules <file>` to A/B test alternate tunings.

---

## 授權條款 · License

本專案以 **Apache License 2.0** 釋出,完整條款見 [LICENSE](LICENSE)。
This project is licensed under the **Apache License 2.0** — see [LICENSE](LICENSE) for the full text.

```
Copyright 2026 Chang Wei Lin

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### 第三方素材 · Third-party assets

程式碼採 Apache-2.0,內附素材另依其原始授權（皆為 **CC0 公眾領域,免署名**,出處保留為禮貌性致謝):
The code is Apache-2.0; bundled assets keep their original licenses (all **CC0 public domain**, attribution kept as courtesy):

- 🔊 **音效 · Audio** — [Freesound](https://freesound.org/)（CC0);明細見 [`public/assets/audio/CREDITS.md`](public/assets/audio/CREDITS.md)。
- 🧊 **3D 模型 · 3D models** — [Quaternius](https://quaternius.com)（CC0 1.0);明細見 [`public/assets/models/quaternius/README.md`](public/assets/models/quaternius/README.md)。
