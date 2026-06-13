---
name: 3d-web-game
description: 3D 網頁遊戲建模準則 — Three.js 程式生成優先 + 可選 GLTF 混合管線、開源 3D 資產與 AI 生成工具地圖、霓虹賽博美術規範、效能預算與審查清單。當任務涉及修改 public/js/board3d.js、城市地標、角色棋子、棋子動作、載入外部 3D 模型、世界地圖/城市特色 3D 化,或評估某個 3D 呈現「夠不夠識別、會不會卡」時使用。
---

# 3D 網頁遊戲建模準則(賽博貿易戰 2049)

本專案的 3D 棋盤是 `public/js/board3d.js`,用 **Three.js (r0.160, CDN importmap)** 純程式即時生成,
**無 build step、無外部模型檔、LAN 離線可跑**。修改任何 3D 呈現前先讀這份準則,再讀 `board3d.js` 與 `public/js/data.js`。

核心立場一句話:**程式生成優先,外部模型可選,惡搞風格不可丟。**

---

## 一、架構鐵則(動手前必讀)

1. **程式生成是預設,GLTF 是升級槽**。`MODEL_MANIFEST` 預設為空 → 零外部請求。任何外部模型都必須有程式生成的 fallback,載入失敗要能自動退回,不能讓棋盤開天窗。
2. **不破壞 `Board3D` 介面**:`new Board3D(container, onRegionClick)`、`board.sync(state)`、`board.highlight(ids)` 是 `ui.js` 的契約,別改簽名。
3. **資料驅動**:城市座標/國家/角色都在 `public/js/data.js`(`REGIONS`、`CHARACTERS`、`FACTIONS`)。地標 builder 以 `r.id` 為 key、棋子 builder 以 `charId` 為 key,**新增城市/角色時 builder 要同步補**,缺了會自動退回後備外觀(城市無地標、棋子用 `_default` 尖塔)。
4. **每次 `sync()` 重建 nodeGroup/pawnGroup**:重建前一定 `disposeGroup()` 再 `.clear()`,否則 geometry/material 洩漏。動畫狀態(待機/啟用)掛在 `userData`,不要存全域。
5. **座標系**:海面 y≈-0.45,六角棋格頂面 y≈0.25。地標基準點放 y=0(掛在 city group, y=0.25)。棋子底座坐 y≈0.3。地標高度 ≈1.5–1.7、棋子 ≈1.2–1.5,維持尺度一致。
6. **顏色語意固定**:陣營色來自 `FACTIONS[*].color`(米藍/牆紅/台綠/日白/韓金);霓虹四色 `NEON_CYAN/PINK/PURPLE/AMBER`;晶片城 `chipBonus` 用綠。不要自創一套配色。

---

## 二、程式生成 + 可選 GLTF 混合管線

`board3d.js` 已內建以下工具,**新模型一律走這條路**:

```js
buildModel(key, proceduralFn, { fit })   // 立即回傳程式生成 Group;manifest 有登記就 async 換成 .glb
loadGltf(url)                             // 快取 Promise,使用時 clone(多棋子共用一次下載)
fitToHeight(obj, targetH)                 // 把外部模型縮放到棋盤尺度、底部坐 y=0
disposeTree(obj) / disposeGroup(g)        // 釋放 geometry/material
neonEdges(geo, color, opacity)            // 霓虹線框(賽博風的核心筆觸)
emissiveMat(color, intensity, extra)      // 自發光標準材質
pawnBase(color, opts) → {root,head,body,base,anim,topY}  // 棋子共享文法骨架
```

- **key 慣例**:`city:<regionId>` / `pawn:<charId>`。外部模型放 `public/assets/models/`,在 `MODEL_MANIFEST` 登記。詳見該資料夾 README。
- **待機動作**:builder 把要動的零件 push 進 `anim` 陣列,型別 `spin`(繞 y)/`spinz`(繞 z)/`rock`(左右搖)/`bob`(上下浮)/`flick`(火焰閃爍,需 `transparent`)。`_animate` 統一播放;當前回合棋子動作會自動加速 ~1.9×+大跳。

---

## 三、開源 3D 資產與工具地圖(2025/2026 現況)

