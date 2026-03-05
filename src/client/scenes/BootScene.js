import Phaser from 'phaser';

// Character IDs and their folder names
export const CHARACTERS = [
  { id: 'boy', folder: 'Boy', name: 'Boy' },
  { id: 'ninja-green', folder: 'NinjaGreen', name: 'Green Ninja' },
  { id: 'ninja-red', folder: 'NinjaRed', name: 'Red Ninja' },
  { id: 'knight', folder: 'Knight', name: 'Knight' },
  { id: 'eskimo', folder: 'Eskimo', name: 'Eskimo' },
  { id: 'demon-red', folder: 'DemonRed', name: 'Demon' },
  { id: 'mask-racoon', folder: 'MaskRacoon', name: 'Racoon' },
  { id: 'fighter-white', folder: 'FighterWhite', name: 'Fighter' },
];

// Animation names mapped to their spritesheet files
// Walk: 64x64 (4 cols x 4 rows, 16x16 frames) - rows: down, left, right, up
// Idle: 64x16 (4 cols x 1 row) - columns: down, left, right, up
// Attack: 64x16 (4 cols x 1 row) - columns: down, left, right, up
// Dead: 16x16 (single frame)
const ANIM_SHEETS = {
  walk:    { file: 'Walk.png',    frameW: 16, frameH: 16 },
  idle:    { file: 'Idle.png',    frameW: 16, frameH: 16 },
  attack:  { file: 'Attack.png',  frameW: 16, frameH: 16 },
  dead:    { file: 'Dead.png',    frameW: 16, frameH: 16 },
  special: { file: 'Special1.png', frameW: 16, frameH: 16 },
};

// Direction row mapping for walk spritesheet (4x4)
// Row 0 = down, Row 1 = left, Row 2 = right, Row 3 = up
const DIRECTIONS = ['down', 'left', 'right', 'up'];

// FX spritesheets with their frame dimensions
const FX_ELEMENTAL = {
  explosion:  { file: 'Explosion/SpriteSheet.png',  frameW: 40, frameH: 40 },
  flam:       { file: 'Flam/SpriteSheet.png',       frameW: 30, frameH: 30 },
  ice:        { file: 'Ice/SpriteSheet.png',         frameW: 32, frameH: 32 },
  rock:       { file: 'Rock/SpriteSheet.png',        frameW: 30, frameH: 30 },
  rockspike:  { file: 'RockSpike/SpriteSheet.png',   frameW: 48, frameH: 48 },
  thunder:    { file: 'Thunder/SpriteSheet.png',     frameW: 20, frameH: 28 },
  water:      { file: 'Water/SpriteSheet.png',       frameW: 33, frameH: 33 },
  waterpillar:{ file: 'WaterPillar/SpriteSheet.png', frameW: 30, frameH: 41 },
};

const FX_MAGIC = {
  aura:       { file: 'Aura/SpriteSheet.png',              frameW: 25, frameH: 24 },
  boost:      { file: 'Boost/SpriteSheet.png',              frameW: 35, frameH: 35 },
  circle:     { file: 'Circle/SpriteSheetOrange.png',       frameW: 32, frameH: 32 },
  shield:     { file: 'Shield/SpriteSheetBlue.png',         frameW: 24, frameH: 26 },
  spark:      { file: 'Spark/SpriteSheet.png',              frameW: 30, frameH: 35 },
  spirit:     { file: 'Spirit/SpriteSheet.png',             frameW: 32, frameH: 32 },
};

