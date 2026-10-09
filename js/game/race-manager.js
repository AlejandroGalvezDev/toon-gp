/**
 * RaceManager — Gestiona el ciclo de vida de las carreras.
 * Estados: countdown → racing → finished
 * Detecta cruce de meta y gestión de vueltas.
 */
(function (global) {
  'use strict';

  var STATES = {
    COUNTDOWN: 'countdown',
    RACING: 'racing',
    FINISHED: 'finished'
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * @param {Object} config
   *   - totalLaps: number — vueltas totales de la carrera
   *   - countdownDuration: number — duración de la cuenta atrás (segundos)
   *   - trackLength: number — longitud total de la pista (unidades)
   *   - startZ: number — posición Z de la línea de meta
   */
  function RaceManager(config) {
    this.totalLaps = (config && config.totalLaps) || 3;
    this.countdownDuration = (config && config.countdownDuration) || 3.0;
    this.trackLength = (config && config.trackLength) || 1000;
    this.startZ = (config && config.startZ) || 0;

    this.state = STATES.COUNTDOWN;
    this.countdownTimer = this.countdownDuration;
    this.currentLap = 1;
    this.raceTime = 0;
    this.finishTime = 0;
    this.isRunning = false;
    this.isFinished = false;

    // Callbacks
    this.onCountdownTick = null;   // (remaining) => void
    this.onRaceStart = null;       // () => void
    this.onLapComplete = null;     // (lapNumber, lapTime) => void
    this.onRaceFinish = null;      // (totalTime) => void
  }

  /**
   * Inicia una nueva carrera (reinicia todo).
   */
  RaceManager.prototype.startRace = function () {
    this.state = STATES.COUNTDOWN;
    this.countdownTimer = this.countdownDuration;
    this.currentLap = 1;
    this.raceTime = 0;
    this.finishTime = 0;
    this.isRunning = true;
    this.isFinished = false;
  };

  /**
   * Actualiza el estado de la carrera cada frame.
   * @param {number} dt - Delta time en segundos.
   * @param {Object} vehicleState - { z: number, lap: number }
   */
  RaceManager.prototype.update = function (dt, vehicleState) {
    if (!this.isRunning) return;

    switch (this.state) {
      case STATES.COUNTDOWN:
        this._updateCountdown(dt);
        break;
      case STATES.RACING:
        this._updateRacing(dt, vehicleState);
        break;
      case STATES.FINISHED:
        // No hacer nada
        break;
    }
  };

  RaceManager.prototype._updateCountdown = function (dt) {
    var prev = Math.ceil(this.countdownTimer);
    this.countdownTimer -= dt;
    var now = Math.ceil(this.countdownTimer);

    if (now !== prev && this.onCountdownTick) {
      this.onCountdownTick(Math.max(now, 0));
    }

    if (this.countdownTimer <= 0) {
      this.state = STATES.RACING;
      if (this.onRaceStart) {
        this.onRaceStart();
      }
    }
  };

  RaceManager.prototype._updateRacing = function (dt, vehicleState) {
    this.raceTime += dt;

    if (!vehicleState) return;

    // Detectar cruce de meta
    if (this._crossedFinishLine(vehicleState)) {
      this._onFinishLineCross();
    }
  };

  RaceManager.prototype._crossedFinishLine = function (vehicleState) {
    var z = vehicleState.z;
    var prevZ = vehicleState.prevZ !== undefined ? vehicleState.prevZ : z;

    // Cruce de meta: de atrás hacia adelante a través de startZ
    // Considera también el "wrap-around" (fin de vuelta -> inicio)
    if (prevZ < this.startZ && z >= this.startZ) {
      return true;
    }
    // Wrap-around: si pasa de un valor alto a bajo, cruzó meta
    if (prevZ > z && prevZ > this.startZ * 0.8 && z < this.startZ + 50) {
      return true;
    }
    return false;
  };

  RaceManager.prototype._onFinishLineCross = function () {
    if (this.currentLap >= this.totalLaps) {
      // Carrera terminada
      this.state = STATES.FINISHED;
      this.isFinished = true;
      this.isRunning = false;
      this.finishTime = this.raceTime;
      if (this.onRaceFinish) {
        this.onRaceFinish(this.raceTime);
      }
    } else {
      this.currentLap++;
      if (this.onLapComplete) {
        this.onLapComplete(this.currentLap - 1, this.raceTime);
      }
    }
  };

  /**
   * Fuerza la finalización de la carrera.
   */
  RaceManager.prototype.finishRace = function () {
    if (this.state === STATES.RACING || this.state === STATES.COUNTDOWN) {
      this.state = STATES.FINISHED;
      this.isFinished = true;
      this.isRunning = false;
      this.finishTime = this.raceTime;
      if (this.onRaceFinish) {
        this.onRaceFinish(this.raceTime);
      }
    }
  };

  RaceManager.prototype.getState = function () {
    return this.state;
  };

  RaceManager.prototype.getCurrentLap = function () {
    return this.currentLap;
  };

  RaceManager.prototype.getTotalLaps = function () {
    return this.totalLaps;
  };

  RaceManager.prototype.getRaceTime = function () {
    return this.raceTime;
  };

  RaceManager.prototype.getFinishTime = function () {
    return this.finishTime;
  };

  RaceManager.prototype.getProgress = function () {
    if (this.state === STATES.COUNTDOWN) {
      return 0;
    }
    if (this.state === STATES.FINISHED) {
      return 1;
    }
    return clamp((this.currentLap - 1) / this.totalLaps, 0, 1);
  };

  // Exponer globalmente
  global.GAME = global.GAME || {};
  global.GAME.Game = global.GAME.Game || {};
  global.GAME.Game.RaceManager = RaceManager;
  global.GAME.Game.RaceManager.STATES = STATES;

})(typeof window !== 'undefined' ? window : this);
