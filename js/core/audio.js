// js/core/audio.js — GAME.Core.Audio (Web Audio API procedural)
window.GAME = window.GAME || {};
GAME.Core = GAME.Core || {};

GAME.Core.Audio = class Audio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.skidSource = null;
    this.skidGain = null;
    this.skidFilter = null;
    this.musicGain = null;
    this.musicTimer = null;
    this.musicPlaying = false;
    this.initialized = false;
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  startEngine() {
    const ctx = this.ensureContext();
    this.stopEngine();
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 800;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);
    this.engineOsc.start();
    this.engineGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.3);
    this.initialized = true;
  }

  setEngineSpeed(speed) {
    if (!this.engineOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 40 + Math.min(speed / 300, 1) * 180;
    const vol = 0.06 + Math.min(speed / 300, 1) * 0.10;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(400 + Math.min(speed / 300, 1) * 2000, t, 0.1);
  }

  stopEngine() {
    if (!this.engineOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      this.engineGain.gain.cancelScheduledValues(t);
      this.engineGain.gain.setValueAtTime(this.engineGain.gain.value, t);
      this.engineGain.gain.linearRampToValueAtTime(0, t + 0.3);
      this.engineOsc.stop(t + 0.35);
    } catch (e) {}
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  playSkid(duration = 0.4) {
    const ctx = this.ensureContext();
    this.stopSkid();
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    this.skidSource = ctx.createBufferSource();
    this.skidSource.buffer = buf;
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 900;
    this.skidFilter.Q.value = 2.5;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0.18;
    this.skidSource.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.masterGain);
    this.skidSource.start();
    this.skidSource.stop(ctx.currentTime + duration);
  }

  stopSkid() {
    if (this.skidSource && this.ctx) {
      try { this.skidSource.stop(); } catch (e) {}
    }
    this.skidSource = null;
    this.skidGain = null;
    this.skidFilter = null;
  }

  playCountdown() {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    [523.25, 523.25, 523.25, 1046.5].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.7);
      g.gain.linearRampToValueAtTime(0.2, now + i * 0.7 + 0.02);
      g.gain.linearRampToValueAtTime(0, now + i * 0.7 + (i === 3 ? 0.6 : 0.5));
      osc.connect(g); g.connect(this.masterGain);
      osc.start(now + i * 0.7);
      osc.stop(now + i * 0.7 + 0.65);
    });
  }

  playLapBeep() {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.3);
  }

  playEffect(name) {
    const ctx = this.ensureContext();
    const t = ctx.currentTime;
    if (name === 'overtake') {
      [660, 880].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.18, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.25);
        o.connect(g); g.connect(this.masterGain);
        o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.3);
      });
    } else if (name === 'click') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = 1200;
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g); g.connect(this.masterGain);
      o.start(t); o.stop(t + 0.1);
    }
  }

  startMusic() {
    const ctx = this.ensureContext();
    if (this.musicPlaying) return;
    this.musicPlaying = true;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.10;
    this.musicGain.connect(this.masterGain);
    const bpm = 140;
    const noteLen = 60 / bpm / 2;
    const seq = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 293.66, 392.00];
    let step = 0;
    const tick = () => {
      if (!this.musicPlaying || !this.ctx) return;
      const f = seq[step % seq.length];
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t = this.ctx.currentTime;
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + noteLen * 0.9);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + noteLen);
      step++;
    };
    tick();
    this.musicTimer = setInterval(tick, noteLen * 1000);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  dispose() {
    this.stopEngine();
    this.stopSkid();
    this.stopMusic();
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
};