// Loading screen tips
const TIPS = [
  'Right-click to move on ice',
  'Q / W / E / R to cast spells',
  'Stay inside the ring!',
  'Upgrade spells in the shop',
  'Knock enemies out of bounds!',
  'Ice physics: plan your path!',
  'Heavier hits send you flying',
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    // Dark background
    cam.setBackgroundColor('#0a0a1e');

    // --- Title ---
    this.add.text(cx, cy - 120, 'DÖNER FIGHT', {
      fontFamily: 'monospace',
      fontSize: '52px',
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(cx, cy - 75, 'Prepare for battle...', {
      fontFamily: 'monospace',
      fontSize: '14px',
      fill: '#888899',
    }).setOrigin(0.5);

    // --- Progress Bar ---
    const barW = 340;
    const barH = 24;
    const barX = cx - barW / 2;
    const barY = cy - barH / 2;

    const progressBox = this.add.graphics();
    // Outer glow
    progressBox.lineStyle(2, 0x44aadd, 0.3);
    progressBox.strokeRoundedRect(barX - 4, barY - 4, barW + 8, barH + 8, 6);
    // Inner background
    progressBox.fillStyle(0x111122, 0.9);
    progressBox.fillRoundedRect(barX, barY, barW, barH, 4);

    const progressBar = this.add.graphics();

    const percentText = this.add.text(cx, cy + 24, '0%', {
      fontFamily: 'monospace',
      fontSize: '14px',
      fill: '#44aadd',
    }).setOrigin(0.5);

    // --- Rotating Tips ---
    const tipText = this.add.text(cx, cy + 70, TIPS[0], {
      fontFamily: 'monospace',
      fontSize: '12px',
      fill: '#666688',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    let tipIndex = 0;
    const tipTimer = setInterval(() => {
      tipIndex = (tipIndex + 1) % TIPS.length;
      if (tipText && tipText.active) {
        tipText.setText(TIPS[tipIndex]);
      }
    }, 2500);

    // --- Progress Callback ---
    this.load.on('progress', (value) => {
      progressBar.clear();
      // Main fill
      progressBar.fillStyle(0x44aadd, 1);
      progressBar.fillRoundedRect(barX + 2, barY + 2, (barW - 4) * value, barH - 4, 3);
      // Bright highlight on top half
      progressBar.fillStyle(0x88ddff, 0.3);
      progressBar.fillRoundedRect(barX + 2, barY + 2, (barW - 4) * value, (barH - 4) / 2, 3);

      percentText.setText(`${Math.round(value * 100)}%`);
    });

    this.load.on('complete', () => {
      clearInterval(tipTimer);
      progressBar.destroy();
      progressBox.destroy();
      percentText.destroy();
      tipText.destroy();
      this._loadComplete = true;
    });

    // Watchdog: keep loader alive when tab is hidden (rAF throttled)
    this._loadComplete = false;
    this._sceneStarted = false;
    const watchdog = () => {
      if (this._sceneStarted) return;
      const loader = this.load;
      // Kick stalled loader
      if (!this._loadComplete && loader.list.size > 0 && loader.inflight.size === 0 && loader.state === 1) {
        loader.checkLoadQueue();
      }
      // If load is done but create() hasn't fired (rAF frozen), transition manually
      if (this._loadComplete && !this._sceneStarted) {
        this._sceneStarted = true;
        this.createAnimations();
        this.scene.start('MenuScene');
        return;
      }
      setTimeout(watchdog, 200);
    };
    setTimeout(watchdog, 500);

    // --- Load Character Spritesheets ---
    for (const char of CHARACTERS) {
      for (const [animName, sheet] of Object.entries(ANIM_SHEETS)) {
        const key = `${char.id}-${animName}`;
        this.load.spritesheet(key,
          `assets/characters/${char.folder}/${sheet.file}`,
          { frameWidth: sheet.frameW, frameHeight: sheet.frameH }
        );
      }
      // Faceset portrait
      this.load.image(`${char.id}-face`, `assets/characters/${char.folder}/Faceset.png`);
    }

    // --- Load FX Spritesheets ---
    for (const [name, fx] of Object.entries(FX_ELEMENTAL)) {
      this.load.spritesheet(`fx-${name}`,
        `assets/fx/elemental/${fx.file}`,
        { frameWidth: fx.frameW, frameHeight: fx.frameH }
      );
    }
    for (const [name, fx] of Object.entries(FX_MAGIC)) {
      this.load.spritesheet(`fx-${name}`,
        `assets/fx/magic/${fx.file}`,
        { frameWidth: fx.frameW, frameHeight: fx.frameH }
      );
    }

    // --- Load Tiles (as spritesheets for individual tile access) ---
    this.load.spritesheet('tile-floor', 'assets/tiles/TilesetFloor.png', {
      frameWidth: 16, frameHeight: 16,
    });
    this.load.spritesheet('tile-nature', 'assets/tiles/TilesetNature.png', {
      frameWidth: 16, frameHeight: 16,
    });
    this.load.spritesheet('tile-dungeon', 'assets/tiles/TilesetDungeon.png', {
      frameWidth: 16, frameHeight: 16,
    });
    this.load.spritesheet('tile-element', 'assets/tiles/TilesetElement.png', {
      frameWidth: 16, frameHeight: 16,
    });

    // --- Load Arena Maps (hand-designed in editor.html) ---
    // Load all arena variants for per-round obstacle rotation
    for (let i = 0; i <= 9; i++) {
      this.load.json(`arena-map-${i}`, `assets/maps/arena${i}.json`);
    }
    // Fallback default map
    this.load.json('arena-map', 'assets/maps/arena-default.json');

    // --- Load UI ---
    this.load.image('ui-panel', 'assets/ui/theme-wood/nine_path_panel.png');
    this.load.image('ui-button', 'assets/ui/theme-wood/button_normal.png');
    this.load.image('ui-button-hover', 'assets/ui/theme-wood/button_hover.png');
    this.load.image('ui-button-pressed', 'assets/ui/theme-wood/button_pressed.png');
    this.load.image('ui-inventory-cell', 'assets/ui/theme-wood/inventory_cell.png');
    this.load.image('ui-heart', 'assets/ui/receptacle/Heart.png');
    // Additional UI for menu overhaul
    this.load.image('ui-panel-2', 'assets/ui/theme-wood/nine_path_panel_2.png');
    this.load.image('ui-panel-3', 'assets/ui/theme-wood/nine_path_panel_3.png');
    this.load.image('ui-bg', 'assets/ui/theme-wood/nine_path_bg.png');
    this.load.image('ui-bg-2', 'assets/ui/theme-wood/nine_path_bg_2.png');
    this.load.image('ui-panel-interior', 'assets/ui/theme-wood/nine_path_panel_interior.png');
    this.load.image('ui-focus', 'assets/ui/theme-wood/nine_path_focus.png');
    this.load.image('ui-scroll', 'assets/ui/receptacle/rectangle/BackgroundScroll.png');
    this.load.image('ui-slider-progress', 'assets/ui/theme-wood/slider_progress.png');
    this.load.image('ui-tab', 'assets/ui/theme-wood/tab_selected.png');
    this.load.image('ui-button-disabled', 'assets/ui/theme-wood/button_disabled.png');
    this.load.image('ui-tab-unselected', 'assets/ui/theme-wood/tab_unselected.png');

    // --- Load Spell Icons ---
    const spellIcons = [
      'BookFire', 'BookIce', 'BookRock', 'BookThunder',
      'BookPlant', 'BookLight', 'BookDarkness', 'BookDeath',
      'BookWind',
      'Fireball', 'Explosion', 'Mist',
      'Upgrade', 'Permutation',
    ];
    for (const icon of spellIcons) {
      const path = `assets/ui/skill-icons/spell/${icon}.png`;
      const pathOff = `assets/ui/skill-icons/spell/${icon}Disabled.png`;
      this.load.image(`spell-${icon}`, path);
      this.load.image(`spell-${icon}-off`, pathOff);
    }

    // --- Load Audio ---
    // Menu SFX
    this.load.audio('sfx-accept', 'assets/audio/sfx/Menu/Accept.wav');
    this.load.audio('sfx-cancel', 'assets/audio/sfx/Menu/Cancel.wav');
    this.load.audio('sfx-move', 'assets/audio/sfx/Menu/Move1.wav');
    // Jingles
    this.load.audio('jingle-success', 'assets/audio/jingles/Success1.wav');
    this.load.audio('jingle-gameover', 'assets/audio/jingles/GameOver.wav');
    this.load.audio('jingle-levelup', 'assets/audio/jingles/LevelUp1.wav');
    // Menu music
    this.load.audio('music-menu', 'assets/audio/music/4 - Village.ogg');
    // Fight music
    this.load.audio('music-fight', 'assets/audio/music/17 - Fight.ogg');
  }

  create() {
    if (this._sceneStarted) return;
    this._sceneStarted = true;

    // Restore sound mute preference
    const muted = localStorage.getItem('soundMuted') === 'true';
    this.sound.mute = muted;

    this.createAnimations();
    // Fade out then transition to menu
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('MenuScene');
    });
  }

  createAnimations() {
    for (const char of CHARACTERS) {
      // Walk animations (4 directions, 4 frames each)
      for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
        const dir = DIRECTIONS[dirIdx];
        this.anims.create({
          key: `${char.id}-walk-${dir}`,
          frames: this.anims.generateFrameNumbers(`${char.id}-walk`, {
            start: dirIdx * 4,
            end: dirIdx * 4 + 3,
          }),
          frameRate: 8,
          repeat: -1,
        });
      }

      // Idle animations (1 frame per direction, columns: down, left, right, up)
      for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
        const dir = DIRECTIONS[dirIdx];
        this.anims.create({
          key: `${char.id}-idle-${dir}`,
          frames: [{ key: `${char.id}-idle`, frame: dirIdx }],
          frameRate: 1,
          repeat: 0,
        });
      }

      // Attack animations (1 frame per direction)
      for (let dirIdx = 0; dirIdx < DIRECTIONS.length; dirIdx++) {
        const dir = DIRECTIONS[dirIdx];
        this.anims.create({
          key: `${char.id}-attack-${dir}`,
          frames: [{ key: `${char.id}-attack`, frame: dirIdx }],
          frameRate: 8,
          repeat: 0,
        });
      }

      // Dead animation (single frame)
      this.anims.create({
        key: `${char.id}-dead`,
        frames: [{ key: `${char.id}-dead`, frame: 0 }],
        frameRate: 1,
        repeat: 0,
      });
    }

    // FX animations
    for (const [name, fx] of Object.entries(FX_ELEMENTAL)) {
      const key = `fx-${name}`;
      const texture = this.textures.get(key);
      if (texture && texture.frameTotal > 1) {
        this.anims.create({
          key: `${key}-play`,
          frames: this.anims.generateFrameNumbers(key, {
            start: 0,
            end: texture.frameTotal - 2, // -2 because frameTotal includes __BASE
          }),
          frameRate: 12,
          repeat: 0,
        });
      }
    }

    for (const [name, fx] of Object.entries(FX_MAGIC)) {
      const key = `fx-${name}`;
      const texture = this.textures.get(key);
      if (texture && texture.frameTotal > 1) {
        this.anims.create({
          key: `${key}-play`,
          frames: this.anims.generateFrameNumbers(key, {
            start: 0,
            end: texture.frameTotal - 2,
          }),
          frameRate: 12,
          repeat: 0,
        });
      }
    }
  }
}
