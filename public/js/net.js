export function connect(name) {
  const handlers = new Map();
  let ws = null;
  let retry = 0;
  let closedByUser = false;

  const net = {
    id: null,
    seed: null,
    connected: false,
    name,
    send(msg) {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(msg));
        return true;
      }
      return false;
    },
    on(type, cb) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(cb);
      return net;
    },
    close() {
      closedByUser = true;
      ws?.close();
    },
  };

  function emit(type, msg) {
    const list = handlers.get(type);
    if (!list) return;
    for (const cb of list) {
      try { cb(msg); } catch (e) { console.error(e); }
    }
  }

  function open() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onopen = () => {
      retry = 0;
      ws.send(JSON.stringify({ t: 'join', name: net.name }));
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (!msg || !msg.t) return;
      if (msg.t === 'welcome') {
        net.id = msg.id;
        net.seed = msg.seed;
        net.connected = true;
        emit('open', msg);
      }
      emit(msg.t, msg);
    };
    ws.onclose = () => {
      const was = net.connected;
      net.connected = false;
      if (was) emit('close', {});
      if (closedByUser) return;
      retry++;
      setTimeout(open, Math.min(5000, 500 * retry));
    };
    ws.onerror = () => {};
  }

  open();
  return net;
}
