# Arena2 — Game Data Report
Date: 2026-03-16

## Overview
8-player top-down KB arena. 20 rounds, ice-physics movement, Smash Bros-style vulnerability scaling. Players pick spells from a shop between rounds, craft items from material drops, and activate set bonuses.

---

## Characters (8)

| Character | Passive | Effect |
|---|---|---|
| Demon Red | Kırk Canlı | +20 bonus HP (120 total) |
| Knight | Metin Gönül | 12% damage reduction |
| Eskimo | Soğukkanlı | 30% slow resistance |
| Ninja Red | Sözden Yılmaz | 30% fire spell resistance |
| Boy | Hazırcevap | 15% cooldown reduction |
| Ninja Green | Tez Ayak | 20% mobility spell range bonus |
| Mask Racoon | Sözütok | 15% knockback bonus |
| Fighter White | Koçaklama | 15% knockback resistance |

---

## Spells (27 total)

### Q Slot — Fireball Variants (3 spells, 4 tiers each)

| Spell | Name | Base DMG | KB | CD | Speed | Range | Special |
|---|---|---|---|---|---|---|---|
| fireball-focus | Uzun Hava | 3 | 0.08 | 3.5s | 8 | 450 | Pierces at T3 |
| fireball-speed | Tekerleme | 3 | 0.10 | 1.8s | 8 | 250 | Fast fire rate, CD drops to 1.1s at T4 |
| fireball-power | Taşlama | 3 | 0.12 | 3.2s | 8 | 280 | AoE explosion at T2, stun at T4 |

### W Slot — Mobility & Utility (8 spells, 2 tiers each)

| Spell | Name | Type | CD | Key Mechanic |
|---|---|---|---|---|
| blink | Hop | Blink | 5.5s | Instant teleport, 220 range (+140 at T2) |
| dash | Koşma | Dash | 5.5s | Charge through enemies, 3 dmg (+2 at T1) |
| flash | Seğirtme | Buff | 6.5s | +60% speed for 2s, leaves slow trail at T2 |
| ghost | Gayb | Buff | 9.0s | Intangible 2.5s, projectiles pass through |
| swap | Çelme | Swap | 10.0s | Switch positions with target, stun at T2 |
| timeshift | Devir | Recall | 9.0s | Return to position from 3s ago |
| grappling | Sallama | Hook | 9.0s | Pull self to terrain, flight collision at T2 |
| sacma | Saçma | Projectile | 4.5s | 7-shot scatter cone, 1 dmg each |
| sema | Sema | Buff | 10.0s | Whirling dervish, deflects projectiles |

### E Slot — Control & Debuff (7 spells, 2 tiers each)

| Spell | Name | Type | CD | Key Mechanic |
|---|---|---|---|---|
| frostbolt | Yârin Gözü | Projectile | 4.0s | 50% slow 2s + 400ms root |
| blizzard | Yârin Sözü | Zone | 7.0s | AoE slow field, 3.5s duration |
| icewall | Mâni | Wall | 10.0s | Solid obstacle, 30 HP, shatters with slow at T2 |
| bouncer | Karşılama | Projectile | 5.5s | Bounces off walls (3×), destroys enemy spells |
| shield | Himmet | Buff | 10.0s | Blocks 2 hits, reflects on break at T2 |
| rabita | Rabıta | Link | 12.0s | Links two players — KB transfers between them |
| kement | Kement | Tether | 11.0s | Lasso — tethers target, limits movement range |

### R Slot — Ultimates (9 spells, 2 tiers each)

