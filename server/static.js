import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const THREE_BUILD = path.join(ROOT, 'node_modules/three/build');
const THREE_JSM = path.join(ROOT, 'node_modules/three/examples/jsm');

const TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveUnder(base, rel) {
  const p = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  if (p !== base && !p.startsWith(base + path.sep)) return null;
  return p;
}

function mapUrl(pathname) {
  if (pathname.startsWith('/shared/')) return resolveUnder(SHARED, pathname.slice(8));
  if (pathname.startsWith('/vendor/addons/')) return resolveUnder(THREE_JSM, pathname.slice(15));
  if (pathname.startsWith('/vendor/')) return resolveUnder(THREE_BUILD, pathname.slice(8));
  let rel = pathname;
  if (rel.endsWith('/')) rel += 'index.html';
  return resolveUnder(PUBLIC, rel);
}

export async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ok');
    return;
  }
  const file = mapUrl(pathname);
  if (!file) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  let data;
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) throw new Error('nf');
    data = await fs.readFile(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
  res.end(req.method === 'HEAD' ? undefined : data);
}