挑選順序:**先程式生成 → 不夠再拿 CC0 低面數模型 → 真的需要寫實/特定造型再用 AI 生成**。

### 現成模型庫(優先 CC0,商用安全)
| 來源 | 授權 | 特色 | 用途 |
|---|---|---|---|
| **Quaternius** (quaternius.com) | CC0 | 低面數、風格統一的成套包(建築/載具/人物動畫) | 城市建築群、載具升級 |
| **Poly Pizza** (poly.pizza) | CC0/CC-BY | 海量低面數,可直接下 `.glb`,瀏覽器友善 | 地標、道具、棋子 |
| **Kenney** (kenney.nl/assets) | CC0 | 原型神器,城市/載具/UI 套件 | 快速鋪量、UI |
| **Poly Haven** (polyhaven.com) | CC0 | HDRI/材質為主 | 環境光、材質升級 |
| **Sketchfab**(篩 Downloadable+CC) | 視作者 | 寫實地標、名人風格化頭像 | 指標性地標 |

### AI 文字/圖片 → 3D(需要特定造型時)
| 工具 | 授權 | 重點 |
|---|---|---|
| **Hunyuan3D 2.x** (Tencent) | Apache-2.0 | 開源最強;文字/圖片→帶 PBR 貼圖,本機 6GB VRAM 可跑,輸出 glTF/OBJ/FBX |
| **TripoSR** (Stability/VAST) | MIT | 單圖→mesh,數秒出件,品質較粗,適合遠景小物 |
| **Meshy** | 商用(免費額度) | 文字/圖片→3D,匯出 GLB/FBX/USDZ,介面友善 |

### 真實世界地圖 / 程序化城市(若要做寫實地理)
- **geo-three** / **three-geo**:用 Mapbox DEM 即時生出衛星貼圖地形,給 GPS 座標就出 3D 地形。
- **OpenStreetMap + Overpass API**:抓建築輪廓多邊形,依 `levels` 拉伸成樓房。
- 註:本專案目前是**風格化環太平洋地圖**(`LANDMASSES` 手繪海岸線),不是寫實 GIS。要轉寫實是大改,先確認需求再動。

### 角色 / 頭像生成(若要更精緻的人物)
- **CharacterStudio** (M3-org)、**MakeHuman**、**CharMorph**、**VRoid Studio**(動漫風,VRM)。
- ⚠️ 本專案角色是**真人科技巨頭的惡搞諷刺諧音梗**。維持**特徵剪影/卡通化**,**不要做寫實肖像**——延續美術基調、也避開肖像權與觀感風險。

---

## 四、美術規範(賽博龐克霓虹)

- **氛圍**:深藍黑底(`0x04050f`)+ 霓虹自發光 + 海面網格 + 星空 + 沿航線跑的交通工具。新元素要「會發光、會動一點點」才融得進去。
- **筆觸**:實體用 `emissiveMat` + `neonEdges` 線框點睛;少量 `transparent` 做光暈/火焰。避免大面積無自發光的死黑塊。
- **識別度優先於寫實**:棋盤俯視角(相機 y≈24,maxPolarAngle≈0.46π),**最強識別來自頭頂剪影與輪廓**,不是臉部細節。城市靠地標天際線、棋子靠頭頂梗道具一眼認出。
- **梗是資產**:卡名、角色綽號、地標選擇(護國神山、筷子夾火箭、QQ 企鵝)是專案靈魂,重構不得犧牲(對齊 `board-game-design` skill 的美學原則)。

---

## 五、效能預算(LAN 多人,最多 8 人同畫面)

- 目標 60fps(中階筆電/手機瀏覽器)。`setPixelRatio(min(devicePixelRatio,2))` 已設,別拿掉。
- **draw call / 三角面**:地標 < 30k 面、棋子 < 10k 面。程式生成的 primitive 很省,放心用;外部模型要先看面數。
- **共用幾何/材質**:同款重複物件(科技卡方塊、建築群)共用 geometry,`loadGltf` 已對外部模型快取+clone。
- **每幀只動該動的**:`_animate` 只遍歷 pawnGroup(≤8)與少量 flicker/traffic。**不要每幀 traverse 整個 scene**,也不要每幀 new 物件/材質。
- **重建即釋放**:`sync()` 重建群組前 `disposeGroup`。新增持久動畫物件要記得有對應的清理。
- **載入策略**:外部模型 async 載入、程式生成先頂著,絕不阻塞首屏。

