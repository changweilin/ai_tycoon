// ============ WebSocket 客戶端 ============
export class Net {
  constructor(onSync, onError, onOther = null, onReconnect = null) {
    this.onSync = onSync;
    this.onError = onError;
    this.onOther = onOther;
    this.onReconnect = onReconnect; // 斷線重連成功時呼叫(用來重新加入房間)
    this.connected = false;
    this._everOpen = false;
    this._queue = [];
    this._connect();
  }

  _connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.onopen = () => {
      this.connected = true;
      // 重連(非首次):先送 reattach 重新綁定房間,再補送排隊訊息
      if (this._everOpen && this.onReconnect) this.onReconnect();
      this._everOpen = true;
      for (const m of this._queue) this.ws.send(JSON.stringify(m));
      this._queue = [];
    };
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.t === 'sync') this.onSync(m);
      else if (m.t === 'error') this.onError(m.msg);
      else if (this.onOther) this.onOther(m);
    };
    this.ws.onclose = () => {
      this.connected = false;
      this.onError('與伺服器斷線,重連中…');
      setTimeout(() => this._connect(), 2000);
    };
  }

  // 立即送出(不排隊;reattach 必須早於後續行動)
  sendNow(msg) { if (this.connected) this.ws.send(JSON.stringify(msg)); }

  send(msg) {
    if (this.connected) this.ws.send(JSON.stringify(msg));
    else this._queue.push(msg);
  }

  action(kind, extra = {}) { this.send({ t: 'action', kind, ...extra }); }
}
