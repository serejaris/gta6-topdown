import * as THREE from 'three';
import { mulberry32 } from '/shared/world.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = false, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function noise(g, w, h, n, alpha, rnd, light = false) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rnd() * 255);
    g.fillStyle = light ? `rgba(255,255,255,${alpha * rnd()})` : `rgba(${v},${v},${v},${alpha})`;
    const s = 1 + rnd() * 2;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

function asphalt(g, w, h, rnd) {
  g.fillStyle = '#34313a';
  g.fillRect(0, 0, w, h);
  noise(g, w, h, w * h * 0.06, 0.07, rnd);
  for (let i = 0; i < 6; i++) {
    const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(10,8,14,0.25)');
    gr.addColorStop(1, 'rgba(10,8,14,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export function makeTextures() {
  const rnd = mulberry32(99);
  const T = {};

  {
    const ppm = 16;
    const W = 20 * ppm, H = 64 * ppm;
    const [c, g] = canvas(W, H);
    asphalt(g, W, H, rnd);
    const X = (m) => (m + 10) * ppm;
    g.fillStyle = 'rgba(235,235,225,0.85)';
    g.fillRect(X(-9.5), 0, 0.2 * ppm, H);
    g.fillRect(X(9.3), 0, 0.2 * ppm, H);
    for (const lx of [-5, 5]) {
      for (let y = 7 * ppm; y < H - 7 * ppm; y += 6 * ppm) g.fillRect(X(lx) - 0.07 * ppm, y, 0.15 * ppm, 3 * ppm);
    }
    g.fillStyle = 'rgba(255,200,40,0.9)';
    g.fillRect(X(-0.3), 6 * ppm, 0.17 * ppm, H - 12 * ppm);
    g.fillRect(X(0.13), 6 * ppm, 0.17 * ppm, H - 12 * ppm);
    g.fillStyle = 'rgba(240,240,232,0.9)';
    for (const y0 of [0.8, 64 - 4.2]) {
      for (let x = -9; x < 9; x += 1.2) g.fillRect(X(x), y0 * ppm, 0.6 * ppm, 3.4 * ppm);
    }
    g.fillRect(X(0), 5.0 * ppm, 9.3 * ppm, 0.4 * ppm);
    g.fillRect(X(-9.3), (64 - 5.4) * ppm, 9.3 * ppm, 0.4 * ppm);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.ellipse(X(-7 + rnd() * 14), (10 + rnd() * 44) * ppm, 0.8 * ppm, 1.4 * ppm, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#26232b';
    g.beginPath();
    g.arc(X(2.5), 30 * ppm, 0.45 * ppm, 0, Math.PI * 2);
    g.fill();
    T.road = tex(c);
  }

  {
    const ppm = 16;
    const W = 20 * ppm;
    const [c, g] = canvas(W, W);
    asphalt(g, W, W, rnd);
    g.strokeStyle = 'rgba(255,200,40,0.35)';
    g.lineWidth = 0.15 * ppm;
    g.setLineDash([0.6 * ppm, 0.6 * ppm]);
    g.strokeRect(1.5 * ppm, 1.5 * ppm, 17 * ppm, 17 * ppm);
    T.cross = tex(c);
  }

  const groundStyles = {
    downtown: { walk: '#9a95a0', inner: '#7e7887', pattern: 'tiles', tile: '#8b8594' },
    vice: { walk: '#c9a7b4', inner: '#d9b4c0', pattern: 'checker', tile: '#e8c9d2' },
    beach: { walk: '#e3cfa5', inner: '#ecd9a8', pattern: 'sand', tile: '#f2e2b6' },
    suburb: { walk: '#b8b0a6', inner: '#5f8f45', pattern: 'grass', tile: '#6da050' },
    industrial: { walk: '#8a857c', inner: '#6b665d', pattern: 'concrete', tile: '#5c574f' },
    park: { walk: '#b0a89c', inner: '#4f8a3c', pattern: 'park', tile: '#5f9c48' },
  };
  T.block = {};
  for (const [name, st] of Object.entries(groundStyles)) {
    const S = 512, ppm = S / 64;
    const [c, g] = canvas(S, S);
    g.fillStyle = st.walk;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.13)';
    g.lineWidth = 1;
    for (let k = 0; k <= 64; k += 1.5) {
      g.beginPath(); g.moveTo(k * ppm, 0); g.lineTo(k * ppm, 4 * ppm); g.stroke();
      g.beginPath(); g.moveTo(k * ppm, S); g.lineTo(k * ppm, S - 4 * ppm); g.stroke();
      g.beginPath(); g.moveTo(0, k * ppm); g.lineTo(4 * ppm, k * ppm); g.stroke();
      g.beginPath(); g.moveTo(S, k * ppm); g.lineTo(S - 4 * ppm, k * ppm); g.stroke();
    }
    noise(g, S, S, 9000, 0.05, rnd);
    const i0 = 4 * ppm, iw = 56 * ppm;
    g.fillStyle = st.inner;
    g.fillRect(i0, i0, iw, iw);
    if (st.pattern === 'tiles') {
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let k = 0; k <= 56; k += 2) {
        g.beginPath(); g.moveTo(i0 + k * ppm, i0); g.lineTo(i0 + k * ppm, i0 + iw); g.stroke();
        g.beginPath(); g.moveTo(i0, i0 + k * ppm); g.lineTo(i0 + iw, i0 + k * ppm); g.stroke();
      }
    } else if (st.pattern === 'checker') {
      g.fillStyle = st.tile;
      for (let a = 0; a < 28; a++) for (let b = 0; b < 28; b++) if ((a + b) % 2) g.fillRect(i0 + a * 2 * ppm, i0 + b * 2 * ppm, 2 * ppm, 2 * ppm);
    } else if (st.pattern === 'sand' || st.pattern === 'grass' || st.pattern === 'park') {
      for (let k = 0; k < 4000; k++) {
        g.fillStyle = st.pattern === 'sand' ? `rgba(160,120,60,${rnd() * 0.18})` : `rgba(${20 + rnd() * 60},${80 + rnd() * 70},${20 + rnd() * 30},${0.35})`;
        g.fillRect(i0 + rnd() * iw, i0 + rnd() * iw, 2, 2 + rnd() * 2);
      }
      if (st.pattern === 'park') {
        g.strokeStyle = '#c4ae86';
        g.lineWidth = 2.5 * ppm;
        g.beginPath(); g.moveTo(S / 2, i0); g.lineTo(S / 2, i0 + iw); g.stroke();
        g.beginPath(); g.moveTo(i0, S / 2); g.lineTo(i0 + iw, S / 2); g.stroke();
        g.beginPath(); g.arc(S / 2, S / 2, 9 * ppm, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#2e7f9a';
        g.beginPath(); g.ellipse(S / 2, S / 2, 5 * ppm, 5 * ppm, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(160,230,255,0.5)';
        g.beginPath(); g.ellipse(S / 2 - ppm, S / 2 - ppm, 2 * ppm, 1.2 * ppm, 0.5, 0, Math.PI * 2); g.fill();
      }
    } else {
      noise(g, S, S, 6000, 0.08, rnd);
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      for (let k = 0; k < 20; k++) {
        g.beginPath();
        let x = i0 + rnd() * iw, y = i0 + rnd() * iw;
        g.moveTo(x, y);
        for (let s = 0; s < 5; s++) { x += (rnd() - 0.5) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(30,20,30,0.5)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, S - 3, S - 3);
    T.block[name] = tex(c);
  }

  {
    const S = 256, ppm = 4;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#e8d3a8';
    g.fillRect(0, 0, S, S);
    for (let k = 0; k < 6000; k++) {
      g.fillStyle = `rgba(150,110,60,${rnd() * 0.15})`;
      g.fillRect(rnd() * S, rnd() * S, 2, 2);
    }
    T.sand = tex(c, true);
  }

  {
    const C = 32, N = 8;
    const [c, g] = canvas(C * N, C * N);
    const [ce, ge] = canvas(C * N, C * N);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, C * N, C * N);
    noise(g, C * N, C * N, 3000, 0.06, rnd);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, C * N, C * N);
    const lit = ['#ffd58a', '#ffc070', '#ffe7b0', '#ff9ec8', '#9ee8ff'];
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        const x = a * C, y = b * C;
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(x, y + C - 3, C, 3);
        g.fillStyle = '#1e2a3c';
        g.fillRect(x + 5, y + 6, C - 10, C - 12);
        g.fillStyle = 'rgba(160,190,230,0.25)';
        g.fillRect(x + 5, y + 6, (C - 10) / 2, C - 12);
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillRect(x + C / 2 - 0.5, y + 6, 1, C - 12);
        if (rnd() < 0.33) {
          const col = lit[Math.floor(rnd() * lit.length)];
          ge.fillStyle = col;
          ge.fillRect(x + 5, y + 6, C - 10, C - 12);
          g.fillStyle = col;
          g.fillRect(x + 5, y + 6, C - 10, C - 12);
          if (rnd() < 0.5) {
            ge.fillStyle = 'rgba(0,0,0,0.5)';
            ge.fillRect(x + 5, y + 6, (C - 10) * rnd(), C - 12);
          }
        }
      }
    }
    T.facade = tex(c, true);
    T.facadeEmit = tex(ce, true);
  }

  {
    const S = 128;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#b5adb2';
    g.fillRect(0, 0, S, S);
    noise(g, S, S, 4000, 0.12, rnd);
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 1;
    for (let k = 0; k <= S; k += 32) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.stroke();
      g.beginPath(); g.moveTo(0, k); g.lineTo(S, k); g.stroke();
    }
    T.roof = tex(c, true);
  }

  {
    const S = 256;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#3b3b44';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 10;
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff';
    g.font = 'bold 150px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', S / 2, S / 2 + 6);
    T.helipad = tex(c);
  }

  {
    const S = 256;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#f0ece2';
    g.fillRect(0, 0, S, S);
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, '#2ad4e8');
    gr.addColorStop(1, '#1088c8');
    g.fillStyle = gr;
    g.fillRect(16, 16, S - 32, S - 32);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let k = 0; k < 12; k++) {
      g.beginPath();
      const y = 30 + rnd() * (S - 60);
      g.moveTo(20, y);
      for (let x = 20; x < S - 20; x += 20) g.lineTo(x, y + Math.sin(x * 0.1 + k) * 4);
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,40,80,0.3)';
    for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(16, 16 + k * (S - 32) / 5); g.lineTo(S - 16, 16 + k * (S - 32) / 5); g.stroke(); }
    T.pool = tex(c);
  }

  {
    const S = 128;
    const [c, g] = canvas(S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    T.glow = tex(c, false, false);
  }

  {
    const S = 64;
    const [c, g] = canvas(S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    T.blob = tex(c, false, false);
  }

  {
    const S = 128;
    const [c, g] = canvas(S, S);
    g.fillStyle = 'rgba(120,0,8,0.95)';
    for (let k = 0; k < 14; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 40;
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 4 + rnd() * 16, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath(); g.arc(S / 2, S / 2, 28, 0, Math.PI * 2); g.fill();
    T.blood = tex(c);
  }

  {
    const S = 128;
    const [c, g] = canvas(S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(10,8,8,0.95)');
    gr.addColorStop(0.6, 'rgba(20,15,15,0.6)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    T.scorch = tex(c);
  }

  {
    const S = 64;
    const [c, g] = canvas(S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    T.particle = tex(c, false, false);
  }

  {
    const S = 256;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(80,200,230,0.5)';
    g.lineWidth = 3;
    for (let k = 0; k < 40; k++) {
      g.beginPath();
      const y = rnd() * S, x = rnd() * S, l = 10 + rnd() * 40;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + l / 2, y - 4, x + l, y);
      g.stroke();
    }
    T.water = tex(c, true);
  }

  T.pickup = {};
  const icons = {
    pistol: ['#ffd23f', 'P'], uzi: ['#ff8c3a', 'U'], shotgun: ['#ff5a5a', 'S'], rocket: ['#ff3df0', 'R'],
    health: ['#ff3b5c', '+'], armor: ['#3ea8ff', 'A'], cash: ['#39ff88', '$'], bribe: ['#ffe14d', '★'],
  };
  for (const [k, [col, ch]] of Object.entries(icons)) {
    const S = 128;
    const [c, g] = canvas(S, S);
    g.fillStyle = 'rgba(10,6,20,0.85)';
    g.beginPath(); g.arc(S / 2, S / 2, 58, 0, Math.PI * 2); g.fill();
    g.strokeStyle = col;
    g.lineWidth = 8;
    g.beginPath(); g.arc(S / 2, S / 2, 52, 0, Math.PI * 2); g.stroke();
    g.fillStyle = col;
    g.font = 'bold 72px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, S / 2, S / 2 + 4);
    T.pickup[k] = tex(c);
    T.pickup[k].userData = { color: col };
  }

  return T;
}

export function textSprite(text, color = '#ffffff', size = 48, outline = '#000') {
  const [c, g] = canvas(8, 8);
  g.font = `bold ${size}px Arial, sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + 16;
  c.width = w;
  c.height = size + 16;
  g.font = `bold ${size}px Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = size / 6;
  g.strokeStyle = outline;
  g.strokeText(text, w / 2, c.height / 2);
  g.fillStyle = color;
  g.fillText(text, w / 2, c.height / 2);
  const t = tex(c);
  const m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false });
  const s = new THREE.Sprite(m);
  s.renderOrder = 20;
  s.userData.aspect = w / c.height;
  return s;
}
