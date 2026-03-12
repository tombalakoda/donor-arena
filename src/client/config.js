import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';

/** Shared font family string — Alkhemikal font with monospace fallback */
export const UI_FONT = "'Alkhemikal', monospace";

/** Audio volume helpers — read from localStorage with sensible defaults */
export function getMusicVolume() {
  if (localStorage.getItem('soundMuted') === 'true') return 0;
  return parseFloat(localStorage.getItem('musicVolume') ?? '0.35');
}
export function getSfxVolume() {
  if (localStorage.getItem('soundMuted') === 'true') return 0;
  return parseFloat(localStorage.getItem('sfxVolume') ?? '0.5');
}

export const TIPS = [
  'Sağ tıkla buzda yürü',
  'Q / W / E / R ile hünerlerini göster',
  'Meydanın içinde kal!',
  'Dükkânda hünerlerini pişir',
  'Rakibi meydandan aşağı düşür!',
  'Buz zemini: yolunu iyi hesapla!',
  'Sert vuruş seni uçurur',
];

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
