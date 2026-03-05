import { UI_FONT } from '../config.js';
import { createNinesliceButton } from './UIHelpers.js';

/**
 * MatchEndOverlay — Shown when all rounds are complete.
 * Displays scoreboard with portraits, rankings, jingle, and action buttons.
 */
export class MatchEndOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.elements = [];
  }

  show(scores, localPlayerId) {
    if (this.visible) this.destroy();
    this.visible = true;
    this.build(scores, localPlayerId);
  }

  hide() {
    this.visible = false;
    this.destroy();
  }

  destroy() {
    for (const el of this.elements) {
      if (el && !el.destroyed) el.destroy();
    }
    this.elements = [];
  }

  playSfx(key) {
    try {
      this.scene.sound.play(key, { volume: 0.6 });
    } catch (e) { /* audio not available */ }
  }

  build(scores, localPlayerId) {
    const scene = this.scene;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const DEPTH = 350;

    // Play jingle
    const isWinner = scores && scores.length > 0 && scores[0].id === localPlayerId;
    if (isWinner) {
      this.playSfx('jingle-success');
    } else {
      this.playSfx('jingle-gameover');
    }

    // Dark overlay (kept as rectangle dimmer)
    const bg = scene.add.rectangle(camW / 2, camH / 2, camW, camH, 0x000000, 0.8)
      .setScrollFactor(0).setDepth(DEPTH).setInteractive();
    this.elements.push(bg);

    // Main panel — nineslice
    const panelW = 520;
    const panelH = 440;
    const py = camH / 2 - panelH / 2;
    const px = camW / 2 - panelW / 2;
    const panel = scene.add.nineslice(camW / 2, camH / 2, 'ui-panel', null, panelW, panelH, 4, 4, 4, 4)
      .setScrollFactor(0).setDepth(DEPTH + 1);
    this.elements.push(panel);

    // Title
    const title = scene.add.text(camW / 2, py + 30, 'MATCH OVER', {
      fontSize: '32px',
      fontFamily: UI_FONT,
      fill: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(title);

    const sub = scene.add.text(camW / 2, py + 60, 'DÖNER FIGHT', {
      fontSize: '13px',
      fontFamily: UI_FONT,
      fill: '#666688',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    this.elements.push(sub);

    // --- Winner highlight ---
    if (scores && scores.length > 0) {
      const winner = scores[0];

      // Winner portrait (if available)
      const winnerCharId = winner.characterId || 'boy';
      const faceKey = `${winnerCharId}-face`;
      if (scene.textures.exists(faceKey)) {
        const face = scene.add.image(camW / 2, py + 105, faceKey)
          .setScale(2.5)
          .setScrollFactor(0).setDepth(DEPTH + 3);
        this.elements.push(face);

        // FX aura behind portrait
        if (scene.textures.exists('fx-aura')) {
          const aura = scene.add.sprite(camW / 2, py + 105, 'fx-aura', 0)
            .setScale(3).setAlpha(0.4).setTint(0xffdd44)
            .setScrollFactor(0).setDepth(DEPTH + 2);
          if (scene.anims.exists('fx-aura-play')) {
            aura.play({ key: 'fx-aura-play', repeat: -1 });
          }
          this.elements.push(aura);
        }
      }

      // Winner name
      const winnerName = winner.name || winner.id.slice(-4);
      const nameLabel = scene.add.text(camW / 2, py + 135, `${winnerName}`, {
        fontSize: '18px',
        fontFamily: UI_FONT,
        fill: '#ffdd44',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 3);
      this.elements.push(nameLabel);
    }

    // --- Scoreboard table ---
    const tableY = py + 165;
    const rowH = 28;
    const cols = { rank: px + 25, face: px + 60, name: px + 100, pts: px + 300, elims: px + 370, wins: px + 440 };

    // Header
    const headerStyle = { fontSize: '12px', fontFamily: UI_FONT, fill: '#888899' };
    const headers = [
      scene.add.text(cols.rank, tableY, '#', headerStyle).setScrollFactor(0).setDepth(DEPTH + 2),
      scene.add.text(cols.name, tableY, 'Player', headerStyle).setScrollFactor(0).setDepth(DEPTH + 2),
      scene.add.text(cols.pts, tableY, 'Pts', headerStyle).setScrollFactor(0).setDepth(DEPTH + 2),
      scene.add.text(cols.elims, tableY, 'Elims', headerStyle).setScrollFactor(0).setDepth(DEPTH + 2),
      scene.add.text(cols.wins, tableY, 'Wins', headerStyle).setScrollFactor(0).setDepth(DEPTH + 2),
    ];
    this.elements.push(...headers);

    // Divider
    const divG = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH + 2);
    divG.lineStyle(1, 0x444466, 0.5);
    divG.lineBetween(px + 15, tableY + 16, px + panelW - 15, tableY + 16);
    this.elements.push(divG);

    // Rank colors
    const rankColors = ['#ffdd44', '#cccccc', '#cc8844'];

    // Rows
    const maxRows = Math.min(scores ? scores.length : 0, 8);
    for (let i = 0; i < maxRows; i++) {
      const s = scores[i];
      const ry = tableY + 24 + i * rowH;
      const isLocal = s.id === localPlayerId;
      const rankColor = rankColors[i] || '#aaaaaa';
      const nameColor = isLocal ? '#44ddff' : '#cccccc';

      // Alternating row background for even rows
      if (i % 2 === 0) {
        const rowBgAlt = scene.add.nineslice(camW / 2, ry + 6, 'ui-bg', null, panelW - 30, rowH - 2, 4, 4, 4, 4)
          .setAlpha(0.15)
          .setScrollFactor(0).setDepth(DEPTH + 1);
        this.elements.push(rowBgAlt);
      }

      // Highlight row for local player — nineslice focus
      if (isLocal) {
        const rowHighlight = scene.add.nineslice(camW / 2, ry + 6, 'ui-focus', null, panelW - 30, rowH - 2, 3, 3, 3, 3)
          .setAlpha(0.3)
          .setScrollFactor(0).setDepth(DEPTH + 1);
        this.elements.push(rowHighlight);
      }

      // Rank
      const rankText = scene.add.text(cols.rank + 8, ry, `${i + 1}`, {
        fontSize: '13px', fontFamily: UI_FONT, fill: rankColor, fontStyle: 'bold',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 3);
      this.elements.push(rankText);

      // Face icon
      const charId = s.characterId || 'boy';
      const faceKey = `${charId}-face`;
      if (scene.textures.exists(faceKey)) {
        const faceIcon = scene.add.image(cols.face, ry + 6, faceKey)
          .setScale(0.65)
          .setScrollFactor(0).setDepth(DEPTH + 3);
        this.elements.push(faceIcon);
      }

      // Name
      const name = s.name || s.id.slice(-4);
      const nameText = scene.add.text(cols.name, ry, name, {
        fontSize: '13px', fontFamily: UI_FONT, fill: nameColor,
      }).setScrollFactor(0).setDepth(DEPTH + 3);
      this.elements.push(nameText);

      // Points
      const ptsText = scene.add.text(cols.pts + 10, ry, `${s.points}`, {
        fontSize: '13px', fontFamily: UI_FONT, fill: '#ffdd44',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 3);
      this.elements.push(ptsText);

      // Eliminations
      const elimText = scene.add.text(cols.elims + 10, ry, `${s.eliminations}`, {
        fontSize: '13px', fontFamily: UI_FONT, fill: '#ff6644',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 3);
      this.elements.push(elimText);

      // Rounds won
      const winsText = scene.add.text(cols.wins + 10, ry, `${s.roundsWon}`, {
        fontSize: '13px', fontFamily: UI_FONT, fill: '#44cc88',
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 3);
      this.elements.push(winsText);
    }

    // --- Buttons ---
    const btnY = py + panelH - 45;

    const { elements: menuEls } = createNinesliceButton(scene, camW / 2 - 90, btnY, 'Menu', {
      width: 150, height: 40, depth: DEPTH + 3, fontSize: '15px',
      onClick: () => {
        this.playSfx('sfx-accept');
        this.returnToMenu();
      },
      sfx: true,
    });
    this.elements.push(...menuEls);

    const { elements: playEls } = createNinesliceButton(scene, camW / 2 + 90, btnY, 'Play Again', {
      width: 150, height: 40, depth: DEPTH + 3, fontSize: '15px',
      onClick: () => {
        this.playSfx('sfx-accept');
        this.playAgain();
      },
      sfx: true,
    });
    this.elements.push(...playEls);
  }

  returnToMenu() {
    const scene = this.scene;
    if (scene.network) {
      scene.network.disconnect();
    }
    window.__networkConnected = false;
    scene.sound.stopAll();

    scene.cameras.main.fadeOut(400, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => {
      scene.scene.start('MenuScene');
    });
  }

  playAgain() {
    const scene = this.scene;
    // Disconnect current
    if (scene.network) {
      scene.network.disconnect();
    }
    window.__networkConnected = false;
    scene.sound.stopAll();

    scene.cameras.main.fadeOut(400, 0, 0, 0);
    scene.cameras.main.once('camerafadeoutcomplete', () => {
      // Go back to menu where they can choose character / mode again
      scene.scene.start('MenuScene');
    });
  }
}