---

## 六、審查清單(改完 3D 自問)

- [ ] 改動有沒有破壞 `Board3D` 介面(`sync`/`highlight`/建構子)?
- [ ] 新城市/角色的 builder 補了嗎?缺了會退回後備外觀嗎(不會壞)?
- [ ] 外部模型路徑都有程式生成 fallback?載入失敗會 `console.warn` 後沿用程式生成?
- [ ] `sync()` 重建群組前有 `disposeGroup`?有沒有每幀 new 物件/材質?
- [ ] 動畫零件掛在 `userData.anim`,沒有洩漏進全域 `this.flickers`/`this.traffic`?
- [ ] 尺度對嗎(地標 ≈1.7、棋子 ≈1.2,底部坐在棋格面)?顏色用了既有語意?
- [ ] 俯視一眼認得出是哪座城市 / 哪個角色嗎(識別度測試)?
- [ ] 維持霓虹自發光基調與惡搞風格了嗎?沒有寫實肖像?
- [ ] `node --check public/js/board3d.js` 過;`npm test` 過;啟動 server 頁面 200。
- [ ] 8 棋子同畫面有沒有掉幀?(效能預算)

---

## 七、本專案 3D 現況速查(2026-06)

- **地圖**:風格化環太平洋海岸線(`LANDMASSES`,世界座標 = 原始 `[x,z]` 點)+ 裝飾小島 + 海面網格 + 星空。
- **地形(`_buildTerrain`)**:用 `pointInPolygon` 在陸塊內、避開城市(距離 >2.6)決定性散布**山(InstancedMesh 岩錐+雪冠)** 與 **森林(InstancedMesh 松樹,逐株 HSL 變色)**;空白處即平原。既有島嶼加小丘、再散布 12 座太平洋小島。地形坐 `TERRAIN_Y=-0.16`。InstancedMesh 一律 `frustumCulled=false`(否則單一包圍球會整批誤剔)。
- **海洋(`_buildOcean`/`_animateOcean`)**:60×60 分段平面(`geo.rotateX` 烘進旋轉,位移頂點 y),浪高 = 天氣 `wave` 參數;法線每 5 幀重算一次省效能。
- **天氣系統(`_buildWeather`/`_updateWeather`/`setWeather`)**:8 種天氣 `WEATHER`(晴天/海浪/季風/梅雨/下雪/雷雨/颱風/龍捲風),各自一組參數(rain/snow/cloud/wind/wave/light/amb/flash/funnel/funnelGround/fog/bg),`weightedPick` 加權隨機、`WX_BLEND_DUR` 平滑過渡、`wxHold` 後再換。元件:雨(LineSegments 帶風斜)、雪(柔邊 Points)、雲(高空 sprite 隨風飄+轉烏雲)、閃電(瞬間 PointLight)、漏斗(颱風=高空寬旋臂 / 龍捲=觸地窄漏斗,會遊走)。左上角有天氣徽章 DOM。`setWeather(key, immediate)` 公開,**未來可由遊戲事件(季節/EVENT_CARDS)驅動**。
- **城市地標**:21 座城市全部有專屬 `LANDMARK_BUILDERS`(太空針、金門大橋、東京鐵塔、東方明珠、護國神山、自由女神、好萊塢、雷峰塔、黃鶴樓、大熊貓、鄭王廟、哈里發塔…)+ 周圍程序化天際線。
- **棋子**:13 位角色各有惡搞特徵剪影(火箭人/皮衣 GPU/蜥蜴 VR/蘋果高領/多彩 G/阿里金幣/華為菊花/QQ 企鵝/深海鯨/百度熊掌/神山晶圓/方向盤/三星)+ 待機動作,當前回合者大跳。
- **航線**:plane/ship/train 三型,各自有移動的載具模型。
- **升級槽**:`public/assets/models/` + `MODEL_MANIFEST`(預設空)。
- **動畫主迴圈**:`_animate` 用 `clock.getDelta()`(夾 0.05)累加成 `this._elapsed`,海浪與天氣吃 `dt`。新增每幀動畫請走這裡、避免每幀 new 物件。
