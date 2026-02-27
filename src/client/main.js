import Phaser from 'phaser';
import { gameConfig } from './config.js';

// Prevent right-click context menu on the game canvas
document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'CANVAS') {
    e.preventDefault();
  }
});

// Guard against multiple Phaser instances from Vite module re-evaluation
if (!window.__game) {
  const game = new Phaser.Game(gameConfig);
  window.__game = game;

  // Fallback game loop for hidden tabs where rAF is throttled to 0.
  // Uses Web Worker to avoid Chrome's timer throttling for background tabs.
  const workerBlob = new Blob([`
    let running = false;
    let interval = null;
    self.onmessage = (e) => {
      if (e.data === 'start') {
        if (interval) clearInterval(interval);
        running = true;
        interval = setInterval(() => { if (running) self.postMessage('tick'); }, 50);
      } else if (e.data === 'stop') {
        running = false;
        if (interval) { clearInterval(interval); interval = null; }
      }
    };
  `], { type: 'application/javascript' });
  const tickWorker = new Worker(URL.createObjectURL(workerBlob));
  tickWorker.onmessage = () => {
    if (document.hidden && game.loop && game.loop.running) {
      game.loop.step(performance.now());
    }
  };
  // Start/stop worker based on visibility
  document.addEventListener('visibilitychange', () => {
    tickWorker.postMessage(document.hidden ? 'start' : 'stop');
  });
  if (document.hidden) tickWorker.postMessage('start');
}
