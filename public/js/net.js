// ============ WebSocket 客戶端 ============
export class Net {
  constructor(onSync, onError, onOther = null) {
    this.onSync = onSync;
    this.onError = onError;
    this.onOther = onOther;
    this.connected = false;
    this._queue = [];
    this._connect();
  }

  _connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.onopen = () => {
      this.connected = true;
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
      this.onError('與伺服器斷線,3 秒後重連…');
      setTimeout(() => this._connect(), 3000);
    };
  }

  send(msg) {
    if (this.connected) this.ws.send(JSON.stringify(msg));
    else this._queue.push(msg);
  }

  action(kind, extra = {}) { this.send({ t: 'action', kind, ...extra }); }
}