| Spell | Name | Type | CD | Key Mechanic |
|---|---|---|---|---|
| hook | Bağlama | Hook | 12.0s | Grab + throw enemy (0.13 throw force) |
| lightning | Sitem | Instant | 8.5s | AoE burst around caster, 0.15 KB, chains at T2 |
| homing | Hasret | Homing | 15.0s | Tracking missile, 6s lifetime |
| meteor | Nazar | Zone | 13.0s | Delayed impact, highest KB in game (0.16) |
| rocketswarm | Gıybet | Homing | 14.0s | 5-missile barrage, individually tracking |
| boomerang | Beddua | Boomerang | 8.5s | KB scales with distance (0.03→0.09) |
| bade | Bade | Barrel | 13.0s | Massive rolling barrel, 4 dmg + slow |
| cekim | Çekim | Zone | 12.0s | Gravity well, pulls enemies to center |

---

## Crafting System

### Materials (8)

| ID | Name | Tag | Color |
|---|---|---|---|
| buz | Buz Parçası | ice | Blue |
| koz | Koz | fire | Orange |
| agir | Ağır Taş | force | Brown |
| telek | Telek | speed | Green |
| demir | Demir | guard | Grey |
| kehribar | Kehribar | electric | Gold |
| altin | Altın Varak | greed | Dark gold |
| gam | Gam Yükü | stealth | Purple |

**Drop rates:** 1 base/round + 1 per kill + 1 for round win + item bonuses

### Equipment Slots (3)

| Slot | Theme | Focus |
|---|---|---|
| Saz | Musical instruments | Offense (damage, KB, projectiles) |
| Yadigar | Talismans/relics | Utility (defense, economy, cooldowns) |
| Pabuç | Footwear | Movement (speed, friction, DI, KB resist) |

### Recipes (24 total: 8 per slot)

#### Saz (Offense)

| Recipe | Rarity | Ingredients | Tags | Effect |
|---|---|---|---|---|
| Organ | Beyaz | Koz ×2 | fire | +12% damage |
| Piyano | Yeşil | Buz + Koz | ice, fire | +1 bonus dmg vs slowed |
| Tokmak | Beyaz | Ağır ×2 | force | +12% KB |
| Santur | Yeşil | Buz + Ağır | ice, force | +15% KB vs slowed |
| Küdüm | Yeşil | Ağır + Telek | force, speed | +15% projectile speed, +8% KB at max range |
| Korg | Mor | Koz + Kehribar | fire, electric | +20% damage, +10% KB taken |
| Theremin | Yeşil | Gam + Koz | stealth, fire | First hit each round +40% damage |
| Ksilofon | Mor | Altın + Ağır + Koz | greed, force | +1 SP per elimination |

#### Yadigâr (Utility)

| Recipe | Rarity | Ingredients | Tags | Effect |
|---|---|---|---|---|
| Cevşen | Beyaz | Buz ×2 | ice | 25% shorter slows |
| Çelik Serhad | Beyaz | Demir ×2 | guard | 8% damage reduction |
| Ampul | Yeşil | Kehribar + Demir | electric, guard | 15% damage reduction below 30% HP |
| Saat | Beyaz | Gam ×2 | stealth | 30% CDR after 3s idle |
| Sikke Kesesi | Beyaz | Altın ×2 | greed | +1 SP per round |
| Kelepçe | Yeşil | Buz + Demir | ice, guard | 20% slow/root resist |
| Sarı Altından Bir Boru | Mor | Altın + Gam + Demir | greed, stealth | Disassemble returns 2 mats instead of 1 |
| Kozmatik | Mor | Koz + Kehribar + Demir | fire, electric | +15 max HP, +10% spell cooldown |

#### Pabuç (Movement)

| Recipe | Rarity | Ingredients | Tags | Effect |
|---|---|---|---|---|
| Çarık | Beyaz | Telek ×2 | speed | +10% move speed |
| Köşele | Yeşil | Demir + Telek | guard, speed | +8% KB resist, -5% speed |
| Takunya | Yeşil | Buz + Telek | ice, speed | -30% friction, +5% speed |
| Yün Patik | Yeşil | Gam + Telek | stealth, speed | +20% DI |
| Kundura | Yeşil | Ağır + Demir | force, guard | +15% KB resist, -8% speed |
| Nalın | Mor | Kehribar + Telek | electric, speed | +18% speed, -12 max HP |
| Çorap | Mor | Altın + Telek + Gam | greed, speed | +5% speed, +1 material/round |
| Basmak | Mor | Koz + Telek + Ağır | fire, speed | +10% KB at max speed |

