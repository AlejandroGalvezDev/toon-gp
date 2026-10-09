// js/core/game.js — GAME.Core.Game: game loop principal
window.GAME = window.GAME || {};
GAME.Core = GAME.Core || {};

GAME.Core.Game = class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.renderer = new GAME.Render.Renderer(canvas);
    this.audio = new GAME.Core.Audio();
    this.sceneManager = new GAME.Core.SceneManager(this.renderer, this.audio);
    this.stateMachine = new GAME.Core.StateMachine();
    this.input = new GAME.Core.Input();
    this.lastTime = 0;
    this.running = false;
    this.rafId = null;
    this.trackGenerator = new GAME.Track.TrackGenerator();
    this.raceManager = null;
    this.timeTrial = null;
    this.trackData = null;
    this.player = null;
    this.ghostData = new GAME.Game.GhostData();
    this.lapTimer = new GAME.Game.LapTimer({ totalLaps: 3 });

    // Config
    this.difficulty = 'medium';
    this.totalLaps = 3;
    this.lapsCompleted = 0;
    this.bestLapTime = Infinity;
    this.sessionStart = 0;

    // Cuenta atrás de salida: 3 → 2 → 1 → GO!
    this.countdownSeconds = 3;
    this.goSeconds = 1;
    this.countdownTimer = 0;
    this.goTimer = 0;

    // Límites del mundo (se recalculan con cada pista generada)
    this.worldBounds = null;

    // Progreso por la pista para detectar el cruce de meta (null = sin referencia)
    this.prevProgress = null;

    // Escenas
    this.sceneManager.register('menu', {
      update: (dt) => this._updateMenu(dt),
      render: (ctx, w, h) => this._renderMenu(ctx, w, h)
    });
    this.sceneManager.register('race', {
      update: (dt) => this._updateRace(dt),
      render: (ctx, w, h) => this._renderRace(ctx, w, h)
    });
    this.sceneManager.register('results', {
      update: (dt) => this._updateResults(dt),
      render: (ctx, w, h) => this._renderResults(ctx, w, h)
    });

    this.sceneManager.show('menu');
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      const dt = Math.min((t - this.lastTime) / 1000, 0.05);
      this.lastTime = t;
      this.update(dt);
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  update(dt) {
    this.sceneManager.update(dt);
  }

  render() {
    const w = this.canvas.width, h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);
    this.sceneManager.render(this.ctx, w, h);
  }

  // ── Menú ──
  _updateMenu(dt) {
    if (this.input.isDown('Enter') || this.input.isDown('Space')) {
      this.startRace();
    }
  }

  _renderMenu(ctx, w, h) {
    // Fondo
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff6b35');
    g.addColorStop(0.5, '#f7c948');
    g.addColorStop(1, '#2d5a27');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Sol cartoon
    ctx.fillStyle = '#ffe66d';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.3, 60, 0, Math.PI * 2);
    ctx.fill();

    // Título
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 72px "Arial Black", Arial, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#222';
    ctx.strokeText('TOON GP', w / 2, h * 0.45);
    ctx.fillStyle = '#e74c3c';
    ctx.fillText('TOON GP', w / 2, h * 0.45);

    // Subtítulo
    ctx.font = 'bold 28px "Arial Black", Arial, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeText('CONTRARRELOJ F1', w / 2, h * 0.55);
    ctx.fillStyle = '#fff';
    ctx.fillText('CONTRARRELOJ F1', w / 2, h * 0.55);

    // Instrucciones
    ctx.font = '20px Arial, sans-serif';
    ctx.lineWidth = 3;
    const lines = [
      'Pulsa ENTER para empezar',
      'Flechas / WASD para conducir',
      'ESPACIO para derrapar',
      'R para reiniciar vuelta'
    ];
    lines.forEach((line, i) => {
      const yy = h * 0.68 + i * 30;
      ctx.strokeText(line, w / 2, yy);
      ctx.fillStyle = '#fff';
      ctx.fillText(line, w / 2, yy);
    });
  }

  // ── Carrera ──
  startRace(seed = Date.now() % 100000) {
    this.trackGenerator.generateTrack(seed);
    this.trackData = this.trackGenerator.getTrackData();

    // Salir orientado en el sentido de la pista (no hacia el exterior)
    const start = this.trackData.getPointAt(0);
    const ahead = this.trackData.getPointAt(20);
    this.player = new GAME.Physics.CarPhysics({
      x: start.x,
      y: start.y,
      angle: Math.atan2(ahead.y - start.y, ahead.x - start.x)
    });

    this.lapTimer = new GAME.Game.LapTimer({ totalLaps: this.totalLaps });
    this.lapsCompleted = 0;
    this.bestLapTime = Infinity;

    // Cuenta atrás: el cronómetro de vuelta arranca al terminar (en el GO!)
    this.countdownTimer = this.countdownSeconds;
    this.goTimer = this.goSeconds;
    this.prevProgress = null;
    this.trackProgress = 0; // progreso por la pista (lo usa el renderer)
    this._computeWorldBounds();

    this.raceManager = new GAME.Game.RaceManager({
      trackData: this.trackData,
      totalLaps: this.totalLaps
    });
    this.sceneManager.show('race');
    this.audio.startEngine();
  }

  /**
   * Límites del mundo a partir de la pista generada.
   * Antes estaba fijado a ±500 y dejaba fuera casi toda la pista (y la meta).
   */
  _computeWorldBounds() {
    const pad = 400;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of this.trackData.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    this.worldBounds = {
      minX: minX - pad, maxX: maxX + pad,
      minY: minY - pad, maxY: maxY + pad
    };
  }

  /**
   * Progreso (0..length) del punto de la pista más cercano a una posición.
   * Es la base para saber si el coche ha completado la vuelta.
   */
  _getTrackProgress(x, y) {
    const pts = this.trackData.points;
    const cum = this.trackData.cumulative;
    let bestIdx = 0, bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - x, dy = pts[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    return cum[bestIdx] || 0;
  }

  /**
   * Paso de la cuenta atrás a dibujar: 3, 2, 1, 0 (= ¡GO!) o null si ya empezó.
   */
  _getCountdownStep() {
    if (this.countdownTimer > 0) return Math.max(1, Math.ceil(this.countdownTimer));
    if (this.goTimer > 0) return 0;
    return null;
  }

  /** Avanza la cuenta atrás y arranca el cronómetro en la salida. */
  _tickCountdown(dt) {
    if (this.countdownTimer > 0) {
      this.countdownTimer = Math.max(0, this.countdownTimer - dt);
      if (this.countdownTimer === 0) {
        // ¡Salida! El cronómetro de vuelta empieza aquí, fuera de la cuenta atrás
        this.goTimer = this.goSeconds;
        this.lapTimer.startLap();
      }
    } else if (this.goTimer > 0) {
      this.goTimer = Math.max(0, this.goTimer - dt);
    }
  }

  _updateRace(dt) {
    this._tickCountdown(dt);

    // El coche no arranca hasta el GO
    const inCountdown = this.countdownTimer > 0;
    if (!inCountdown) {
      const inp = {
        throttle: this.input.getThrottle(),
        brake: this.input.getBrake(),
        steer: this.input.getSteer(),
        drift: this.input.isDown('Space')
      };
      this.player.update(dt, inp);
    }

    // Límites del mundo (derivados de la pista, no fijos)
    const b = this.worldBounds;
    if (b) {
      if (this.player.x < b.minX) this.player.x = b.minX;
      if (this.player.x > b.maxX) this.player.x = b.maxX;
      if (this.player.y < b.minY) this.player.y = b.minY;
      if (this.player.y > b.maxY) this.player.y = b.maxY;
    }

    // Cronometraje
    this.lapTimer.update(dt);

    // Vuelta: se cuenta al cruzar la línea de meta DESPUÉS de recorrer casi
    // toda la vuelta. Estar cerca de la meta (o ir y volver) no basta.
    const L = this.trackData.getLength();
    const prog = this._getTrackProgress(this.player.x, this.player.y);
    this.trackProgress = prog;
    const meta = this.trackData.getPointAt(0);
    const distMeta = Math.hypot(this.player.x - meta.x, this.player.y - meta.y);
    if (this.prevProgress !== null &&
        this.prevProgress > L * 0.7 && prog < L * 0.3 &&
        distMeta < 300 &&
        this.lapTimer.getCurrentLapTime() > 5) {
      this._completeLap();
    }
    this.prevProgress = prog;

    // Pausa
    if (this.input.isDown('Escape')) {
      this.audio.stopEngine();
      this.sceneManager.show('menu');
      this.input.keys['Escape'] = false;
    }

    // Reiniciar
    if (this.input.isDown('KeyR')) {
      const p = this.trackData.getPointAt(0);
      this.player.x = p.x;
      this.player.y = p.y;
      this.player.speed = 0;
      this.player.angle = Math.atan2(
        this.trackData.getPointAt(20).y - p.y,
        this.trackData.getPointAt(20).x - p.x
      );
      // Rompemos la continuidad del progreso: si no, teletransportarse a la
      // meta desde el final de la vuelta contaría como cruce.
      this.prevProgress = null;
      this.input.keys['KeyR'] = false;
    }

    // Audio motor
    this.audio.setEngineSpeed(this.player.speed / this.player.maxSpeed);
    if (this.player.driftAngle > 0.1) {
      this.audio.playSkid();
    }
  }

  _completeLap() {
    const lapTime = this.lapTimer.endLap();
    if (!lapTime) return; // no había vuelta activa
    // La validez de la vuelta se decide en _updateRace (progreso por la pista).
    // Aquí lo importante es: o termina la carrera o el cronómetro sigue vivo.
    this.lapsCompleted++;
    if (lapTime < this.bestLapTime) {
      this.bestLapTime = lapTime;
      this.audio.playEffect('lap');
    }
    this.ghostData.saveLap(lapTime, 'track_1');
    if (this.lapsCompleted >= this.totalLaps) {
      this._finishRace();
    } else {
      this.lapTimer.startLap();
    }
  }

  _finishRace() {
    this.audio.stopEngine();
    this.audio.playEffect('finish');
    this.sceneManager.show('results');
  }

  _renderRace(ctx, w, h) {
    // Renderizar escena (la posición X y la velocidad mueven el parallax
    // y el efecto de velocidad; el coche del jugador se dibuja abajo al centro)
    const sceneState = {
      trackData: this.trackData,
      trackProgress: this.trackProgress,
      player: this.player,
      playerX: this.player.x,
      speed: this.player.speed,
      cars: [{
        x: this.player.x,
        y: this.renderer.carScreenY(),
        angle: this.player.angle,
        driftAngle: this.player.driftAngle,
        isDrifting: this.player.isDrifting
      }],
      effects: []
    };
    this.renderer.render(sceneState);

    // HUD
    const ps = this.player.getState();
    const hudState = {
      speed: Math.round(ps.speed),
      maxSpeed: this.player.maxSpeed,
      lapTime: this.lapTimer.getCurrentLapTime(),
      bestLap: this.lapTimer.getBestLap(),
      diff: this.bestLapTime < Infinity ? this.lapTimer.getCurrentLapTime() - this.bestLapTime : 0,
      position: 1,
      totalCars: 1,
      trackPoints: this.trackData.points,
      playerPos: { x: this.player.x, y: this.player.y },
      playerAngle: this.player.angle
    };
    const hud = new GAME.Render.HUDRenderer();
    hud.render(ctx, w, h, hudState);

    // Cuenta atrás (3, 2, 1, ¡GO!)
    const step = this._getCountdownStep();
    if (step !== null) {
      hud.drawCountdown(ctx, w, h, step);
    }

    // Info vuelta
    ctx.font = 'bold 24px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    const lapText = `VUELTA ${this.lapsCompleted + 1}/${this.totalLaps}`;
    ctx.strokeText(lapText, 20, 80);
    ctx.fillText(lapText, 20, 80);
  }

  // ── Resultados ──
  _updateResults(dt) {
    if (this.input.isDown('Enter') || this.input.isDown('Space')) {
      this.sceneManager.show('menu');
      this.input.keys['Enter'] = false;
      this.input.keys['Space'] = false;
    }
  }

  _renderResults(ctx, w, h) {
    // Fondo
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a1a2e');
    g.addColorStop(1, '#16213e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Título
    ctx.font = 'bold 56px "Arial Black", Arial, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#222';
    ctx.strokeText('RESULTADOS', w / 2, h * 0.2);
    ctx.fillStyle = '#f1c40f';
    ctx.fillText('RESULTADOS', w / 2, h * 0.2);

    // Tiempos
    ctx.font = '24px Arial, sans-serif';
    ctx.lineWidth = 3;
    const times = this.lapTimer.getLapTimes();
    times.forEach((t, i) => {
      const yy = h * 0.35 + i * 40;
      const txt = `Vuelta ${i + 1}: ${this.lapTimer.formatTime(t)}`;
      ctx.strokeText(txt, w / 2, yy);
      ctx.fillStyle = '#fff';
      ctx.fillText(txt, w / 2, yy);
    });

    // Mejor vuelta
    if (this.bestLapTime < Infinity) {
      ctx.font = 'bold 32px "Arial Black", Arial, sans-serif';
      const bestTxt = `MEJOR: ${this.lapTimer.formatTime(this.bestLapTime)}`;
      ctx.strokeText(bestTxt, w / 2, h * 0.65);
      ctx.fillStyle = '#2ecc71';
      ctx.fillText(bestTxt, w / 2, h * 0.65);
    }

    // Volver
    ctx.font = '20px Arial, sans-serif';
    const backTxt = 'Pulsa ENTER para volver';
    ctx.strokeText(backTxt, w / 2, h * 0.8);
    ctx.fillStyle = '#aaa';
    ctx.fillText(backTxt, w / 2, h * 0.8);
  }
};
