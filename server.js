import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { serveStatic } from './server/static.js';
import { createSim, SEED, TICK_RATE, SNAP_RATE } from './server/sim.js';

const PORT = Number(process.env.PORT) || 3000;
const PING_MS = 5000;
const IDLE_MS = 15000;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 24;
const MAX_PER_IP = Number(process.env.MAX_PER_IP) || 4;
const RATE_DROP = 60;
const RATE_KILL = 200;
const REJECT_CODES = { full: 1, ip: 2, banned: 3 };
const VIEW_R = 160;
const EVENT_R = 150;
const LOCAL_EVENTS = new Set(['shot', 'hit', 'explode', 'cash']);
const BUF_SKIP = 256e3;
const BUF_KILL = 2e6;

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const BAN_MS = 30 * 60 * 1000;
const bans = new Map();

function isBanned(ip) {
  const until = bans.get(ip);
  if (!until) return false;
  if (until > Date.now()) return true;
  bans.delete(ip);
  return false;
}

function adminOk(req) {
  if (!ADMIN_SECRET) return false;
  const got = Buffer.from(String(req.headers['x-admin-secret'] || ''));
  const want = Buffer.from(ADMIN_SECRET);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function admin(req, res, url) {
  const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (!adminOk(req)) return json(403, { error: 'forbidden' });
  const id = Number(url.searchParams.get('id'));
  if (url.pathname === '/admin/players' && req.method === 'GET') {
    const list = sim.list().map((p) => ({ ...p, ip: sockets.get(p.id)?.ip || null }));
    return json(200, list);
  }
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const ws = sockets.get(id);
  if (!ws) return json(404, { error: 'no such player' });
  if (url.pathname === '/admin/rename') { sim.rename(id); return json(200, { ok: true }); }
  if (url.pathname === '/admin/kick') {
    if (url.searchParams.get('ban') !== '0') bans.set(ws.ip, Date.now() + BAN_MS);
    sim.rename(id);
    reject(ws, 'banned');
    return json(200, { ok: true });
  }
  return json(404, { error: 'unknown' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname.startsWith('/admin/')) {
    try { admin(req, res, url); } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
    return;
  }
  serveStatic(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024, perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 } } });
const clients = new Map();

function sendTo(ws, msg) {
  if (ws.readyState === 1) {
    try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch {}
  }
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  const local = msg.t === 'ev' && LOCAL_EVENTS.has(msg.kind) && typeof msg.x === 'number';
  for (const [ws, pid] of clients) {
    if (local && pid != null && pid !== msg.id && pid !== msg.by) {
      const p = sim.pos(pid);
      if (p && (p.x - msg.x) ** 2 + (p.z - msg.z) ** 2 > EVENT_R * EVENT_R) continue;
    }
    sendTo(ws, data);
  }
}

function snapFor(parts, pid) {
  const p = sim.pos(pid);
  const pick = (list) => {
    const out = [];
    for (const o of list) if (!p || o.id === p.car || (o.x - p.x) ** 2 + (o.z - p.z) ** 2 <= VIEW_R * VIEW_R) out.push(o.s);
    return out.join(',');
  };
  return `${parts.head},"cars":[${pick(parts.cars)}],"peds":[${pick(parts.peds)}],"pickups":[${pick(parts.pickups)}]}`;
}

function sendSnaps() {
  const parts = sim.snapshotParts();
  for (const [ws, pid] of clients) {
    if (pid == null || ws.readyState !== 1) continue;
    if (ws.bufferedAmount > BUF_KILL) { ws.terminate(); continue; }
    if (ws.bufferedAmount > BUF_SKIP) continue;
    sendTo(ws, snapFor(parts, pid));
  }
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

function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) {
    const parts = fwd.split(',');
    return parts[parts.length - 1].trim();
  }
  return req.socket.remoteAddress || '';
}

function reject(ws, reason) {
  sendTo(ws, { t: 'reject', reason });
  setTimeout(() => ws.close(4000 + (REJECT_CODES[reason] || 0), reason), 50);
}

const ipCount = new Map();

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  ws.ip = ip;
  const n = (ipCount.get(ip) || 0) + 1;
  ipCount.set(ip, n);
  ws.once('close', () => {
    const left = (ipCount.get(ip) || 1) - 1;
    if (left > 0) ipCount.set(ip, left); else ipCount.delete(ip);
  });
  if (isBanned(ip)) { reject(ws, 'banned'); return; }
  if (n > MAX_PER_IP) { reject(ws, 'ip'); return; }
  clients.set(ws, null);
  ws.isAlive = true;
  ws.lastMsgAt = Date.now();
  ws.rateAt = Date.now();
  ws.rateN = 0;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    const t = Date.now();
    ws.lastMsgAt = t;
    if (t - ws.rateAt >= 1000) { ws.rateAt = t; ws.rateN = 0; }
    ws.rateN++;
    if (ws.rateN > RATE_KILL) { ws.terminate(); return; }
    if (ws.rateN > RATE_DROP) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    try {
      let pid = clients.get(ws);
      if (msg.t === 'join') {
        if (pid != null) return;
        if (sockets.size >= MAX_PLAYERS) { reject(ws, 'full'); return; }
        const p = sim.join(msg.name);
        clients.set(ws, p.id);
        sockets.set(p.id, ws);
        sendTo(ws, { t: 'welcome', id: p.id, seed: SEED, tickRate: TICK_RATE });
        sendTo(ws, snapFor(sim.snapshotParts(), p.id));
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
    if (tickN % snapEvery === 0 && clients.size) sendSnaps();
  } catch (e) {
    console.error('tick error', e);
  }
}, 1000 / TICK_RATE);

process.on('uncaughtException', (e) => console.error('uncaught', e));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`gta6-topdown on http://0.0.0.0:${PORT}`);
});
