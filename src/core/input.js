// Keyboard / mouse input with pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.mouse = { dx: 0, dy: 0, buttons: new Set(), clicked: new Set(), released: new Set(), wheel: 0 };
    this.locked = false;
    this.lockedAt = 0;
    this.enabled = true;
    this.onLockChange = null;
    this.listeners = [];

    const on = (target, ev, fn, opts) => {
      target.addEventListener(ev, fn, opts);
      this.listeners.push([target, ev, fn, opts]);
    };
    on(window, 'keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const code = e.code;
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F1'].includes(code) || (e.ctrlKey && code !== 'KeyR')) e.preventDefault();
    });
    on(window, 'keyup', (e) => {
      this.keys.delete(e.code);
    });
    on(window, 'blur', () => {
      this.keys.clear();
      this.mouse.buttons.clear();
    });
    on(document, 'mousemove', (e) => {
      if (!this.locked) return;
      // Chrome can report a huge bogus delta right after pointer lock engages; drop those
      if (performance.now() - this.lockedAt < 150) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) > 400 || Math.abs(my) > 400) return;
      this.mouse.dx += mx;
      this.mouse.dy += my;
    });
    on(canvas, 'mousedown', (e) => {
      if (!this.locked) return;
      this.mouse.buttons.add(e.button);
      this.mouse.clicked.add(e.button);
    });
    on(window, 'mouseup', (e) => {
      if (this.mouse.buttons.has(e.button)) this.mouse.released.add(e.button);
      this.mouse.buttons.delete(e.button);
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(window, 'wheel', (e) => {
      if (this.locked) this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockedAt = performance.now();
      if (!this.locked) { this.mouse.buttons.clear(); this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* ignored: browsers may refuse without a user gesture */ }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  mouseDown(b) { return this.mouse.buttons.has(b); }
  mouseHit(b) { return this.mouse.clicked.has(b); }
  mouseUp(b) { return this.mouse.released.has(b); }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked.clear();
    this.mouse.released.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }
}
