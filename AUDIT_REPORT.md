# Code Audit Report
Date: 2026-03-15
Project: Aşıklar Meydanı (Arena2) — 2D Multiplayer KB Arena + Crafting System

## Summary
The crafting system is impressively complete — 24 recipes, 18 set bonuses, full inventory management, and a polished forge UI are all in place and working. However, there are **two bugs that will break player movement** (Kasirga Hazine produces corrupted physics values) and **one bug that makes an item permanently overpowered** (Saat cooldown reduction is always active instead of conditional). Five socket listeners leak on player disconnect. Beyond bugs, the two largest files (GameScene at 1951 lines, HUDManager at 1228 lines) are becoming hard to maintain, and the project still has no README or architecture documentation.

## Overall Health
🟡 Needs Attention

---

## Findings

### 🔴 Critical — Fix Before Going Further

**Kasirga Hazine breaks player movement**
What this means: When a player activates the Kasirga set bonus (speed+speed), the speed boost uses a mismatched field name — the spell system writes `multiplier` but the physics system reads `amount`. The result is a corrupted "not a number" value that breaks all movement for that player.
Why it matters: Any player who builds two speed-tagged items will have their character become uncontrollable. This is a game-breaking crash.
What to do: In `src/server/game/ServerSpell.js` line 249, change `multiplier` to `amount` so the physics system can read it correctly.

**Instant-hit spells ignore all item damage modifiers**
What this means: When spells deal damage directly in Room.js (not through projectiles), the code calls the damage function without passing item stats. This means equipped items that boost or reduce damage have no effect on these hits.
Why it matters: Players will notice their damage-boosting items don't work on certain spells, creating confusion and breaking the crafting system's value proposition.
What to do: In `src/server/rooms/Room.js` line 381, pass `attackerItems` and `targetItems` to `applyDamage()` the same way `GameLoop.processSpellHits()` does at line 169.

---

### 🟡 Important — Address Soon

**Saat item gives permanent cooldown reduction instead of conditional**
What this means: The Saat item is supposed to reduce cooldowns by 30% only after 3 seconds of not attacking. Instead, it always gives 30% cooldown reduction because the "last attack time" tracker writes to the wrong place and resets every game tick.
Why it matters: Players with Saat get a permanent 30% cooldown reduction, making it by far the strongest item in the game. Combined with certain character passives, cooldowns could become unreasonably short.
What to do: In `src/server/game/ItemSystem.js`, add a method `updateLastAttackTime(time)` that sets `this.lastAttackTime = time` on the instance, then call it from `ServerSpell.processCast()` line 258 instead of mutating the stats cache.

**Five crafting socket listeners leak on player disconnect**
What this means: When a player leaves the game, the server removes most event listeners but forgets to remove the five crafting-related ones (craft, equip, unequip, disassemble, nazar). These orphaned listeners stay attached to the connection.
Why it matters: Over many connect/disconnect cycles, this wastes server memory. In rare cases, a reconnecting player could trigger stale handlers.
What to do: In `src/server/rooms/Room.js` `removePlayer()` (around line 218), add removals for `CLIENT_CRAFT_ITEM`, `CLIENT_DISASSEMBLE_ITEM`, `CLIENT_EQUIP_ITEM`, `CLIENT_UNEQUIP_ITEM`, and `CLIENT_NAZAR_SPEND`.

**Single dual-tagged item can activate cross-tag Hazine alone**
What this means: A Mor (rare) item like Korg has two tags (fire + electric). The code allows this single item to activate the Berserker set bonus, which was designed to require tags "across different items." This makes cross-tag set bonuses much easier to get than intended.
Why it matters: Players can activate powerful set bonuses with just one crafted item instead of needing two coordinated pieces, undermining the crafting depth.
What to do: In `src/shared/itemData.js` `computeActiveHazine()`, for cross-tag requirements, add a check that `slotsA` and `slotsB` contain at least one *different* slot (i.e., the tags come from different equipped items).

**Cehennem + Yangin burn stacks too high**
What this means: The Cehennem set bonus (fire×3) is supposed to increase burn to 2 damage/second for 2 seconds. But because it stacks additively on top of Yangin (fire×2), the actual result is 3 damage/second for 3 seconds — dealing 9 total burn damage per hit. That is nearly as much as a full spell hit.
Why it matters: Burn builds could become dominant since every spell hit deals nearly double damage from burn alone.
What to do: In `src/shared/itemData.js`, change Cehennem's effect to override values instead of additive (e.g., set `burnDamage` to 2 and `burnDuration` to 2000 directly), or change `_mergeEffect` in ItemSystem to use `Math.max` for burn fields.

**Nazar reroll action is not implemented**
What this means: The plan includes three ways to spend Nazar beads: reroll a material, get an extra material, or peek at a recipe hint. The reroll option (cost: 1 Nazar) was never built — the Nazar is deducted but nothing happens, and the button is missing from the UI.
Why it matters: Players lose Nazar beads with no result if they somehow trigger the reroll action. The missing button means the cheapest Nazar option is unavailable.
What to do: Add the reroll button to `OcakOverlay.js` and implement the reroll logic in `Room.js` `handleNazarSpend` — remove one random material and add a different random one.

