import { PLAYER } from '../../shared/constants.js';
import { SPELLS, SPELL_TYPES } from '../../shared/spellData.js';

export class SpellVisualManager {
  constructor(scene) {
    this.scene = scene;
    this.spellVisuals = new Map();
    this.pendingSpellCasts = [];
  }

  handleSpellCast(data) {
    if (this.spellVisuals.has(data.id)) return;
    if (this.pendingSpellCasts.some(p => p.id === data.id)) return;
    this.pendingSpellCasts.push(data);
  }

  processPending() {
    while (this.pendingSpellCasts.length > 0) {
      const spell = this.pendingSpellCasts.shift();
      this.createSpellVisual(spell);
    }
  }

  // --- Spawn / Death burst helpers ---

  _spawnBurst(x, y, color) {
    const ring = this.scene.add.circle(x, y, 4, color, 0.6);
    ring.setDepth(17);
    this.scene.tweens.add({
      targets: ring,
      radius: 18,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  _deathBurst(x, y, color) {
    const ring = this.scene.add.circle(x, y, 6, color, 0.5);
    ring.setDepth(17);
    this.scene.tweens.add({
      targets: ring,
      radius: 22,
      alpha: 0,
      duration: 250,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  createSpellVisual(spell) {
    const def = SPELLS[spell.type];
    if (!def) return;

    const effectiveType = spell.spellType || def.type;
    const scene = this.scene;

    // Play cast sound from spell definition
    const castFx = def.fx || {};
    if (castFx.sound && scene.cache.audio.exists(castFx.sound)) {
      scene.sound.play(castFx.sound, { volume: 0.15 });
    }

    const visual = {
      type: effectiveType,
      lifetime: spell.lifetime || 2000,
      elapsed: 0,
      ownerId: spell.ownerId,
    };

    switch (effectiveType) {
      case SPELL_TYPES.PROJECTILE: {
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-flam';
        const animKey = fx.animKey || 'fx-flam-play';
        const scale = fx.scale || 1.5;
        const color = fx.color || 0xff4400;
        const glowColor = fx.glowColor || color;

        const glow = scene.add.circle(spell.x, spell.y, (spell.radius || 5) + 6, glowColor, 0.25);
        glow.setDepth(15);

        const sprite = scene.add.sprite(spell.x, spell.y, spriteKey);
        sprite.setScale(scale);
        sprite.setDepth(16);
        sprite.play({ key: animKey, repeat: -1 });

        const angle = Math.atan2(spell.vy || 0, spell.vx || 0);
        sprite.setRotation(angle);

        // Particle trail
        const trail = scene.add.particles(0, 0, spriteKey, {
          follow: sprite,
          frequency: 40,
          lifespan: 200,
          scale: { start: scale * 0.5, end: 0 },
          alpha: { start: 0.4, end: 0 },
          blendMode: 'ADD',
          depth: 14,
        });

        visual.sprite = sprite;
        visual.glow = glow;
        visual.trail = trail;
        visual.glowColor = glowColor;
        // Store velocity per-tick (server units) for extrapolation
        visual.vx = spell.vx || 0;
        visual.vy = spell.vy || 0;
        visual.serverX = spell.x;
        visual.serverY = spell.y;

        this._spawnBurst(spell.x, spell.y, glowColor);
        break;
      }

      case SPELL_TYPES.BLINK: {
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-spirit';
        const animKey = fx.animKey || 'fx-spirit-play';
        const scale = fx.scale || 2;
        const color = fx.color || 0x44ddff;

        const departure = scene.add.sprite(spell.x, spell.y, spriteKey);
        departure.setScale(scale);
        departure.setDepth(16);
        departure.setAlpha(0.9);
        departure.play({ key: animKey, repeat: 0 });

        const destX = spell.targetX || spell.x;
        const destY = spell.targetY || spell.y;
        const arrival = scene.add.sprite(destX, destY, spriteKey);
        arrival.setScale(scale);
        arrival.setDepth(16);
        arrival.setAlpha(0.9);
        arrival.play({ key: animKey, repeat: 0 });

        const trail = scene.add.graphics();
        trail.setDepth(14);
        trail.lineStyle(3, color, 0.6);
        trail.beginPath();
        trail.moveTo(spell.x, spell.y);
        trail.lineTo(destX, destY);
        trail.strokePath();

        visual.sprite = departure;
        visual.arrival = arrival;
        visual.trail = trail;
        visual.lifetime = spell.lifetime || 300;
        break;
      }

      case SPELL_TYPES.DASH: {
        const dashColor = 0xffaa33;
        const dashSprite = 'fx-boost';
        const dashAnim = 'fx-boost-play';

        const destX = spell.targetX || spell.x;
        const destY = spell.targetY || spell.y;

        const trail = scene.add.graphics();
        trail.setDepth(14);
        trail.lineStyle(14, dashColor, 0.15);
        trail.beginPath();
        trail.moveTo(spell.x, spell.y);
        trail.lineTo(destX, destY);
        trail.strokePath();
        trail.lineStyle(6, dashColor, 0.7);
        trail.beginPath();
        trail.moveTo(spell.x, spell.y);
        trail.lineTo(destX, destY);
        trail.strokePath();

        const arrival = scene.add.sprite(destX, destY, dashSprite);
        arrival.setScale(2.5);
        arrival.setDepth(16);
        arrival.setAlpha(0.95);
        arrival.setTint(dashColor);
        arrival.play({ key: dashAnim, repeat: 0 });

        visual.sprite = arrival;
        visual.trail = trail;
        visual.lifetime = spell.lifetime || 400;
        break;
      }

      case SPELL_TYPES.HOOK: {
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-rock';
        const animKey = fx.animKey || 'fx-rock-play';
        const scale = fx.scale || 1.5;
        const chainColor = fx.chainColor || 0xaaaaaa;

        const sprite = scene.add.sprite(spell.x, spell.y, spriteKey);
        sprite.setScale(scale);
        sprite.setDepth(16);
        sprite.play({ key: animKey, repeat: -1 });

        const hookAngle = Math.atan2(spell.vy || 0, spell.vx || 0);
        sprite.setRotation(hookAngle);

        const chain = scene.add.graphics();
        chain.setDepth(14);

        visual.originX = spell.x;
        visual.originY = spell.y;
        visual.chainColor = chainColor;
        visual.sprite = sprite;
        visual.chain = chain;
        visual.hooked = false;
        visual.vx = spell.vx || 0;
        visual.vy = spell.vy || 0;
        visual.serverX = spell.x;
        visual.serverY = spell.y;
        break;
      }

      case SPELL_TYPES.ZONE: {
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-ice';
        const animKey = fx.animKey || 'fx-ice-play';
        const color = fx.color || 0x44ddff;
        const zoneRadius = spell.radius || 35;

        if (spell.isMeteor) {
          // Meteor: start with pulsing warning circle, explode on impact
          const warning = scene.add.circle(spell.x, spell.y, 5, 0xff2200, 0.15);
          warning.setDepth(5);
          warning.setStrokeStyle(2, 0xff4400, 0.6);
          visual.zone = warning;
          visual.sprite = warning; // placeholder for cleanup
          visual.isMeteor = true;
          visual.meteorRadius = zoneRadius;
          visual.impactDelay = spell.impactDelay || 1000;
          visual.impactTriggered = false;
          visual.baseAlpha = 0.15;
        } else {
          const zone = scene.add.circle(spell.x, spell.y, zoneRadius, color, 0.2);
          zone.setDepth(5);
          zone.setStrokeStyle(1.5, color, 0.6);

          const sprite = scene.add.sprite(spell.x, spell.y, spriteKey);
          sprite.setScale((zoneRadius / 16) * 0.8);
          sprite.setDepth(6);
          sprite.setAlpha(0.7);
          sprite.play({ key: animKey, repeat: -1 });

          visual.zone = zone;
          visual.sprite = sprite;
          visual.baseAlpha = 0.2;
        }
        break;
      }

      case SPELL_TYPES.WALL: {
        const wall = scene.add.rectangle(
          spell.x, spell.y,
          spell.width || 80,
          spell.height || 20,
          0x886644, 0.9
        );
        wall.setDepth(10);
        wall.setRotation(spell.angle || 0);
        wall.setStrokeStyle(2, 0xaa8866, 1);
        visual.sprite = wall;
        break;
      }

      case SPELL_TYPES.INSTANT: {
        const ring = scene.add.circle(spell.x, spell.y, spell.radius || 75, 0xffdd44, 0.3);
        ring.setDepth(5);
        ring.setStrokeStyle(3, 0xffee66, 0.8);
        ring.isFilled = false;
        visual.sprite = ring;
        visual.lifetime = spell.lifetime || 500;
        break;
      }

      case SPELL_TYPES.BUFF: {
        const fx = def.fx || {};
        const buffType = spell.buffType || 'flash';
        visual.followOwner = true;
        visual.ownerId = spell.ownerId;
        visual.buffType = buffType;

        if (buffType === 'shield') {
          const bubble = scene.add.circle(spell.x, spell.y, PLAYER.RADIUS + 8, 0x44aaff, 0.15);
          bubble.setDepth(4);
          bubble.setStrokeStyle(2.5, 0x88ccff, 0.7);
          visual.sprite = bubble;
          // Animated shield sprite on top
          const shieldSpriteKey = fx.sprite || 'fx-shield';
          const shieldAnimKey = fx.animKey || 'fx-shield-play';
          const shieldScale = (fx.scale || 1.5) * 1.8;
          if (scene.anims.exists(shieldAnimKey)) {
            const shieldFx = scene.add.sprite(spell.x, spell.y, shieldSpriteKey);
            shieldFx.setDepth(5);
            shieldFx.setScale(shieldScale);
            shieldFx.setAlpha(0.6);
            shieldFx.play({ key: shieldAnimKey, repeat: -1 });
            visual.glow = shieldFx;
            visual._baseGlowScale = shieldScale;
          }
          // Shield activation sound
          if (scene.sound && scene.cache.audio.exists('sfx-shield')) {
            scene.sound.play('sfx-shield', { volume: 0.4 });
          }
        } else if (buffType === 'ghost') {
          const ghostGlow = scene.add.circle(spell.x, spell.y, PLAYER.RADIUS + 6, 0xaabbff, 0.12);
          ghostGlow.setDepth(4);
          ghostGlow.setStrokeStyle(2, 0xccddff, 0.5);
          visual.sprite = ghostGlow;
          const spriteKey = fx.sprite || 'fx-spirit';
          const animKey = fx.animKey || 'fx-spirit-play';
          if (scene.anims.exists(animKey)) {
            const ghostFx = scene.add.sprite(spell.x, spell.y, spriteKey);
            ghostFx.setDepth(5);
            ghostFx.setScale((fx.scale || 1.5) * 1.5);
            ghostFx.setAlpha(0.35);
            ghostFx.play({ key: animKey, repeat: -1 });
            visual.glow = ghostFx;
          }
        } else {
          const flashGlow = scene.add.circle(spell.x, spell.y, PLAYER.RADIUS + 5, 0xffdd00, 0.2);
          flashGlow.setDepth(4);
          flashGlow.setStrokeStyle(2, 0xffee44, 0.6);
          visual.sprite = flashGlow;
          const spriteKey = fx.sprite || 'fx-boost';
          const animKey = fx.animKey || 'fx-boost-play';
          if (scene.anims.exists(animKey)) {
            const flashFx = scene.add.sprite(spell.x, spell.y, spriteKey);
            flashFx.setDepth(5);
            flashFx.setScale((fx.scale || 1.0) * 1.5);
            flashFx.setAlpha(0.5);
            flashFx.play({ key: animKey, repeat: -1 });
            visual.glow = flashFx;
          }
        }
        break;
      }

      case SPELL_TYPES.SWAP: {
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-spirit';
        const animKey = fx.animKey || 'fx-spirit-play';
        const scale = fx.scale || 0.9;
        const glowColor = fx.glowColor || 0xdd88ff;

        if (scene.anims.exists(animKey)) {
          const swapSprite = scene.add.sprite(spell.x, spell.y, spriteKey);
          swapSprite.setDepth(15);
          swapSprite.setScale(scale * 2);
          swapSprite.play({ key: animKey, repeat: -1 });
          // Initial rotation to face travel direction
          const angle = Math.atan2(spell.vy || 0, spell.vx || 0);
          swapSprite.setRotation(angle);
          visual.sprite = swapSprite;
        } else {
          visual.sprite = scene.add.circle(spell.x, spell.y, spell.radius || 7, fx.color || 0xcc44ff, 0.8);
          visual.sprite.setDepth(15);
        }

        const swapGlow = scene.add.circle(spell.x, spell.y, (spell.radius || 7) + 6, glowColor, 0.3);
        swapGlow.setDepth(14);
        visual.glow = swapGlow;
        visual.glowColor = glowColor;

        // Particle trail
        const swapTrailKey = scene.anims.exists(animKey) ? spriteKey : null;
        if (swapTrailKey) {
          const trail = scene.add.particles(0, 0, swapTrailKey, {
            follow: visual.sprite,
            frequency: 40,
            lifespan: 200,
            scale: { start: scale * 0.5, end: 0 },
            alpha: { start: 0.4, end: 0 },
            blendMode: 'ADD',
            depth: 14,
          });
          visual.trail = trail;
        }

        // Velocity for extrapolation
        visual.vx = spell.vx || 0;
        visual.vy = spell.vy || 0;
        visual.serverX = spell.x;
        visual.serverY = spell.y;

        this._spawnBurst(spell.x, spell.y, glowColor);
        break;
      }

      case SPELL_TYPES.RECALL: {
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-circle';
        const animKey = fx.animKey || 'fx-circle-play';
        const scale = fx.scale || 1.0;
        const recallColor = fx.color || 0x44ddff;

        const departPoof = scene.add.circle(spell.targetX || spell.x, spell.targetY || spell.y, 20, recallColor, 0.5);
        departPoof.setDepth(5);
        visual.sprite = departPoof;

        const arrivalPoof = scene.add.circle(spell.x, spell.y, 20, recallColor, 0.5);
        arrivalPoof.setDepth(5);
        visual.arrival = arrivalPoof;

        if (scene.anims.exists(animKey)) {
          const recallFx = scene.add.sprite(spell.x, spell.y, spriteKey);
          recallFx.setDepth(6);
          recallFx.setScale(scale * 2);
          recallFx.play({ key: animKey, repeat: 0 });
          visual.glow = recallFx;
        }

        visual.lifetime = spell.lifetime || 800;
        break;
      }

      case SPELL_TYPES.HOMING: {
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-flam';
        const animKey = fx.animKey || 'fx-flam-play';
        const scale = fx.scale || 0.8;
        const glowColor = fx.glowColor || 0xff8844;

        if (scene.anims.exists(animKey)) {
          const homingSprite = scene.add.sprite(spell.x, spell.y, spriteKey);
          homingSprite.setDepth(15);
          homingSprite.setScale(scale * 1.5);
          homingSprite.play({ key: animKey, repeat: -1 });
          // Initial rotation
          const angle = Math.atan2(spell.vy || 0, spell.vx || 0);
          homingSprite.setRotation(angle);
          visual.sprite = homingSprite;
        } else {
          visual.sprite = scene.add.circle(spell.x, spell.y, spell.radius || 7, fx.color || 0xff4400, 0.8);
          visual.sprite.setDepth(15);
        }

        const homingGlow = scene.add.circle(spell.x, spell.y, (spell.radius || 7) + 3, glowColor, 0.3);
        homingGlow.setDepth(14);
        visual.glow = homingGlow;
        visual.glowColor = glowColor;

        // Particle trail
        if (scene.anims.exists(animKey)) {
          const trail = scene.add.particles(0, 0, spriteKey, {
            follow: visual.sprite,
            frequency: 40,
            lifespan: 200,
            scale: { start: scale * 0.5, end: 0 },
            alpha: { start: 0.4, end: 0 },
            blendMode: 'ADD',
            depth: 14,
          });
          visual.trail = trail;
        }

        // Velocity for extrapolation
        visual.vx = spell.vx || 0;
        visual.vy = spell.vy || 0;
        visual.serverX = spell.x;
        visual.serverY = spell.y;

        this._spawnBurst(spell.x, spell.y, glowColor);
        break;
      }

      case SPELL_TYPES.BOOMERANG: {
        const fx = def.fx || {};
        const spriteKey = fx.sprite || 'fx-rock-spike';
        const animKey = fx.animKey || 'fx-rock-spike-play';
        const scale = fx.scale || 1.0;
        const glowColor = fx.glowColor || 0xaacc66;

        if (scene.anims.exists(animKey)) {
          const boomSprite = scene.add.sprite(spell.x, spell.y, spriteKey);
          boomSprite.setDepth(15);
          boomSprite.setScale(scale * 1.5);
          boomSprite.play({ key: animKey, repeat: -1 });
          visual.sprite = boomSprite;
        } else {
          visual.sprite = scene.add.circle(spell.x, spell.y, spell.radius || 8, fx.color || 0x88aa44, 0.8);
          visual.sprite.setDepth(15);
        }

        const boomGlow = scene.add.circle(spell.x, spell.y, (spell.radius || 8) + 3, glowColor, 0.3);
        boomGlow.setDepth(14);
        visual.glow = boomGlow;
        visual.glowColor = glowColor;

        // Particle trail
        const boomTrailKey = scene.anims.exists(animKey) ? spriteKey : null;
        if (boomTrailKey) {
          const trail = scene.add.particles(0, 0, boomTrailKey, {
            follow: visual.sprite,
            frequency: 40,
            lifespan: 200,
            scale: { start: scale * 0.5, end: 0 },
            alpha: { start: 0.4, end: 0 },
            blendMode: 'ADD',
            depth: 14,
          });
          visual.trail = trail;
        }

        // Velocity for extrapolation
        visual.vx = spell.vx || 0;
        visual.vy = spell.vy || 0;
        visual.serverX = spell.x;
        visual.serverY = spell.y;
        visual.isBoomerang = true;

        this._spawnBurst(spell.x, spell.y, glowColor);
        break;
      }

      default: {
        const color = (def.fx && def.fx.color) || 0xff00ff;
        const marker = scene.add.circle(spell.x, spell.y, spell.radius || 20, color, 0.6);
        marker.setDepth(15);
        visual.sprite = marker;
        break;
      }
    }

    this.spellVisuals.set(spell.id, visual);
  }

  syncSpellVisuals(serverSpells) {
    const scene = this.scene;
    const activeIds = new Set(serverSpells.map(s => s.id));

    // Remove visuals for spells no longer on server
    for (const [id, visual] of this.spellVisuals) {
      if (!activeIds.has(id) && visual.elapsed > 200) {
        // Deactivate grappling if the removed spell was providing grappling state
        if (visual.pullSelf && visual.ownerId === scene.localPlayerId && scene.grapplingActive) {
          scene.grapplingActive = false;
          scene.moveTarget = null;
        }

        // Death burst for moving spell types
        if (visual.sprite && !visual.sprite.destroyed) {
          const movingTypes = [SPELL_TYPES.PROJECTILE, SPELL_TYPES.HOMING, SPELL_TYPES.SWAP, SPELL_TYPES.BOOMERANG];
          if (movingTypes.includes(visual.type) && visual.glowColor) {
            this._deathBurst(visual.sprite.x, visual.sprite.y, visual.glowColor);
          }
        }

        this.destroySpellVisual(visual);
        this.spellVisuals.delete(id);
      }
    }

    // Create visuals for server spells that have no client visual yet
    for (const spell of serverSpells) {
      if (!this.spellVisuals.has(spell.id) && spell.active !== false) {
        this.handleSpellCast({
          id: spell.id,
          type: spell.type,
          spellType: spell.spellType,
          ownerId: spell.ownerId,
          x: spell.x,
          y: spell.y,
          vx: spell.vx || 0,
          vy: spell.vy || 0,
          radius: spell.radius,
          lifetime: spell.lifetime,
          targetX: spell.targetX,
          targetY: spell.targetY,
          pullSelf: spell.pullSelf,
          buffType: spell.buffType || null,
        });
      }
    }

    // Update positions from server for moving spell types
    for (const spell of serverSpells) {
      const visual = this.spellVisuals.get(spell.id);
      if (!visual || !visual.sprite || visual.sprite.destroyed) continue;

      // PROJECTILE: snap to server + store velocity for extrapolation
      if (visual.type === SPELL_TYPES.PROJECTILE) {
        visual.serverX = spell.x;
        visual.serverY = spell.y;
        visual.vx = spell.vx || 0;
        visual.vy = spell.vy || 0;
        // Snap to server position on each sync tick
        visual.sprite.x = spell.x;
        visual.sprite.y = spell.y;
        if (visual.glow && !visual.glow.destroyed) {
          visual.glow.x = spell.x;
          visual.glow.y = spell.y;
        }
      } else if (visual.type === SPELL_TYPES.HOOK) {
        // Update chain origin to caster's CURRENT position
        if (spell.ownerId === scene.localPlayerId && scene.playerBody) {
          visual.originX = scene.playerBody.position.x;
          visual.originY = scene.playerBody.position.y;
        } else {
          const rp = scene.remotePlayers.get(spell.ownerId);
          if (rp) {
            visual.originX = rp.x;
            visual.originY = rp.y;
          }
        }

        if (spell.hooked && !visual.hooked) {
          visual.hooked = true;
          visual.vx = 0;
          visual.vy = 0;
        }

        visual.pullSelf = spell.pullSelf;
        visual.serverAnchorX = spell.anchorX || 0;
        visual.serverAnchorY = spell.anchorY || 0;
        visual.serverReleased = spell.released;
        visual.serverPhase = spell.phase || null;

        // Grappling hook: detect activation for local player
        if (spell.pullSelf && spell.hooked && spell.pullActive && !spell.released && spell.ownerId === scene.localPlayerId) {
          scene.grapplingActive = true;
        }
        if (spell.pullSelf && spell.ownerId === scene.localPlayerId && (spell.released || !spell.hooked || !spell.pullActive)) {
          if (scene.grapplingActive) {
            scene.grapplingActive = false;
            scene.moveTarget = null;
          }
        }

        // Snap hook to server position + store for extrapolation
        visual.serverX = spell.x;
        visual.serverY = spell.y;
        visual.vx = spell.vx || 0;
        visual.vy = spell.vy || 0;
        visual.sprite.x = spell.x;
        visual.sprite.y = spell.y;

        let chainFromX, chainFromY, chainToX, chainToY;
        let lineWidth = 3;
        let chainColor = visual.chainColor || 0xaaaaaa;
        let chainAlpha = 0.7;

        if (spell.pullSelf && spell.hooked) {
          // Grappling: chain from anchor to caster
          chainFromX = spell.anchorX || visual.sprite.x;
          chainFromY = spell.anchorY || visual.sprite.y;
          chainToX = visual.originX;
          chainToY = visual.originY;
        } else if (spell.phase === 'pull') {
          // Hook pull: chain from caster to enemy (spell.x/y tracks enemy)
          chainFromX = visual.originX;
          chainFromY = visual.originY;
          chainToX = spell.x;
          chainToY = spell.y;
          lineWidth = 4;
          chainColor = 0xdd6633; // orange tint during pull
        } else if (spell.phase === 'done' || spell.released) {
          // Hook done: fade chain out
          chainFromX = visual.originX;
          chainFromY = visual.originY;
          chainToX = spell.x;
          chainToY = spell.y;
          chainAlpha = 0.3;
        } else {
          // Flight: chain from caster to projectile
          chainFromX = visual.originX;
          chainFromY = visual.originY;
          chainToX = visual.sprite.x;
          chainToY = visual.sprite.y;
        }

        // Hide hook sprite when hooked (pull/throw phase) but not for grappling
        if (spell.hooked && !spell.released && !spell.pullSelf) {
          visual.sprite.setVisible(false);
        }
        // Grappling: hide when hooked and not released
        if (spell.pullSelf && spell.hooked && !spell.released) {
          visual.sprite.setVisible(false);
        }

        if (visual.chain && !visual.chain.destroyed) {
          visual.chain.clear();
          if (chainAlpha > 0.05) {
            visual.chain.lineStyle(lineWidth, chainColor, chainAlpha);
            visual.chain.beginPath();
            visual.chain.moveTo(chainFromX, chainFromY);
            visual.chain.lineTo(chainToX, chainToY);
            visual.chain.strokePath();
          }
        }
      }

      // SWAP, HOMING, BOOMERANG: snap to server + store velocity
      if (visual.type === SPELL_TYPES.SWAP || visual.type === SPELL_TYPES.HOMING || visual.type === SPELL_TYPES.BOOMERANG) {
        visual.serverX = spell.x;
        visual.serverY = spell.y;
        visual.vx = spell.vx || 0;
        visual.vy = spell.vy || 0;
        // Snap to server position
        visual.sprite.x = spell.x;
        visual.sprite.y = spell.y;
        if (visual.glow && !visual.glow.destroyed) {
          visual.glow.x = spell.x;
          visual.glow.y = spell.y;
        }

        // Rotate homing and swap to face travel direction
        if ((visual.type === SPELL_TYPES.HOMING || visual.type === SPELL_TYPES.SWAP) && visual.sprite && !visual.sprite.destroyed) {
          if (spell.vx || spell.vy) {
            const angle = Math.atan2(spell.vy || 0, spell.vx || 0);
            visual.sprite.setRotation(angle);
          }
        }
      }

      // BUFF: position comes from server (follows owner)
      if (visual.type === SPELL_TYPES.BUFF && visual.followOwner) {
        visual.sprite.x = spell.x;
        visual.sprite.y = spell.y;
        if (visual.glow && !visual.glow.destroyed) {
          visual.glow.x = spell.x;
          visual.glow.y = spell.y;
        }
      }
    }
  }

  update(delta) {
    const scene = this.scene;

    for (const [id, visual] of this.spellVisuals) {
      visual.elapsed += delta;

      // PROJECTILE: velocity extrapolation + drift correction
      if (visual.type === SPELL_TYPES.PROJECTILE && visual.sprite && !visual.sprite.destroyed) {
        const t = delta / 50; // server tick = 50ms
        visual.sprite.x += visual.vx * t;
        visual.sprite.y += visual.vy * t;
        // Drift correction
        visual.sprite.x += (visual.serverX - visual.sprite.x) * 0.1;
        visual.sprite.y += (visual.serverY - visual.sprite.y) * 0.1;
        // Update server prediction target
        visual.serverX += visual.vx * t;
        visual.serverY += visual.vy * t;
        // Rotation
        if (visual.vx || visual.vy) {
          visual.sprite.setRotation(Math.atan2(visual.vy, visual.vx));
        }
        // Glow offset behind travel direction
        if (visual.glow && !visual.glow.destroyed) {
          const speed = Math.sqrt(visual.vx * visual.vx + visual.vy * visual.vy) || 1;
          const offsetDist = 6;
          visual.glow.x = visual.sprite.x - (visual.vx / speed) * offsetDist;
          visual.glow.y = visual.sprite.y - (visual.vy / speed) * offsetDist;
        }
      } else if (visual.type === SPELL_TYPES.HOOK && visual.sprite && !visual.sprite.destroyed) {
        if (!visual.hooked) {
          const t = delta / 50;
          visual.sprite.x += visual.vx * t;
          visual.sprite.y += visual.vy * t;
          // Drift correction
          visual.sprite.x += (visual.serverX - visual.sprite.x) * 0.1;
          visual.sprite.y += (visual.serverY - visual.sprite.y) * 0.1;
          visual.serverX += visual.vx * t;
          visual.serverY += visual.vy * t;
        }

        // Update chain origin from current player position (for smooth 60fps tracking)
        if (visual.ownerId === scene.localPlayerId && scene.playerBody) {
          visual.originX = scene.playerBody.position.x;
          visual.originY = scene.playerBody.position.y;
        } else {
          const rp = scene.remotePlayers.get(visual.ownerId);
          if (rp) {
            visual.originX = rp.x;
            visual.originY = rp.y;
          }
        }

        // Redraw chain every frame
        if (visual.chain && !visual.chain.destroyed) {
          // Grappling released: clear chain
          if (visual.pullSelf && visual.serverReleased) {
            visual.chain.clear();
          // Hook done/released: clear chain (enemy is flying from knockback)
          } else if (!visual.pullSelf && (visual.serverPhase === 'done' || visual.serverReleased)) {
            visual.chain.clear();
          } else {
            let chainFromX, chainFromY, chainToX, chainToY;
            let lineWidth = 3;
            let chainColor = visual.chainColor || 0xaaaaaa;
            let chainAlpha = 0.7;

            if (visual.pullSelf && visual.hooked) {
              // Grappling: chain from anchor to caster
              chainFromX = visual.serverAnchorX || visual.sprite.x;
              chainFromY = visual.serverAnchorY || visual.sprite.y;
              chainToX = visual.originX;
              chainToY = visual.originY;
              lineWidth = 4;
              if (visual.ownerId === scene.localPlayerId && scene.playerBody) {
                const vel = scene.playerBody.velocity;
                const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
                const normalMax = PLAYER.SPEED * 0.05;
                if (speed > normalMax * 3) chainColor = 0xff6600;
                else if (speed > normalMax * 1.5) chainColor = 0xddaa44;
              }
            } else if (!visual.pullSelf && visual.serverPhase === 'pull') {
              // Hook pull: chain from caster to enemy, orange tint
              chainFromX = visual.originX;
              chainFromY = visual.originY;
              chainToX = visual.serverX;
              chainToY = visual.serverY;
              lineWidth = 4;
              chainColor = 0xdd6633;
            } else {
              // Flight: chain from caster to projectile
              chainFromX = visual.originX;
              chainFromY = visual.originY;
              chainToX = visual.sprite.x;
              chainToY = visual.sprite.y;
            }
            visual.chain.clear();
            visual.chain.lineStyle(lineWidth, chainColor, chainAlpha);
            visual.chain.beginPath();
            visual.chain.moveTo(chainFromX, chainFromY);
            visual.chain.lineTo(chainToX, chainToY);
            visual.chain.strokePath();
          }
        }
      } else if (visual.type === SPELL_TYPES.BLINK || visual.type === SPELL_TYPES.DASH) {
        const alpha = Math.max(0, 1 - visual.elapsed / visual.lifetime);
        if (visual.sprite && !visual.sprite.destroyed) visual.sprite.setAlpha(alpha);
        if (visual.arrival && !visual.arrival.destroyed) visual.arrival.setAlpha(alpha);
        if (visual.trail && !visual.trail.destroyed) visual.trail.setAlpha(alpha);
      } else if (visual.type === SPELL_TYPES.ZONE) {
        if (visual.isMeteor && visual.zone && !visual.zone.destroyed) {
          // Meteor warning: grow circle toward impact radius, pulse faster as impact approaches
          const progress = Math.min(1, visual.elapsed / visual.impactDelay);
          const currentRadius = 5 + (visual.meteorRadius - 5) * progress;
          visual.zone.setRadius(currentRadius);
          const pulse = 0.15 + 0.25 * Math.sin(visual.elapsed * (0.006 + progress * 0.02));
          visual.zone.setAlpha(pulse);

          // On impact: replace warning with explosion sprite
          if (progress >= 1 && !visual.impactTriggered) {
            visual.impactTriggered = true;
            visual.zone.setStrokeStyle(3, 0xff6600, 0.8);
            visual.zone.setFillStyle(0xff4400, 0.3);
            // Add explosion sprite on top
            const explosionKey = 'fx-explosion';
            const explosionAnim = 'fx-explosion-play';
            if (scene.anims.exists(explosionAnim)) {
              const explSprite = scene.add.sprite(visual.zone.x, visual.zone.y, explosionKey);
              explSprite.setScale((visual.meteorRadius / 20) * 1.5);
              explSprite.setDepth(6);
              explSprite.setAlpha(0.8);
              explSprite.play({ key: explosionAnim, repeat: 0 });
              visual.glow = explSprite;
            }
          }
        } else if (visual.zone && !visual.zone.destroyed) {
          const pulse = 0.15 + 0.1 * Math.sin(visual.elapsed * 0.004);
          visual.zone.setAlpha(pulse);
        }
      } else if (visual.type === SPELL_TYPES.BUFF && visual.followOwner && visual.sprite && !visual.sprite.destroyed) {
        let ownerX, ownerY;
        if (visual.ownerId === scene.localPlayerId && scene.playerBody) {
          ownerX = scene.playerBody.position.x;
          ownerY = scene.playerBody.position.y;
        } else {
          const rp = scene.remotePlayers.get(visual.ownerId);
          if (rp) { ownerX = rp.x; ownerY = rp.y; }
        }
        if (ownerX !== undefined) {
          visual.sprite.x = ownerX;
          visual.sprite.y = ownerY;
          if (visual.glow && !visual.glow.destroyed) {
            visual.glow.x = ownerX;
            visual.glow.y = ownerY;
          }
        }
        if (visual.sprite && !visual.sprite.destroyed) {
          const pulse = 0.1 + 0.08 * Math.sin(visual.elapsed * 0.005);
          visual.sprite.setAlpha(visual.buffType === 'shield' ? pulse + 0.08 : pulse);
          // Shield: scale breath on the animated sprite
          if (visual.buffType === 'shield' && visual.glow && !visual.glow.destroyed) {
            const scaleBreath = visual._baseGlowScale * (1.0 + 0.06 * Math.sin(visual.elapsed * 0.004));
            visual.glow.setScale(scaleBreath);
          }
        }
      } else if ((visual.type === SPELL_TYPES.SWAP || visual.type === SPELL_TYPES.HOMING || visual.type === SPELL_TYPES.BOOMERANG) && visual.sprite && !visual.sprite.destroyed) {
        // Velocity extrapolation + drift correction
        const t = delta / 50;
        visual.sprite.x += visual.vx * t;
        visual.sprite.y += visual.vy * t;
        // Drift correction
        visual.sprite.x += (visual.serverX - visual.sprite.x) * 0.1;
        visual.sprite.y += (visual.serverY - visual.sprite.y) * 0.1;
        // Update server prediction target
        visual.serverX += visual.vx * t;
        visual.serverY += visual.vy * t;

        // Glow offset behind travel direction
        if (visual.glow && !visual.glow.destroyed) {
          if (visual.vx || visual.vy) {
            const speed = Math.sqrt(visual.vx * visual.vx + visual.vy * visual.vy) || 1;
            const offsetDist = 6;
            visual.glow.x = visual.sprite.x - (visual.vx / speed) * offsetDist;
            visual.glow.y = visual.sprite.y - (visual.vy / speed) * offsetDist;
          } else {
            visual.glow.x = visual.sprite.x;
            visual.glow.y = visual.sprite.y;
          }
        }

        // Boomerang spins, homing/swap rotate to face direction
        if (visual.isBoomerang) {
          // Spin scales with speed: slow at apex, fast when moving
          const spd = Math.sqrt(visual.vx * visual.vx + visual.vy * visual.vy);
          visual.sprite.rotation += Math.max(0.02, 0.15 * (spd / 7));
        } else if (visual.vx || visual.vy) {
          visual.sprite.setRotation(Math.atan2(visual.vy, visual.vx));
        }
      } else if (visual.type === SPELL_TYPES.RECALL) {
        const alpha = Math.max(0, 1 - visual.elapsed / visual.lifetime);
        if (visual.sprite && !visual.sprite.destroyed) visual.sprite.setAlpha(alpha);
        if (visual.arrival && !visual.arrival.destroyed) visual.arrival.setAlpha(alpha);
        if (visual.glow && !visual.glow.destroyed) visual.glow.setAlpha(alpha);
      }

      // Cleanup when lifetime expired (with grace period for server sync)
      if (visual.elapsed > visual.lifetime + 500) {
        this.destroySpellVisual(visual);
        this.spellVisuals.delete(id);
      }
    }
  }

  destroySpellVisual(visual) {
    if (visual.sprite && !visual.sprite.destroyed) visual.sprite.destroy();
    if (visual.glow && !visual.glow.destroyed) visual.glow.destroy();
    if (visual.chain && !visual.chain.destroyed) visual.chain.destroy();
    if (visual.trail && !visual.trail.destroyed) visual.trail.destroy();
    if (visual.arrival && !visual.arrival.destroyed) visual.arrival.destroy();
    if (visual.zone && !visual.zone.destroyed) visual.zone.destroy();
  }

  destroy() {
    for (const [id, visual] of this.spellVisuals) {
      this.destroySpellVisual(visual);
    }
    this.spellVisuals.clear();
    this.pendingSpellCasts = [];
  }
}
