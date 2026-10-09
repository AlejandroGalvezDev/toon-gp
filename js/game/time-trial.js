/**
 * TimeTrial — Gestiona sesión de contrarreloj.
 * N vueltas, mejor vuelta, comparación con rival.
 */
(function (global) {
  'use strict';

  var STATES = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    FINISHED: 'finished'
  };

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

  /**
   * @param {Object} [config]
   *   - totalLaps: number — vueltas totales
   *   - rivalName: string — nombre del rival fantasma
   *   - rivalTime: number — tiempo objetivo del rival (mejor vuelta)
   *   - onLapComplete: function(lapNumber, lapTime)
   *   - onSessionComplete: function(bestLap, totalTime)
   *   - onCountdownTick: function(remaining)
   *   - onRaceStart: function()
   */
  function TimeTrial(config) {
    config = config || {};
    this.totalLaps = config.totalLaps || 3;
    this.rivalName = config.rivalName || 'Rival';
    this.rivalTime = config.rivalTime || 85.0;

    this.lapTimer = null;
    this.ghostData = null;
    this.state = STATES.IDLE;
    this.currentLap = 0;
    this.lapTimes = [];
    this.totalTime = 0;
    this.bestLap = Infinity;
    this.bestLapIndex = -1;
    this.startTimeStamp = null;
    this.finishTimeStamp = null;

    // Callbacks
    this.onLapComplete = config.onLapComplete || null;
    this.onSessionComplete = config.onSessionComplete || null;
    this.onCountdownTick = config.onCountdownTick || null;
    this.onRaceStart = config.onRaceStart || null;
  }

  /**
   * Inicializa el LapTimer y GhostData.
   * @param {Object} lapTimer
   * @param {Object} ghostData
   */
  TimeTrial.prototype.init = function (lapTimer, ghostData) {
    this.lapTimer = lapTimer;
    this.ghostData = ghostData;
  };

  /**
   * Inicia una nueva sesión de contrarreloj.
   */
  TimeTrial.prototype.start = function () {
    this.state = STATES.RUNNING;
    this.currentLap = 1;
    this.lapTimes = [];
    this.totalTime = 0;
    this.bestLap = Infinity;
    this.bestLapIndex = -1;
    this.startTimeStamp = performance.now ? performance.now() : Date.now();

    if (this.lapTimer) {
      this.lapTimer.reset();
      this.lapTimer.startLap();
    }
  };

  /**
   * Pausa la sesión.
   */
  TimeTrial.prototype.pause = function () {
    if (this.state === STATES.RUNNING) {
      this.state = STATES.PAUSED;
    }
  };

  /**
   * Reanuda la sesión.
   */
  TimeTrial.prototype.resume = function () {
    if (this.state === STATES.PAUSED) {
      this.state = STATES.RUNNING;
    }
  };

  /**
   * Termina la sesión prematuramente.
   */
  TimeTrial.prototype.abort = function () {
    this.state = STATES.FINISHED;
    if (this.lapTimer) {
      this.lapTimer.endLap();
    }
  };

  /**
   * Registra la finalización de una vuelta.
   * @param {number} lapTime — Tiempo de la vuelta en segundos.
   * @returns {Object} — Info de la vuelta completada.
   */
  TimeTrial.prototype.completeLap = function (lapTime) {
    if (this.state !== STATES.RUNNING) return null;

    this.lapTimes.push(lapTime);
    this.totalTime += lapTime;

    // Actualizar mejor vuelta
    if (lapTime < this.bestLap) {
      this.bestLap = lapTime;
      this.bestLapIndex = this.lapTimes.length - 1;
    }

    var lapNumber = this.lapTimes.length;
    var result = {
      lapNumber: lapNumber,
      lapTime: lapTime,
      lapTimeFormatted: formatTime(lapTime),
      isBestLap: lapNumber === this.bestLapIndex + 1,
      diffToBest: lapTime - this.bestLap,
      diffToRival: lapTime - this.rivalTime
    };

    if (this.onLapComplete) {
      this.onLapComplete(lapNumber, lapTime);
    }

    // ¿Última vuelta?
    if (lapNumber >= this.totalLaps) {
      this._finishSession();
    } else {
      this.currentLap = lapNumber + 1;
      if (this.lapTimer) {
        this.lapTimer.startLap();
      }
    }

    return result;
  };

  TimeTrial.prototype._finishSession = function () {
    this.state = STATES.FINISHED;
    this.finishTimeStamp = performance.now ? performance.now() : Date.now();

    var sessionTime = (this.finishTimeStamp - this.startTimeStamp) / 1000;

    if (this.onSessionComplete) {
      this.onSessionComplete(this.bestLap, sessionTime);
    }
  };

  /**
   * Actualiza el estado de la sesión (llamar cada frame).
   * @param {number} dt - Delta time en segundos.
   */
  TimeTrial.prototype.update = function (dt) {
    if (this.state !== STATES.RUNNING) return;

    if (this.lapTimer) {
      this.lapTimer.update(dt);
    }
  };

  /**
   * Obtiene el tiempo actual de la vuelta en curso.
   * @returns {string} — Formateado MM:SS.mmm
   */
  TimeTrial.prototype.getCurrentLapTime = function () {
    if (this.lapTimer) {
      return this.lapTimer.getCurrentLapTimeFormatted();
    }
    return '--:--.---';
  };

  /**
   * Obtiene el mejor tiempo de la sesión.
   * @returns {string|null}
   */
  TimeTrial.prototype.getBestLapFormatted = function () {
    if (this.bestLap === Infinity) return null;
    return formatTime(this.bestLap);
  };

  /**
   * Obtiene el tiempo total de la sesión.
   * @returns {string}
   */
  TimeTrial.prototype.getTotalTimeFormatted = function () {
    return formatTime(this.totalTime);
  };

  /**
   * Compara la mejor vuelta con el rival.
   * @returns {Object}
   */
  TimeTrial.prototype.getRivalComparison = function () {
    var diff = this.bestLap - this.rivalTime;
    return {
      playerBest: this.bestLap,
      rivalTime: this.rivalTime,
      diff: diff,
      playerWins: this.bestLap < this.rivalTime,
      message: diff < 0
        ? '¡Ganas por ' + Math.abs(diff).toFixed(3) + 's!'
        : diff > 0
          ? 'Pierdes por ' + diff.toFixed(3) + 's'
          : '¡Empate!'
    };
  };

  /**
   * Obtiene el estado actual de la sesión.
   * @returns {Object}
   */
  TimeTrial.prototype.getStatus = function () {
    return {
      state: this.state,
      currentLap: this.currentLap,
      totalLaps: this.totalLaps,
      bestLap: this.bestLap,
      bestLapFormatted: this.getBestLapFormatted(),
      totalTime: this.totalTime,
      lapTimes: this.lapTimes.slice(),
      rivalComparison: this.getRivalComparison()
    };
  };

  // Helpers estáticos
  TimeTrial.formatTime = formatTime;
  TimeTrial.STATES = STATES;

  // Exponer globalmente
  global.GAME = global.GAME || {};
  global.GAME.Game = global.GAME.Game || {};
  global.GAME.Game.TimeTrial = TimeTrial;

})(typeof window !== 'undefined' ? window : this);
