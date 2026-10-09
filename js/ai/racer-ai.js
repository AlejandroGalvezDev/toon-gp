/**
 * RacerAI — IA de oponentes para Toon GP.
 * Genera entradas de control (throttle, brake, steer, targetX)
 * basándose en los datos de la pista y la dificultad seleccionada.
 */
(function (global) {
  'use strict';

  var SPEED_PROFILES = {
    easy:   { cornerFactor: 0.80, straightFactor: 0.80, reaction: 0.30 },
    medium: { cornerFactor: 0.90, straightFactor: 0.90, reaction: 0.20 },
    hard:   { cornerFactor: 0.95, straightFactor: 0.95, reaction: 0.10 }
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * @param {Object} trackData - Información de la pista.
   *   - sections: array de { type: 'straight'|'corner'|'chicane', length, curvature, speedLimit }
   *   - trackWidth: number
   *   - startX, startZ: posición de salida
   * @param {'easy'|'medium'|'hard'} difficulty
   */
  function RacerAI(trackData, difficulty) {
    this.trackData = trackData;
    this.difficulty = difficulty || 'medium';
    this.profile = SPEED_PROFILES[this.difficulty] || SPEED_PROFILES.medium;
    this.currentSectionIndex = 0;
    this.distanceIntoSection = 0;
    this.totalDistance = 0;
    this.precomputedTargets = this._precomputeTargets();
  }

  RacerAI.prototype._precomputeTargets = function () {
    var targets = [];
    var sections = this.trackData.sections || [];
    var trackWidth = this.trackData.trackWidth || 12;
    var startX = this.trackData.startX || 0;
    var startZ = this.trackData.startZ || 0;
    var x = startX;
    var z = startZ;

    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      var length = sec.length || 100;
      var curvature = sec.curvature || 0;
      var speedLimit = sec.speedLimit || 200;
      var halfWidth = trackWidth / 2;

      // Target X: trazado óptimo — hacia el interior de la curva
      var targetX = x - curvature * halfWidth;

      // Velocidad objetivo según tipo de sección
      var targetSpeed;
      if (sec.type === 'straight') {
        targetSpeed = speedLimit * this.profile.straightFactor;
      } else {
        // Corner / chicane: más lento, proporcional a curvatura
        targetSpeed = speedLimit * this.profile.cornerFactor * (1 - Math.abs(curvature) * 0.4);
      }

      targets.push({
        index: i,
        startZ: z,
        endZ: z + length,
        targetX: clamp(targetX, x - halfWidth + 1, x + halfWidth - 1),
        targetSpeed: Math.max(targetSpeed, 30),
        curvature: curvature,
        type: sec.type
      });

      // Avanza la posición de inicio de la siguiente sección
      x += curvature * length * 0.1;
      z += length;
    }
    return targets;
  };

  /**
   * Actualiza la IA para el frame actual.
   * @param {number} dt - Delta time en segundos.
   * @param {Object} playerState - Estado del jugador/vehículo.
   *   - x, z: posición actual
   *   - speed: velocidad actual
   *   - heading: ángulo de dirección (radianes)
   *   - lap: vuelta actual
   * @returns {Object} { throttle: 0-1, brake: 0-1, steer: -1 a 1, targetX: número }
   */
  RacerAI.prototype.update = function (dt, playerState) {
    var section = this._getCurrentSection(playerState.z);
    var target = this.precomputedTargets[section.index];

    if (!target) {
      return { throttle: 0, brake: 0, steer: 0, targetX: playerState.x };
    }

    // --- Throttle / Brake ---
    var speedDiff = target.targetSpeed - playerState.speed;
    var throttle = 0;
    var brake = 0;

    if (speedDiff > 0) {
      throttle = clamp(speedDiff / 50, 0, 1);
      brake = 0;
    } else {
      brake = clamp(-speedDiff / 50, 0, 1);
      throttle = 0;
    }

    // Frenado anticipatorio en curvas
    var distToCorner = target.endZ - playerState.z;
    if (target.curvature !== 0 && distToCorner < 60 && distToCorner > 0) {
      var brakeFactor = clamp(1 - distToCorner / 60, 0, 0.7);
      brake = Math.max(brake, brakeFactor);
      throttle = Math.min(throttle, 1 - brakeFactor * 0.5);
    }

    // --- Steer ---
    var dx = target.targetX - playerState.x;
    var steer = clamp(dx * 0.05, -1, 1);

    // Reacción según dificultad (suavizado)
    steer = lerp(0, steer, 1 - this.profile.reaction);
    throttle = lerp(0, throttle, 1 - this.profile.reaction);
    brake = lerp(0, brake, 1 - this.profile.reaction);

    return {
      throttle: clamp(throttle, 0, 1),
      brake: clamp(brake, 0, 1),
      steer: clamp(steer, -1, 1),
      targetX: target.targetX
    };
  };

  RacerAI.prototype._getCurrentSection = function (z) {
    var targets = this.precomputedTargets;
    for (var i = 0; i < targets.length; i++) {
      if (z >= targets[i].startZ && z < targets[i].endZ) {
        this.currentSectionIndex = i;
        return { index: i, section: targets[i] };
      }
    }
    // Si se pasa de la última sección, vuelve a la primera (vuelta circular)
    this.currentSectionIndex = 0;
    return { index: 0, section: targets[0] };
  };

  RacerAI.prototype.getCurrentSectionIndex = function () {
    return this.currentSectionIndex;
  };

  RacerAI.prototype.setDifficulty = function (difficulty) {
    this.difficulty = difficulty;
    this.profile = SPEED_PROFILES[difficulty] || SPEED_PROFILES.medium;
    this.precomputedTargets = this._precomputeTargets();
  };

  // Exponer globalmente
  global.GAME = global.GAME || {};
  global.GAME.AI = global.GAME.AI || {};
  global.GAME.AI.RacerAI = RacerAI;

})(typeof window !== 'undefined' ? window : this);
