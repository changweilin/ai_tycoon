# 賽博貿易戰 2049

環太平洋科技冷戰陣營對抗桌遊 — 3D 網頁版,LAN/Tailscale 多人連線。

## 快速開始

```powershell
npm install
npm run dev    # 本地開發(改檔自動重啟);正式跑 npm start
```

模式:多人連線(2 人=米牆對決免台灣)/ 單人 vs AI(AI 數量 = 預計人數 - 1)/ AI 內戰(全 AI 自動對戰觀賞)/ 上帝模式(一人控全角色試玩)。

- 大廳可設定**遊戲名稱**與**預計人數(2~8)**,人數 6+ 同時開放日韓角色。
- 個人 PIN 只需設定一次,之後切換角色/換裝置/載入存檔都沿用。
- 遊戲每回合自動暫存到 `saves/`;房主可手動 💾 儲存、⏹️ 結束遊戲;連線畫面可 📂 載入存檔續戰。

伺服器啟動後會印出區網網址(預設 port 8520):

1. 房主開瀏覽器到 `http://localhost:8520` → 建立房間。
2. 其他玩家連同一個 WiFi/LAN 或 Tailscale,掃大廳的 QR code 或輸入 4 位數 PIN 加入。
3. 加入時選「遊戲模式」或「觀戰模式」;選角色時設定角色 PIN(換裝置可憑 PIN 認領)。
4. 湊滿 米/牆/台 至少各一人(3~8 人,6 人以上同時開放日韓)→ 房主開始遊戲。

完整規則見 [RULES.md](RULES.md)。

## 單機版(GitHub Pages,無需伺服器)

`public/` 可直接部署成純靜態的**單機版**:鎖定「加入房間」,只開放**單人對 AI** 與**上帝模式**,並附頁籤式規則說明(基礎/回合行動/陣營加權/角色加權/科技卡/灰色作戰卡,手機優先)。

- 遊戲邏輯在瀏覽器內由 `public/js/localnet.js` 驅動真正的引擎(`public/engine/` 是 `server/{game,bot,strategy}.js` 的衍生複本,由 `npm run build:engine` 產生)。
- 部署:推到 `main` 後,`.github/workflows/pages.yml` 會自動重建 `public/engine/`、把 `solo-flag.js` 設為 `true`,並發佈到 GitHub Pages(需在 repo Settings → Pages 將來源設為 GitHub Actions)。
- 本機測試單機版:`npm start` 後開 `http://localhost:8520/?solo=1`(`?solo=1` 會強制單機模式,不必改旗標)。

## 測試

```powershell
node test/sim.js   # 無頭隨機模擬(3/5/8 人局各 30 次)
node test/e2e.js   # 伺服器端對端煙霧測試
```

## 結構

```
server/server.js   HTTP 靜態檔 + WebSocket 房間伺服器
server/game.js     權威遊戲邏輯(只在伺服器執行)
public/js/data.js  角色/地圖/卡片資料(前後端共用)
public/js/ui.js    前端流程(連線→大廳→遊戲)
public/js/board3d.js  Three.js 賽博龐克 3D 棋盤
public/js/net.js   WebSocket 客戶端
```

> 注意:前端的 Three.js 與 QR 函式庫走 CDN,首次載入需要網際網路;之後瀏覽器會快取。
