/**
 * ArenaRenderer.js — Handles all arena rendering: floor tiles, obstacles,
 * decorations, edge masks, and grid overlays.
 *
 * Extracted from GameScene.js to reduce monolith size.
 */

import { ARENA } from '../../shared/constants.js';

export class ArenaRenderer {
  /**
   * @param {Phaser.Scene} scene - The GameScene instance
   */
  constructor(scene) {
    this.scene = scene;
    this.arenaMaps = {};            // sparse map: mapIndex → mapData
    this._loadingMaps = new Set();  // track in-flight map fetches
    this.currentMapIndex = -1;
    this.obstacleSprites = [];
    this.arenaTexture = null;
  }

  // Map IDs sorted numerically — must match server's loadMaps() order
  // so that mapIndex 0 → map1, mapIndex 22 → map23, mapIndex 23 → map25, etc.
  static MAP_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,25,26,27,28,29];

  // --- Main Entry ---

  createArena() {
    const s = this.scene;

    // Map1 was preloaded in BootScene — cache it
    const map1 = s.cache.json.get('arena-map-1');
    if (map1) this.arenaMaps[0] = map1; // mapIndex 0 = map1

    // Use map1 for shared floor/decorations
    const mapData = map1 || s.cache.json.get('arena-map');
    if (mapData && mapData.floor && mapData.floor.tiles && mapData.floor.tiles.length > 0) {
      this._createArenaFromMap(mapData);
    } else {
      this._createArenaProceduralFallback();
    }
  }

  // --- Map-based Arena ---

  _createArenaFromMap(mapData) {
    const s = this.scene;
    const texSize = ARENA.FLOOR_SIZE + 800;
    const texHalf = texSize / 2;

    // --- RenderTexture for static floor ---
    const rt = s.add.renderTexture(0, 0, texSize, texSize);
    rt.setOrigin(0.5);
    rt.setDepth(0);

    // Step 1: Fill entire texture with white
    rt.fill(0xFFFFFF);

    // Step 2: Stamp map tiles on top (centered within the larger texture)
    const mapOffset = (texSize - ARENA.FLOOR_SIZE) / 2;
    const stampSprite = s.make.sprite({ x: 0, y: 0, key: 'tile-floor', frame: 0, add: false });
    stampSprite.setOrigin(0);
    let currentTileset = 'tile-floor';
    for (const tile of mapData.floor.tiles) {
      if (tile.tileset !== currentTileset) {
        currentTileset = tile.tileset;
        stampSprite.setTexture(currentTileset, tile.frame);
      } else {
        stampSprite.setFrame(tile.frame);
      }
      rt.draw(stampSprite, mapOffset + tile.col * 16, mapOffset + tile.row * 16);
    }
    stampSprite.destroy();

    // Step 3: Subtle grid overlay
    this._drawGridOverlay(rt, texSize, texHalf);

    this.arenaTexture = rt;

    // Step 4: Place decorations from map data
    if (mapData.decorations && mapData.decorations.length > 0) {
      this._createDecorationsFromMap(mapData.decorations);
    }

    // Step 5: Dynamic ring graphics (owned by HUDManager)
    s.hudManager.ringGraphics = s.add.graphics();
    s.hudManager.ringGraphics.setDepth(1);
    s.hudManager.outerRingGraphics = s.add.graphics();
    s.hudManager.outerRingGraphics.setDepth(1);
    s.hudManager.lastDrawnRingRadius = -1;

    // Aim indicator graphics (world-space, below spells)
    s.indicatorGraphics = s.add.graphics().setDepth(3);
  }

  _createDecorationsFromMap(decorations) {
    const s = this.scene;
    const half = ARENA.FLOOR_SIZE / 2;
    for (const dec of decorations) {
      const scale = dec.scale || 3;
      const alpha = dec.alpha || 0.65;
      const worldX = dec.x - half;
      const worldY = dec.y - half;
      const sprite = s.add.sprite(worldX, worldY, dec.tileset, dec.frame);
      sprite.setScale(scale);
      sprite.setOrigin(0.5, 0.5);
      sprite.setAlpha(alpha);
      sprite.setDepth(2);
    }
  }

  // --- Obstacles ---

  createObstaclesFromMap(obstacles) {
    const s = this.scene;
    const half = ARENA.FLOOR_SIZE / 2;
    this.obstacleSprites = [];

    const TYPE_TINTS = {
      breakable: 0xddaa44,
      bouncer:   0x44ff88,
      explosive: 0xff4444,
    };

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      const worldX = obs.x - half;
      const worldY = obs.y - half;
      const scale = obs.scale || 2.25;
      const radius = obs.radius || 24;
      const type = obs.type || 'normal';

      const shadow = s.add.ellipse(worldX, worldY + 4, radius * 2, radius, 0x000000, 0.3);
      shadow.setDepth(4);

      const sprite = s.add.sprite(worldX, worldY, obs.tileset, obs.frame);
      sprite.setScale(scale);
      sprite.setOrigin(0.5, 0.5);
      sprite.setDepth(5);

      const tint = TYPE_TINTS[type];
      if (tint) sprite.setTint(tint);

      if (type === 'bouncer') {
        s.tweens.add({
          targets: sprite,
          scaleX: scale * 1.08,
          scaleY: scale * 1.08,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      this.obstacleSprites.push({ sprite, shadow, mapIndex: i, type });
    }
  }

  /**
   * Swap obstacle visuals for a new round's map.
   * Lazy-loads the map JSON if not already cached.
   */
  loadObstaclesForMap(mapIndex) {
    const s = this.scene;

    // Destroy existing obstacles
    for (const obs of this.obstacleSprites) {
      if (obs.sprite && !obs.sprite.destroyed) obs.sprite.destroy();
      if (obs.shadow && !obs.shadow.destroyed) obs.shadow.destroy();
    }
    this.obstacleSprites = [];

    this.currentMapIndex = mapIndex;

    // Already cached — use it immediately
    if (this.arenaMaps[mapIndex]) {
      const mapData = this.arenaMaps[mapIndex];
      if (mapData.obstacles && mapData.obstacles.length > 0) {
        this.createObstaclesFromMap(mapData.obstacles);
      }
      return;
    }

    // Need to lazy-load this map
    const mapFileId = ArenaRenderer.MAP_IDS[mapIndex];
    if (mapFileId === undefined || this._loadingMaps.has(mapIndex)) return;

    this._loadingMaps.add(mapIndex);
    const cacheKey = `arena-map-${mapFileId}`;

    // Check if Phaser already has it cached (e.g. map1 from boot)
    const cached = s.cache.json.get(cacheKey);
    if (cached) {
      this.arenaMaps[mapIndex] = cached;
      this._loadingMaps.delete(mapIndex);
      if (cached.obstacles && cached.obstacles.length > 0) {
        this.createObstaclesFromMap(cached.obstacles);
      }
      return;
    }

    // Fetch map JSON on demand
    s.load.json(cacheKey, `assets/maps/map${mapFileId}.json`);
    s.load.once(`filecomplete-json-${cacheKey}`, () => {
      const data = s.cache.json.get(cacheKey);
      this._loadingMaps.delete(mapIndex);
      if (!data) return;
      this.arenaMaps[mapIndex] = data;
      if (this.currentMapIndex === mapIndex && data.obstacles && data.obstacles.length > 0) {
        this.createObstaclesFromMap(data.obstacles);
      }
    });
    s.load.start();
  }

  /**
   * Handle obstacle destruction events from server.
   */
  handleObstacleEvent(data) {
    if (!data || !data.destroyed) return;
    const s = this.scene;

    for (const evt of data.destroyed) {
      const idx = this.obstacleSprites.findIndex(o => o.mapIndex === evt.mapIndex);
      if (idx === -1) continue;

      const obs = this.obstacleSprites[idx];
      const x = obs.sprite ? obs.sprite.x : evt.x;
      const y = obs.sprite ? obs.sprite.y : evt.y;

      if (obs.sprite && !obs.sprite.destroyed) obs.sprite.destroy();
      if (obs.shadow && !obs.shadow.destroyed) obs.shadow.destroy();
      this.obstacleSprites.splice(idx, 1);

      if (evt.type === 'explosive') {
        const explosionRadius = evt.explosionRadius || 120;

        if (s.anims.exists('fx-explosion-play')) {
          const explosion = s.add.sprite(x, y, 'fx-explosion');
          explosion.setScale(explosionRadius / 20);
          explosion.setDepth(16);
          explosion.play({ key: 'fx-explosion-play', repeat: 0 });
          explosion.once('animationcomplete', () => explosion.destroy());
        }

        if (s.anims.exists('fx-circular-slash-play')) {
          const ring = s.add.sprite(x, y, 'fx-circular-slash');
          ring.setTint(0xff4444);
          ring.setScale(1);
          ring.setDepth(15);
          ring.setAlpha(0.8);
          ring.play({ key: 'fx-circular-slash-play', repeat: 0 });
          s.tweens.add({
            targets: ring,
            scaleX: explosionRadius / 16, scaleY: explosionRadius / 16,
            alpha: 0,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => ring.destroy(),
          });
        }
      } else {
        if (s.anims.exists('fx-smoke-circular-play')) {
          const puff = s.add.sprite(x, y, 'fx-smoke-circular');
          puff.setTint(0xddaa44);
          puff.setScale(3);
          puff.setDepth(15);
          puff.play({ key: 'fx-smoke-circular-play', repeat: 0 });
          puff.once('animationcomplete', () => puff.destroy());
        }

        const rockKey = 'fx-particle-rock';
        const rockTex = s.textures.exists(rockKey) ? s.textures.get(rockKey) : null;
        const rockFrames = rockTex ? Math.max(1, rockTex.frameTotal - 1) : 0;
        if (rockFrames > 0) {
          for (let i = 0; i < 5; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 30;
            const frame = Math.floor(Math.random() * rockFrames);
            const debris = s.add.sprite(x, y, rockKey, frame);
            debris.setScale(1.5 + Math.random());
            debris.setDepth(15);
            debris.setAlpha(0.8);
            s.tweens.add({
              targets: debris,
              x: x + Math.cos(angle) * dist,
              y: y + Math.sin(angle) * dist,
              alpha: 0,
              scaleX: 0.5,
              scaleY: 0.5,
              duration: 300 + Math.random() * 200,
              ease: 'Quad.easeOut',
              onComplete: () => debris.destroy(),
            });
          }
        }
      }
    }
  }

  // --- Rendering Helpers ---

  _drawGridOverlay(rt, size, half) {
    const s = this.scene;
    const grid = s.make.graphics({ x: 0, y: 0, add: false });
    const radius = ARENA.RADIUS;
    const gridSpacing = 64;

    grid.lineStyle(1, 0xffffff, 0.05);
    for (let x = 0; x <= size; x += gridSpacing) {
      const dx = x - half;
      if (Math.abs(dx) > radius) continue;
      const yExtent = Math.sqrt(radius * radius - dx * dx);
      grid.lineBetween(x, half - yExtent, x, half + yExtent);
    }
    for (let y = 0; y <= size; y += gridSpacing) {
      const dy = y - half;
      if (Math.abs(dy) > radius) continue;
      const xExtent = Math.sqrt(radius * radius - dy * dy);
      grid.lineBetween(half - xExtent, y, half + xExtent, y);
    }

    grid.lineStyle(1, 0xffffff, 0.1);
    grid.lineBetween(half - 20, half, half + 20, half);
    grid.lineBetween(half, half - 20, half, half + 20);
    rt.draw(grid);
    grid.destroy();
  }

  // --- Procedural Fallback ---

  _createArenaProceduralFallback() {
    const s = this.scene;
    const radius = ARENA.RADIUS;
    const TILE_SCALE = 2;
    const TILE_SIZE = 16 * TILE_SCALE;
    const texSize = ARENA.FLOOR_SIZE + 800;
    const texHalf = texSize / 2;

    const rt = s.add.renderTexture(0, 0, texSize, texSize);
    rt.setOrigin(0.5);
    rt.setDepth(0);

    const COLS = 22;
    const iceFillFrames = [
      22 * COLS + 1, 22 * COLS + 1, 22 * COLS + 1,
      22 * COLS + 5, 22 * COLS + 6, 22 * COLS + 9,
      21 * COLS + 5, 21 * COLS + 9,
      23 * COLS + 5, 23 * COLS + 9,
    ];

    let rngSeed = 42;
    const nextRng = () => {
      rngSeed = (rngSeed * 16807 + 0) % 2147483647;
      return (rngSeed & 0x7fffffff) / 0x7fffffff;
    };

    rt.fill(0xFFFFFF);

    const totalTiles = Math.ceil(texSize / TILE_SIZE);
    const stampTile = s.make.sprite({ x: 0, y: 0, key: 'tile-floor', frame: 0, add: false });
    stampTile.setScale(TILE_SCALE);
    stampTile.setOrigin(0);

    for (let ty = 0; ty < totalTiles; ty++) {
      for (let tx = 0; tx < totalTiles; tx++) {
        const cx = tx * TILE_SIZE + TILE_SIZE / 2;
        const cy = ty * TILE_SIZE + TILE_SIZE / 2;
        const dx = cx - texHalf;
        const dy = cy - texHalf;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < radius + TILE_SIZE * 0.3) {
          const frame = iceFillFrames[Math.floor(nextRng() * iceFillFrames.length)];
          stampTile.setFrame(frame);
          rt.draw(stampTile, tx * TILE_SIZE, ty * TILE_SIZE);
        } else {
          nextRng();
        }
      }
    }
    stampTile.destroy();

    this._drawGridOverlay(rt, texSize, texHalf);

    this.arenaTexture = rt;

    this._createArenaDecorations();

    s.hudManager.ringGraphics = s.add.graphics();
    s.hudManager.ringGraphics.setDepth(1);
    s.hudManager.outerRingGraphics = s.add.graphics();
    s.hudManager.outerRingGraphics.setDepth(1);
    s.hudManager.lastDrawnRingRadius = -1;

    if (s.indicatorGraphics && !s.indicatorGraphics.destroyed) s.indicatorGraphics.destroy();
    s.indicatorGraphics = s.add.graphics().setDepth(3);
  }

  _createArenaDecorations() {
    const s = this.scene;
    const PROP_SCALE = 3;
    const radius = ARENA.RADIUS;
    const COLS = 24;

    const PROPS = [
      { frames: [[13*COLS+10]], w: 1, h: 1, weight: 5 },
      { frames: [[12*COLS+10]], w: 1, h: 1, weight: 4 },
      { frames: [[12*COLS+11]], w: 1, h: 1, weight: 3 },
      { frames: [[13*COLS+11]], w: 1, h: 1, weight: 3 },
      { frames: [[0*COLS+8, 0*COLS+9]], w: 2, h: 1, weight: 5 },
      { frames: [[0*COLS+10, 0*COLS+11]], w: 2, h: 1, weight: 5 },
      { frames: [[2*COLS+8, 2*COLS+9]], w: 2, h: 1, weight: 4 },
    ];

    let rng = 54321;
    const nextRng = () => {
      rng = (rng * 16807) % 2147483647;
      return (rng & 0x7fffffff) / 0x7fffffff;
    };

    const weighted = [];
    for (const prop of PROPS) {
      for (let i = 0; i < prop.weight; i++) weighted.push(prop);
    }

    const numProps = 22;
    const innerR = radius - 10;
    const outerR = radius + 50;
    const placed = [];
    const minDist = 90;

    for (let i = 0; i < numProps; i++) {
      const angle = (i / numProps) * Math.PI * 2 + nextRng() * 0.25;
      const r = innerR + nextRng() * (outerR - innerR);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      let tooClose = false;
      for (const pp of placed) {
        const ddx = pp.x - x, ddy = pp.y - y;
        if (Math.sqrt(ddx * ddx + ddy * ddy) < minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;
      placed.push({ x, y });

      const prop = weighted[Math.floor(nextRng() * weighted.length)];
      const container = s.add.container(x, y);
      container.setDepth(2);

      const tileRendered = 16 * PROP_SCALE;
      const offsetX = -(prop.w * tileRendered) / 2;
      const offsetY = -(prop.h * tileRendered) / 2;

      for (let row = 0; row < prop.h; row++) {
        for (let col = 0; col < prop.w; col++) {
          const frame = prop.frames[row][col];
          const sprite = s.add.sprite(
            offsetX + col * tileRendered,
            offsetY + row * tileRendered,
            'tile-nature',
            frame
          );
          sprite.setScale(PROP_SCALE);
          sprite.setOrigin(0, 0);
          sprite.setAlpha(0.65);
          container.add(sprite);
        }
      }
    }
  }
}
