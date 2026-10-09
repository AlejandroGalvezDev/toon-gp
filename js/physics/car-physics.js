/**
 * CarPhysics - Física de coche estilo OutRun para Toon GP
 * 
 * Implementa aceleración, frenado, derrapes y transferencia de peso.
 * Diseñado para juegos de carreras cartoon con sensación arcade.
 * 
 * API pública:
 *   const car = new CarPhysics({ x: 0, y: 0, angle: 0 });
 *   car.update(dt, { throttle: 1, brake: 0, steer: 0.5, drift: false });
 *   const state = car.getState();
 *   car.applyCollision(otherCar);
 */

class CarPhysics {
  /**
   * @param {Object} config - Configuración inicial del coche
   * @param {number} [config.x=0] - Posición X en el mundo
   * @param {number} [config.y=0] - Posición Y en el mundo
   * @param {number} [config.angle=0] - Ángulo de orientación (radianes)
   * @param {number} [config.maxSpeed=300] - Velocidad máxima (px/s)
   * @param {number} [config.acceleration=150] - Aceleración base (px/s²)
   * @param {number} [config.braking=250] - Fuerza de frenado (px/s²)
   * @param {number} [config.friction=0.98] - Fricción (0-1, más bajo = más fricción)
   * @param {number} [config.grip=0.9] - Agarre de neumáticos (0-1)
   * @param {number} [config.driftFactor=0.3] - Factor de derrape (0-1)
   * @param {number} [config.weightTransfer=0.5] - Transferencia de peso (0-1)
   */
  constructor(config = {}) {
    // Posición y orientación
    this.x = config.x ?? 0;
    this.y = config.y ?? 0;
    this.angle = config.angle ?? 0;
    
    // Velocidad
    this.speed = 0;
    this.maxSpeed = config.maxSpeed ?? 300;
    
    // Parámetros de manejo
    this.acceleration = config.acceleration ?? 150;
    this.braking = config.braking ?? 250;
    this.friction = config.friction ?? 0.98;
    this.grip = config.grip ?? 0.9;
    this.driftFactor = config.driftFactor ?? 0.3;
    this.weightTransfer = config.weightTransfer ?? 0.5;
    
    // Estado de derrape
    this.driftAngle = 0;
    this.isDrifting = false;
    
    // Velocidad angular
    this.angularVelocity = 0;
    
    // Dimensiones del coche (para colisiones)
    this.width = 40;
    this.height = 20;
    
    // Estado interno
    this._steerAngle = 0;
    this._lateralVelocity = 0;
  }

