// Test: la carretera renderizada debe reflejar las curvas de la pista.
// Ejecutar: node test/render-curves-test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Canvas mock con guarda de coordenadas NaN ──
const nanCalls = [];
function guard(method, args) {
    for (const a of args) {
        if (typeof a === 'number' && !Number.isFinite(a)) nanCalls.push(`${method}(${args.join(',')})`);
    }
}
class MockCanvas {
    constructor(w = 1280, h = 720) { this.width = w; this.height = h; this.fills = 0; this.strokes = 0; }
    getContext() {
        const self = this;
        return {
            canvas: self,
            fillRect: (...a) => guard('fillRect', a),
            strokeRect: (...a) => guard('strokeRect', a),
            clearRect: (...a) => guard('clearRect', a),
            fillText: (...a) => guard('fillText', a),
            strokeText: (...a) => guard('strokeText', a),
            measureText: () => ({ width: 10 }),
            beginPath: () => {},
            moveTo: (...a) => guard('moveTo', a),
            lineTo: (...a) => guard('lineTo', a),
            arc: (...a) => guard('arc', a),
            ellipse: (...a) => guard('ellipse', a),
            closePath: () => {},
            fill() { self.fills++; },
            stroke() { self.strokes++; },
            save: () => {}, restore: () => {},
            translate: (...a) => guard('translate', a),
            rotate: (...a) => guard('rotate', a),
            scale: (...a) => guard('scale', a),
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
}

const windowObj = { console, performance: { now: () => Date.now() }, Math };
windowObj.window = windowObj;
const ctx = vm.createContext(windowObj);
for (const rel of ['js/render/renderer.js', 'js/track/track-data.js', 'js/track/track-generator.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), ctx, { filename: rel });
}
const G = windowObj.GAME;

const failures = [];
function check(name, ok, detail) {
    if (!ok) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
}

const canvas = new MockCanvas(1280, 720);
const renderer = new G.Render.Renderer(canvas);
const tg = new G.Track.TrackGenerator();
tg.generateTrack(12345);
const trackData = tg.getTrackData();
const w = canvas.width, h = canvas.height;
const horizon = h * renderer.horizonY;

// Punto de la pista con más curva
let curveIdx = 0, maxCurve = 0;
trackData.points.forEach((p, i) => {
    if (Math.abs(p.curve) > maxCurve) { maxCurve = Math.abs(p.curve); curveIdx = i; }
});
const prog = trackData.cumulative[curveIdx];
const pos = trackData.getPointAt(prog);
const ahead = trackData.getPointAt(prog + 20);
const sceneState = {
    trackData,
    trackProgress: prog,
    player: { x: pos.x, y: pos.y, angle: Math.atan2(ahead.y - pos.y, ahead.x - pos.x), driftAngle: 0, isDrifting: false },
    playerX: pos.x,
    speed: 0,
    cars: [],
    effects: []
};

// 1) La proyección de la pista existe
check('Renderer.projectTrack existe', typeof renderer.projectTrack === 'function');
if (typeof renderer.projectTrack !== 'function') {
    console.log('\nSin projectTrack no hay forma de dibujar las curvas.');
    process.exit(1);
}

// 2) Geometría válida
const geo = renderer.projectTrack(sceneState);
const pts = (geo || []).filter(Boolean);
check('devuelve geometría', Array.isArray(geo) && pts.length >= 10, `puntos=${pts.length}`);
check('todos los valores son finitos',
    pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.halfW)));

// 3) La carretera se estrecha hacia el horizonte (entre puntos visibles)
const visibles = pts.filter(p => p.y < h);
const pCerca = visibles.reduce((a, b) => (a.y > b.y ? a : b));
const pLejos = visibles.reduce((a, b) => (a.y < b.y ? a : b));
check('la carretera se estrecha hacia el horizonte',
    !!pCerca && !!pLejos && pLejos.halfW < pCerca.halfW * 0.25,
    `cerca=${pCerca && pCerca.halfW.toFixed(0)} lejos=${pLejos && pLejos.halfW.toFixed(0)}`);

// Desviación del eje de la carretera respecto a la recta "recta": la recta
// va del punto de fuga (centro del horizonte) al punto más cercano. Si la
// carretera fuera recta todos los puntos caerían sobre ella (desviación 0);
// las curvas la alejan. Acotamos a la carretera de delante (profundidad<1200).
function desviacionCurva(geo) {
    // Solo la carretera de delante que de verdad se ve en pantalla: los puntos
    // recortados al plano cercano tienen depth mínima y coordenadas gigantes.
    const visibles = (geo || []).filter(Boolean)
        .filter(p => p.depth < 1200 && p.y < h && p.y > horizon);
    if (visibles.length < 3) return 0;
    // Cortamos en el punto de profundidad máxima: más allá la pista ya vuelve
    // hacia la cámara (es otro tramo del circuito), no es la carretera de delante.
    let pico = 0;
    visibles.forEach((p, i) => { if (p.depth > visibles[pico].depth) pico = i; });
    const cercaDelante = visibles.slice(0, pico + 1);
    if (cercaDelante.length < 3) return 0;
    const vp = { x: w / 2, y: horizon };
    const near = cercaDelante.reduce((a, b) => (a.y > b.y ? a : b));
    const dx = vp.x - near.x, dy = vp.y - near.y;
    const L = Math.hypot(dx, dy) || 1;
    let max = 0;
    for (const p of cercaDelante) {
        const d = Math.abs((p.x - near.x) * dy - (p.y - near.y) * dx) / L;
        if (d > max) max = d;
    }
    return max;
}

// 4) LA CLAVE: en una sección con curva, el eje de la carretera se dobla
const maxDev = desviacionCurva(geo);
check('la carretera se dobla en una curva (no es un trapecio recto)',
    maxDev > 15, `desviación del eje=${maxDev.toFixed(1)}px (curva |curve|=${maxCurve.toFixed(2)})`);

// 5) En algún punto de la pista la carretera llega a doblarse mucho
let worst = 0;
for (let d = 0; d < trackData.getLength(); d += 400) {
    const p = trackData.getPointAt(d);
    const a2 = trackData.getPointAt(d + 20);
    const dev = desviacionCurva(renderer.projectTrack({
        trackData, trackProgress: d,
        player: { x: p.x, y: p.y, angle: Math.atan2(a2.y - p.y, a2.x - p.x) }
    }));
    if (dev > worst) worst = dev;
}
check('recorriendo la pista se ven curvas marcadas', worst > 40, `máximo=${worst.toFixed(0)}px`);

// 6) El firme cubre el fondo de la pantalla (no hay hueco bajo el coche)
check('el firme llega hasta abajo', Math.max(...pts.map(p => p.y)) > h,
    `y máx=${Math.max(...pts.map(p => p.y)).toFixed(0)} (h=${h})`);

// 7) Al renderizar se pinta el firme y no hay NaN
const fillsBefore = canvas.fills;
renderer.render(sceneState);
renderer.render({ ...sceneState, speed: 250 });
check('render() pinta el firme por tramos', canvas.fills - fillsBefore > 40,
    `fills=${canvas.fills - fillsBefore}`);
check('sin coordenadas NaN al renderizar', nanCalls.length === 0, nanCalls.slice(0, 3).join(' | '));

console.log('');
if (failures.length) {
    console.log(`${failures.length} comprobación(es) fallida(s).`);
    process.exit(1);
} else {
    console.log('Todo correcto.');
    process.exit(0);
}
