import { generateWorld } from '/shared/world.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { connect } from './net.js';
import { createGame } from './game.js';
import { createInput } from './input.js';

const params = new URLSearchParams(location.search);
const BOT = params.get('bot') === '1';
const canvas = document.getElementById('c');
const hudRoot = document.getElementById('hud');

let world = generateWorld(6);
let hud = null;
let audio = null;
try { hud = createHud(hudRoot, world); } catch (e) { console.error('hud', e); }
try { audio = createAudio(); } catch (e) { console.error('audio', e); }

const isTyping = () => { try { return !!hud?.isTyping?.(); } catch { return false; } };
const input = createInput(canvas, isTyping);

let unlocked = false;
const unlock = () => {
  if (unlocked) return;
  unlocked = true;
  try { audio?.unlock?.(); } catch (e) { console.error(e); }
};
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

const state = { net: null, game: null, renderer: null, started: false };
window.__game = {
  get view() { return state.game?.view || null; },
  get net() { return state.net; },
  get game() { return state.game; },
  get renderer() { return state.renderer; },
  hud, audio, bot: BOT,
};

function safe(fn) {
  try { fn(); } catch (e) { console.error(e); }
}

function start(name) {
  if (state.started) return;
  state.started = true;
  name = String(name || 'Player').slice(0, 16);
  const net = connect(name);
  state.net = net;
  const game = createGame({ world, net, bot: BOT });
  state.game = game;

  net.on('welcome', (msg) => {
    if (msg.seed != null && msg.seed !== world.seed) {
      world = generateWorld(msg.seed);
      game.setWorld(world);
      if (hud) hud.world = world;
    }
    if (!state.renderer) {
      try {
        state.renderer = createRenderer(canvas, world);
        game.setRenderer(state.renderer);
      } catch (e) { console.error('renderer', e); }
    }
    game.onWelcome(msg);
  });
  net.on('snap', (msg) => game.onSnap(msg));
  net.on('ev', (ev) => {
    game.onEvent(ev);
    safe(() => state.renderer?.effect?.(ev));
    safe(() => hud?.event?.(ev, game.view));
    safe(() => audio?.event?.(ev, game.view));
  });
  safe(() => hud?.onChat?.((text) => net.send({ t: 'chat', text: String(text).slice(0, 120) })));


  let last = performance.now();
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25,Math.max(0, (ts - last) / 1000));
    last = ts;
    const inp = input.frame();
    let view;
    try {
      view = game.update(dt, inp, innerWidth, innerHeight);
    } catch (e) { console.error(e); return; }
    if (state.renderer) safe(() => state.renderer.update(view, dt));
    safe(() => hud?.update?.(view, dt));
    safe(() => audio?.update?.(view, dt));
  }
  requestAnimationFrame(frame);
}

const autoName = params.get('name');
if (autoName && (params.get('auto') === '1' || BOT)) {
  start(autoName);
} else if (hud?.showJoin) {
  hud.showJoin((name) => { unlock(); start(name); });
} else {
  start(autoName || 'Player' + Math.floor(Math.random() * 1000));
}
