const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(target, isTyping = () => false) {
  const down = new Set();
  let pressed = new Set();
  let wheel = 0;
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, pressed: false, moved: false };

  addEventListener('keydown', (e) => {
    if (isTyping()) return;
    if (BLOCK_KEYS.has(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });
  addEventListener('keyup', (e) => {
    down.delete(e.code);
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
    wheel += Math.sign(e.deltaY);
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
