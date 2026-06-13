# 外部 3D 模型(可選)— public/assets/models/

本專案的 3D 棋盤(`public/js/board3d.js`)**預設全部用程式即時生成**(Three.js 幾何體),
不需要任何外部模型檔,LAN 離線也能跑。這個資料夾是「**可選的升級槽**」:
你可以把寫實/精緻的 `.glb` 模型丟進來,**就地覆蓋**對應的城市地標或角色棋子,
程式生成版本會自動讓位;載入失敗則自動退回程式生成,不會壞掉。

## 怎麼用(三步)

1. 取得一個 `.glb`(見下方「去哪找模型」),放進這個資料夾,例如:
   `public/assets/models/tokyo_tower.glb`、`public/assets/models/musk.glb`
2. 打開 `public/js/board3d.js`,在 `MODEL_MANIFEST` 登記:
   ```js
   const MODEL_MANIFEST = {
     'city:tokyo': 'assets/models/tokyo_tower.glb', // 蓋掉東京地標
     'pawn:musk':  'assets/models/musk.glb',        // 蓋掉馬斯克棋子
   };
   ```
3. 重新整理頁面即可。模型會自動縮放到棋盤尺度(地標高 ≈1.7、棋子高 ≈1.2)並讓底部坐在地面。

### key 命名規則
- 城市地標:`city:<regionId>` — regionId 見 `public/js/data.js` 的 `REGIONS`
  (`seattle / sv / austin / nyc / phoenix / la / beijing / shanghai / shenzhen /
   hangzhou / wuhan / chengdu / tokyo / seoul / hsinchu / hanoi / singapore /
   sydney / bangkok / bangalore / dubai`)。
- 角色棋子:`pawn:<charId>` — charId 見 `CHARACTERS`
  (`musk / jensen / zuck / jobs / google / jack / ren / pony / liang / robin /
   tsmc / toyota / lee`)。

## 去哪找模型(免費 / 開源)

| 來源 | 授權 | 適合 | 連結 |
|---|---|---|---|
| **Quaternius** | CC0 | 低面數 game-ready 包(建築、載具、人物),風格統一 | <https://quaternius.com> |
| **Poly Pizza** | CC0/CC-BY | 海量低面數模型,瀏覽器友善,可直接下 `.glb` | <https://poly.pizza> |
| **Kenney** | CC0 | 原型神器,城市/載具/道具套件 | <https://kenney.nl/assets> |
| **Poly Haven** | CC0 | HDRI、材質、少量模型 | <https://polyhaven.com> |
| **Sketchfab**(篩 Downloadable + CC) | 視作者 | 寫實地標、名人風格化頭像 | <https://sketchfab.com> |

### 用 AI 生成(文字/圖片 → 3D)
- **Hunyuan3D 2.x**(Tencent,Apache-2.0,可本機 6GB VRAM):文字/圖片→帶 PBR 貼圖,輸出 glTF/OBJ/FBX。<https://github.com/Tencent/Hunyuan3D-2>
- **TripoSR**(Stability AI / VAST,MIT):單張圖→mesh,數秒出件(品質較粗,適合遠景棋子)。<https://github.com/VAST-AI-Research/TripoSR>
- **Meshy**(商用,有免費額度):文字/圖片→3D,匯出 GLB/FBX/USDZ 等。<https://www.meshy.ai>

> 角色棋子建議維持本專案的**惡搞諷刺風格化**(諧音梗、特徵剪影),不要做真人寫實肖像,
> 以延續美術基調並避免肖像權爭議。

## 模型規範(讓載入順利)
- 格式 **`.glb`**(單檔含貼圖)優先;`.gltf + .bin + 貼圖` 也支援(同資料夾)。
- 面數:地標 < 30k、棋子 < 10k(LAN 多人,愈輕愈好)。
- 朝向:+Y 朝上,模型大致置中;高度不限(程式會 `fitToHeight` 自動縮放)。
- 材質:標準 PBR(MeshStandard/Physical)即可;自發光(emissive)能融入霓虹氛圍。