---

### 🟢 Good to Know — Low Priority

**"Survive after elimination" Nazar bonus is defined but never awarded**
What this means: The plan says players should earn +1 Nazar for surviving a round after being eliminated. The constant `NAZAR_PER_SURVIVE_AFTER_ELIM` exists in the data file but no code uses it.
Why it matters: Minor — the comeback mechanic works without this, but struggling players get slightly less help than intended.
What to do: Track which players were eliminated in the previous round, and award +1 Nazar at the start of the next round if they're still in the match.

**Berserker Hazine is missing the spell speed component**
What this means: The plan says Berserker should give "+20% damage and +15% spell speed below 40% HP." The implementation only gives the damage bonus — the spell speed part was silently dropped.
Why it matters: The Berserker combo is weaker than designed, slightly reducing the incentive to build fire+electric.
What to do: Add a `lowHpSpellSpeedBonus` field to the Berserker Hazine effect and integrate it into spell cooldown computation.

**`icon-nazar` sprite is loaded twice in BootScene**
What this means: The same image file is loaded at line 367 and again at line 382. Phaser handles this gracefully (ignores the duplicate), so nothing breaks.
Why it matters: Cosmetic code quality issue only.
What to do: Remove the duplicate `this.load.image('icon-nazar', ...)` at line 382.

**Vite is listed as a production dependency**
What this means: The build tool (Vite) is in the `dependencies` section of package.json instead of `devDependencies`. The game server doesn't need it at runtime.
Why it matters: Makes production installs larger than necessary. No functional impact.
What to do: Move `vite` and `phaser` from `dependencies` to `devDependencies` in `package.json`.

**OcakOverlay duplicates recipe affordability check**
What this means: `OcakOverlay._canAffordRecipe()` does the same thing as the shared helper `hasIngredientsFor()` already exported from `itemData.js`.
Why it matters: If recipe logic changes, it needs to be updated in two places.
What to do: Replace `_canAffordRecipe()` with a call to the shared `hasIngredientsFor()` helper.

**Korsanlik + Corap economy may be overtuned**
What this means: A player with both Korsanlik (double drops, -15% HP) and Corap (+1 material/round) gets ~4 materials per round instead of 1, potentially accumulating 80+ materials over a full match versus the normal 25-30. The HP penalty may not offset this.
Why it matters: Could create a dominant "economy" build that outscales all other strategies.
What to do: Monitor in playtesting. Consider capping Korsanlik's doubling to only the base drop, not bonus drops.

---

## What's Working Well

- **Complete crafting system**: All 24 recipes, 18 Hazine, 8 materials, 3 equipment slots, 6-slot stash — fully implemented end-to-end.
- **Excellent input validation**: All crafting messages are type-checked, phase-gated, and rate-limited on the server.
- **Clean data layer**: `itemData.js` is well-structured with all recipes, materials, and Hazine in one shared file used by both client and server.
- **Discovery persistence**: localStorage save/load with proper try/catch and server-side validation on join.
- **Polished UI**: OcakOverlay with 3-column layout, sprite icons, rarity colors, Hazine hints, and contextual SFX.
- **Good notification system**: Material drop animations, Hazine badges with pulse, discovery banners with gold/green theming.
- **Server-authoritative design**: All crafting logic runs on the server. Clients cannot cheat.

---

## Debt Level
Building Up

The project is functional and well-organized at the module level (shared data, server systems, client UI all properly separated). However, three files are becoming monoliths: GameScene.js (1951 lines), HUDManager.js (1228 lines), and Room.js (950 lines). The item stat integration uses a callback pattern that works but leads to redundant lookups (3× per player per tick in physics) and a fragile mutation pattern for tracking state like attack times. New features should consider extracting responsibilities from these large files before adding more code to them.

## Documentation Status
Minimal. No README, no PROJECT.md, no architecture overview in the repository. The crafting system design document exists in the Claude plans directory but is not part of the codebase. Inline code comments are generally good — constants are well-documented, key methods have JSDoc, and section dividers make files navigable. The socket message protocol has no payload documentation. A new developer would struggle to understand the project without guidance.

## Recommended Next Steps
1. **Fix Kasirga NaN bug** — single-line fix in ServerSpell.js (`multiplier` → `amount`). Game-breaking if triggered.
2. **Fix instant-hit damage bypass** — pass item stats to `applyDamage()` in Room.js line 381. Ensures all items work consistently.
3. **Fix Saat always-on CDR** — add `updateLastAttackTime()` to ItemSystem and call it from ServerSpell. Prevents balance-breaking permanent CDR.
4. **Add missing socket listener cleanup** — add the 5 crafting listener removals to `removePlayer()` in Room.js. Prevents memory leaks.
5. **Add cross-tag Hazine "different items" check** — one conditional in `computeActiveHazine()`. Preserves intended crafting depth.

---
*Generated by Code Auditor skill. Findings reflect the state of the project at the time of the audit.*
