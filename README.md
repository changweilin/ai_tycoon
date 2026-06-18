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
- 單機模式觸發任一即可:`window.__SOLO__`(workflow 設 true)/ 網址 `?solo=1` / 主機名是 `*.github.io`(保底)。
- 部署:推到 `main` 後,`.github/workflows/pages.yml` 會自動重建 `public/engine/`、把 `solo-flag.js` 設為 `true`,並發佈到 GitHub Pages。
- 本機測試單機版:`npm start` 後開 `http://localhost:8520/?solo=1`。

> **若 Pages 顯示的是 README 而不是遊戲**:代表 Pages 來源還是「Deploy from a branch」(serves repo 根目錄 → Jekyll 把 README.md 當首頁)。
> 修正:**Settings → Pages → Build and deployment → Source 選「GitHub Actions」**,然後到 **Actions** 分頁重跑 `Deploy single-player web to GitHub Pages`。
> (workflow 已加 `enablement: true` 會嘗試自動切換來源;若仍是舊頁,手動切一次最保險。)

## 讓手機用 HTTPS 安全連線(多人版)

伺服器**一律提供 HTTP(埠 8520)**;若偵測到憑證,**另外**在埠 **8521** 同時提供 **HTTPS + WSS**。
兩個埠共用同一份房間狀態,所以**桌機走 http、手機走 https 也能同桌對戰**。`net.js` 在 https 頁面會自動改用 `wss://`,前端零修改。兩種方式擇一:

### A) 自簽憑證(最快,自己一台機器就能用)

```powershell
npm run gen-cert   # 產生 config/{key,cert}.pem,SAN 自動含 localhost / 區網 IP / Tailscale IP 與 *.ts.net
npm start          # 桌機:http://localhost:8520;手機(安全連線):https://<IP>:8521
```

- **桌機**直接開 `http://localhost:8520`(或 `http://<區網 IP>:8520`)——和以前一樣,打開就能用。
- **手機**開終端機印出的 `https://<區網或 Tailscale IP>:8521`(注意是 **https** 且埠是 **8521**),首次會出現安全警告(自簽憑證),點**「進階 → 仍要前往」**即可,WebSocket 走 wss 正常連線。
- (`config/{key,cert}.pem` 已列入 `.gitignore`;刪掉它們即回到只有 HTTP。)

### 換埠(預設 8520 被佔用時)

埠優先序:**命令列參數 > 環境變數 > 預設**。最通用的做法是命令列參數(任何系統都一樣):

```powershell
npm start -- --port 8000              # http 走 8000;https 副埠自動 = 8001
npm start -- --port 8000 --https-port 9000   # 也可分別指定
```

- 環境變數寫法**因 shell 而異**,別搞錯:
  - **PowerShell**(Windows 預設):`$env:PORT=8000; npm start`(**不是** `PORT=8000 npm start`,那是 bash 寫法,PowerShell 會報「不是 cmdlet」而**沒啟動**)
  - **bash / macOS / Linux**:`PORT=8000 npm start`
- `HTTPS_PORT` 預設 = `PORT + 1`。若該副埠剛好被佔用,**HTTP 仍會正常啟動**(只是手機 HTTPS 暫不可用),終端機會提示換副埠的指令。

### B) Tailscale Serve(行動裝置最穩,**受信任憑證、零警告**)

伺服器維持一般 HTTP,由 Tailscale 在前面終結 TLS:

1. Tailscale 後台開啟 **MagicDNS** 與 **HTTPS Certificates**(`https://login.tailscale.com/admin/dns`)。
2. `tailscale serve --bg 8520`(把本機 8520 以 https 對外;WebSocket Upgrade 也會一併代理)。
3. 手機開 `https://<你的機器>.<tailnet>.ts.net` — 受信任憑證、無警告。

> 為何需要這些:**HTTPS 頁面不能連 `ws://`(mixed content 會被瀏覽器擋)**,所以對外走 https 時伺服器也要提供 wss。
> 反之,同一個 WiFi 下用 `http://<區網 IP>:8520` 純 HTTP 也能連手機,不一定要 HTTPS。
> GitHub Pages 版是**單機、不連伺服器**,所以不受此限。

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
