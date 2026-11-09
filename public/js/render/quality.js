export const LEVELS = [
  { dpr: 2, bloom: true, shadow: 2048 },
  { dpr: 1.5, bloom: true, shadow: 1024 },
  { dpr: 1.25, bloom: true, shadow: 1024 },
  { dpr: 1.25, bloom: false, shadow: 1024 },
  { dpr: 1, bloom: false, shadow: 1024 },
  { dpr: 1, bloom: false, shadow: 0 },
];

const MODES = ['auto', 'high', 'mid', 'low'];
const FIXED = { high: 0, mid: 1, low: LEVELS.length - 1 };
const MODE_RU = { auto: 'авто', high: 'высокое', mid: 'среднее', low: 'низкое' };
const KEY = 'gta6.quality';
const WINDOW = 1.5;
const DOWN_FPS = 45;
const UP_FPS = 58;
const UP_HOLD = 10;

function readMode() {
  const q = new URLSearchParams(location.search).get('q');
  if (MODES.includes(q)) {
    try { localStorage.setItem(KEY, q); } catch {}
    return q;
  }
  try {
    const s = localStorage.getItem(KEY);
    if (MODES.includes(s)) return s;
  } catch {}
  return 'auto';
}

export function createQuality(apply, caps = {}) {
  let mode = readMode();
  let level = mode === 'auto' ? 1 : FIXED[mode];
  let acc = 0, frames = 0, fps = 0, clock = 0;
  let good = 0, cool = 3, upAt = -1e9, upTo = -1;
  const fails = LEVELS.map(() => 0);

  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:50;pointer-events:none;font:11px/1.3 ui-monospace,Menlo,monospace;color:#fff;opacity:.5;text-shadow:0 1px 2px #000;white-space:nowrap;letter-spacing:.02em';
  document.body.appendChild(badge);

  function label() {
    const L = LEVELS[level];
    const dpr = Math.min(L.dpr, window.devicePixelRatio || 1);
    const bloom = L.bloom && caps.bloom !== false, shadow = caps.shadow !== false ? L.shadow : 0;
    const parts = [`Q ${MODE_RU[mode]}`, `×${dpr}`, bloom ? 'блум' : 'без блума', shadow ? `тени ${shadow}` : 'без теней'];
    if (fps) parts.push(`${Math.round(fps)} к/с`);
    return parts.join(' · ');
  }
  function show() { badge.textContent = label(); }

  function set(i) {
    i = Math.max(0, Math.min(LEVELS.length - 1, i));
    if (i === level) return;
    level = i;
    apply(LEVELS[level]);
    acc = 0; frames = 0; good = 0; cool = WINDOW;
    show();
  }

  function setMode(m) {
    mode = m;
    try { localStorage.setItem(KEY, m); } catch {}
    good = 0; cool = WINDOW; fails.fill(0);
    if (m !== 'auto') set(FIXED[m]);
    show();
  }

  function evaluate() {
    if (mode !== 'auto') return;
    if (cool > 0) { cool -= WINDOW; return; }
    if (fps < DOWN_FPS) {
      if (level < LEVELS.length - 1) {
        if (upTo === level && clock - upAt < 30) fails[level]++;
        upTo = -1;
        set(level + 1);
      }
      good = 0;
    } else if (fps > UP_FPS) {
      good += WINDOW;
      if (level > 0 && good >= Math.min(UP_HOLD * 2 ** fails[level - 1], 160)) {
        upAt = clock;
        upTo = level - 1;
        set(level - 1);
      }
    } else good = 0;
  }

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyQ' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  });

  apply(LEVELS[level]);
  show();

  const api = {
    get level() { return LEVELS[level]; },
    get mode() { return mode; },
    get fps() { return fps; },
    label,
    setMode,
    tick(dt) {
      if (!(dt > 0) || dt > 0.25) return;
      clock += dt;
      acc += dt;
      frames++;
      if (acc >= WINDOW) {
        fps = frames / acc;
        acc = 0;
        frames = 0;
        evaluate();
        show();
      }
    },
  };
  window.__quality = api;
  return api;
}
