/**
 * Renderer - Renderizador pseudo-3D estilo OutRun para Toon GP
 * 
 * Dibuja la escena completa con perspectiva, sprites escalados por profundidad,
 * y estilo cartoon con colores saturados y formas redondeadas.
 * 
 * Capas de renderizado:
 *   1. Cielo (gradiente cálido)
 *   2. Fondo (montañas cartoon)
 *   3. Carretera (proyectada punto a punto desde la pista real: dibuja sus curvas)
 *   4. Decoración lateral (proyectada, colocada junto a la carretera)
 *   5. Coches (sprites escalados)
 *   6. Efectos
 * 
 * API pública:
 *   const renderer = new Renderer(canvas);
 *   renderer.render(sceneState);        // sceneState: { trackData, trackProgress, player, cars, speed, playerX }
 *   renderer.projectTrack(sceneState);  // geometría de la carretera en pantalla (pruebas/debug)
 */

class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas de renderizado
   * @param {Object} [config] - Configuración del renderer
   * @param {number} [config.horizonY=0.3] - Posición Y del horizonte (0-1)
   * @param {number} [config.cameraHeight=100] - Altura de la cámara
   * @param {number} [config.carDepth=100] - Profundidad a la que se sienta el coche
   * @param {number} [config.focalFactor=0.25] - Longitud focal = ancho de pantalla * factor
   * @param {number} [config.trackDrawDistance=3000] - px de pista que se dibujan hacia delante
   */
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // Configuración
    this.horizonY = config.horizonY ?? 0.3;
    this.cameraHeight = config.cameraHeight ?? 100;

    // Cámara y proyección de la pista (mundo → pantalla)
    this.carDepth = config.carDepth ?? 100;
    this.focalFactor = config.focalFactor ?? 0.25;
    this.nearClip = config.nearClip ?? 5;
    this.trackDrawDistance = config.trackDrawDistance ?? 3000;
    this.trackSampleStep = config.trackSampleStep ?? 50;
    this.carScreenYOffset = config.carScreenYOffset ?? 70;
    
    // Estado de la escena
    this.scrollX = 0;
    this.time = 0;
    
    // Colores del tema cartoon
    this.colors = {
      sky: ['#FF6B35', '#F7C59F', '#FFE66D'],
      mountains: ['#8B4B9C', '#6B3A7D', '#4A2A5C'],
      road: ['#4A4A4A', '#5A5A5A'],
      grass: ['#7EC850', '#5DA838'],
      roadLine: '#FFFFFF',
      roadEdge: '#FF4444'
    };
  }

  /** Altura de pantalla del sprite del coche (coincide con la proyección). */
  carScreenY() {
    return this.canvas.height - this.carScreenYOffset;
  }

  /**
   * Renderiza un frame completo
   * @param {Object} sceneState - Estado de la escena
   * @param {Object} sceneState.trackData - Datos de la pista (para proyectarla)
   * @param {number} sceneState.trackProgress - Progreso del coche por la pista
   * @param {Object} [sceneState.player] - Estado del coche del jugador
   * @param {Array} sceneState.cars - Array de estados de coches
   * @param {number} sceneState.playerX - Posición X del jugador (para scroll)
   * @param {number} [sceneState.speed=0] - Velocidad actual
   */
  render(sceneState) {
    sceneState = sceneState || {};
    const { cars = [], playerX = 0, speed = 0 } = sceneState;
    
    // Actualizar scroll basado en posición del jugador
    this.scrollX = playerX;
    this.time += 0.016; // Asumir ~60fps
    
    // Limpiar canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Renderizar capas en orden
    this._renderSky();
    this._renderMountains();
    this._renderTrack(sceneState);
    this._renderDecorations(sceneState);
    this._renderCars(cars);
    this._renderEffects(speed);
  }

  /**
   * Renderiza el cielo con gradiente cálido
   * @private
   */
  _renderSky() {
    const { ctx, canvas } = this;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height * this.horizonY);
    
    gradient.addColorStop(0, this.colors.sky[0]);
    gradient.addColorStop(0.5, this.colors.sky[1]);
    gradient.addColorStop(1, this.colors.sky[2]);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height * this.horizonY);
  }

  /**
   * Renderiza montañas cartoon en el fondo
   * @private
   */
  _renderMountains() {
    const { ctx, canvas } = this;
    const horizon = canvas.height * this.horizonY;
    
    // Tres capas de montañas con paralaje
    for (let layer = 0; layer < 3; layer++) {
      const parallax = 0.1 + layer * 0.1;
      const offset = (this.scrollX * parallax) % 200;
      
      ctx.fillStyle = this.colors.mountains[layer];
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      
      for (let x = -200; x < canvas.width + 200; x += 50) {
        const height = 30 + Math.sin((x + offset) * 0.02) * 20 + layer * 15;
        ctx.lineTo(x, horizon - height);
      }
      
      ctx.lineTo(canvas.width, horizon);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Cámara de carrera: apoya un poco por detrás del coche y apunta en la
   * dirección de la pista bajo él. Así la carretera se dibuja con sus curvas
   * y el desplazamiento lateral del coche desplaza la carretera en pantalla.
   * @param {Object} sceneState
   * @private
   */
  _getCamera(sceneState) {
    const { trackData, player, trackProgress = 0 } = sceneState || {};
    const w = this.canvas.width, h = this.canvas.height;
    const horizon = h * this.horizonY;
    let ang = 0, px = 0, py = 0;

    if (trackData && typeof trackData.getPointAt === 'function') {
      const a = trackData.getPointAt(trackProgress);
      const b = trackData.getPointAt(trackProgress + 10);
      ang = Math.atan2(b.y - a.y, b.x - a.x);
      px = player ? player.x : a.x;
      py = player ? player.y : a.y;
    } else if (player) {
      px = player.x;
      py = player.y;
      ang = player.angle || 0;
    }

    const cos = Math.cos(ang), sin = Math.sin(ang);
    return {
      x: px - cos * this.carDepth,
      y: py - sin * this.carDepth,
      cos, sin, w, h, horizon,
      focal: w * this.focalFactor,
      // screenY = horizonte + k / profundidad; k deja el coche en su sitio
      k: Math.max((this.carScreenY() - horizon) * this.carDepth, 1)
    };
  }

  /**
   * Proyecta un punto en coordenadas de cámara (lateral, profundidad) a pantalla.
   * @private
   */
  _project(cam, side, depth, halfWWorld = 0) {
    const scale = cam.focal / depth;
    return {
      x: cam.w / 2 + side * scale,
      y: cam.horizon + cam.k / depth,
      halfW: halfWWorld * scale,
      scale,
      depth
    };
  }

  /**
   * Proyecta la pista por delante de la cámara a coordenadas de pantalla.
   * Devuelve [{ x, y, halfW, scale, depth }] de cerca a lejos, con `null` como
   * marca de ruptura cuando la pista pasa por detrás de la cámara.
   * Es la geometría que dibuja _renderTrack y la que usan las pruebas para
   * comprobar que las curvas aparecen.
   * @param {Object} sceneState - { trackData, trackProgress, player }
   * @returns {Array}
   */
  projectTrack(sceneState) {
    const trackData = sceneState && sceneState.trackData;
    if (!trackData || typeof trackData.getPointAt !== 'function') return [];

    const cam = this._getCamera(sceneState);
    const near = this.nearClip;
    const step = this.trackSampleStep;
    const progress = sceneState.trackProgress || 0;
    const length = trackData.getLength ? trackData.getLength() : this.trackDrawDistance;
    const far = Math.min(this.trackDrawDistance, length || this.trackDrawDistance);

    const pts = [];
    let prev = null;
    let opened = false;

    for (let d = -this.carDepth - step; d <= far; d += step) {
      const p = trackData.getPointAt(progress + d);
      const rx = p.x - cam.x, ry = p.y - cam.y;
      const depth = rx * cam.cos + ry * cam.sin;
      const side = -rx * cam.sin + ry * cam.cos;
      const halfW = (p.width || 120) / 2;
      const sample = { depth, side, halfW };

      if (depth >= near) {
        if (prev && prev.depth < near) {
          // Veníamos de detrás de la cámara: recortamos al plano cercano
          const t = (near - prev.depth) / (depth - prev.depth);
          pts.push(this._project(cam,
            prev.side + (side - prev.side) * t,
            near,
            prev.halfW + (halfW - prev.halfW) * t));
        }
        pts.push(this._project(cam, side, depth, halfW));
        opened = true;
      } else if (opened && prev && prev.depth >= near) {
        // La pista se va por detrás: recortamos y marcamos la ruptura
        const t = (near - prev.depth) / (depth - prev.depth);
        pts.push(this._project(cam,
          prev.side + (side - prev.side) * t,
          near,
          prev.halfW + (halfW - prev.halfW) * t));
        pts.push(null);
        opened = false;
      }

      prev = sample;
    }
    return pts;
  }

  /**
   * Renderiza la carretera: un quad por tramo de pista proyectado, con línea
   * central discontinua y bordes. Al proyectar la pista real, las curvas del
   * circuito aparecen en pantalla.
   * @param {Object} sceneState
   * @private
   */
  _renderTrack(sceneState) {
    const pts = this.projectTrack(sceneState);
    if (pts.length < 2) return;
    const { ctx } = this;
    const horizon = this.canvas.height * this.horizonY;

    // 1) Firme (más claro cuanto más cerca)
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x - a.halfW, a.y);
      ctx.lineTo(a.x + a.halfW, a.y);
      ctx.lineTo(b.x + b.halfW, b.y);
      ctx.lineTo(b.x - b.halfW, b.y);
      ctx.closePath();
      ctx.fillStyle = this._roadColor(b.y, horizon);
      ctx.fill();
    }

    // 2) Línea central discontinua (un tramo sí, el siguiente no)
    ctx.fillStyle = this.colors.roadLine;
    for (let i = 0; i < pts.length - 1; i += 2) {
      const a = pts[i], b = pts[i + 1];
      if (!a || !b) continue;
      const aw = 4 * a.scale, bw = 4 * b.scale;
      ctx.beginPath();
      ctx.moveTo(a.x - aw, a.y);
      ctx.lineTo(a.x + aw, a.y);
      ctx.lineTo(b.x + bw, b.y);
      ctx.lineTo(b.x - bw, b.y);
      ctx.closePath();
      ctx.fill();
    }

    // 3) Bordes
    this._strokeRoadEdge(pts, -1);
    this._strokeRoadEdge(pts, 1);
  }

  /** Traza el borde izquierdo (sign=-1) o derecho (sign=1) de la carretera. */
  _strokeRoadEdge(pts, sign) {
    const { ctx } = this;
    ctx.beginPath();
    let started = false;
    for (const p of pts) {
      if (!p) { started = false; continue; }
      const x = p.x + sign * p.halfW;
      if (!started) { ctx.moveTo(x, p.y); started = true; }
      else ctx.lineTo(x, p.y);
    }
    ctx.strokeStyle = this.colors.roadEdge;
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  /** Color del firme para una altura de pantalla (igual que el degradado viejo). */
  _roadColor(y, horizon) {
    const denom = Math.max(this.canvas.height - horizon, 1);
    const t = Math.max(0, Math.min(1, (y - horizon) / denom));
    return this._mixColor(this.colors.road[0], this.colors.road[1], t);
  }

  /** Mezcla dos colores hexadecimales. */
  _mixColor(c1, c2, t) {
    const parse = (c) => [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
    const a = parse(c1), b = parse(c2);
    const m = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Renderiza la decoración de la pista (árboles y vallas) proyectándola con la
   * misma cámara, de forma que queda junto a la carretera.
   * @param {Object} sceneState
   * @private
   */
  _renderDecorations(sceneState) {
    const trackData = sceneState && sceneState.trackData;
    if (!trackData || typeof trackData.getDecoration !== 'function') return;

    const cam = this._getCamera(sceneState);
    const near = this.nearClip;
    const dec = trackData.getDecoration();
    if (!dec) return;

    const items = [];
    for (const t of dec.trees || []) items.push({ obj: t, kind: 'tree' });
    for (const b of dec.billboards || []) items.push({ obj: b, kind: 'sign' });

    const visible = [];
    for (const item of items) {
      const o = item.obj;
      const rx = o.x - cam.x, ry = o.y - cam.y;
      const depth = rx * cam.cos + ry * cam.sin;
      if (depth < near || depth > this.trackDrawDistance) continue;
      const side = -rx * cam.sin + ry * cam.cos;
      const p = this._project(cam, side, depth, 0);
      if (p.x < -300 || p.x > cam.w + 300) continue;
      visible.push({ item, p });
    }

    // De lejos a cerca para que las cosas cercanas tapen las lejanas
    visible.sort((a, b) => b.p.depth - a.p.depth);
    for (const v of visible) {
      const scale = v.p.scale * (v.item.obj.scale || 1);
      if (v.item.kind === 'tree') this._drawTree(v.p.x, v.p.y, scale);
      else this._drawSign(v.p.x, v.p.y, scale);
    }
  }

  /**
   * Dibuja un árbol cartoon
   * @private
   */
  _drawTree(x, y, scale) {
    const { ctx } = this;
    const size = 40 * scale;
    
    // Tronco
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x - 5 * scale, y, 10 * scale, 30 * scale);
    
    // Copa (círculos superpuestos para estilo cartoon)
    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.arc(x, y - 10 * scale, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#32CD32';
    ctx.beginPath();
    ctx.arc(x - size * 0.3, y - 5 * scale, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Contorno grueso
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 10 * scale, size * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * Dibuja una señal de tráfico cartoon
   * @private
   */
  _drawSign(x, y, scale) {
    const { ctx } = this;
    const size = 30 * scale;
    
    // Poste
    ctx.fillStyle = '#666';
    ctx.fillRect(x - 3 * scale, y, 6 * scale, 40 * scale);
    
    // Cartel
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(x, y - 10 * scale, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Símbolo (flecha)
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y - 20 * scale);
    ctx.lineTo(x + 8 * scale, y - 5 * scale);
    ctx.lineTo(x - 8 * scale, y - 5 * scale);
    ctx.closePath();
    ctx.fill();
    
    // Contorno
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 10 * scale, size * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * Renderiza los coches con sprites escalados por profundidad
   * @param {Array} cars - Array de estados de coches
   * @private
   */
  _renderCars(cars) {
    const { ctx, canvas } = this;
    const horizon = canvas.height * this.horizonY;
    
    // Ordenar por profundidad (Y) para pintar lejanos primero
    const sortedCars = [...cars].sort((a, b) => a.y - b.y);
    
    for (const car of sortedCars) {
      // Calcular posición en pantalla
      const relX = car.x - this.scrollX;
      const screenX = canvas.width / 2 + relX * 0.5;
      
      // Profundidad basada en Y (más Y = más cerca)
      const depth = Math.max(0, Math.min(1, (car.y - horizon) / (canvas.height - horizon)));
      const scale = 0.3 + depth * 0.7;
      
      const screenY = horizon + (canvas.height - horizon) * depth;
      
      // No dibujar si está fuera de pantalla
      if (screenX < -100 || screenX > canvas.width + 100) continue;
      
      this._drawCarSprite(screenX, screenY, scale, car);
    }
  }

  /**
   * Dibuja un sprite de coche F1 procedural estilo cartoon
   * @param {number} x - Posición X en pantalla
   * @param {number} y - Posición Y en pantalla
   * @param {number} scale - Escala del sprite
   * @param {Object} car - Estado del coche
   * @private
   */
  _drawCarSprite(x, y, scale, car) {
    const { ctx } = this;
    const w = 60 * scale;
    const h = 30 * scale;
    
    ctx.save();
    ctx.translate(x, y);
    
    // Rotar según ángulo de derrape
    const rotation = (car.driftAngle || 0) * 0.5;
    ctx.rotate(rotation);
    
    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.4, w * 0.5, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Cuerpo principal (monoplaza F1)
    ctx.fillStyle = '#FF4444';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.45, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Contorno grueso
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3 * scale;
    ctx.stroke();
    
    // Cabina del piloto
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(-w * 0.1, -h * 0.15, w * 0.15, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Casco del piloto
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(-w * 0.1, -h * 0.2, h * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Alerón delantero
    ctx.fillStyle = '#CC0000';
    ctx.fillRect(w * 0.3, -h * 0.1, w * 0.25, h * 0.15);
    ctx.strokeRect(w * 0.3, -h * 0.1, w * 0.25, h * 0.15);
    
    // Alerón trasero
    ctx.fillStyle = '#CC0000';
    ctx.fillRect(-w * 0.55, -h * 0.15, w * 0.2, h * 0.2);
    ctx.strokeRect(-w * 0.55, -h * 0.15, w * 0.2, h * 0.2);
    
    // Ruedas
    ctx.fillStyle = '#222';
    const wheelRadius = h * 0.2;
    
    // Rueda delantera
    ctx.beginPath();
    ctx.arc(w * 0.35, h * 0.25, wheelRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Rueda trasera
    ctx.beginPath();
    ctx.arc(-w * 0.35, h * 0.25, wheelRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Efecto de derrape (líneas de humo)
    if (car.isDrifting) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2 * scale;
      
      for (let i = 0; i < 3; i++) {
        const smokeX = -w * 0.5 - i * 10 * scale;
        const smokeY = h * 0.3 + Math.sin(this.time * 10 + i) * 5 * scale;
        
        ctx.beginPath();
        ctx.moveTo(smokeX, smokeY);
        ctx.lineTo(smokeX - 15 * scale, smokeY + 5 * scale);
        ctx.stroke();
      }
    }
    
    ctx.restore();
  }

  /**
   * Renderiza efectos visuales (velocidad, partículas)
   * @param {number} speed - Velocidad actual
   * @private
   */
  _renderEffects(speed) {
    const { ctx, canvas } = this;
    
    // Líneas de velocidad cuando el coche va rápido
    if (speed > 200) {
      const intensity = (speed - 200) / 100;
      ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.3})`;
      ctx.lineWidth = 2;
      
      for (let i = 0; i < 10; i++) {
        const x = Math.random() * canvas.width;
        const y = canvas.height * 0.5 + Math.random() * canvas.height * 0.5;
        const length = 20 + Math.random() * 30;
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + length);
        ctx.stroke();
      }
    }
  }

  /**
   * Redimensiona el canvas
   * @param {number} width - Nuevo ancho
   * @param {number} height - Nuevo alto
   */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }
}

// Asignación a API global
if (typeof window !== 'undefined') {
  window.GAME = window.GAME || {};
  window.GAME.Render = window.GAME.Render || {};
  window.GAME.Render.Renderer = Renderer;
}
