// Smoke test: carga todos los módulos en un entorno Node con mock de window/document
// y valida que la API pública de window.GAME está completa y funcional.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mocks mínimos
class MockAudioParam { constructor() { this.value = 0; } }
class MockAudioContext {
    constructor() {
        this.currentTime = 0;
        this.destination = {};
        this.sampleRate = 44100;
    }
    createOscillator() {
        return {
            connect: () => {}, start: () => {}, stop: () => {}, disconnect: () => {},
            frequency: new MockAudioParam(), detune: new MockAudioParam(),
            type: 'sawtooth', onended: null
        };
    }
    createGain() { return { connect: () => {}, disconnect: () => {}, gain: new MockAudioParam() }; }
    createBiquadFilter() {
        return { connect: () => {}, disconnect: () => {}, frequency: new MockAudioParam(), Q: new MockAudioParam(), gain: new MockAudioParam(), type: 'lowpass' };
    }
    createBufferSource() {
        return { connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {}, buffer: null, loop: false };
    }
    createBuffer(ch, len, sr) {
        return {
            getChannelData: () => new Float32Array(len),
            numberOfChannels: ch, length: len, sampleRate: sr
        };
    }
}
const mockLocalStorage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
};
class MockElement {
    constructor(tag) {
        this.tagName = (tag || 'div').toUpperCase();
        this.children = [];
        this.style = {};
        this._cls = new Set();
        this.dataset = {};
        this._listeners = {};
    }
    get classList() {
        const s = this._cls;
        return {
            add: (...c) => c.forEach(x => s.add(x)),
            remove: (...c) => c.forEach(x => s.delete(x)),
            toggle: (c) => s.has(c) ? s.delete(c) : s.add(c),
            contains: (c) => s.has(c)
        };
    }
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
    removeEventListener(t, f) { this._listeners[t] = (this._listeners[t] || []).filter(x => x !== f); }
    dispatchEvent() {}
    appendChild(c) { this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter(x => x !== c); }
    getContext() {
        return {
            canvas: this,
            fillRect: () => {}, strokeRect: () => {}, clearRect: () => {},
            fillText: () => {}, strokeText: () => {}, measureText: () => ({ width: 10 }),
            beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {}, closePath: () => {},
            fill: () => {}, stroke: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, scale: () => {},
            drawImage: () => {}, createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
            set fillStyle(v) {}, get fillStyle() { return ''; },
            set strokeStyle(v) {}, get strokeStyle() { return ''; },
            set lineWidth(v) {}, get lineWidth() { return 1; },
            set font(v) {}, get font() { return ''; },
            set textAlign(v) {}, get textAlign() { return ''; },
            set textBaseline(v) {}, get textBaseline() { return ''; },
            set globalAlpha(v) {}, get globalAlpha() { return 1; },
            set globalCompositeOperation(v) {}, get globalCompositeOperation() { return ''; },
            set lineCap(v) {}, get lineCap() { return ''; },
            set lineJoin(v) {}, get lineJoin() { return ''; },
            set shadowBlur(v) {}, get shadowBlur() { return 0; },
            set shadowColor(v) {}, get shadowColor() { return ''; }
        };
    }
    setAttribute(k, v) { this[k] = v; }
    getAttribute(k) { return this[k] ?? null; }
    removeAttribute(k) { delete this[k]; }
}
const document = {
    createElement: (t) => new MockElement(t),
    getElementById: (id) => new MockElement('div'),
    querySelector: (s) => new MockElement('div'),
    querySelectorAll: (s) => [],
    body: new MockElement('body'),
    documentElement: new MockElement('html'),
    addEventListener: () => {}, removeEventListener: () => {},
    fonts: { load: () => Promise.resolve() }
};
const windowObj = {
    document,
    localStorage: mockLocalStorage,
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    requestAnimationFrame: (f) => setTimeout(f, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    performance: { now: () => Date.now() },
    devicePixelRatio: 1,
    innerWidth: 1280, innerHeight: 720,
    addEventListener: () => {}, removeEventListener: () => {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    console
};
windowObj.window = windowObj;
windowObj.globalThis = windowObj;

// Contexto de ejecución
const ctx = vm.createContext(windowObj);

// Cargar módulos en el orden del index.html
const loadOrder = [
    'js/core/game.js', 'js/core/input.js', 'js/core/audio.js', 'js/core/scene-manager.js', 'js/core/state-machine.js',
    'js/render/renderer.js', 'js/render/hud-renderer.js',
    'js/physics/car-physics.js',
    'js/ai/racer-ai.js',
    'js/track/track-generator.js', 'js/track/track-data.js',
    'js/game/race-manager.js', 'js/game/lap-timer.js', 'js/game/ghost-data.js', 'js/game/time-trial.js',
    'js/main.js'
];

const baseDir = '/home/alejandro/prueba/Cars';
const results = { loaded: [], errors: [], apiChecks: {}, runtimeChecks: {} };

for (const rel of loadOrder) {
    const full = path.join(baseDir, rel);
    if (!fs.existsSync(full)) {
        results.errors.push({ file: rel, error: 'FILE_NOT_FOUND' });
        continue;
    }
    try {
        const code = fs.readFileSync(full, 'utf8');
        vm.runInContext(code, ctx, { filename: rel });
        results.loaded.push(rel);
    } catch (e) {
        results.errors.push({ file: rel, error: e.message, stack: e.stack?.split('\n').slice(0, 3).join(' | ') });
    }
}

// Verificar API pública
const G = windowObj.GAME || {};
const expected = {
    'Physics.CarPhysics': () => G.Physics?.CarPhysics,
    'Render.Renderer': () => G.Render?.Renderer,
    'Render.HUDRenderer': () => G.Render?.HUDRenderer,
    'Track.TrackGenerator': () => G.Track?.TrackGenerator,
    'Track.TrackData': () => G.Track?.TrackData,
    'AI.RacerAI': () => G.AI?.RacerAI,
    'Game.RaceManager': () => G.Game?.RaceManager,
    'Game.LapTimer': () => G.Game?.LapTimer,
    'Game.GhostData': () => G.Game?.GhostData,
    'Game.TimeTrial': () => G.Game?.TimeTrial,
    'Core.Audio': () => G.Core?.Audio,
    'Core.SceneManager': () => G.Core?.SceneManager,
    'Core.StateMachine': () => G.Core?.StateMachine,
    'Core.Input': () => G.Core?.Input
};
for (const [name, getter] of Object.entries(expected)) {
    try {
        results.apiChecks[name] = typeof getter() === 'function' ? 'OK' : `MISSING (${typeof getter()})`;
    } catch (e) {
        results.apiChecks[name] = `ERROR: ${e.message}`;
    }
}

// Pruebas de instanciación y uso
function tryTest(name, fn) {
    try {
        const r = fn();
        results.runtimeChecks[name] = r === true ? 'OK' : `FAIL: ${JSON.stringify(r)}`;
    } catch (e) {
        results.runtimeChecks[name] = `ERROR: ${e.message}`;
    }
}

tryTest('CarPhysics instantiate', () => {
    const Car = G.Physics.CarPhysics;
    const c = new Car();
    if (typeof c.update !== 'function') return 'no update()';
    if (typeof c.getState !== 'function') return 'no getState()';
    const s = c.getState();
    if (typeof s.x !== 'number' || typeof s.speed !== 'number') return 'getState bad shape';
    return true;
});
tryTest('CarPhysics update changes speed', () => {
    const c = new G.Physics.CarPhysics();
    const s0 = c.getState().speed;
    for (let i = 0; i < 60; i++) c.update(0.016, { throttle: 1, brake: 0, steer: 0, drift: false });
    const s1 = c.getState().speed;
    if (!(s1 > s0)) return `speed did not increase: ${s0} -> ${s1}`;
    return true;
});
tryTest('CarPhysics brake works', () => {
    const c = new G.Physics.CarPhysics();
    for (let i = 0; i < 120; i++) c.update(0.016, { throttle: 1, brake: 0, steer: 0, drift: false });
    const before = c.getState().speed;
    for (let i = 0; i < 120; i++) c.update(0.016, { throttle: 0, brake: 1, steer: 0, drift: false });
    const after = c.getState().speed;
    if (!(after < before)) return `brake failed: ${before} -> ${after}`;
    return true;
});
tryTest('TrackGenerator generate', () => {
    const TG = G.Track.TrackGenerator;
    const t = new TG();
    t.generateTrack(12345);
    const data = t.getTrackData();
    if (!data || typeof data.getLength !== 'function') return 'no getTrackData';
    const L = data.getLength();
    if (!(L > 0)) return 'length 0';
    const p = data.getPointAt(0);
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return 'bad point';
    return true;
});
tryTest('TrackGenerator circular', () => {
    const TG = G.Track.TrackGenerator;
    const t = new TG();
    t.generateTrack(777);
    const d = t.getTrackData();
    const a = d.getPointAt(0), b = d.getPointAt(0.999 * d.getLength());
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (!(dist < d.getLength() * 0.05)) return `not closed: gap=${dist.toFixed(1)}`;
    return true;
});
tryTest('TrackGenerator decoration', () => {
    const t = new G.Track.TrackGenerator();
    t.generateTrack(42);
    const dec = t.getTrackData().getDecoration();
    if (!dec || Object.keys(dec).length === 0) return 'no decoration';
    return true;
});
tryTest('LapTimer', () => {
    const T = new G.Game.LapTimer();
    T.startLap();
    const lap = T.endLap();
    if (typeof lap !== 'number') return 'endLap not number';
    const best = T.getBestLap();
    if (typeof best !== 'number') return 'no best';
    const fmt = T.formatTime(lap);
    if (!/^\d{2}:\d{2}\.\d{3}$/.test(fmt)) return `bad format: ${fmt}`;
    return true;
});
tryTest('GhostData', () => {
    const gd = new G.Game.GhostData('test-ghost');
    gd.saveLap(1, 85.234);
    const g = gd.getGhost(1);
    if (!g) return 'no ghost saved';
    return true;
});
tryTest('RacerAI instantiate', () => {
    const t = new G.Track.TrackGenerator();
    t.generateTrack(99);
    const ai = new G.AI.RacerAI(t.getTrackData(), 'medium');
    const out = ai.update(0.016, { x: 0, y: 0, speed: 100, angle: 0, distance: 0 });
    if (typeof out !== 'object') return 'no output';
    if (typeof out.steer !== 'number') return 'no steer';
    return true;
});
tryTest('RaceManager states', () => {
    const RM = new G.Game.RaceManager();
    if (!RM) return 'no instance';
    return true;
});
tryTest('StateMachine transitions', () => {
    const SM = new G.Core.StateMachine();
    if (typeof SM.transition !== 'function') return 'no transition()';
    return true;
});
tryTest('Input instantiate', () => {
    const I = new G.Core.Input();
    if (typeof I.isDown !== 'function') return 'no isDown()';
    if (typeof I.getThrottle !== 'function') return 'no getThrottle()';
    return true;
});
tryTest('Audio instantiate', () => {
    const A = new G.Core.Audio();
    if (typeof A.startEngine !== 'function') return 'no startEngine()';
    return true;
});
tryTest('Renderer instantiate', () => {
    const mockCanvas = new MockElement('canvas');
    const R = new G.Render.Renderer(mockCanvas);
    if (typeof R.render !== 'function') return 'no render()';
    return true;
});
tryTest('HUDRenderer instantiate', () => {
    const H = new G.Render.HUDRenderer();
    if (typeof H.render !== 'function') return 'no render()';
    return true;
});
tryTest('Game instantiate', () => {
    const MockCanvas = new MockElement('canvas');
    const g = new G.Core.Game(MockCanvas);
    if (!g) return 'no instance';
    if (typeof g.start !== 'function') return 'no start()';
    return true;
});

console.log(JSON.stringify(results, null, 2));

// main.js arranca el bucle de juego con requestAnimationFrame (mock: setTimeout),
// así que sin salir explícitamente el proceso no terminaría nunca.
process.exit(results.errors.length > 0 ? 1 : 0);
