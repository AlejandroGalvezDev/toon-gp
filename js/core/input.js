// js/core/input.js — GAME.Core.Input
window.GAME = window.GAME || {};
GAME.Core = GAME.Core || {};

GAME.Core.Input = class Input {
  constructor() {
    this.keys = {};
    this.touch = { throttle: false, brake: false, left: false, right: false, drift: false };
    this.gamepadIndex = null;
    this._bindKeyboard();
    this._bindTouch();
    this._bindGamepad();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  _bindTouch() {
    const map = {
      'btn-up': 'throttle', 'btn-down': 'brake',
      'btn-left': 'left', 'btn-right': 'right', 'btn-drift': 'drift'
    };
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = map[id];
      const on = (e) => { e.preventDefault(); this.touch[key] = true; };
      const off = (e) => { e.preventDefault(); this.touch[key] = false; };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
    });
  }

  _bindGamepad() {
    window.addEventListener('gamepadconnected', (e) => { this.gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = null; });
  }

  _gp() {
    if (this.gamepadIndex === null || !navigator.getGamepads) return null;
    return navigator.getGamepads()[this.gamepadIndex];
  }

  isDown(key) {
    return !!this.keys[key];
  }

  getThrottle() {
    let v = (this.isDown('ArrowUp') || this.isDown('KeyW') || this.touch.throttle) ? 1 : 0;
    const gp = this._gp();
    if (gp && gp.buttons[7]) v = Math.max(v, gp.buttons[7].value);
    return v;
  }

  getSteer() {
    let v = 0;
    if (this.isDown('ArrowLeft') || this.isDown('KeyA') || this.touch.left) v -= 1;
    if (this.isDown('ArrowRight') || this.isDown('KeyD') || this.touch.right) v += 1;
    const gp = this._gp();
    if (gp && gp.axes[0]) v += gp.axes[0];
    return Math.max(-1, Math.min(1, v));
  }

  getBrake() {
    let v = (this.isDown('ArrowDown') || this.isDown('KeyS') || this.touch.brake) ? 1 : 0;
    const gp = this._gp();
    if (gp && gp.buttons[6]) v = Math.max(v, gp.buttons[6].value);
    return v;
  }

  isDriftPressed() {
    let v = this.isDown('Space') || this.touch.drift;
    const gp = this._gp();
    if (gp && gp.buttons[0] && gp.buttons[0].pressed) v = true;
    return v;
  }
};
