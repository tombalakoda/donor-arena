/**
 * OcakOverlay.js — Forge (Ocak) tab for the crafting system.
 *
 * Layout (1280×720):
 *   LEFT COL   — Equipped items (3 slots: Saz/Yadigar/Pabuc) + Nazar spending
 *   CENTER COL — Material bar + Stash (inventory) + Craftable recipes
 *   RIGHT COL  — Item details + action buttons (equip/unequip/disassemble/craft)
 *
 * Built with the same sprite-based UI patterns as ShopOverlay.
 */

import { MATERIALS, MATERIAL_IDS, RECIPES, HAZINE, ITEM_CONSTANTS } from '../../shared/itemData.js';
import { COLOR, FONT, SPACE, DEPTH, ALPHA, SCREEN, textStyle } from './UIConfig.js';
import { createButton, createText, createIcyFrame, animateIn } from './UIHelpers.js';
import { getSfxVolume } from '../config.js';

const D = DEPTH.OVERLAY_DIM;
const CX = SCREEN.CX;
const CY = SCREEN.CY;
const SHOP_FONT = FONT.FAMILY_HEADING;

// Rarity colors
const RARITY_COLOR = {
  beyaz: { hex: '#CCCCCC', tint: 0xCCCCCC },
  yesil: { hex: '#44DD88', tint: 0x44DD88 },
  mor:   { hex: '#BB66FF', tint: 0xBB66FF },
};

const RARITY_NAMES = {
  beyaz: 'Beyaz',
  yesil: 'Yeşil',
  mor: 'Mor',
};

// Slot display names
const SLOT_NAMES = { saz: 'Saz', yadigar: 'Yadigar', pabuc: 'Pabuç' };
const SLOT_ICON_KEYS = { saz: 'slot-saz', yadigar: 'slot-yadigar', pabuc: 'slot-pabuc' };

// Layout
const LEFT_X = 190;
const MID_X = CX;
const RIGHT_X = 1070;
const COL_Y = 385;
const PANEL_W = 229;
const PANEL_H = 329;

export class OcakOverlay {
  constructor(scene) {
    this.scene = scene;
    this.elements = [];
    this.selectedItem = null; // { item, source: 'equipped'|'stash'|'recipe', slot? }
    this.progression = null;
  }

  /**
   * Build the Ocak overlay content (called when tab switches to Ocak).
   * Does NOT build dimmer/header/timer — those belong to ShopOverlay's chrome.
   */
  build(progression) {
    this.progression = progression;
    this.selectedItem = null;
    this._buildLeftColumn();
    this._buildCenterColumn();
    this._buildRightColumn();
  }

  updateProgression(progression) {
    this.progression = progression;
    this.destroy();
    this.build(progression);
  }

  destroy() {
    for (const el of this.elements) {
      if (el && !el.destroyed) {
        if (el.removeAllListeners) el.removeAllListeners();
        el.destroy();
      }
    }
    this.elements = [];
  }

