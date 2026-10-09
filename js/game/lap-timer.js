/**
 * LapTimer — Sistema de cronometraje de vueltas.
 * Mide tiempos por vuelta, calcula la mejor vuelta y
 * devuelve tiempos en formato MM:SS.mmm.
 */
(function (global) {
  'use strict';

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * Formatea un tiempo en segundos a "MM:SS.mmm".
   * @param {number} seconds
   * @returns {string}
   */
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

  /**
   * Parsea un tiempo "MM:SS.mmm" a segundos.
   * @param {string} str
   * @returns {number}
   */
  function parseTime(str) {
    var parts = str.split(':');
    if (parts.length !== 2) return NaN;
    var mins = parseFloat(parts[0]);
    var secs = parseFloat(parts[1]);
    if (isNaN(mins) || isNaN(secs)) return NaN;
    return mins * 60 + secs;
  }

  /**
   * LapTimer
   * @param {Object} [config]
   *   - totalLaps: number
   */
  function LapTimer(config) {
    this.totalLaps = (config && config.totalLaps) || 3;
    this.lapTimes = [];          // Array de tiempos por vuelta (segundos)
    this.currentLapStart = null; // Timestamp de inicio de vuelta actual
    this.currentLapTime = 0;     // Tiempo transcurrido de la vuelta actual
    this.isLapActive = false;
    this.bestLapTime = Infinity;
    this.bestLapIndex = -1;
    this.lastLapTime = null;

    // Callbacks
    this.onLapStart = null;   // (lapNumber) => void
    this.onLapComplete = null; // (lapNumber, lapTime) => void
  }

  LapTimer.prototype.startLap = function () {
    if (this.isLapActive) {
      // Si ya hay una vuelta activa, la terminamos primero
      this.endLap();
    }
    this.isLapActive = true;
    this.currentLapStart = performance.now ? performance.now() : Date.now();
    this.currentLapTime = 0;
    if (this.onLapStart) {
      this.onLapStart(this.lapTimes.length + 1);
    }
  };

  LapTimer.prototype.endLap = function () {
    if (!this.isLapActive) return null;

    var now = performance.now ? performance.now() : Date.now();
    var lapTime = (now - this.currentLapStart) / 1000; // segundos
    this.isLapActive = false;
    this.lastLapTime = lapTime;
    this.lapTimes.push(lapTime);

    // Actualizar mejor vuelta
    if (lapTime < this.bestLapTime) {
      this.bestLapTime = lapTime;
      this.bestLapIndex = this.lapTimes.length - 1;
    }

    var lapNumber = this.lapTimes.length;
    if (this.onLapComplete) {
      this.onLapComplete(lapNumber, lapTime);
    }
    return lapTime;
  };

  /**
   * Actualiza el tiempo de la vuelta actual (llamar cada frame).
   * @param {number} dt - Delta time en segundos.
   */
  LapTimer.prototype.update = function (dt) {
    if (this.isLapActive) {
      this.currentLapTime += dt;
    }
  };

  /**
   * Actualiza el tiempo de vuelta actual basado en performance.now.
   * Más preciso que acumular dt.
   */
  LapTimer.prototype.updatePrecise = function () {
    if (this.isLapActive) {
      var now = performance.now ? performance.now() : Date.now();
      this.currentLapTime = (now - this.currentLapStart) / 1000;
    }
  };

  LapTimer.prototype.getCurrentLapTime = function () {
    if (this.isLapActive) {
      return this.currentLapTime;
    }
    return 0;
  };

  LapTimer.prototype.getCurrentLapTimeFormatted = function () {
    return formatTime(this.getCurrentLapTime());
  };

  LapTimer.prototype.getBestLap = function () {
    if (this.bestLapTime === Infinity) return null;
    return this.bestLapTime;
  };

  LapTimer.prototype.getBestLapFormatted = function () {
    return formatTime(this.bestLapTime);
  };

  LapTimer.prototype.getLastLap = function () {
    return this.lastLapTime;
  };

  LapTimer.prototype.getLastLapFormatted = function () {
    return formatTime(this.lastLapTime);
  };

  LapTimer.prototype.formatTime = function (seconds) {
    return formatTime(seconds);
  };

  LapTimer.prototype.getLapTimes = function () {
    return this.lapTimes.slice();
  };

  LapTimer.prototype.getLapTimesFormatted = function () {
    var self = this;
    return this.lapTimes.map(function (t) { return formatTime(t); });
  };

  LapTimer.prototype.getAverageLap = function () {
    if (this.lapTimes.length === 0) return null;
    var sum = this.lapTimes.reduce(function (a, b) { return a + b; }, 0);
    return sum / this.lapTimes.length;
  };

  LapTimer.prototype.getAverageLapFormatted = function () {
    return formatTime(this.getAverageLap());
  };

  LapTimer.prototype.getTotalTime = function () {
    return this.lapTimes.reduce(function (a, b) { return a + b; }, 0);
  };

  LapTimer.prototype.getCurrentLapNumber = function () {
    return this.lapTimes.length + (this.isLapActive ? 1 : 0);
  };

  LapTimer.prototype.isFirstLap = function () {
    return this.lapTimes.length === 0 && !this.isLapActive;
  };

  LapTimer.prototype.isLastLap = function () {
    return this.lapTimes.length >= this.totalLaps - 1 && this.isLapActive;
  };

  LapTimer.prototype.reset = function () {
    this.lapTimes = [];
    this.currentLapStart = null;
    this.currentLapTime = 0;
    this.isLapActive = false;
    this.bestLapTime = Infinity;
    this.bestLapIndex = -1;
    this.lastLapTime = null;
  };

  // Helpers estáticos
  LapTimer.formatTime = formatTime;
  LapTimer.parseTime = parseTime;

  // Exponer globalmente
  global.GAME = global.GAME || {};
  global.GAME.Game = global.GAME.Game || {};
  global.GAME.Game.LapTimer = LapTimer;

})(typeof window !== 'undefined' ? window : this);