  /**
   * Actualiza la física del coche
   * @param {number} dt - Delta time en segundos
   * @param {Object} input - Entrada del jugador
   * @param {number} input.throttle - Acelerador (0-1)
   * @param {number} input.brake - Freno (0-1)
   * @param {number} input.steer - Dirección (-1 izquierda, 1 derecha)
   * @param {boolean} input.drift - Botón de derrape activado
   */
  update(dt, input) {
    const { throttle = 0, brake = 0, steer = 0, drift = false } = input;
    
    // Limpiar entradas
    const clampedThrottle = Math.max(0, Math.min(1, throttle));
    const clampedBrake = Math.max(0, Math.min(1, brake));
    const clampedSteer = Math.max(-1, Math.min(1, steer));
    
    // --- Aceleración y frenado ---
    if (clampedThrottle > 0) {
      // Aceleración con curva (menos potencia a altas velocidades)
      const speedRatio = this.speed / this.maxSpeed;
      const accelCurve = 1 - (speedRatio * 0.5);
      this.speed += this.acceleration * clampedThrottle * accelCurve * dt;
    }
    
    if (clampedBrake > 0) {
      // Frenado más efectivo a altas velocidades
      const brakeForce = this.braking * clampedBrake;
      this.speed -= brakeForce * dt;
    }
    
    // --- Fricción ---
    this.speed *= Math.pow(this.friction, dt * 60);
    
    // Límites de velocidad
    this.speed = Math.max(0, Math.min(this.maxSpeed, this.speed));
    
    // --- Transferencia de peso ---
    // Al acelerar, el peso va atrás (reduce agarre delantero)
    // Al frenar, el peso va adelante (reduce agarre trasero)
    const accelWeight = clampedThrottle * this.weightTransfer;
    const brakeWeight = clampedBrake * this.weightTransfer;
    const effectiveGrip = this.grip * (1 - accelWeight * 0.3 + brakeWeight * 0.2);
    
    // --- Dirección ---
    // La velocidad angular depende de la velocidad y el giro
    const steerSensitivity = 2.5;
    const speedFactor = Math.min(1, this.speed / 100);
    this._steerAngle = clampedSteer * steerSensitivity * speedFactor;
    
    // --- Derrape ---
    this.isDrifting = drift && this.speed > 50;
    
    if (this.isDrifting) {
      // Al derrapar, el ángulo de deriva aumenta
      const driftDirection = clampedSteer !== 0 ? Math.sign(clampedSteer) : 1;
      this.driftAngle += driftDirection * this.driftFactor * dt * 3;
      this.driftAngle *= 0.95; // Decaimiento del derrape
      
      // Reduce el agarre durante el derrape
      const driftGrip = effectiveGrip * (1 - this.driftFactor);
      this.angularVelocity = this._steerAngle * driftGrip;
    } else {
      // Normal: el ángulo de deriva vuelve a cero
      this.driftAngle *= 0.9;
      this.angularVelocity = this._steerAngle * effectiveGrip;
    }
    
    // Actualizar ángulo de orientación
    this.angle += this.angularVelocity * dt;
    
    // --- Movimiento ---
    // Calcular velocidad lateral (derrape)
    const forwardX = Math.cos(this.angle);
    const forwardY = Math.sin(this.angle);
    
    // Velocidad en la dirección del coche
    const targetLateralVelocity = this.isDrifting 
      ? Math.sin(this.driftAngle) * this.speed * 0.5 
      : 0;
    
    this._lateralVelocity += (targetLateralVelocity - this._lateralVelocity) * 0.1;
    
    // Movimiento total
    const moveX = forwardX * this.speed - forwardY * this._lateralVelocity;
    const moveY = forwardY * this.speed + forwardX * this._lateralVelocity;
    
    this.x += moveX * dt;
    this.y += moveY * dt;
    
    // Normalizar ángulo
    while (this.angle > Math.PI) this.angle -= Math.PI * 2;
    while (this.angle < -Math.PI) this.angle += Math.PI * 2;
  }

  /**
   * Devuelve el estado actual del coche para renderizado
   * @returns {Object} Estado con posición, ángulo, velocidad, etc.
   */
  getState() {
    return {
      x: this.x,
      y: this.y,
      angle: this.angle,
      speed: this.speed,
      driftAngle: this.driftAngle,
      isDrifting: this.isDrifting,
      width: this.width,
      height: this.height,
      // Para efectos visuales
      steerAngle: this._steerAngle,
      lateralVelocity: this._lateralVelocity
    };
  }

  /**
   * Aplica colisión con otro coche
   * @param {CarPhysics} other - Otro coche
   * @returns {boolean} true si hubo colisión
   */
  applyCollision(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Radio de colisión (aproximado)
    const collisionRadius = (this.width + other.width) / 2;
    
    if (distance < collisionRadius && distance > 0) {
      // Normalizar dirección de colisión
      const nx = dx / distance;
      const ny = dy / distance;
      
      // Separar coches
      const overlap = collisionRadius - distance;
      this.x += nx * overlap * 0.5;
      this.y += ny * overlap * 0.5;
      other.x -= nx * overlap * 0.5;
      other.y -= ny * overlap * 0.5;
      
      // Intercambiar velocidades (colisión elástica simplificada)
      const avgSpeed = (this.speed + other.speed) / 2;
      this.speed = avgSpeed * 0.8;
      other.speed = avgSpeed * 0.8;
      
      // Reducir ángulo de deriva
      this.driftAngle *= 0.5;
      other.driftAngle *= 0.5;
      
      return true;
    }
    
    return false;
  }

  /**
   * Reinicia el coche a una posición y estado inicial
   * @param {number} x - Posición X
   * @param {number} y - Posición Y
   * @param {number} [angle=0] - Ángulo inicial
   */
  reset(x, y, angle = 0) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 0;
    this.driftAngle = 0;
    this.isDrifting = false;
    this.angularVelocity = 0;
    this._steerAngle = 0;
    this._lateralVelocity = 0;
  }
}

// Asignación a API global
if (typeof window !== 'undefined') {
  window.GAME = window.GAME || {};
  window.GAME.Physics = window.GAME.Physics || {};
  window.GAME.Physics.CarPhysics = CarPhysics;
}
