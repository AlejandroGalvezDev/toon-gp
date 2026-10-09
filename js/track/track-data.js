/* TrackData: contenedor de datos de pista para Toon GP.
 * Almacena puntos de la pista, provee muestreo por distancia, zonas DRS y
 * posiciones laterales para decoración (árboles, edificios, vallas, gradas).
 * Expone GAME.Track.TrackData.
 */
window.GAME = window.GAME || {};
window.GAME.Track = window.GAME.Track || {};

(function (Track) {
  'use strict';

  var DECORATION_SPACING = 90; // px entre elementos decorativos laterales

  function TrackData(opts) {
    if (!opts || !opts.points || !opts.points.length) {
      throw new Error('TrackData: opts.points debe ser un array no vacío');
    }
    this.points = opts.points;
    this.length = opts.length || 0;
    this.cumulative = opts.cumulative || [];
    this.drsSectors = opts.drsSectors || [];
    this.seed = opts.seed || 0;
    this._decor = null; // cache de decoración
  }

  // ---- Muestreo por distancia ----

  // Devuelve el punto interpolado en la distancia dada (circular)
  TrackData.prototype.getPointAt = function (distance) {
    if (this.points.length === 0) return { x: 0, y: 0, curve: 0, type: 'straight', width: 0 };
    var d = ((distance % this.length) + this.length) % this.length;

    // Búsqueda binaria en cumulative
    var cum = this.cumulative;
    var lo = 0, hi = cum.length - 1;
    if (d <= cum[lo]) return this._interpAt(0, d, cum[0], cum[1]);
    if (d >= cum[hi]) return this._interpAt(hi, d, cum[hi], cum[0] + this.length);
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid; else hi = mid;
    }
    return this._interpAt(lo, d, cum[lo], cum[hi]);
  };

  // Interpolación lineal entre puntos consecutivos
  TrackData.prototype._interpAt = function (i, d, c0, c1) {
    var t = c1 > c0 ? (d - c0) / (c1 - c0) : 0;
    t = Math.max(0, Math.min(1, t));
    var a = this.points[i % this.points.length];
    var b = this.points[(i + 1) % this.points.length];
    var w0 = a.width || 0;
    var w1 = b.width || 0;
    return {
      x: Math.round((a.x + (b.x - a.x) * t) * 100) / 100,
      y: Math.round((a.y + (b.y - a.y) * t) * 100) / 100,
      curve: Math.round((a.curve + (b.curve - a.curve) * t) * 1000) / 1000,
      type: t < 0.5 ? a.type : b.type,
      width: Math.round((w0 + (w1 - w0) * t) * 100) / 100
    };
  };

  // Devuelve la curvatura (curve) en la distancia dada
  TrackData.prototype.getCurveAt = function (distance) {
    var p = this.getPointAt(distance);
    return p ? p.curve : 0;
  };

  // ---- Zonas DRS ----

  // Devuelve array de zonas DRS: { startIndex, endIndex, startDist, endDist, length, color }
  TrackData.prototype.getDRSZones = function () {
    return this.drsSectors;
  };

  // Indica si una distancia está dentro de alguna zona DRS
  TrackData.prototype.isInDRS = function (distance) {
    var d = ((distance % this.length) + this.length) % this.length;
    for (var i = 0; i < this.drsSectors.length; i++) {
      var z = this.drsSectors[i];
      if (z.startDist <= z.endDist) {
        if (d >= z.startDist && d <= z.endDist) return true;
      } else {
        // Zona que cruza el inicio/final de vuelta
        if (d >= z.startDist || d <= z.endDist) return true;
      }
    }
    return false;
  };

  // ---- Decoración lateral ----

  // Genera posiciones laterales para árboles, edificios, vallas y gradas.
  // Retorna { trees, buildings, billboards, grandstands } con posiciones {x,y,rotation,side,scale}.
  // side: -1 izquierda, +1 derecha respecto a la dirección de avance.
  TrackData.prototype.getDecoration = function () {
    if (this._decor) return this._decor;
    var rng = Track._mulberry32(this.seed ^ 0x9E3779B9);
    var trees = [];
    var buildings = [];
    var billboards = [];
    var grandstands = [];

    var numDecorPoints = Math.floor(this.length / DECORATION_SPACING);
    var i;
    for (i = 0; i < numDecorPoints; i++) {
      var dist = i * DECORATION_SPACING;
      var p = this.getPointAt(dist);

      // Dirección tangente en el punto
      var ahead = this.getPointAt(dist + 10);
      var tx = ahead.x - p.x, ty = ahead.y - p.y;
      var tlen = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= tlen; ty /= tlen;
      // Normal (perpendicular): izquierda
      var nx = -ty, ny = tx;
      var halfW = (p.width || 120) / 2;

      var side = rng() < 0.5 ? -1 : 1;
      var offset = halfW + 30 + rng() * 80;

      // Árboles: en zonas curvas y rectas
      if (rng() < 0.55) {
        trees.push({
          x: Math.round((p.x + nx * side * offset) * 100) / 100,
          y: Math.round((p.y + ny * side * offset) * 100) / 100,
          rotation: Math.round((Math.atan2(ty, tx)) * 100) / 100,
          side: side,
          scale: Math.round((0.8 + rng() * 0.6) * 100) / 100,
          type: rng() < 0.5 ? 'round' : 'pine'
        });
      }

      // Edificios: solo en rectas, lado aleatorio, más alejados
      if (p.type === 'straight' && rng() < 0.35) {
        var bo = offset + 100 + rng() * 120;
        buildings.push({
          x: Math.round((p.x + nx * side * bo) * 100) / 100,
          y: Math.round((p.y + ny * side * bo) * 100) / 100,
          rotation: Math.round((Math.atan2(ty, tx)) * 100) / 100,
          side: side,
          scale: Math.round((0.9 + rng() * 0.8) * 100) / 100,
          color: ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', '#ff8b94'][Math.floor(rng() * 5)],
          windows: 2 + Math.floor(rng() * 4)
        });
      }

      // Vallas publicitarias: cerca de la pista, en rectas y curvas suaves
      if ((p.type === 'straight' || Math.abs(p.curve) < 0.3) && rng() < 0.5) {
        var bo2 = halfW + 18;
        billboards.push({
          x: Math.round((p.x + nx * side * bo2) * 100) / 100,
          y: Math.round((p.y + ny * side * bo2) * 100) / 100,
          rotation: Math.round((Math.atan2(ty, tx)) * 100) / 100,
          side: side,
          scale: 1,
          color: ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'][Math.floor(rng() * 5)],
          text: 'TOON GP'
        });
      }

      // Gradas: en rectas y curvas, lado aleatorio, grandes
      if (rng() < 0.3) {
        var go = halfW + 60 + rng() * 100;
        grandstands.push({
          x: Math.round((p.x + nx * side * go) * 100) / 100,
          y: Math.round((p.y + ny * side * go) * 100) / 100,
          rotation: Math.round((Math.atan2(ty, tx)) * 100) / 100,
          side: side,
          scale: Math.round((0.9 + rng() * 0.5) * 100) / 100,
          color: ['#e74c3c', '#3498db', '#f39c12', '#2ecc71'][Math.floor(rng() * 4)]
        });
      }
    }

    // Decoración especial en zonas DRS: vallas de color vibrante
    for (i = 0; i < this.drsSectors.length; i++) {
      var z = this.drsSectors[i];
      var steps = Math.max(3, Math.floor((z.endDist - z.startDist) / 40));
      for (var k = 0; k < steps; k++) {
        var dd = z.startDist + (z.endDist - z.startDist) * (k / steps);
        var pp = this.getPointAt(dd);
        var ah = this.getPointAt(dd + 10);
        var tx2 = ah.x - pp.x, ty2 = ah.y - pp.y;
        var tl2 = Math.sqrt(tx2 * tx2 + ty2 * ty2) || 1;
        tx2 /= tl2; ty2 /= tl2;
        var nx2 = -ty2, ny2 = tx2;
        var hw = (pp.width || 120) / 2;
        var s2 = k % 2 === 0 ? -1 : 1;
        billboards.push({
          x: Math.round((pp.x + nx2 * s2 * (hw + 18)) * 100) / 100,
          y: Math.round((pp.y + ny2 * s2 * (hw + 18)) * 100) / 100,
          rotation: Math.round((Math.atan2(ty2, tx2)) * 100) / 100,
          side: s2,
          scale: 1,
          color: z.color,
          text: 'DRS'
        });
      }
    }

    this._decor = {
      trees: trees,
      buildings: buildings,
      billboards: billboards,
      grandstands: grandstands
    };
    return this._decor;
  };

  // Invalida la caché de decoración (llamar si se regenera la pista)
  TrackData.prototype.invalidateDecoration = function () {
    this._decor = null;
  };

  // ---- Utilidades ----

  // Devuelve el número de puntos de la pista
  TrackData.prototype.getNumPoints = function () {
    return this.points.length;
  };

  // Devuelve un punto por índice (circular)
  TrackData.prototype.getPoint = function (i) {
    return this.points[((i % this.points.length) + this.points.length) % this.points.length];
  };

  // Devuelve la distancia total de la pista
  TrackData.prototype.getLength = function () {
    return this.length;
  };

  // Punto de inicio de la vuelta (normalmente en la recta más larga / DRS)
  TrackData.prototype.getStartPoint = function () {
    if (this.drsSectors.length > 0) {
      return this.getPointAt(this.drsSectors[0].startDist);
    }
    return this.getPointAt(0);
  };

  Track.TrackData = TrackData;
})(window.GAME.Track);
