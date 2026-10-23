// Input manager: keyboard, mouse, pointer lock. UI layers can pause
// game input by pushing "capture" (e.g. inventory open).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseButtons = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.captured = false;      // true when a UI layer owns input
    this.pointerLocked = false;

    this.onKeyDown = null;      // (code, event) => bool handled
    this.onMouseDown = null;    // (button) => void
    this.onMouseUp = null;
    this.onWheel = null;

    document.addEventListener('keydown', (e) => {
      if (e.code === 'F5') e.preventDefault();
      if (this.onKeyDown && this.onKeyDown(e.code, e)) return;
      if (!this.captured) this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseButtons.clear(); });

    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked && !this.captured) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (this.captured) return;
      if (!this.pointerLocked) {
        this.requestLock();
        return;
      }
      this.mouseButtons.add(e.button);
      this.onMouseDown?.(e.button);
    });
    document.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
      this.onMouseUp?.(e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (this.captured) return;
      this.wheel += Math.sign(e.deltaY);
      this.onWheel?.(Math.sign(e.deltaY));
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) {
        this.keys.clear();
        this.mouseButtons.clear();
        this.onLockLost?.();
      }
    });
  }

  requestLock() {
    this.canvas.requestPointerLock?.();
  }

  releaseLock() {
    if (this.pointerLocked) document.exitPointerLock();
  }

  // Call once per frame after consuming dx/dy.
  endFrame() {
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }

  down(code) {
    return !this.captured && this.keys.has(code);
  }

  mouseDown(button) {
    return !this.captured && this.mouseButtons.has(button);
  }
}