  // ═══════════════════════════════════════════════════════
  //  LEFT COLUMN — Equipped items + Active Hazine + Nazar
  // ═══════════════════════════════════════════════════════
  _buildLeftColumn() {
    const s = this.scene;
    const prog = this.progression;
    if (!prog) return;

    // Panel background
    const panel = createIcyFrame(s, LEFT_X, COL_Y, PANEL_W, PANEL_H, D + 1, 0.25);
    this.elements.push(panel);
    animateIn(s, panel, { from: 'scale', delay: 50, duration: 300 });

    const panelTop = COL_Y - PANEL_H / 2;
    let y = panelTop + 22;

    // Title
    const title = createText(s, LEFT_X, y, 'DONANIM', { fontSize: '11px', fontFamily: SHOP_FONT }, {
      fill: '#FFFFFF', depth: D + 3, stroke: '#000000', strokeThickness: 3,
    });
    this.elements.push(title);
    y += 24;

    // Equipment slots
    const slots = ['saz', 'yadigar', 'pabuc'];
    for (const slot of slots) {
      const item = prog.equipped ? prog.equipped[slot] : null;
      const slotY = y;
      const slotH = 50;

      // Slot background
      const slotBg = s.add.graphics().setScrollFactor(0).setDepth(D + 2);
      const bgColor = item ? (RARITY_COLOR[item.rarity]?.tint || 0x445566) : 0x334455;
      slotBg.fillStyle(bgColor, item ? 0.2 : 0.1);
      slotBg.fillRoundedRect(LEFT_X - 100, slotY - slotH / 2, 200, slotH, 4);
      slotBg.lineStyle(1, bgColor, item ? 0.5 : 0.2);
      slotBg.strokeRoundedRect(LEFT_X - 100, slotY - slotH / 2, 200, slotH, 4);
      this.elements.push(slotBg);

      // Slot icon sprite
      const slotSpriteKey = SLOT_ICON_KEYS[slot];
      if (s.textures.exists(slotSpriteKey)) {
        const slotSprite = s.add.image(LEFT_X - 90, slotY, slotSpriteKey)
          .setDisplaySize(20, 20).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
        if (!item) slotSprite.setAlpha(0.4);
        this.elements.push(slotSprite);
      }
      // Slot label
      const slotLabel = s.add.text(LEFT_X - 66, slotY - 8, SLOT_NAMES[slot],
        textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
          fill: item ? '#FFFFFF' : '#888888', strokeThickness: 2,
        })
      ).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
      this.elements.push(slotLabel);

