// Test del generador de pistas: la polilínea base debe ser un circuito cerrado
// válido — sin auto-intersecciones (la curva polar no puede anularse), sin
// quiebros bruscos y con la curvatura calculada a partir de la geometría real.
// Ejecutar: node test/track-generator-test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const windowObj = { console };
windowObj.window = windowObj;
const ctx = vm.createContext(windowObj);
for (const rel of ['js/track/track-data.js', 'js/track/track-generator.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), ctx, { filename: rel });
}
const G = windowObj.GAME;

const failures = [];
function check(name, ok, detail) {
    if (!ok) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? '  OK  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
}

const SEEDS = [];
for (let s = 1; s <= 30; s++) SEEDS.push(s * 7919);

function segmentIntersect(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4;
}

let peorRadio = Infinity, peorGiro = 0, cortes = 0, peorCorr = 1;
for (const seed of SEEDS) {
    const tg = new G.Track.TrackGenerator();
    tg.generateTrack(seed);
    const td = tg.getTrackData();
    const pts = td.points, N = pts.length;

    // 1) La curva polar nunca se anula: si r bajara a 0 o a negativo la pista
    //    se plegaría sobre el origen y se auto-intersecaría.
    let minR = Infinity;
    for (const p of pts) minR = Math.min(minR, Math.hypot(p.x, p.y));
    peorRadio = Math.min(peorRadio, minR);

    // 2) Ningún quiebro brusco entre segmentos consecutivos
    let maxTurn = 0;
    for (let i = 0; i < N; i++) {
        const a = pts[(i - 1 + N) % N], b = pts[i], c = pts[(i + 1) % N];
        const a1 = Math.atan2(b.y - a.y, b.x - a.x), a2 = Math.atan2(c.y - b.y, c.x - b.x);
        let dAng = Math.abs(a2 - a1); if (dAng > Math.PI) dAng = 2 * Math.PI - dAng;
        maxTurn = Math.max(maxTurn, dAng * 180 / Math.PI);
    }
    peorGiro = Math.max(peorGiro, maxTurn);

    // 3) Sin auto-intersecciones (segmentos no vecinos)
    for (let i = 0; i < N; i++) {
        for (let j = i + 2; j < N; j++) {
            if (i === 0 && j === N - 1) continue;
            if (segmentIntersect(pts[i], pts[(i + 1) % N], pts[j], pts[(j + 1) % N])) { cortes++; break; }
        }
    }

    // 4) getPointAt(cumulative[i]) devuelve exactamente points[i]
    for (let i = 0; i < N; i += 7) {
        const g = td.getPointAt(td.cumulative[i]);
        if (Math.hypot(g.x - pts[i].x, g.y - pts[i].y) > 0.01) { cortes += 1000; break; }
    }

    // 5) "curve" correlaciona con la curvatura real de la polilínea
    const cross = [];
    for (let i = 0; i < N; i++) {
        const a = pts[(i - 1 + N) % N], b = pts[i], c = pts[(i + 1) % N];
        cross.push((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    }
    const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const mc = mean(cross), mv = mean(pts.map(p => p.curve));
    let num = 0, d1 = 0, d2 = 0;
    for (let i = 0; i < N; i++) {
        num += (cross[i] - mc) * (pts[i].curve - mv);
        d1 += (cross[i] - mc) ** 2;
        d2 += (pts[i].curve - mv) ** 2;
    }
    const corr = num / Math.sqrt(d1 * d2 || 1);
    peorCorr = Math.min(peorCorr, corr);
}

check('la curva polar no se anula en ninguna semilla (sin pliegues)',
    peorRadio > 270, `radio mínimo=${peorRadio.toFixed(0)}px`);
check('sin quiebros bruscos (>40º) en ninguna semilla',
    peorGiro < 40, `giro máximo=${peorGiro.toFixed(1)}º`);
check('sin auto-intersecciones ni puntos incoherentes',
    cortes === 0, `incidencias=${cortes}`);
check('"curve" refleja la curvatura real de la polilínea',
    peorCorr > 0.5, `correlación mínima=${peorCorr.toFixed(2)}`);

// 6) El ancho sigue la curva: más ancho en las curvas que en las rectas
const tg = new G.Track.TrackGenerator();
tg.generateTrack(42);
const pts2 = tg.getTrackData().points;
const enCurva = pts2.filter(p => Math.abs(p.curve) > 0.3);
const enRecta = pts2.filter(p => Math.abs(p.curve) < 0.05);
const avg = (arr, f) => arr.reduce((s, p) => s + f(p), 0) / (arr.length || 1);
check('la pista es más ancha en las curvas que en las rectas',
    avg(enCurva, p => p.width) > avg(enRecta, p => p.width),
    `curva=${avg(enCurva, p => p.width).toFixed(0)} recta=${avg(enRecta, p => p.width).toFixed(0)}`);

console.log('');
if (failures.length) {
    console.log(`${failures.length} comprobación(es) fallida(s).`);
    process.exit(1);
} else {
    console.log('Todo correcto.');
    process.exit(0);
}
