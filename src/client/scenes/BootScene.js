import Phaser from 'phaser';
import { TIPS } from '../config.js';

const PS2P = "'Press Start 2P', cursive";
const WHITE = '#ffffff';

// Character IDs and their folder names
export const CHARACTERS = [
  { id: 'boy', folder: 'Boy', name: 'Cevheri' },
  { id: 'ninja-green', folder: 'NinjaGreen', name: 'Gövel Ayşe' },
  { id: 'ninja-red', folder: 'NinjaRed', name: 'Ateş Fatma' },
  { id: 'knight', folder: 'Knight', name: 'Top Can' },
  { id: 'eskimo', folder: 'Eskimo', name: 'Aybars' },
  { id: 'demon-red', folder: 'DemonRed', name: 'Cin' },
  { id: 'mask-racoon', folder: 'MaskRacoon', name: 'Kemal' },
  { id: 'fighter-white', folder: 'FighterWhite', name: 'Boran' },
];

// Animation names mapped to their spritesheet files
// Walk: 64x64 (4 cols x 4 rows, 16x16 frames) - columns = directions, rows = animation frames
//   col0=down, col1=up, col2=left, col3=right
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

// Walk.png column-to-direction mapping (columns = directions, rows = anim frames)
// Phaser frame indices: frame = col + row*4 (4 columns per row)
const WALK_DIR_FRAMES = {
  down:  [0, 4, 8, 12],   // column 0
  up:    [1, 5, 9, 13],   // column 1
  left:  [2, 6, 10, 14],  // column 2
  right: [3, 7, 11, 15],  // column 3
};

// Idle/Attack direction mapping (single row: col0=down, col1=left, col2=right, col3=up)
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

const FX_SLASH = {
  'circular-slash': { file: 'SlashFx/CircularSlash/SpriteSheet.png', frameW: 32, frameH: 32 },
  'slash':          { file: 'SlashFx/Slash/SpriteSheet.png',         frameW: 32, frameH: 32 },
  'slash-double':   { file: 'SlashFx/SlashDouble/SpriteSheet.png',   frameW: 32, frameH: 32 },
};

const FX_SMOKE = {
  'smoke-circular': { file: 'Smoke/SmokeCircular/SpriteSheet.png', frameW: 16, frameH: 14 },
};

const FX_PARTICLES = {
  'particle-snow':  { file: 'Particle/Snow.png',  frameW: 8,  frameH: 8 },
  'particle-fire':  { file: 'Particle/Fire.png',   frameW: 12, frameH: 12 },
  'particle-spark': { file: 'Particle/Spark.png',  frameW: 10, frameH: 8 },
  'particle-rock':  { file: 'Particle/Rock.png',   frameW: 16, frameH: 16 },
};


