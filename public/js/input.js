const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

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
      };
      pressed = new Set();
      wheel = 0;
      mouse.pressed = false;
      if (typing) down.clear();
      return out;
    },
  };
}
