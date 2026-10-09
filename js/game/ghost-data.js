/**
 * GhostData — Guarda/carga tiempos de vuelta.
 * Compara tiempo actual con mejor vuelta.
 * Genera 'coches fantasma' con tiempos predefinidos.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'toongp_ghost_data';

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function formatTime(seconds) {
    if (seconds === Infinity || seconds === null || seconds === undefined || isNaN(seconds)) {
      return '--:--.---';
    }
    var mins = Math.floor(seconds / 60);
    var secs = seconds - mins * 60;
    var secsStr = secs < 10 ? '0' + secs.toFixed(3) : secs.toFixed(3);
    var minsStr = mins < 10 ? '0' + mins : String(mins);
    return minsStr + ':' + secsStr;
  }

  function parseTime(str) {
    var parts = str.split(':');
    if (parts.length !== 2) return NaN;
    var mins = parseFloat(parts[0]);
    var secs = parseFloat(parts[1]);
    if (isNaN(mins) || isNaN(secs)) return NaN;
    return mins * 60 + secs;
  }

  /**
   * @param {Object} [config]
   *   - storageKey: string — clave personalizada para localStorage
   *   - maxGhosts: number — máximo de fantasmas almacenados
   */
  function GhostData(config) {
    this.storageKey = (config && config.storageKey) || STORAGE_KEY;
    this.maxGhosts = (config && config.maxGhosts) || 10;

    this.records = [];       // [{ time, date, trackId }]
    this.currentGhost = null;
    this.bestGhost = null;
    this.sessionBest = Infinity;

    // Perfiles fantasma predefinidos por dificultad
    this.predefinedGhosts = {
      easy:   { time: 95.000, speed: 0.78, name: 'Rookie Ghost' },
      medium: { time: 85.000, speed: 0.88, name: 'Pro Ghost' },
      hard:   { time: 78.000, speed: 0.95, name: 'Champion Ghost' }
    };

    this.load();
  }

  /**
   * Guarda un tiempo de vuelta.
   * @param {number} time - Tiempo en segundos.
   * @param {string} [trackId] - Identificador de la pista.
   * @returns {boolean} — true si es nuevo récord.
   */
  GhostData.prototype.saveLapTime = function (time, trackId) {
    if (time <= 0 || !isFinite(time)) return false;

    var record = {
      time: time,
      date: new Date().toISOString(),
      trackId: trackId || 'default'
    };

    this.records.push(record);
    this.records.sort(function (a, b) { return a.time - b.time; });

    // Mantener solo los mejores
    if (this.records.length > this.maxGhosts) {
      this.records = this.records.slice(0, this.maxGhosts);
    }

    // Actualizar mejor fantasma
    if (!this.bestGhost || time < this.bestGhost.time) {
      this.bestGhost = record;
    }

    if (time < this.sessionBest) {
      this.sessionBest = time;
    }

    this.save();
    return !this.bestGhost || this.bestGhost.time === time;
  };

  /**
   * Obtiene el mejor tiempo registrado.
   * @returns {Object|null}
   */
  GhostData.prototype.getBestGhost = function () {
    return this.bestGhost;
  };

  /**
   * Obtiene el mejor tiempo de la sesión actual.
   * @returns {number}
   */
  GhostData.prototype.getSessionBest = function () {
    return this.sessionBest;
  };

  /**
   * Compara un tiempo dado con el mejor fantasma.
   * @param {number} time
   * @returns {Object} { diff, isBetter, bestGhost }
   */
  GhostData.prototype.compareWithBest = function (time) {
    var best = this.bestGhost;
    var diff = best ? time - best.time : 0;
    var isBetter = best ? time < best.time : true;
    return {
      diff: diff,
      isBetter: isBetter,
      bestGhost: best
    };
  };

  /**
   * Compara con un fantasma predefinido por dificultad.
   * @param {number} time
   * @param {string} difficulty — 'easy' | 'medium' | 'hard'
   * @returns {Object}
   */
  GhostData.prototype.compareWithPredefined = function (time, difficulty) {
    var ghost = this.predefinedGhosts[difficulty];
    if (!ghost) {
      return { diff: 0, isBetter: false, ghost: null };
    }
    var diff = time - ghost.time;
    return {
      diff: diff,
      isBetter: time < ghost.time,
      ghost: ghost
    };
  };

  /**
   * Genera posiciones de fantasma a lo largo de la pista.
   * @param {Object} ghostProfile
   *   - time: number — tiempo objetivo de vuelta
   *   - speed: number — factor de velocidad (0-1)
   * @param {number} trackLength
   * @returns {Array} — [{ z, speed, time }]
   */
  GhostData.prototype.generateGhostPath = function (ghostProfile, trackLength) {
    if (!ghostProfile || !trackLength) return [];

    var time = ghostProfile.time;
    var speed = ghostProfile.speed || 0.85;
    var path = [];
    var totalSteps = 50;
    var stepZ = trackLength / totalSteps;

    for (var i = 0; i <= totalSteps; i++) {
      var z = i * stepZ;
      var t = (z / trackLength) * time;
      path.push({
        z: z,
        speed: speed,
        time: t
      });
    }
    return path;
  };

  /**
   * Obtiene todos los registros guardados.
   * @returns {Array}
   */
  // Alias de API
  GhostData.prototype.saveLap = function (time, trackId) {
    return this.saveLapTime(time, trackId);
  };

  GhostData.prototype.getGhost = function (lapNumber) {
    var rec = this.records[lapNumber - 1] || null;
    if (rec) return { time: rec.time, date: rec.date, trackId: rec.trackId };
    return this.bestGhost;
  };

  GhostData.prototype.getRecords = function () {
    return this.records.slice();
  };

  /**
   * Limpia todos los datos.
   */
  GhostData.prototype.clear = function () {
    this.records = [];
    this.bestGhost = null;
    this.sessionBest = Infinity;
    this.save();
  };

  /**
   * Guarda en localStorage.
   */
  GhostData.prototype.save = function () {
    try {
      var data = JSON.stringify({
        records: this.records,
        bestGhost: this.bestGhost,
        sessionBest: this.sessionBest
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, data);
      }
    } catch (e) {
      // localStorage no disponible o lleno
    }
  };

  /**
   * Carga desde localStorage.
   */
  GhostData.prototype.load = function () {
    try {
      if (typeof localStorage !== 'undefined') {
        var data = localStorage.getItem(this.storageKey);
        if (data) {
          var parsed = JSON.parse(data);
          this.records = parsed.records || [];
          this.bestGhost = parsed.bestGhost || null;
          this.sessionBest = parsed.sessionBest !== undefined ? parsed.sessionBest : Infinity;
        }
      }
    } catch (e) {
      this.records = [];
      this.bestGhost = null;
      this.sessionBest = Infinity;
    }
  };

  // Helpers estáticos
  GhostData.formatTime = formatTime;
  GhostData.parseTime = parseTime;

  // Exponer globalmente
  global.GAME = global.GAME || {};
  global.GAME.Game = global.GAME.Game || {};
  global.GAME.Game.GhostData = GhostData;

})(typeof window !== 'undefined' ? window : this);