export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    // Dark background
    cam.setBackgroundColor('#0d1520');

    // --- Logo ---
    // Logo is loaded inline (before other assets) so it shows during loading
    this.load.image('ui-logo', 'assets/ui/logo.png');
    this.load.once('filecomplete-image-ui-logo', () => {
      // Native: 1270x649, display at ~450px wide (keeps aspect ratio)
      const logoW = 450;
      const logoH = Math.round(logoW * (649 / 1270));
      this.add.image(cx, cy - 110, 'ui-logo')
        .setDisplaySize(logoW, logoH).setOrigin(0.5);
    });
    this.load.start(); // kick off logo load immediately

    this.add.text(cx, cy - 55, 'Meydana hazırlan...', {
      fontFamily: PS2P,
      fontSize: '10px',
      fill: WHITE,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0.7);

    // --- Progress Bar ---
    const barW = 340;
    const barH = 24;
    const barX = cx - barW / 2;
    const barY = cy - barH / 2;

    const progressBox = this.add.graphics();
    // Outer glow
    progressBox.lineStyle(2, 0xb8e4f0, 0.3);
    progressBox.strokeRoundedRect(barX - 4, barY - 4, barW + 8, barH + 8, 6);
    // Inner background
    progressBox.fillStyle(0x0a1520, 0.9);
    progressBox.fillRoundedRect(barX, barY, barW, barH, 4);

    const progressBar = this.add.graphics();

    const percentText = this.add.text(cx, cy + 24, '0%', {
      fontFamily: PS2P,
      fontSize: '10px',
      fill: WHITE,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // --- Rotating Tips ---
    const tipText = this.add.text(cx, cy + 70, TIPS[0], {
      fontFamily: PS2P,
      fontSize: '8px',
      fill: WHITE,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0.5);

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
      progressBar.fillStyle(0xb8e4f0, 1);
      progressBar.fillRoundedRect(barX + 2, barY + 2, (barW - 4) * value, barH - 4, 3);
      // Bright highlight on top half
      progressBar.fillStyle(0xddeeff, 0.3);
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
      this._watchdogId = setTimeout(watchdog, 200);
    };
    this._watchdogId = setTimeout(watchdog, 500);

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
    for (const [name, fx] of Object.entries(FX_SLASH)) {
      this.load.spritesheet(`fx-${name}`,
        `assets/fx/${fx.file}`,
        { frameWidth: fx.frameW, frameHeight: fx.frameH }
      );
    }
    for (const [name, fx] of Object.entries(FX_SMOKE)) {
      this.load.spritesheet(`fx-${name}`,
        `assets/fx/${fx.file}`,
        { frameWidth: fx.frameW, frameHeight: fx.frameH }
      );
    }
    for (const [name, fx] of Object.entries(FX_PARTICLES)) {
      this.load.spritesheet(`fx-${name}`,
        `assets/fx/${fx.file}`,
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

    // --- Load Arena Maps ---
    // Only load map1 (for shared floor/decorations) + fallback at boot.
    // Other maps are lazy-loaded per round in GameScene to speed up initial load.
    this.load.json('arena-map-1', 'assets/maps/map1.json');
    this.load.json('arena-map', 'assets/maps/arena-default.json');

    // --- Shop panel assets ---
    this.load.image('ui-shop-panel', 'assets/ui/panel1.png');
    this.load.image('ui-shop-card',  'assets/ui/cardasset.png');
    this.load.spritesheet('ui-shop-btn', 'assets/ui/buttonssheet.png', {
      frameWidth: 173, frameHeight: 76,
    });
    this.load.image('ui-shop-btn-wide', 'assets/ui/buton3.png');
    // New icy shop assets
    this.load.image('ui-panel2', 'assets/ui/panel2.png');
    this.load.spritesheet('ui-frame-icy', 'assets/ui/frames.png', {
      frameWidth: 111, frameHeight: 138,
    });
    this.load.spritesheet('ui-frame-icy2', 'assets/ui/frames2.png', {
      frameWidth: 111, frameHeight: 138,
    });

    // --- Load UI (Ninja Adventure – Theme Wood kit) ---
    this.load.image('ui-panel',           'assets/ui/theme-wood/nine_path_panel.png');
    this.load.image('ui-button',          'assets/ui/theme-wood/button_normal.png');
    this.load.image('ui-button-hover',    'assets/ui/theme-wood/button_hover.png');
    this.load.image('ui-button-pressed',  'assets/ui/theme-wood/button_pressed.png');
    this.load.image('ui-inventory-cell',  'assets/ui/theme-wood/inventory_cell.png');
    this.load.image('ui-heart',           'assets/ui/receptacle/Heart.png');
    this.load.image('ui-panel-2',         'assets/ui/theme-wood/nine_path_panel_2.png');
    this.load.image('ui-panel-3',         'assets/ui/theme-wood/nine_path_panel_3.png');
    this.load.image('ui-bg',              'assets/ui/theme-wood/nine_path_bg.png');
    this.load.image('ui-bg-2',            'assets/ui/theme-wood/nine_path_bg_2.png');
    this.load.image('ui-panel-interior',  'assets/ui/theme-wood/nine_path_panel_interior.png');
    this.load.image('ui-focus',           'assets/ui/theme-wood/nine_path_focus.png');
    this.load.image('ui-scroll',          'assets/ui/theme-wood/nine_path_panel_3.png');
    this.load.image('ui-slider-progress', 'assets/ui/theme-wood/slider_progress.png');
    this.load.image('ui-tab',             'assets/ui/theme-wood/tab_selected.png');
    this.load.image('ui-button-disabled', 'assets/ui/theme-wood/button_disabled.png');
    this.load.image('ui-tab-unselected',  'assets/ui/theme-wood/tab_unselected.png');
    this.load.image('ui-nameplate',       'assets/ui/theme-wood/nine_path_panel_2.png');
    this.load.image('ui-title-bar',       'assets/ui/theme-wood/nine_path_panel_interior.png');
    this.load.image('ui-panel-disabled',  'assets/ui/theme-wood/nine_path_panel_disabled.png');

    // --- Arrow navigation sprites ---
    this.load.image('ui-arrow-left',       'assets/ui/theme-wood/arrow_left.png');
    this.load.image('ui-arrow-left-hover', 'assets/ui/theme-wood/arrow_left_hover.png');
    this.load.image('ui-arrow-right',      'assets/ui/theme-wood/arrow_right.png');
    this.load.image('ui-arrow-right-hover','assets/ui/theme-wood/arrow_right_hover.png');

    // --- Keyboard key sprites (for spell slot keybind hints) ---
    this.load.image('key-Q', 'assets/ui/keys/KeyQ.png');
    this.load.image('key-W', 'assets/ui/keys/KeyW.png');
    this.load.image('key-E', 'assets/ui/keys/KeyE.png');
    this.load.image('key-R', 'assets/ui/keys/KeyR.png');

    // --- Receptacle & Dialog assets ---
    this.load.image('ui-lifebar-fill',    'assets/ui/receptacle/LifeBarMiniProgress.png');
    this.load.image('ui-lifebar-bg',      'assets/ui/receptacle/LifeBarMiniUnder.png');
    this.load.image('ui-sphere-bg',       'assets/ui/receptacle/sphere/BackgroundWood.png');
    this.load.image('ui-sphere-mana',     'assets/ui/receptacle/sphere/ProgressMana.png');
    this.load.image('ui-sphere-over',     'assets/ui/receptacle/sphere/Over.png');
    this.load.image('ui-dialog-info',     'assets/ui/dialog/DialogInfo.png');
    this.load.image('ui-icon-heart',      'assets/ui/receptacle/IconHeart.png');
    this.load.image('menu-bg', 'assets/ui/menu-bg.png');
    this.load.image('ui-logo', 'assets/ui/logo.png');
    this.load.image('ui-panel0', 'assets/ui/panel0.png');

    // --- Load Spell Icons ---
    const spellIcons = [
      'BookFire', 'BookIce', 'BookRock', 'BookThunder',
      'BookPlant', 'BookLight', 'BookDarkness', 'BookDeath',
      'BookWind',
      'Fireball', 'Explosion', 'Mist',
      'Upgrade', 'Permutation',
      'OrbLight', 'Cut', 'Necromancy', 'Vision', 'WaterCanon',
      'DefenseUpgrade', 'Alchemy', 'AttackUpgrade', 'MagicWeapon',
      'Death', 'Camouflage', 'Counter',
    ];
    for (const icon of spellIcons) {
      const path = `assets/ui/skill-icons/spell/${icon}.png`;
      const pathOff = `assets/ui/skill-icons/spell/${icon}Disabled.png`;
      this.load.image(`spell-${icon}`, path);
      this.load.image(`spell-${icon}-off`, pathOff);
    }

    // --- HUD toggle icons ---
    this.load.image('icon-sound-on', 'assets/ui/icon-sound-on.png');
    this.load.image('icon-sound-off', 'assets/ui/icon-sound-off.png');
    this.load.image('icon-scoreboard', 'assets/ui/icon-scoreboard.png');

    // --- Crafting / Item system icons ---
    // Material icons (16x16 pixel art)
    this.load.image('mat-buz',      'assets/ui/items/mat-buz.png');
    this.load.image('mat-koz',      'assets/ui/items/mat-koz.png');
    this.load.image('mat-agir',     'assets/ui/items/mat-agir.png');
    this.load.image('mat-telek',    'assets/ui/items/mat-telek.png');
    this.load.image('mat-demir',    'assets/ui/items/mat-demir.png');
    this.load.image('mat-kehribar', 'assets/ui/items/mat-kehribar.png');
    this.load.image('mat-altin',    'assets/ui/items/mat-altin.png');
    this.load.image('mat-gam',      'assets/ui/items/mat-gam.png');
    // Slot icons
    this.load.image('slot-saz',     'assets/ui/items/slot-saz.png');
    this.load.image('slot-yadigar', 'assets/ui/items/slot-yadigar.png');
    this.load.image('slot-pabuc',   'assets/ui/items/slot-pabuc.png');
    // Misc item UI
    this.load.image('icon-ocak',    'assets/ui/items/icon-ocak.png');
    this.load.image('icon-nazar',   'assets/ui/items/icon-nazar.png');

    // --- Custom spell icons ---
    this.load.image('icon-mani', 'assets/ui/icon-mani.png');
    this.load.image('icon-devir', 'assets/ui/icon-devir.png');
    this.load.image('icon-karsilama', 'assets/ui/icon-karsilama.png');
    this.load.image('icon-sallama', 'assets/ui/icon-sallama.png');
    this.load.image('icon-bade', 'assets/ui/icon-bade.png');
    this.load.image('icon-baglama', 'assets/ui/icon-baglama.png');
    this.load.image('icon-beddua', 'assets/ui/icon-beddua.png');
    this.load.image('icon-celme', 'assets/ui/icon-celme.png');
    this.load.image('icon-gayb', 'assets/ui/icon-gayb.png');
    this.load.image('icon-giybet', 'assets/ui/icon-giybet.png');
    this.load.image('icon-hasret', 'assets/ui/icon-hasret.png');
    this.load.image('icon-kosma', 'assets/ui/icon-kosma.png');
    this.load.image('icon-nazar', 'assets/ui/icon-nazar.png');
    this.load.image('icon-segirtme', 'assets/ui/icon-segirtme.png');
    this.load.image('icon-sitem', 'assets/ui/icon-sitem.png');
    this.load.image('icon-uzunhava', 'assets/ui/icon-uzunhava.png');
    this.load.image('icon-cekim', 'assets/ui/icon-cekim.png');
    this.load.image('icon-sacma', 'assets/ui/icon-sacma.png');
    this.load.image('icon-sema', 'assets/ui/icon-sema.png');
    this.load.image('icon-rabita', 'assets/ui/icon-rabita.png');
    this.load.image('icon-kement', 'assets/ui/icon-kement.png');

    // --- Custom spell FX spritesheets ---
    this.load.spritesheet('fx-shuriken', 'assets/fx/custom/Shuriken.png',
      { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('fx-fireball-display', 'assets/fx/custom/Fireball.png',
      { frameWidth: 16, frameHeight: 16 });
    this.load.image('fx-kunai', 'assets/fx/custom/BigKunai.png');
    this.load.spritesheet('fx-canonball', 'assets/fx/custom/CanonBall.png',
      { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('fx-canonball-bade', 'assets/fx/custom/CanonBallBade.png',
      { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('fx-swap-poof', 'assets/fx/custom/SwapPoof.png',
      { frameWidth: 16, frameHeight: 14 });
    this.load.spritesheet('fx-shuriken-magic', 'assets/fx/custom/ShurikenMagic.png',
      { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('fx-magicball', 'assets/fx/custom/magicball.png',
      { frameWidth: 25, frameHeight: 30 });
    this.load.spritesheet('fx-giybet', 'assets/fx/custom/giybet.png',
      { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('fx-puf', 'assets/fx/custom/puf.png',
      { frameWidth: 40, frameHeight: 40 });

    // --- Load Audio ---
    // Menu SFX
    this.load.audio('sfx-accept', 'assets/audio/sfx/Menu/Accept.wav');
    this.load.audio('sfx-cancel', 'assets/audio/sfx/Menu/Cancel.wav');
    this.load.audio('sfx-move', 'assets/audio/sfx/Menu/Move1.wav');
    // Jingles
    this.load.audio('jingle-success', 'assets/audio/jingles/Success1.wav');
    this.load.audio('jingle-gameover', 'assets/audio/jingles/GameOver.wav');
    this.load.audio('jingle-levelup', 'assets/audio/jingles/LevelUp1.wav');
    // Shield activation SFX
    this.load.audio('sfx-shield', 'assets/audio/sfx/magic/Magic3.wav');
    // Ring damage SFX
    this.load.audio('sfx-ring-burn', 'assets/audio/sfx/Elemental/Fire2.wav');
    // Spell cast SFX
    this.load.audio('sfx-fireball', 'assets/audio/sfx/Elemental/Fireball.wav');
    this.load.audio('sfx-blink', 'assets/audio/sfx/whoosh/Whoosh.wav');
    this.load.audio('sfx-dash', 'assets/audio/sfx/whoosh/Launch.wav');
    this.load.audio('sfx-ice', 'assets/audio/sfx/Elemental/Water1.wav');
    this.load.audio('sfx-hook', 'assets/audio/sfx/whoosh/Slash.wav');
    this.load.audio('sfx-lightning', 'assets/audio/sfx/Elemental/Explosion.wav');
    this.load.audio('sfx-meteor', 'assets/audio/sfx/Elemental/Explosion3.wav');
    this.load.audio('sfx-homing', 'assets/audio/sfx/magic/Magic1.wav');
    this.load.audio('sfx-swap', 'assets/audio/sfx/magic/Magic2.wav');
    this.load.audio('sfx-flash', 'assets/audio/sfx/magic/Spirit.wav');
    this.load.audio('sfx-ghost', 'assets/audio/sfx/magic/Strange.wav');
    this.load.audio('sfx-recall', 'assets/audio/sfx/magic/Fx.wav');
    this.load.audio('sfx-wall', 'assets/audio/sfx/Elemental/Water10.wav');
    this.load.audio('sfx-bouncer', 'assets/audio/sfx/bounce/Bounce.wav');
    this.load.audio('sfx-rocket', 'assets/audio/sfx/whoosh/Whoosh2.wav');
    // --- Crafting / Item system SFX ---
    this.load.audio('sfx-craft',            'assets/audio/sfx/crafting/craft.wav');
    this.load.audio('sfx-discover-recipe',  'assets/audio/sfx/crafting/discover-recipe.wav');
    this.load.audio('sfx-discover-hazine',  'assets/audio/sfx/crafting/discover-hazine.wav');
    this.load.audio('sfx-hazine-activate',  'assets/audio/sfx/crafting/hazine-activate.wav');
    this.load.audio('sfx-material-drop',    'assets/audio/sfx/crafting/material-drop.wav');
    this.load.audio('sfx-equip',            'assets/audio/sfx/crafting/equip.wav');
    this.load.audio('sfx-unequip',          'assets/audio/sfx/crafting/unequip.wav');
    this.load.audio('sfx-disassemble',      'assets/audio/sfx/crafting/disassemble.wav');
    this.load.audio('sfx-nazar-spend',      'assets/audio/sfx/crafting/nazar-spend.wav');
    this.load.audio('sfx-stash-full',       'assets/audio/sfx/crafting/stash-full.wav');

    // Background music (single track for menu + fight)
    this.load.audio('music-menu', 'assets/audio/music/mesnoremix.mp3');
    this.load.audio('music-fight', 'assets/audio/music/mesnoremix.mp3');
  }

  create() {
    if (this._sceneStarted) return;
    this._sceneStarted = true;
    if (this._watchdogId) { clearTimeout(this._watchdogId); this._watchdogId = null; }

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
      // Walk animations (4 directions, 4 frames each — column-based)
      for (const dir of Object.keys(WALK_DIR_FRAMES)) {
        this.anims.create({
          key: `${char.id}-walk-${dir}`,
          frames: WALK_DIR_FRAMES[dir].map(f => ({ key: `${char.id}-walk`, frame: f })),
          frameRate: 8,
          repeat: -1,
        });
      }

      // Spin animation for knockback (cycles through direction poses clockwise)
      this.anims.create({
        key: `${char.id}-spin`,
        frames: [
          { key: `${char.id}-walk`, frame: 0 },  // down
          { key: `${char.id}-walk`, frame: 3 },  // right
          { key: `${char.id}-walk`, frame: 1 },  // up
          { key: `${char.id}-walk`, frame: 2 },  // left
        ],
        frameRate: 16,
        repeat: -1,
      });

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

    // Slash FX animations
    for (const [name] of Object.entries(FX_SLASH)) {
      const key = `fx-${name}`;
      const texture = this.textures.get(key);
      if (texture && texture.frameTotal > 1) {
        this.anims.create({
          key: `${key}-play`,
          frames: this.anims.generateFrameNumbers(key, {
            start: 0,
            end: texture.frameTotal - 2,
          }),
          frameRate: 14,
          repeat: 0,
        });
      }
    }

    // Smoke FX animations
    for (const [name] of Object.entries(FX_SMOKE)) {
      const key = `fx-${name}`;
      const texture = this.textures.get(key);
      if (texture && texture.frameTotal > 1) {
        this.anims.create({
          key: `${key}-play`,
          frames: this.anims.generateFrameNumbers(key, {
            start: 0,
            end: texture.frameTotal - 2,
          }),
          frameRate: 16,
          repeat: 0,
        });
      }
    }

    // Custom spell FX animations
    const customFx = ['shuriken', 'fireball-display', 'canonball', 'canonball-bade', 'swap-poof', 'shuriken-magic', 'magicball', 'giybet', 'puf'];
    for (const name of customFx) {
      const key = `fx-${name}`;
      const texture = this.textures.get(key);
      if (texture && texture.frameTotal > 1) {
        this.anims.create({
          key: `${key}-play`,
          frames: this.anims.generateFrameNumbers(key, {
            start: 0,
            end: texture.frameTotal - 2,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }
    }
  }
}