### Hazine — Set Bonuses (18)

#### 2-Tag Same (require same tag on 2 different equipped items)

| Hazine | Tag | Effect |
|---|---|---|
| Buzul | ice ×2 | +12% KB vs slowed targets |
| Yangın | fire ×2 | Burn on hit (1 HP/s, 1s) |
| Deprem | force ×2 | Ignore 30% of target's KB resistance |
| Kasırga | speed ×2 | +15% speed for 2s after casting |
| Kale | guard ×2 | +5% damage reduction per survived round (max 25%) |
| Akımlar | electric ×2 | +25% damage, +20% KB taken |
| Hazine Avcısı | greed ×2 | +2 SP per round |
| Hayalet | stealth ×2 | Semi-transparent for 1.5s after taking KB |

#### 2-Tag Cross (require two different tags from different items)

| Hazine | Tags | Effect |
|---|---|---|
| Permafrost | ice + guard | +30% slow duration dealt |
| Işık Topu | force + speed | +20% KB at >70% max range |
| Berserker | fire + electric | +20% damage below 40% HP |
| Korsanlık | greed + electric | Double material drops, start rounds at 85% HP |
| Sessiz Ölüm | stealth + force | First KB each round +25% force |
| Buz Kalesi | ice + speed | +15% slow bonus while sliding (speed > 80%) |

#### 3-Tag (require same tag on all 3 equipped items)

| Hazine | Tag | Effect |
|---|---|---|
| Mutlak Sıfır | ice ×3 | All spells apply 0.15 slow for 1.5s |
| Cehennem | fire ×3 | Burn becomes 2 HP/s for 2s |
| Titan | force ×3 | +20% KB dealt, +10% KB resist, -10% speed |
| Şimşek | speed ×3 | +25% speed, +30% DI, -15 max HP |

---

## Nazar (Comeback Mechanic)

| Source | Amount |
|---|---|
| Taking KB | +1 per KB event |
| Getting eliminated | +2 |
| Ring damage | +0.5 per second |
| **Max stack** | **10** |

| Spend | Cost | Effect |
|---|---|---|
| Reroll | 1 Nazar | Swap a random material for a different one |
| Extra material | 2 Nazar | Gain 1 random material |
| Recipe hint | 3 Nazar | Reveal an undiscovered recipe |

---

## Economy

### SP Income (per round)

| Source | SP | Condition |
|---|---|---|
| Base | 3 | Always |
| Damage | 1 per 25 dmg | Tracked per round |
| Ring-out kill | 4 | Per elimination |
| Round win | 3 | Last standing |
| Survival | 2 | Not eliminated |

### SP Costs

| Action | Cost |
|---|---|
| Select spell (W/E/R) | 3 SP |
| Q tier upgrade | 5 / 6 / 8 / 10 SP |
| W/E/R tier upgrade | 6 / 10 SP |

### Material Income (per round)

| Source | Count |
|---|---|
| Base | 1 random |
| Per kill | +1 random each |
| Round win | +1 random |
| Çorap item | +1 per round |
| Korsanlık Hazine | All drops ×2 |

---

## Core Physics

| Parameter | Value |
|---|---|
| Base HP | 100 |
| KB Vulnerability | 1.0 + (damageTaken / maxHP) × 1.8 |
| Max vulnerability | ~2.8× at 0% HP |
| Spell damage can kill? | No (floors at 1 HP) |
| Ring damage can kill? | Yes (2 + overshoot² per second) |
| Arena radius | 480px, shrinks at 2.0 + round×0.5 px/sec |
| Round duration | 45 seconds |
| Movement | Ice physics — low friction, momentum-based |
| DI (directional influence) | 0.15 force during KB |

---

*Full machine-readable data available in `docs/game-data.xml`*