      if (item) {
        // Item name
        const rarityColor = RARITY_COLOR[item.rarity]?.hex || '#FFFFFF';
        const itemName = s.add.text(LEFT_X - 90, slotY + 8, item.name,
          textStyle({ fontSize: '9px', fontFamily: SHOP_FONT }, {
            fill: rarityColor, strokeThickness: 2,
          })
        ).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
        this.elements.push(itemName);

        // Tags
        if (item.tags && item.tags.length > 0) {
          const tagStr = item.tags.join(', ');
          const tagText = s.add.text(LEFT_X + 90, slotY, tagStr,
            textStyle({ fontSize: '7px', fontFamily: SHOP_FONT }, {
              fill: '#AACCDD', strokeThickness: 1,
            })
          ).setScrollFactor(0).setDepth(D + 3).setOrigin(1, 0.5);
          this.elements.push(tagText);
        }

        // Click to select
        const hitArea = s.add.rectangle(LEFT_X, slotY, 200, slotH)
          .setScrollFactor(0).setDepth(D + 4).setAlpha(0.001)
          .setInteractive({ useHandCursor: true });
        hitArea.on('pointerup', () => {
          this._playCraftSfx('navigate');
          this.selectedItem = { item, source: 'equipped', slot };
          this._rebuildRight();
        });
        this.elements.push(hitArea);
      } else {
        const emptyText = s.add.text(LEFT_X, slotY + 4, '(boş)',
          textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
            fill: '#666666', strokeThickness: 1,
          })
        ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0.5);
        this.elements.push(emptyText);
      }

      y += slotH + 6;
    }

    // Active Hazine
    y += 4;
    const activeHazine = prog.hazineActive || [];
    if (activeHazine.length > 0) {
      const hazTitle = s.add.text(LEFT_X, y, 'HAZİNE',
        textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
          fill: '#FFD700', strokeThickness: 2,
        })
      ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.elements.push(hazTitle);
      y += 16;

      for (const hzId of activeHazine.slice(0, 3)) {
        const hz = HAZINE[hzId];
        if (!hz) continue;
        const hzText = s.add.text(LEFT_X, y, hz.name,
          textStyle({ fontSize: '7px', fontFamily: SHOP_FONT }, {
            fill: '#FFD700', strokeThickness: 1,
          })
        ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
        this.elements.push(hzText);
        y += 14;
      }
    }

    // Nazar section
    y = COL_Y + PANEL_H / 2 - 80;
    const nazar = prog.nazar || 0;
    // Nazar icon sprite
    if (s.textures.exists('icon-nazar')) {
      const nazarIcon = s.add.image(LEFT_X - 50, y, 'icon-nazar')
        .setDisplaySize(18, 18).setScrollFactor(0).setDepth(D + 3).setTint(0xDDAAFF);
      this.elements.push(nazarIcon);
    }
    const nazarLabel = createText(s, LEFT_X - 10, y, `Nazar: ${nazar}`, { fontSize: '9px', fontFamily: SHOP_FONT }, {
      fill: '#DDAAFF', depth: D + 3, strokeThickness: 2,
    });
    this.elements.push(nazarLabel);
    y += 20;

    // Nazar buttons
    const nazarActions = [
      { label: 'Değiştir', action: 'reroll', cost: ITEM_CONSTANTS.NAZAR_COST_REROLL },
      { label: '+1 Malzeme', action: 'extra', cost: ITEM_CONSTANTS.NAZAR_COST_EXTRA_MATERIAL },
      { label: 'İpucu', action: 'hint', cost: ITEM_CONSTANTS.NAZAR_COST_RECIPE_HINT },
    ];

    for (const na of nazarActions) {
      const canAfford = nazar >= na.cost;
      const { elements: btnEls } = createButton(s, LEFT_X, y, `${na.label} (${na.cost})`, {
        width: 160, height: 22, depth: D + 4, enabled: canAfford,
        fontToken: { fontSize: '8px', fontFamily: SHOP_FONT },
        onClick: () => {
          this._playCraftSfx('nazar');
          if (s.network && s.network.connected) {
            s.network.sendNazarSpend(na.action);
          }
        },
      });
      this.elements.push(...btnEls);
      y += 28;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  CENTER COLUMN — Materials + Stash + Recipes
  // ═══════════════════════════════════════════════════════
  _buildCenterColumn() {
    const s = this.scene;
    const prog = this.progression;
    if (!prog) return;

    const panelTop = COL_Y - PANEL_H / 2;
    let y = panelTop + 12;

    // Material bar
    const materials = prog.materials || {};
    const matBarY = y;
    const matPerRow = 4;
    const matW = 50;
    const matH = 22;
    const matStartX = MID_X - (matPerRow * matW) / 2;

    for (let i = 0; i < MATERIAL_IDS.length; i++) {
      const matId = MATERIAL_IDS[i];
      const mat = MATERIALS[matId];
      const count = materials[matId] || 0;
      const row = Math.floor(i / matPerRow);
      const col = i % matPerRow;
      const mx = matStartX + col * matW + matW / 2;
      const my = matBarY + row * matH;

      // Material sprite icon
      const matSpriteKey = `mat-${matId}`;
      if (s.textures.exists(matSpriteKey)) {
        const matIcon = s.add.image(mx - 14, my + 8, matSpriteKey)
          .setDisplaySize(14, 14).setScrollFactor(0).setDepth(D + 3);
        if (count === 0) matIcon.setAlpha(0.3);
        this.elements.push(matIcon);
      }

      // Count text next to icon
      const matText = s.add.text(mx + 4, my, `${count}`,
        textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
          fill: count > 0 ? '#FFFFFF' : '#555555',
          strokeThickness: 1,
        })
      ).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0);
      this.elements.push(matText);
    }

    y += Math.ceil(MATERIAL_IDS.length / matPerRow) * matH + 10;

    // Separator
    const sep1 = s.add.graphics().setScrollFactor(0).setDepth(D + 2);
    sep1.lineStyle(1, 0xA8C8DC, 0.3);
    sep1.lineBetween(MID_X - 100, y, MID_X + 100, y);
    this.elements.push(sep1);
    y += 8;

    // Stash header
    const stash = prog.stash || [];
    const stashTitle = s.add.text(MID_X, y, `SANDIK (${stash.length}/${ITEM_CONSTANTS.MAX_STASH_SIZE})`,
      textStyle({ fontSize: '9px', fontFamily: SHOP_FONT }, {
        fill: '#FFFFFF', strokeThickness: 2,
      })
    ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
    this.elements.push(stashTitle);
    y += 18;

    // Stash items
    if (stash.length === 0) {
      const emptyStash = s.add.text(MID_X, y + 10, '(boş)',
        textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
          fill: '#666666', strokeThickness: 1,
        })
      ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.elements.push(emptyStash);
      y += 30;
    } else {
      for (const item of stash.slice(0, 6)) {
        const itemH = 22;
        const rarityColor = RARITY_COLOR[item.rarity]?.hex || '#FFFFFF';
        const rarityTint = RARITY_COLOR[item.rarity]?.tint || 0xCCCCCC;

        // Item row bg
        const itemBg = s.add.graphics().setScrollFactor(0).setDepth(D + 2);
        itemBg.fillStyle(rarityTint, 0.1);
        itemBg.fillRoundedRect(MID_X - 100, y - 2, 200, itemH, 3);
        this.elements.push(itemBg);

        // Slot sprite icon + name
        const stashSlotKey = SLOT_ICON_KEYS[item.slot];
        if (stashSlotKey && s.textures.exists(stashSlotKey)) {
          const stashSlotIcon = s.add.image(MID_X - 90, y + itemH / 2 - 2, stashSlotKey)
            .setDisplaySize(14, 14).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
          this.elements.push(stashSlotIcon);
        }
        const itemLabel = s.add.text(MID_X - 72, y + itemH / 2 - 2, item.name,
          textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
            fill: rarityColor, strokeThickness: 1,
          })
        ).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
        this.elements.push(itemLabel);

        // Click to select
        const hit = s.add.rectangle(MID_X, y + itemH / 2 - 2, 200, itemH)
          .setScrollFactor(0).setDepth(D + 4).setAlpha(0.001)
          .setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => {
          this._playCraftSfx('navigate');
          this.selectedItem = { item, source: 'stash' };
          this._rebuildRight();
        });
        this.elements.push(hit);

        y += itemH + 2;
      }
    }

    y += 8;

    // Separator
    const sep2 = s.add.graphics().setScrollFactor(0).setDepth(D + 2);
    sep2.lineStyle(1, 0xA8C8DC, 0.3);
    sep2.lineBetween(MID_X - 100, y, MID_X + 100, y);
    this.elements.push(sep2);
    y += 8;

    // Craftable recipes header
    const recipeTitle = s.add.text(MID_X, y, 'TARİFLER',
      textStyle({ fontSize: '9px', fontFamily: SHOP_FONT }, {
        fill: '#FFFFFF', strokeThickness: 2,
      })
    ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
    this.elements.push(recipeTitle);
    y += 18;

    // Get craftable recipes (discovered + affordable)
    const discoveredRecipes = new Set(prog.discoveredRecipes || []);
    const craftableRecipes = [];
    const discoverableRecipes = [];

    for (const [id, recipe] of Object.entries(RECIPES)) {
      if (!this._canAffordRecipe(recipe, materials)) continue;
      if (discoveredRecipes.has(id)) {
        craftableRecipes.push({ id, recipe, discovered: true });
      } else {
        discoverableRecipes.push({ id, recipe, discovered: false });
      }
    }

    const allRecipes = [...craftableRecipes, ...discoverableRecipes];
    const maxVisible = 4;
    const isStashFull = stash.length >= ITEM_CONSTANTS.MAX_STASH_SIZE;

    if (allRecipes.length === 0) {
      const noRecipe = s.add.text(MID_X, y + 10, 'Yeterli malzeme yok',
        textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
          fill: '#666666', strokeThickness: 1,
        })
      ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.elements.push(noRecipe);
    } else {
      for (const { id, recipe, discovered } of allRecipes.slice(0, maxVisible)) {
        const recH = 28;

        // Recipe row background
        const recBg = s.add.graphics().setScrollFactor(0).setDepth(D + 2);
        const rarityTint = RARITY_COLOR[recipe.rarity]?.tint || 0xCCCCCC;
        recBg.fillStyle(rarityTint, 0.08);
        recBg.fillRoundedRect(MID_X - 100, y - 2, 200, recH, 3);
        this.elements.push(recBg);

        if (discovered) {
          // Show recipe name + ingredients
          const recLabel = s.add.text(MID_X - 90, y + recH / 2 - 2, recipe.name,
            textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
              fill: RARITY_COLOR[recipe.rarity]?.hex || '#FFFFFF', strokeThickness: 1,
            })
          ).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
          this.elements.push(recLabel);

          // Craft button
          const btnLabel = isStashFull ? 'Dolu' : 'Yap';
          const { elements: btnEls } = createButton(s, MID_X + 70, y + recH / 2 - 2, btnLabel, {
            width: 50, height: 18, depth: D + 5, enabled: !isStashFull,
            fontToken: { fontSize: '7px', fontFamily: SHOP_FONT },
            onClick: () => {
              this._playCraftSfx('craft');
              if (s.network && s.network.connected) {
                s.network.sendCraftItem(id);
              }
            },
          });
          this.elements.push(...btnEls);
        } else {
          // Unknown recipe — show ??? with DENE button
          const unknownLabel = s.add.text(MID_X - 90, y + recH / 2 - 2, '??? + ???',
            textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
              fill: '#888888', strokeThickness: 1,
            })
          ).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0.5);
          this.elements.push(unknownLabel);

          const { elements: btnEls } = createButton(s, MID_X + 70, y + recH / 2 - 2, 'Dene', {
            width: 50, height: 18, depth: D + 5, enabled: !isStashFull,
            fontToken: { fontSize: '7px', fontFamily: SHOP_FONT },
            onClick: () => {
              this._playCraftSfx('craft');
              if (s.network && s.network.connected) {
                s.network.sendCraftItem(id);
              }
            },
          });
          this.elements.push(...btnEls);
        }

        // Click recipe row to see details
        const recHit = s.add.rectangle(MID_X - 25, y + recH / 2 - 2, 140, recH)
          .setScrollFactor(0).setDepth(D + 4).setAlpha(0.001)
          .setInteractive({ useHandCursor: true });
        recHit.on('pointerup', () => {
          this._playCraftSfx('navigate');
          if (discovered) {
            this.selectedItem = { item: recipe, source: 'recipe', recipeId: id };
            this._rebuildRight();
          }
        });
        this.elements.push(recHit);

        y += recH + 4;
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  RIGHT COLUMN — Item Details + Actions
  // ═══════════════════════════════════════════════════════
  _buildRightColumn() {
    const s = this.scene;

    // Panel background
    const panel = createIcyFrame(s, RIGHT_X, COL_Y, PANEL_W, PANEL_H, D + 1, 0.25);
    this.elements.push(panel);
    animateIn(s, panel, { from: 'scale', delay: 50, duration: 300 });

    if (!this.selectedItem) {
      const hint = createText(s, RIGHT_X, COL_Y, 'Bir eser seç\nveya yap', { fontSize: '10px', fontFamily: SHOP_FONT }, {
        fill: '#888888', depth: D + 3, strokeThickness: 2,
      });
      this.elements.push(hint);
      return;
    }

    const { item, source, slot, recipeId } = this.selectedItem;
    const panelTop = COL_Y - PANEL_H / 2;
    let y = panelTop + 28;

    // Item name
    const rarityColor = RARITY_COLOR[item.rarity]?.hex || '#FFFFFF';
    const nameText = createText(s, RIGHT_X, y, item.name, { fontSize: '12px', fontFamily: SHOP_FONT }, {
      fill: rarityColor, depth: D + 3, stroke: '#000000', strokeThickness: 3,
    });
    this.elements.push(nameText);
    y += 22;

    // Rarity + Slot
    const rarityName = RARITY_NAMES[item.rarity] || item.rarity;
    const slotName = SLOT_NAMES[item.slot] || item.slot;
    const subtitleText = s.add.text(RIGHT_X, y, `${rarityName} ${slotName}`,
      textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
        fill: '#AABBCC', strokeThickness: 1,
      })
    ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
    this.elements.push(subtitleText);
    y += 18;

    // Tags
    if (item.tags && item.tags.length > 0) {
      const tagStr = item.tags.map(t => {
        const mat = Object.values(MATERIALS).find(m => m.tag === t);
        return mat ? mat.name : t;
      }).join(' • ');
      const tagText = s.add.text(RIGHT_X, y, tagStr,
        textStyle({ fontSize: '7px', fontFamily: SHOP_FONT }, {
          fill: '#88BBDD', strokeThickness: 1,
        })
      ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.elements.push(tagText);
      y += 16;
    }

    y += 6;

    // Description
    if (item.description) {
      const descText = s.add.text(RIGHT_X, y, item.description,
        textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
          fill: '#CCDDEE', strokeThickness: 1,
          wordWrap: { width: PANEL_W - 30 },
          align: 'center',
        })
      ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
      this.elements.push(descText);
      y += descText.height + 12;
    }

    // Ingredients (for recipes)
    if (source === 'recipe' || item.ingredients) {
      const recipe = source === 'recipe' ? item : RECIPES[item.id];
      if (recipe && recipe.ingredients) {
        const ingLabel = s.add.text(RIGHT_X, y, 'Malzeme:',
          textStyle({ fontSize: '8px', fontFamily: SHOP_FONT }, {
            fill: '#AABBCC', strokeThickness: 1,
          })
        ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
        this.elements.push(ingLabel);
        y += 14;

        for (const [matId, count] of Object.entries(recipe.ingredients)) {
          const mat = MATERIALS[matId];
          const matName = mat ? mat.name : matId;

          // Material sprite icon
          const ingSpriteKey = `mat-${matId}`;
          if (s.textures.exists(ingSpriteKey)) {
            const ingIcon = s.add.image(RIGHT_X - 40, y + 5, ingSpriteKey)
              .setDisplaySize(12, 12).setScrollFactor(0).setDepth(D + 3);
            this.elements.push(ingIcon);
          }

          const ingText = s.add.text(RIGHT_X - 24, y, `${matName} x${count}`,
            textStyle({ fontSize: '7px', fontFamily: SHOP_FONT }, {
              fill: '#FFFFFF', strokeThickness: 1,
            })
          ).setScrollFactor(0).setDepth(D + 3).setOrigin(0, 0);
          this.elements.push(ingText);
          y += 14;
        }
        y += 6;
      }
    }

    // Hazine hint (if equipping this + existing items would form a combo)
    if (source !== 'recipe') {
      const hazineHint = this._checkHazineHint(item);
      if (hazineHint) {
        const hzText = s.add.text(RIGHT_X, y, `⚡ ${hazineHint}`,
          textStyle({ fontSize: '7px', fontFamily: SHOP_FONT }, {
            fill: '#FFD700', strokeThickness: 1,
            wordWrap: { width: PANEL_W - 30 },
            align: 'center',
          })
        ).setScrollFactor(0).setDepth(D + 3).setOrigin(0.5, 0);
        this.elements.push(hzText);
        y += 20;
      }
    }

    // Action buttons (bottom of panel)
    const btnY = COL_Y + PANEL_H / 2 - 60;

    if (source === 'stash') {
      // Equip button
      const { elements: equipEls } = createButton(s, RIGHT_X, btnY, 'Kuşan', {
        width: 150, height: 26, depth: D + 5,
        fontToken: { fontSize: '9px', fontFamily: SHOP_FONT },
        onClick: () => {
          this._playCraftSfx('equip');
          if (s.network && s.network.connected) {
            s.network.sendEquipItem(item.instanceId);
          }
        },
      });
      this.elements.push(...equipEls);

      // Disassemble button
      const { elements: disEls } = createButton(s, RIGHT_X, btnY + 30, 'Parçala', {
        width: 150, height: 26, depth: D + 5,
        fontToken: { fontSize: '9px', fontFamily: SHOP_FONT },
        onClick: () => {
          this._playCraftSfx('disassemble');
          if (s.network && s.network.connected) {
            s.network.sendDisassembleItem(item.instanceId, 'stash');
          }
        },
      });
      this.elements.push(...disEls);
    } else if (source === 'equipped') {
      // Unequip button
      const stash = this.progression?.stash || [];
      const stashFull = stash.length >= ITEM_CONSTANTS.MAX_STASH_SIZE;

      const { elements: unequipEls } = createButton(s, RIGHT_X, btnY, 'Çıkar', {
        width: 150, height: 26, depth: D + 5, enabled: !stashFull,
        fontToken: { fontSize: '9px', fontFamily: SHOP_FONT },
        onClick: () => {
          this._playCraftSfx('unequip');
          if (s.network && s.network.connected) {
            s.network.sendUnequipItem(slot);
          }
        },
      });
      this.elements.push(...unequipEls);

      // Disassemble from equipped
      const { elements: disEls } = createButton(s, RIGHT_X, btnY + 30, 'Parçala', {
        width: 150, height: 26, depth: D + 5,
        fontToken: { fontSize: '9px', fontFamily: SHOP_FONT },
        onClick: () => {
          this._playCraftSfx('disassemble');
          if (s.network && s.network.connected) {
            s.network.sendDisassembleItem(item.instanceId, 'equipped');
          }
        },
      });
      this.elements.push(...disEls);
    } else if (source === 'recipe') {
      // Craft button
      const stash = this.progression?.stash || [];
      const stashFull = stash.length >= ITEM_CONSTANTS.MAX_STASH_SIZE;

      const { elements: craftEls } = createButton(s, RIGHT_X, btnY, stashFull ? 'Sandık Dolu' : 'Yap', {
        width: 150, height: 26, depth: D + 5, enabled: !stashFull,
        fontToken: { fontSize: '9px', fontFamily: SHOP_FONT },
        onClick: () => {
          this._playCraftSfx('craft');
          if (s.network && s.network.connected) {
            s.network.sendCraftItem(recipeId);
          }
        },
      });
      this.elements.push(...craftEls);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════

  _rebuildRight() {
    // Only rebuild right column content
    // Since we don't track which elements belong to which column,
    // we rebuild everything
    this.destroy();
    this.build(this.progression);
  }

  _canAffordRecipe(recipe, materials) {
    if (!recipe.ingredients) return false;
    for (const [matId, count] of Object.entries(recipe.ingredients)) {
      if ((materials[matId] || 0) < count) return false;
    }
    return true;
  }

  _checkHazineHint(item) {
    const prog = this.progression;
    if (!prog) return null;
    const discoveredHazine = new Set(prog.discoveredHazine || []);

    // Check if this item's tags would form a Hazine combo with existing equipped items
    const equipped = prog.equipped || {};
    const equippedTags = new Set();
    for (const [, eq] of Object.entries(equipped)) {
      if (eq && eq.tags) {
        for (const tag of eq.tags) equippedTags.add(tag);
      }
    }

    if (!item.tags) return null;

    for (const tag of item.tags) {
      if (equippedTags.has(tag)) {
        // Look for matching Hazine
        for (const [hzId, hz] of Object.entries(HAZINE)) {
          if (!discoveredHazine.has(hzId)) continue;
          if (hz.requirement.type === 'same' && hz.requirement.tag === tag) {
            return `${hz.name} ile eşleşir!`;
          }
        }
        // Even if Hazine not discovered, hint at potential combo
        return `"${tag}" etiketi eşleşiyor`;
      }
    }

    return null;
  }

  _playSfx(key) {
    try { this.scene.sound.play(key, { volume: 0.5 * getSfxVolume() }); } catch (_) { /* */ }
  }

  /**
   * Play a context-appropriate crafting SFX.
   * @param {'craft'|'equip'|'unequip'|'disassemble'|'nazar'|'navigate'|'stash-full'} action
   */
  _playCraftSfx(action) {
    const map = {
      craft:       'sfx-craft',
      equip:       'sfx-equip',
      unequip:     'sfx-unequip',
      disassemble: 'sfx-disassemble',
      nazar:       'sfx-nazar-spend',
      navigate:    'sfx-move',
      'stash-full':'sfx-stash-full',
    };
    this._playSfx(map[action] || 'sfx-move');
  }
}
