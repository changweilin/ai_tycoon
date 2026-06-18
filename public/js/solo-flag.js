// 單機模式旗標。預設 false:本機 `npm start` 仍是多人連線版。
// GitHub Pages 部署時由 .github/workflows/pages.yml 改寫成 true,鎖定加入房間、只開放單人對 AI / 上帝模式。
// 本機測試單機版可改加網址參數 ?solo=1(無需改此檔)。
window.__SOLO__ = false;
