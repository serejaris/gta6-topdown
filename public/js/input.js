const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const STICK_R = 56;

function createTouch(onCar, onWeapon) {
  const state = { active: false, mx: 0, my: 0, ax: 0, ay: 0, aiming: false, fire: false, firePressed: false };
  let root = null;
  const sticks = {};
  const holds = new Map();

  function makeStick(side) {
    const base = document.createElement('div');
    base.className = 't-stick ' + side;
    const knob = document.createElement('div');
    knob.className = 't-knob';
    base.appendChild(knob);
    root.appendChild(base);
    return { base, knob, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  }

  function makeBtn(cls, label, down, up) {
    const b = document.createElement('div');
    b.className = 't-btn ' + cls;
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('on');
      try { b.setPointerCapture(e.pointerId); } catch {}
      down();
    });
    const end = (e) => { b.classList.remove('on'); up?.(); };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    root.appendChild(b);
    return b;
  }

  function place(s, x, y) {
    s.base.style.left = x + 'px';
    s.base.style.top = y + 'px';
  }

  function move(s, x, y) {
    let dx = x - s.ox, dy = y - s.oy;
    const l = Math.hypot(dx, dy);
    if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
    s.x = dx / STICK_R;
    s.y = dy / STICK_R;
    s.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  function release(s) {
    s.id = null;
    s.x = 0; s.y = 0;
    s.knob.style.transform = '';
    s.base.classList.remove('on');
    s.base.style.left = '';
    s.base.style.top = '';
  }

  function enable() {
    if (root) return;
    state.active = true;
    document.documentElement.classList.add('touch');
    root = document.createElement('div');
    root.className = 't-pad';
    document.body.appendChild(root);
    sticks.left = makeStick('left');
    sticks.right = makeStick('right');
    makeBtn('fire', 'ОГОНЬ', () => { state.fire = true; state.firePressed = true; }, () => { state.fire = false; });
    makeBtn('car', 'МАШИНА', onCar);
    makeBtn('wpn', 'ОРУЖИЕ', onWeapon);
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      const s = e.clientX < innerWidth / 2 ? sticks.left : sticks.right;
      if (s.id != null) return;
      s.id = e.pointerId;
      s.ox = e.clientX; s.oy = e.clientY;
      place(s, e.clientX, e.clientY);
      s.base.classList.add('on');
      move(s, e.clientX, e.clientY);
      try { root.setPointerCapture(e.pointerId); } catch {}
      holds.set(e.pointerId, s);
    });
    root.addEventListener('pointermove', (e) => {
      const s = holds.get(e.pointerId);
      if (s) { e.preventDefault(); move(s, e.clientX, e.clientY); }
    });
    const end = (e) => {
      const s = holds.get(e.pointerId);
      if (s) { holds.delete(e.pointerId); release(s); }
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }

  if (matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).get('touch') === '1') {
    if (document.body) enable(); else addEventListener('DOMContentLoaded', enable);
  } else {
    addEventListener('touchstart', enable, { once: true, passive: true });
  }

  return {
    frame() {
      if (!state.active) return null;
      const l = sticks.left, r = sticks.right;
      const out = {
        active: true,
        mx: l ? l.x : 0, my: l ? l.y : 0,
        ax: r ? r.x : 0, ay: r ? r.y : 0,
        aiming: !!r && Math.hypot(r.x, r.y) > 0.3,
        fire: state.fire || (!!r && Math.hypot(r.x, r.y) > 0.8),
        firePressed: state.firePressed,
      };
      state.firePressed = false;
      return out;
    },
  };
}

export function createInput(target, isTyping = () => false) {
  const down = new Set();
  let pressed = new Set();
  let wheel = 0;
  let wheelAcc = 0;
  let wheelAt = 0;
  let wheelSteps = 0;
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, pressed: false, moved: false };

  addEventListener('keydown', (e) => {
    if (isTyping()) return;
    if (BLOCK_KEYS.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });
  addEventListener('keyup', (e) => {
    down.delete(e.code);
    if (e.key === 'Meta' || e.code === 'MetaLeft' || e.code === 'MetaRight') down.clear();
  });
  addEventListener('visibilitychange', () => {
    if (document.hidden) { down.clear(); mouse.down = false; }
  });
  addEventListener('blur', () => {
    down.clear();
    mouse.down = false;
  });
  addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.moved = true;
  });
  addEventListener('mousedown', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (e.button === 0) {
      if (isTyping()) return;
      mouse.down = true;
      mouse.pressed = true;
    }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  addEventListener('wheel', (e) => {
    if (isTyping()) return;
    const t = performance.now();
    if (t - wheelAt > 250) { wheelAcc = 0; wheelSteps = 0; }
    wheelAt = t;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (Math.sign(dy) !== Math.sign(wheelAcc)) wheelAcc = 0;
    wheelAcc += dy;
    let need = wheelSteps ? 150 : 40;
    while (Math.abs(wheelAcc) >= need) {
      const s = Math.sign(wheelAcc);
      wheel += s;
      wheelSteps++;
      wheelAcc -= s * need;
      need = 150;
    }
  }, { passive: true });
  addEventListener('contextmenu', (e) => e.preventDefault());
  target?.addEventListener?.('contextmenu', (e) => e.preventDefault());

  const touch = createTouch(() => { pressed.add('KeyF'); }, () => { wheel += 1; });

  return {
    mouse,
    frame() {
      const typing = isTyping();
      const out = {
        down: typing ? new Set() : new Set(down),
        pressed: typing ? new Set() : pressed,
        wheel: typing ? 0 : wheel,
        mouseX: mouse.x,
        mouseY: mouse.y,
        mouseMoved: mouse.moved,
        mouseDown: !typing && mouse.down,
        mousePressed: !typing && mouse.pressed,
        touch: touch.frame(),
      };
      pressed = new Set();
      wheel = 0;
      mouse.pressed = false;
      if (typing) down.clear();
      return out;
    },
  };
}
