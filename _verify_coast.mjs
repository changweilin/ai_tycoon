// 臨時驗證:城市 + 地形種子點是否落在重繪後的陸地多邊形內(point-in-polygon)
function pip(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

const EURASIA = [
  [-5.2, -13.0], [-6.4, -11.8], [-6.6, -10.6],
  [-7.4, -9.0], [-8.8, -7.4], [-8.6, -5.0], [-7.8, -3.0], [-8.2, -1.0],
  [-9.2, 1.4], [-10.4, 3.2], [-10.8, 4.4],
  [-11.8, 5.4], [-12.4, 6.4], [-13.0, 7.6], [-13.4, 8.8], [-14.2, 8.4], [-14.8, 7.4],
  [-15.6, 7.8], [-16.2, 8.4],
  [-16.8, 9.6], [-17.1, 11.0], [-18.0, 10.6], [-18.9, 9.0], [-19.3, 7.6],
  [-19.8, 6.4], [-20.6, 6.6],
  [-21.6, 7.0], [-22.8, 7.2], [-24.2, 6.8], [-25.6, 5.8], [-26.6, 4.2], [-27.0, 2.2],
  [-27.6, -0.8], [-27.6, -3.8], [-26.2, -6.2], [-23.6, -8.0], [-20.0, -9.4],
  [-16.0, -10.6], [-12.0, -11.4], [-8.6, -11.8], [-6.2, -12.2],
];
const NORTH_AMERICA = [
  [5.4, -12.6], [7.0, -11.0], [7.8, -10.4], [8.2, -8.0], [8.2, -1.0],
  [9.2, 3.6], [10.6, 6.2], [12.6, 9.8], [15.0, 12.2], [17.4, 12.2],
  [18.6, 9.0], [18.4, 3.6], [19.4, -0.4], [21.4, -3.2], [21.8, -5.6],
  [20.2, -7.8], [16.8, -8.2], [12.0, -9.2], [9.2, -10.2], [7.4, -11.4],
];

const CITY = {
  harbin:[-8,-10,'E'], tianjin:[-10.4,-5.4,'E'], beijing:[-12.2,-7,'E'], hangzhou:[-11,0.4,'E'],
  xian:[-14.3,-3.1,'E'], nanjing:[-11.2,-2,'E'], shanghai:[-9.4,-1,'E'], wuhan:[-12.8,-0.6,'E'],
  chongqing:[-14.8,0.2,'E'], shenzhen:[-11.6,4.2,'E'], chengdu:[-16.2,-1.4,'E'], guangzhou:[-13.6,3,'E'],
  telaviv:[-25.5,2.6,'E'], riyadh:[-23.5,4.6,'E'], dubai:[-21.5,5,'E'], mumbai:[-18.6,7.2,'E'],
  bangalore:[-17.2,9,'E'], hanoi:[-13.2,5.6,'E'], bangkok:[-14.6,7.2,'E'],
  seattle:[9.1,-8,'N'], portland:[9.3,-6,'N'], sv:[9.1,-0.3,'N'], la:[10,2.6,'N'], denver:[12.9,-1.8,'N'],
  phoenix:[11.8,3.4,'N'], chicago:[16.8,-3.5,'N'], dallas:[14.7,3.6,'N'], austin:[14.5,5.6,'N'], atlanta:[17.5,2.9,'N'],
  nyc:[19.8,-2.6,'N'], boston:[20.8,-4.4,'N'], vancouver:[8.3,-9.8,'N'], toronto:[18.6,-4.9,'N'], montreal:[19.9,-6.4,'N'],
  mexico:[14.6,9,'N'], panama:[16.6,11,'N'],
};
const SEED = {
  'himalaya@1':[-20.0,6.2,'E'], 'himalaya@2':[-18.5,5.6,'E'], 'himalaya@3':[-17.0,5.4,'E'], 'himalaya@4':[-15.6,5.8,'E'],
  'tianshan@1':[-21.5,-3.5,'E'], 'tianshan@2':[-23.0,-2.2,'E'], 'tianshan@3':[-24.5,-1.2,'E'],
  'tibet@1':[-17.5,3.8,'E'], 'tibet@2':[-19.0,4.4,'E'], 'tibet@3':[-18.0,2.6,'E'], 'tibet@4':[-20.5,3.0,'E'], 'tibet@5':[-22.0,2.2,'E'],
  'iran@1':[-23.0,1.4,'E'],
  'arabia_dune@1':[-24.0,5.2,'E'], 'arabia_dune@2':[-22.5,5.6,'E'],
  'gobi@1':[-16.5,-5.5,'E'], 'gobi@2':[-14.0,-7.5,'E'],
  'steppe@1':[-24.5,-3.5,'E'], 'steppe@2':[-26.0,-5.5,'E'],
  'caspian':[-24.5,-2.0,'E'],
  'rockies@1':[11.5,-5.0,'N'], 'rockies@2':[11.8,-1.5,'N'], 'rockies@3':[12.2,2.0,'N'],
  'plains@1':[15.0,0.0,'N'], 'plains@2':[15.5,-3.0,'N'],
  'greatlakes@1':[16.2,-5.6,'N'], 'greatlakes@2':[17.4,-4.8,'N'], 'greatlakes@3':[18.4,-4.0,'N'],
  'canyon':[14.6,-1.0,'N'],
};

let fail = 0;
const check = (label, x, z, where) => {
  const poly = where === 'E' ? EURASIA : NORTH_AMERICA;
  if (!pip(x, z, poly)) { console.log('MISS:', label, x, z, where); fail++; }
};
for (const [n, [x, z, w]] of Object.entries(CITY)) check('city:' + n, x, z, w);
for (const [n, [x, z, w]] of Object.entries(SEED)) check('seed:' + n, x, z, w);
console.log(fail === 0 ? 'ALL POINTS ON LAND ✓' : `${fail} point(s) off-land ✗`);
