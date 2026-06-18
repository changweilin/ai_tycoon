import { WebSocket } from 'ws';
function once(url, opts, msg){return new Promise((res)=>{const ws=new WebSocket(url,opts);let pin=null;ws.on('open',()=>ws.send(JSON.stringify(msg)));ws.on('message',d=>{const m=JSON.parse(d);if(m.t==='sync'&&!pin){pin=m.lobby.pin;ws.close();res({pin});}});ws.on('error',e=>res({err:e.message}));setTimeout(()=>res({err:'timeout'}),4000);});}
const a = await once('ws://localhost:8520', {}, {t:'createRoom',name:'桌機',isPublic:true});
console.log('ws  (8520) createRoom ->', JSON.stringify(a));
const b = await once('wss://localhost:8521', {rejectUnauthorized:false}, {t:'listRooms'});
console.log('wss (8521) listRooms reached server ->', b.err? 'ERR '+b.err : 'OK (connected, got response)');
