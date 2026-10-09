/* TrackGenerator: pista procedural estilo cartoon para Toon GP.
 * Genera un circuito cerrado con curvas suaves, rectas, chicanes y zonas DRS.
 * Expone GAME.Track.TrackGenerator.
 */
window.GAME = window.GAME || {};
window.GAME.Track = window.GAME.Track || {};

(function (Track) {
  'use strict';

  var DEFAULT_CONFIG = {
    seed: 1,
    numPoints: 120,          // resolución de la polilínea
    baseWidth: 260,          // ancho base de la pista (px)
    curveWidthVar: 60,       // variación de ancho en curvas
    curveIntensity: 0.55,    // amplitud de las curvas (-1..1)
    straightMin: 4,          // segmentos mínimos de una recta
    straightMax: 14,
    curveMin: 4,
    curveMax: 12,
    chicaneChance: 0.08,     // probabilidad de chicane al cerrar
    drsEvery: 1,             // una zona DRS por vuelta
    drsLength: 8,            // puntos de la zona DRS
    edgeSamples: 12          // submuestreos por segmento (suavizado)
  };

  // PRNG determinista (mulberry32) para reproducibilidad por semilla.
  // Se expone en el namespace para que TrackData pueda usarlo también.
  Track._mulberry32 = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function TrackGenerator(config) {
    this.config = {};
    for (var k in DEFAULT_CONFIG) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, k)) {
        this.config[k] = DEFAULT_CONFIG[k];
      }
    }
    if (config) {
      for (var k2 in config) {
        if (Object.prototype.hasOwnProperty.call(config, k2)) {
          this.config[k2] = config[k2];
        }
      }
    }
    this._data = null;
  }

  // Genera una pista nueva a partir de la semilla
  TrackGenerator.prototype.generateTrack = function (seed) {
    if (typeof seed === 'number') this.config.seed = seed >>> 0;
    var rng = Track._mulberry32(this.config.seed);
    var N = this.config.numPoints;

    // 1) Construir una polilínea base: mezcla de curvas suaves y rectas.
    //    Partimos de un círculo base y deformamos con ondas sinusoidales
    //    superpuestas para conseguir un circuito cerrado y suave.
    var radius = 900;
    var center = { x: 0, y: 0 };
    var points = [];
    // Amplitudes de las ondas: máximo 0.44 en total → r ≥ 0.56·radius
    var w1 = 0.16 + rng() * 0.12;
    var w2 = 0.05 + rng() * 0.06;
    var w3 = 0.02 + rng() * 0.03;
    var ph1 = rng() * Math.PI * 2;
    var ph2 = rng() * Math.PI * 2;
    var ph3 = rng() * Math.PI * 2;
    var breathe = 0.72 + rng() * 0.55; // global squash/stretch

    //    IMPORTANTE: la suma de amplitudes debe ser < 1 con margen. Si
    //    1 - (w1+w2+w3) llega a 0 o baja, el radio se anula o se vuelve
    //    negativo, la curva polar se pliega por el origen y la pista se
    //    auto-interseca con quiebros bruscos (probado: pasaba en el 93%
    //    de las semillas). Con r > 0 la curva cerrada nunca se cruza.
    var i;
    for (i = 0; i < N; i++) {
      var t = (i / N) * Math.PI * 2;
      var r = radius * (
        1 +
        w1 * Math.sin(t * 3 + ph1) +
        w2 * Math.sin(t * 5 + ph2) +
        w3 * Math.sin(t * 8 + ph3)
      ) * breathe;
      points.push({
        x: center.x + Math.cos(t) * r,
        y: center.y + Math.sin(t) * r
      });
    }

    // 2) Suavizado del contorno (paso de splines) para curvas redondeadas.
    var smoothPasses = 3;
    for (var p = 0; p < smoothPasses; p++) {
      var smoothed = [];
      for (i = 0; i < N; i++) {
        var prev = points[(i - 1 + N) % N];
        var cur = points[i];
        var next = points[(i + 1) % N];
        smoothed.push({
          x: cur.x * 0.5 + (prev.x + next.x) * 0.25,
          y: cur.y * 0.5 + (prev.y + next.y) * 0.25
        });
      }
      points = smoothed;
    }

    // 3) Etiquetar segmentos: straight / curve / chicane y asignar "curve"
    //    de forma continua mediante un pase de difusión de curvatura.
    var seg = [];
    for (i = 0; i < N; i++) {
      // cur = punto central del trío (antes se usaba una variable
      // residual del bucle de suavizado y la curvatura salía inventada)
      var cur = points[i];
      var prevP = points[(i - 1 + N) % N];
      var nextP = points[(i + 1) % N];
      // Producto cruz 2D como proxy de curvatura
      var vx1 = cur.x - prevP.x, vy1 = cur.y - prevP.y;
      var vx2 = nextP.x - cur.x, vy2 = nextP.y - cur.y;
      var cross = vx1 * vy2 - vy1 * vx2;
      seg.push(cross);
    }
    // Difuminar la curvatura a lo largo del contorno
    var diffPasses = 6;
    for (p = 0; p < diffPasses; p++) {
      var ds = [];
      for (i = 0; i < N; i++) {
        ds.push(seg[i] * 0.6 + (seg[(i - 1 + N) % N] + seg[(i + 1) % N]) * 0.2);
      }
      seg = ds;
    }
    // Normalizar a [-1,1]
    var maxAbs = 1e-6;
    for (i = 0; i < N; i++) maxAbs = Math.max(maxAbs, Math.abs(seg[i]));
    var curveVals = [];
    for (i = 0; i < N; i++) {
      curveVals.push((seg[i] / maxAbs) * this.config.curveIntensity);
    }

    // 4) Asignar tipo por tramos y anchos
    var types = [];
    var widths = [];
    var runStart = 0;
    var runType = 'straight';
    var j = 0;
    var dir = curveVals[0] >= 0 ? 1 : -1;
    var minRun = this.config.straightMin;
    var maxRun = this.config.straightMax;

    while (j < N) {
      var c = curveVals[j];
      if (Math.abs(c) < 0.12) {
        // Zona casi recta
        if (runType !== 'straight') {
          // Cerrar tramo previo
          types.push({ from: runStart, to: j - 1, type: runType });
          runStart = j;
          runType = 'straight';
        }
        j++;
      } else {
        var curDir = c >= 0 ? 1 : -1;
        if (runType === 'straight') {
          // Empezamos curva
          types.push({ from: runStart, to: j - 1, type: 'straight' });
          runStart = j;
          runType = 'curve';
          dir = curDir;
          minRun = this.config.curveMin;
          maxRun = this.config.curveMax;
          j++;
        } else if (runType === 'curve') {
          if (curDir !== dir && j - runStart >= minRun) {
            // Cambio de sentido: cerrar curva
            types.push({ from: runStart, to: j - 1, type: 'curve' });
            runStart = j;
            dir = curDir;
          }
          j++;
        } else {
          // chicane: dejar que siga hasta que el signo cambie
          if (curDir !== dir && j - runStart >= 2) {
            types.push({ from: runStart, to: j - 1, type: 'chicane' });
            runStart = j;
            runType = 'curve';
            dir = curDir;
            minRun = this.config.curveMin;
            maxRun = this.config.curveMax;
          }
          j++;
        }
      }
    }
    // Cerrar el último tramo
    types.push({ from: runStart, to: N - 1, type: runType });

    // 5) Inyectar chicanes ocasionales: si el segmento es una recta
    //    suficientemente larga, introducimos una chicane en el medio.
    var finalSegs = [];
    for (var s = 0; s < types.length; s++) {
      var sg = types[s];
      var len = sg.to - sg.from + 1;
      if (sg.type === 'straight' && len >= 10 && rng() < this.config.chicaneChance * 20) {
        var mid = Math.floor(sg.from + len / 2);
        var chLen = 3;
        finalSegs.push({ from: sg.from, to: mid - 1, type: 'straight' });
        finalSegs.push({ from: mid, to: mid + chLen, type: 'chicane' });
        finalSegs.push({ from: mid + chLen + 1, to: sg.to, type: 'straight' });
      } else {
        finalSegs.push(sg);
      }
    }

    // 6) Mapear tipo y ancho a cada punto de la polilínea
    var pointData = [];
    for (i = 0; i < N; i++) {
      var type = 'straight';
      for (var q = 0; q < finalSegs.length; q++) {
        if (i >= finalSegs[q].from && i <= finalSegs[q].to) {
          type = finalSegs[q].type;
          break;
        }
      }
      var c2 = curveVals[i];
      var w = this.config.baseWidth;
      if (type === 'curve') w += Math.abs(c2) * this.config.curveWidthVar;
      if (type === 'chicane') w += Math.abs(c2) * this.config.curveWidthVar * 1.3;
      if (type === 'straight') w *= 0.94;
      pointData.push({
        x: Math.round(points[i].x * 100) / 100,
        y: Math.round(points[i].y * 100) / 100,
        curve: Math.round(c2 * 1000) / 1000,
        type: type,
        width: Math.round(w * 100) / 100
      });
    }

    // 7) Calcular longitud acumulada para muestreo por distancia
    var cumulative = [0];
    for (i = 1; i <= N; i++) {
      var a = pointData[i - 1];
      var b = pointData[i % N];
      var dx = b.x - a.x, dy = b.y - a.y;
      cumulative.push(cumulative[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    var totalLength = cumulative[N];

    // 8) Zonas DRS: tramos de recta o casi recta donde activar DRS.
    //    Elegimos la recta más larga y, si no hay, un tramo de curva suave.
    var drsSectors = [];
    var bestStraight = null, bestLen = 0;
    for (s = 0; s < finalSegs.length; s++) {
      var sg2 = finalSegs[s];
      var startD = cumulative[sg2.from];
      var endD = cumulative[Math.min(sg2.to + 1, N)];
      var lenD = endD - startD;
      if (sg2.type === 'straight' && lenD > bestLen) {
        bestLen = lenD;
        bestStraight = { startDist: startD, endDist: endD, startIndex: sg2.from, endIndex: sg2.to };
      }
    }
    if (!bestStraight) {
      // Fallback: cualquier tramo
      var f0 = finalSegs[0];
      bestStraight = {
        startDist: cumulative[f0.from],
        endDist: cumulative[Math.min(f0.to + 1, N)],
        startIndex: f0.from,
        endIndex: f0.to
      };
    }
    // Ajustar para que la zona DRS quepa en la recta
    var drsLen = Math.min(this.config.drsLength, bestStraight.endIndex - bestStraight.startIndex + 1);
    drsSectors.push({
      startIndex: bestStraight.startIndex,
      endIndex: bestStraight.startIndex + drsLen - 1,
      startDist: bestStraight.startDist,
      endDist: cumulative[Math.min(bestStraight.startIndex + drsLen, N)],
      length: drsLen,
      color: '#00e5ff'
    });

    // 9) Instanciar TrackData con los puntos y metadatos
    this._data = new Track.TrackData({
      points: pointData,
      length: totalLength,
      cumulative: cumulative,
      drsSectors: drsSectors,
      seed: this.config.seed
    });

    return this._data;
  };

  // Devuelve la TrackData actual (genera con la semilla actual si no existe)
  TrackGenerator.prototype.getTrackData = function () {
    if (!this._data) {
      return this.generateTrack(this.config.seed);
    }
    return this._data;
  };

  // Regenera con una nueva semilla (modifica config.seed)
  TrackGenerator.prototype.regenerate = function (seed) {
    if (typeof seed === 'number') this.config.seed = seed >>> 0;
    return this.generateTrack(this.config.seed);
  };

  Track.TrackGenerator = TrackGenerator;
})(window.GAME.Track);
