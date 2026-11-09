import http from 'node:http';
import { WebSocketServer } from 'ws';
import { serveStatic } from './server/static.js';
import { createSim, SEED, TICK_RATE, SNAP_RATE } from './server/sim.js';

const PORT = Number(process.env.PORT) || 3000;
const PING_MS = 5000;
const IDLE_MS = 15000;

const server = http.createServer((req, res) => {
  serveStatic(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const clients = new Map();

function sendTo(ws, msg) {
  if (ws.readyState === 1) {
    try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch {}
  }
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients.keys()) sendTo(ws, data);
}

const sockets = new Map();
const sim = createSim(broadcast, (pid, msg) => {
  const ws = sockets.get(pid);
  if (ws) sendTo(ws, msg);
});

server.on('upgrade', (req, socket, head) => {
  const url = (req.url || '').split('?')[0];
  if (url !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  clients.set(ws, null);
  ws.isAlive = true;
  ws.lastMsgAt = Date.now();
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    ws.lastMsgAt = Date.now();
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    try {
      let pid = clients.get(ws);
      if (msg.t === 'join') {
        if (pid != null) return;
        const p = sim.join(msg.name);
        clients.set(ws, p.id);
        sockets.set(p.id, ws);
        sendTo(ws, { t: 'welcome', id: p.id, seed: SEED, tickRate: TICK_RATE });
        sendTo(ws, sim.snapshot());
        return;
      }
      if (pid == null) return;
      sim.handle(pid, msg);
    } catch (e) {
      console.error('msg error', e);
    }
  });
  const drop = () => {
    const pid = clients.get(ws);
    clients.delete(ws);
    if (pid != null) {
      sockets.delete(pid);
      try { sim.leave(pid); } catch (e) { console.error('leave error', e); }
    }
  };
  ws.on('close', drop);
  ws.on('error', drop);
});

let pingN = 0;
setInterval(() => {
  const t = Date.now();
  const ping = ++pingN % 2 === 0;
  for (const ws of clients.keys()) {
    if ((ping && !ws.isAlive) || t - ws.lastMsgAt > IDLE_MS) { ws.terminate(); continue; }
    if (!ping) continue;
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, PING_MS / 2);

const dt = 1 / TICK_RATE;
let tickN = 0;
const snapEvery = Math.round(TICK_RATE / SNAP_RATE);
setInterval(() => {
  try {
    sim.step(dt);
    tickN++;
    if (tickN % snapEvery === 0 && clients.size) broadcast(sim.snapshot());
  } catch (e) {
    console.error('tick error', e);
  }
}, 1000 / TICK_RATE);

process.on('uncaughtException', (e) => console.error('uncaught', e));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`gta6-topdown on http://0.0.0.0:${PORT}`);
});
