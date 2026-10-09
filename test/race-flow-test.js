// Test de integración del flujo de carrera:
//   menú → cuenta atrás (3,2,1,GO) → vueltas → resultados → menú
// Comprueba además que el coche se dibuja, que no hay coordenadas NaN en el
// canvas y que las teclas de control no lanzan excepciones.
// Ejecutar: node test/race-flow-test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Reloj simulado: LapTimer usa performance.now(), lo sincronizamos con dt ──
let simNowMs = 0;

// ── Mocks mínimos ──
class MockAudioParam {
    constructor(v = 0) { this.value = v; }
    setValueAtTime(v) { this.value = v; return this; }
    linearRampToValueAtTime(v) { this.value = v; return this; }
    exponentialRampToValueAtTime(v) { this.value = v; return this; }
    setTargetAtTime(v) { this.value = v; return this; }
    cancelScheduledValues() { return this; }
}
class MockAudioContext {
    constructor() { this.currentTime = 0; this.destination = {}; this.sampleRate = 44100; }
    createOscillator() {
        return {
            connect: () => {}, start: () => {}, stop: () => {}, disconnect: () => {},
            frequency: new MockAudioParam(), detune: new MockAudioParam(), type: 'sawtooth', onended: null
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

const nanCalls = []; // llamadas al canvas con coordenadas no finitas
function guardNaN(method, args, where) {
    for (const a of args) {
        if (typeof a === 'number' && !Number.isFinite(a)) nanCalls.push(`${where}.${method}(${args.join(', ')})`);
    }
}

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
        const self = this;
        const ctx = {
            canvas: this,
            fillRect: (...a) => guardNaN('fillRect', a, 'ctx'),
            strokeRect: (...a) => guardNaN('strokeRect', a, 'ctx'),
            clearRect: (...a) => guardNaN('clearRect', a, 'ctx'),
            fillText: (...a) => guardNaN('fillText', a, 'ctx'),
            strokeText: (...a) => guardNaN('strokeText', a, 'ctx'),
            measureText: () => ({ width: 10 }),
            beginPath: () => {},
            moveTo: (...a) => guardNaN('moveTo', a, 'ctx'),
            lineTo: (...a) => guardNaN('lineTo', a, 'ctx'),
            arc: (...a) => guardNaN('arc', a, 'ctx'),
            ellipse: (...a) => guardNaN('ellipse', a, 'ctx'),
            closePath: () => {},
            fill: () => {}, stroke: () => {}, save: () => {}, restore: () => {},
            translate: (...a) => guardNaN('translate', a, 'ctx'),
            rotate: (...a) => guardNaN('rotate', a, 'ctx'),
            scale: (...a) => guardNaN('scale', a, 'ctx'),
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
        return ctx;
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
    performance: { now: () => simNowMs },
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
const loadOrder = [
    'js/core/game.js', 'js/core/input.js', 'js/core/audio.js', 'js/core/scene-manager.js', 'js/core/state-machine.js',
    'js/render/renderer.js', 'js/render/hud-renderer.js',
    'js/physics/car-physics.js',
    'js/ai/racer-ai.js',
    'js/track/track-generator.js', 'js/track/track-data.js',
    'js/game/race-manager.js', 'js/game/lap-timer.js', 'js/game/ghost-data.js', 'js/game/time-trial.js'
];
for (const rel of loadOrder) {
    vm.runInContext(fs.readFileSync(path.join(baseDir, rel), 'utf8'), ctx, { filename: rel });
}

const G = windowObj.GAME;
const failures = [];
function check(name, ok, detail) {
    if (!ok) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
}

// ── Espías ──
const steps = [];
const origCountdown = G.Render.HUDRenderer.prototype.drawCountdown;
G.Render.HUDRenderer.prototype.drawCountdown = function (c, w, h, step) {
    steps.push(step);
    return origCountdown.call(this, c, w, h, step);
};

let playerCarDrawn = false;
const origDrawCar = G.Render.Renderer.prototype._drawCarSprite;
G.Render.Renderer.prototype._drawCarSprite = function (x, y, scale, car) {
    if (car && typeof car.x === 'number' && car.isDrifting !== undefined) playerCarDrawn = true;
    return origDrawCar.call(this, x, y, scale, car);
};

const canvas = new MockElement('canvas');
const game = new G.Core.Game(canvas);

const dt = 1 / 60;
function frames(n, onFrame) {
    for (let i = 0; i < n; i++) {
        game.update(dt);
        game.render();
        simNowMs += dt * 1000;
        if (onFrame) onFrame(i);
    }
}

// ── Fase A: cuenta atrás ──
game.startRace(12345);
const spawn = { x: game.player.x, y: game.player.y };
const transitions = [];
frames(Math.round(4.5 / dt), () => {
    const s = game._getCountdownStep();
    if (transitions[transitions.length - 1] !== s) transitions.push(s);
});

check('la cuenta atrás recorre 3 → 2 → 1 → GO',
    JSON.stringify(transitions) === JSON.stringify([3, 2, 1, 0, null]),
    `transiciones: ${JSON.stringify(transitions)}`);
check('no se mueve el coche durante la cuenta atrás',
    game.player.x === spawn.x && game.player.y === spawn.y,
    `spawn=(${spawn.x.toFixed(1)},${spawn.y.toFixed(1)}) ahora=(${game.player.x.toFixed(1)},${game.player.y.toFixed(1)})`);
check('el cronómetro arranca al terminar la cuenta atrás',
    game.lapTimer.isLapActive === true && game.lapTimer.getCurrentLapTime() > 0,
    `t=${game.lapTimer.getCurrentLapTime().toFixed(2)}s`);
check('la escena sigue siendo la carrera', game.sceneManager.currentName === 'race');

// ── Fase B: el coche responde al acelerador tras el GO ──
const speedBefore = game.player.speed;
game.input.keys['ArrowUp'] = true;
frames(90);
game.input.keys['ArrowUp'] = false;
check('el coche acelera al pulsar adelante',
    game.player.speed > speedBefore && game.player.speed > 20,
    `velocidad=${game.player.speed.toFixed(1)}`);
check('el coche se desplaza tras el GO',
    Math.hypot(game.player.x - spawn.x, game.player.y - spawn.y) > 50,
    `dist=${Math.hypot(game.player.x - spawn.x, game.player.y - spawn.y).toFixed(0)}`);

// ── Fase C: pilotaje perfecto por la pista hasta terminar 3 vueltas ──
const trackLength = game.trackData.getLength();
const totalLaps = game.totalLaps;
let d = 0;
const DRIVEN_SPEED = 250; // px/s
let guard = 0;
while (game.sceneManager.currentName !== 'results' && guard < 60 * 600) {
    game.update(dt);
    game.render();
    simNowMs += dt * 1000;
    d += DRIVEN_SPEED * dt;
    const p = game.trackData.getPointAt(d);
    game.player.x = p.x;
    game.player.y = p.y;
    guard++;
}
check('la carrera termina y pasa a resultados',
    game.sceneManager.currentName === 'results',
    `escena=${game.sceneManager.currentName}, vueltas=${game.lapsCompleted}, frames=${guard}`);
check('se han contado las 3 vueltas', game.lapsCompleted === totalLaps,
    `lapsCompleted=${game.lapsCompleted}`);
check('hay 3 tiempos de vuelta registrados',
    game.lapTimer.getLapTimes().length === totalLaps,
    JSON.stringify(game.lapTimer.getLapTimes().map(t => +t.toFixed(1))));

// ── Fase D: volver al menú con Enter (antes lanzaba TypeError por input._keys) ──
let enterError = null;
try {
    game.input.keys['Enter'] = true;
    frames(2);
    game.input.keys['Enter'] = false;
} catch (e) {
    enterError = e;
}
check('Enter en resultados vuelve al menú sin error',
    enterError === null && game.sceneManager.currentName === 'menu',
    enterError ? enterError.message : `escena=${game.sceneManager.currentName}`);

// ── Fase E: Esc durante la carrera (también usaba input._keys) ──
let escapeError = null;
try {
    game.startRace(999);
    frames(3);
    game.input.keys['Escape'] = true;
    frames(2);
    game.input.keys['Escape'] = false;
} catch (e) {
    escapeError = e;
}
check('Esc durante la carrera vuelve al menú sin error',
    escapeError === null && game.sceneManager.currentName === 'menu',
    escapeError ? escapeError.message : `escena=${game.sceneManager.currentName}`);

// ── Fase F: quedarse parado o hacer idas y vueltas en la meta NO cuenta vuelta ──
let idleError = null;
try {
    game.startRace(777);
    frames(Math.round(3.2 / dt)); // saltar la cuenta atrás
    frames(Math.round(6 / dt));   // 6 s parado encima de la línea de meta
    // Idas y vueltas de 400 px por la pista (más de 5 s en total)
    const meta = game.trackData.getPointAt(0);
    const far = game.trackData.getPointAt(400);
    for (let i = 0; i < Math.round(5 / dt); i++) {
        game.update(dt);
        game.render();
        simNowMs += dt * 1000;
        const k = Math.abs(Math.sin(i * 0.05));
        game.player.x = meta.x + (far.x - meta.x) * k;
        game.player.y = meta.y + (far.y - meta.y) * k;
    }
} catch (e) {
    idleError = e;
}
check('pararse o ir y volver en la meta no cuenta vuelta',
    idleError === null && game.lapsCompleted === 0,
    idleError ? idleError.message : `vueltas=${game.lapsCompleted}`);
check('el cronómetro sigue vivo tras eso',
    game.lapTimer.isLapActive === true && game.lapTimer.getCurrentLapTime() > 0,
    `t=${game.lapTimer.getCurrentLapTime().toFixed(1)}s`);

// Y una vuelta real después sí cuenta
{
    let d2 = 0;
    let guard2 = 0;
    while (game.lapsCompleted < 1 && guard2 < 60 * 120) {
        game.update(dt);
        game.render();
        simNowMs += dt * 1000;
        d2 += DRIVEN_SPEED * dt;
        const p2 = game.trackData.getPointAt(d2);
        game.player.x = p2.x;
        game.player.y = p2.y;
        guard2++;
    }
    check('una vuelta completa alrededor de la pista sí cuenta', game.lapsCompleted === 1,
        `vueltas=${game.lapsCompleted}, frames=${guard2}`);
}

// ── Fase G: renderizado ──
check('el coche del jugador se dibuja', playerCarDrawn === true);
check('no hay coordenadas NaN en el canvas', nanCalls.length === 0,
    nanCalls.slice(0, 3).join(' | '));

console.log('');
if (failures.length) {
    console.log(`${failures.length} comprobación(es) fallida(s).`);
    process.exit(1);
} else {
    console.log('Todo correcto.');
    process.exit(0);
}
