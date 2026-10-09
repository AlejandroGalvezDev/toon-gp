// js/core/state-machine.js — GAME.Core.StateMachine
window.GAME = window.GAME || {};
GAME.Core = GAME.Core || {};

GAME.Core.StateMachine = class StateMachine {
  constructor() {
    this.state = 'MENU';
    this.listeners = {};
  }

  on(state, cb) {
    (this.listeners[state] = this.listeners[state] || []).push(cb);
  }

  canTransition(from, to) {
    const allowed = {
      MENU: ['COUNTDOWN'],
      COUNTDOWN: ['RACING', 'MENU'],
      RACING: ['PAUSED', 'FINISHED'],
      PAUSED: ['RACING', 'MENU'],
      FINISHED: ['MENU', 'COUNTDOWN']
    };
    return (allowed[from] || []).includes(to);
  }

  setState(s) {
    if (!this.canTransition(this.state, s)) return false;
    const prev = this.state;
    this.state = s;
    (this.listeners[s] || []).forEach(cb => cb(prev, s));
    return true;
  }

  is(s) { return this.state === s; }

  transition(to) { return this.setState(to); }
};
