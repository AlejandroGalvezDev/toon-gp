// Test de regresión: la cuenta regresiva antes de la carrera debe avanzar 3 → 2 → 1.
// Ejecutar: node test/countdown-test.js
// Sale con código 1 si alguna comprobación falla.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Mocks mínimos (mismos que smoke-test.js) ──
class MockAudioParam {
    constructor(v = 0) { this.value = v; }
    setValueAtTime(v) { this.value = v; return this; }
    linearRampToValueAtTime(v) { this.value = v; return this; }
    exponentialRampToValueAtTime(v) { this.value = v; return this; }
    setTargetAtTime(v) { this.value = v; return this; }
    cancelScheduledValues() { return this; }
}
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
        return { connect: () => {}, disconnect: () => {}, frequency: new MockAudioParam(), Q: new MockAudioParam(), type: 'lowpass' };
    }
    createBufferSource() {
        return { connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {}, buffer: null, loop: false };
    }
    createBuffer(ch, len, sr) {
        return { getChannelData: () => new Float32Array(len), numberOfChannels: ch, length: len, sampleRate: sr };
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
        this.width = 1280;
        this.height = 720;
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
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
    getContext() {
        return {
            canvas: this,
            fillRect: () => {}, strokeRect: () => {}, clearRect: () => {},
            fillText: () => {}, strokeText: () => {}, measureText: () => ({ width: 10 }),
            beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {}, closePath: () => {},
            ellipse: () => {}, fill: () => {}, stroke: () => {}, save: () => {}, restore: () => {},
            translate: () => {}, rotate: () => {}, scale: () => {},
            drawImage: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
            setLineDash: () => {},
            set fillStyle(v) {}, get fillStyle() { return ''; },
            set strokeStyle(v) {}, get strokeStyle() { return ''; },
            set lineWidth(v) {}, get lineWidth() { return 1; },
            set font(v) {}, get font() { return ''; },
            set textAlign(v) {}, get textAlign() { return ''; },
            set textBaseline(v) {}, get textBaseline() { return ''; },
            set globalAlpha(v) {}, get globalAlpha() { return 1; },
            set globalCompositeOperation(v) {}, get globalCompositeOperation() { return 'source-over'; },
            set lineCap(v) {}, get lineCap() { return 'butt'; },
            set lineJoin(v) {}, get lineJoin() { return 'miter'; },
            set shadowBlur(v) {}, get shadowBlur() { return 0; },
            set shadowColor(v) {}, get shadowColor() { return ''; },
            set lineDashOffset(v) {}, get lineDashOffset() { return 0; }
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
    navigator: { getGamepads: () => [] },
    console
};
windowObj.window = windowObj;
windowObj.globalThis = windowObj;

const ctx = vm.createContext(windowObj);
const baseDir = path.join(__dirname, '..');

// Orden de carga igual que index.html (sin los ficheros inexistentes)
const loadOrder = [
    'js/core/game.js', 'js/core/input.js', 'js/core/audio.js', 'js/core/scene-manager.js', 'js/core/state-machine.js',
    'js/render/renderer.js', 'js/render/hud-renderer.js',
    'js/physics/car-physics.js',
    'js/ai/racer-ai.js',
    'js/track/track-generator.js', 'js/track/track-data.js',
    'js/game/race-manager.js', 'js/game/lap-timer.js', 'js/game/ghost-data.js', 'js/game/time-trial.js'
];

for (const rel of loadOrder) {
    const code = fs.readFileSync(path.join(baseDir, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
}

const G = windowObj.GAME;
const failures = [];
function check(name, ok, detail) {
    if (!ok) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
}

// ── Espía de drawCountdown ──
const steps = [];
const originalDrawCountdown = G.Render.HUDRenderer.prototype.drawCountdown;
G.Render.HUDRenderer.prototype.drawCountdown = function (c, w, h, step) {
    steps.push(step);
    return originalDrawCountdown.call(this, c, w, h, step);
};

const canvas = new MockElement('canvas');
const game = new G.Core.Game(canvas);
game.startRace(12345);

// Simula 4 s a 60 fps (update + render como el bucle real)
const dt = 1 / 60;
for (let i = 0; i < 60 * 4; i++) {
    game.update(dt);
    game.render();
}

// 1) La cuenta atrás debe avanzar: aparecen 2 y 1
check('la cuenta atrás muestra 3', steps.includes(3), `pasos vistos: ${JSON.stringify(steps.slice(0, 8))}`);
check('la cuenta atrás llega a 2', steps.includes(2));
check('la cuenta atrás llega a 1', steps.includes(1));

// 2) Tras 3 s debe terminar (ocultarse o mostrar GO!)
const last = steps[steps.length - 1];
check('la cuenta atrás termina a los 3 s', steps.length === 0 || last === 0 || last === undefined,
    `último valor dibujado: ${JSON.stringify(last)}`);

// 3) El cronómetro de vuelta debe estar corriendo (es de donde sale la cuenta atrás)
check('lapTimer está activo tras empezar la carrera', game.lapTimer.isLapActive === true);
check('lapTimer acumula tiempo', game.lapTimer.getCurrentLapTime() > 0,
    `getCurrentLapTime()=${game.lapTimer.getCurrentLapTime()}`);

// 4) Controles: input.keys es la API pública (antes se usaba input._keys inexistente)
check('input expone keys (no _keys)', game.input.keys !== undefined && game.input._keys === undefined);

console.log('');
if (failures.length) {
    console.log(`${failures.length} comprobación(es) fallida(s).`);
    process.exitCode = 1;
} else {
    console.log('Todo correcto.');
}
process.exit(process.exitCode || 0);
