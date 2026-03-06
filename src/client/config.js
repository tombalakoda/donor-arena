import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';

/** Shared font family string — KiwiSoda pixel font with monospace fallback */
export const UI_FONT = "'KiwiSoda', monospace";

export const gameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#ffffff',    // Pure white — matches snow tiles beyond the arena
  pixelArt: true,                  // Nearest-neighbor filtering for all sprites
  antialias: false,                // Crisp pixel art rendering
  disableVisibilityChange: true,   // Keep running when tab is not visible
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      debug: false,                // Set true to see physics bodies
      setBounds: false,            // We manage arena bounds ourselves
    },
  },
  loader: {
    maxParallelDownloads: 12,
  },
  scene: [BootScene, MenuScene, GameScene],
  dom: {
    createContainer: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    mouse: {
      preventDefaultDown: false,   // Allow right-click
      preventDefaultUp: false,
      preventDefaultMove: false,
    },
  },
};
