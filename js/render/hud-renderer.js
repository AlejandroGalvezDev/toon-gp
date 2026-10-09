// js/render/hud-renderer.js — GAME.Render.HUDRenderer (HUD cartoon)
window.GAME = window.GAME || {};
GAME.Render = GAME.Render || {};

GAME.Render.HUDRenderer = class HUDRenderer {
  constructor() {
    this.fontMain = '"Arial Black", Arial, sans-serif';
  }

  drawSpeedometer(ctx, x, y, r, speed, maxSpeed) {
    ctx.save();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#222';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    ctx.fill();
    const frac = Math.min(speed / maxSpeed, 1);
    const startA = Math.PI * 0.75;
    const endA = startA + frac * Math.PI * 1.5;
    ctx.lineWidth = 8;
    ctx.strokeStyle = frac > 0.85 ? '#e74c3c' : frac > 0.6 ? '#f39c12' : '#2ecc71';
    ctx.beginPath();
    ctx.arc(x, y, r, startA, endA);
    ctx.stroke();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(endA) * r * 0.85, y + Math.sin(endA) * r * 0.85);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = `bold ${Math.floor(r * 0.45)}px ${this.fontMain}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(speed), x, y);
    ctx.restore();
  }

  drawCountdown(ctx, w, h, step) {
    // step: 3, 2, 1, 0 (=GO!)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = step > 0 ? String(step) : 'GO!';
    const color = step > 0 ? '#f1c40f' : '#2ecc71';
    const size = step > 0 ? 120 : 160;
    ctx.font = `bold ${size}px ${this.fontMain}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#222';
    ctx.strokeText(label, w / 2, h / 2);
    ctx.fillStyle = color;
    ctx.fillText(label, w / 2, h / 2);
    ctx.restore();
  }

  drawLapTime(ctx, w, h, current, best, diff) {
    ctx.save();
    ctx.font = `bold 22px ${this.fontMain}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    const x = w - 20, y = 30;
    const fmt = (t) => {
      if (t == null || isNaN(t)) return '--:--.---';
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      const ms = Math.floor((t * 1000) % 1000);
      return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
    };
    const lines = [
      ['VUELTA', fmt(current), '#fff'],
      ['MEJOR', fmt(best), '#f1c40f'],
      ['DIFF', (diff >= 0 ? '+' : '') + diff.toFixed(3), diff <= 0 ? '#2ecc71' : '#e74c3c']
    ];
    lines.forEach(([label, val, col], i) => {
      const yy = y + i * 30;
      ctx.fillStyle = '#fff';
      ctx.strokeText(label, x, yy);
      ctx.fillText(label, x, yy);
      ctx.fillStyle = col;
      ctx.strokeText(val, x + 90, yy);
      ctx.fillText(val, x + 90, yy);
    });
    ctx.restore();
  }

  drawPosition(ctx, w, h, pos, total) {
    ctx.save();
    ctx.font = `bold 28px ${this.fontMain}`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#222';
    ctx.fillStyle = '#f1c40f';
    const txt = `POS ${pos}/${total}`;
    ctx.strokeText(txt, 20, 40);
    ctx.fillText(txt, 20, 40);
    ctx.restore();
  }

  drawMinimap(ctx, w, h, trackPoints, playerPos, playerAngle) {
    const size = 120;
    const ox = w - size - 15, oy = h - size - 15;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(ox - 5, oy - 5, size + 10, size + 10);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox - 5, oy - 5, size + 10, size + 10);
    if (!trackPoints || trackPoints.length === 0) { ctx.restore(); return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of trackPoints) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const pad = 10;
    const sc = Math.min((size - pad * 2) / (maxX - minX || 1), (size - pad * 2) / (maxY - minY || 1));
    const tx = (p) => ox + pad + (p.x - minX) * sc;
    const ty = (p) => oy + pad + (p.y - minY) * sc;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    trackPoints.forEach((p, i) => { i === 0 ? ctx.moveTo(tx(p), ty(p)) : ctx.lineTo(tx(p), ty(p)); });
    ctx.closePath();
    ctx.stroke();
    if (playerPos) {
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(tx(playerPos), ty(playerPos), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  render(ctx, w, h, state) {
    if (state) this.drawRaceHUD(ctx, w, h, state);
  }

  drawRaceHUD(ctx, w, h, state) {
    // state: { speed, maxSpeed, lapTime, bestLap, diff, position, totalCars, trackPoints, playerPos, playerAngle }
    this.drawSpeedometer(ctx, 90, h - 90, 70, state.speed || 0, state.maxSpeed || 300);
    this.drawLapTime(ctx, w, h, state.lapTime, state.bestLap, state.diff);
    this.drawPosition(ctx, w, h, state.position || 1, state.totalCars || 8);
    this.drawMinimap(ctx, w, h, state.trackPoints, state.playerPos, state.playerAngle);
  }
};
