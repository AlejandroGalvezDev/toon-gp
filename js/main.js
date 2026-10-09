// js/main.js — Punto de entrada del juego Toon GP
(function () {
  'use strict';

  function boot() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) {
      console.error('[Toon GP] No se encontró #game-canvas');
      return;
    }

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    const game = new GAME.Core.Game(canvas);
    game.start();

    // Debug
    window.__game = game;
    console.log('[Toon GP] Listo. Usa window.__game para depurar.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
