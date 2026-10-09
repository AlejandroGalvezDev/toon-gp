// js/core/scene-manager.js — GAME.Core.SceneManager
window.GAME = window.GAME || {};
GAME.Core = GAME.Core || {};

GAME.Core.SceneManager = class SceneManager {
  constructor(renderer, audio) {
    this.renderer = renderer;
    this.audio = audio;
    this.scenes = {};
    this.current = null;
    this.currentName = null;
    this.transitioning = false;
  }

  register(name, scene) {
    this.scenes[name] = scene;
  }

  show(name, data) {
    if (!this.scenes[name]) return false;
    if (this.currentName === name) return false;
    this.currentName = name;
    this.current = this.scenes[name];
    this.transitioning = false;
    if (this.current.enter) this.current.enter(data);
    return true;
  }

  update(dt) {
    if (this.current && this.current.update) this.current.update(dt);
  }

  render(ctx, w, h) {
    if (this.current && this.current.render) this.current.render(ctx, w, h);
  }
};
