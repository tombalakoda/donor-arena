// Skill Tree Definitions — shared between client and server
// Each spell has base stats and tier upgrades.
// Q spells: 4 tiers. W/E/R spells: 2 tiers.
// Stats are computed by applying tier mods additively on top of base.

export const SKILL_TREES = {
  // ═══════════════════════════════════════════════════════════════
  // Q — FIREBALL VARIANTS (3 paths, 4 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'fireball-focus': {
    base: {
      type: 'projectile',
      damage: 3,
      knockbackForce: 0.08,      // sniper: long range poke, lower KB than power
      cooldown: 3500,             // sniper: slow fire rate
      speed: 8,
      range: 450,                 // sniper: long range
      radius: 7,
      lifetime: 2300,             // proportional to range
      piercing: false,
    },
    tiers: [
      { cost: 5, name: 'Uzak Nefes', description: 'Daha uzun menzil, daha hızlı söz', mods: { range: 60, speed: 1 } },
      { cost: 6, name: 'Ağır Söz', description: 'Daha sert itme', mods: { knockbackForce: 0.02 } },
      { cost: 8, name: 'Delici Söz', description: 'Söz rakiplerden geçer', mods: { piercing: true } },
      { cost: 10, name: 'Yıldırım Nefes', description: 'En uzun menzil, en sert itme', mods: { range: 80, knockbackForce: 0.02, speed: 1 } },
    ],
  },

  'fireball-speed': {
    base: {
      type: 'projectile',
      damage: 3,
      knockbackForce: 0.10,      // machinegun: moderate per-shot KB
      cooldown: 1800,             // machinegun: fast fire rate
      speed: 8,
      range: 250,                 // machinegun: short range
      radius: 2,                  // small rapid-fire projectile
      lifetime: 1300,             // proportional to range
      piercing: false,
    },
    tiers: [
      { cost: 5, name: 'Hızlı Atış', description: 'Daha hızlı ateş eder', mods: { cooldown: -300, speed: 1 } },
      { cost: 6, name: 'Yakıcı Alev', description: 'Daha güçlü yakar', mods: { cooldown: -300, damage: 1 } },
      { cost: 8, name: 'Uzun Menzil', description: 'Daha uzağa ulaşır', mods: { cooldown: -200, range: 50 } },
      { cost: 10, name: 'Ateş Yağmuru', description: 'Daha da hızlı ateş', mods: { cooldown: -200 } },
    ],
  },

  'fireball-power': {
    base: {
      type: 'projectile',
      damage: 3,
      knockbackForce: 0.12,      // power: strong Q poke, sets up R kills
      cooldown: 3200,             // power: slow fire rate
      speed: 8,
      range: 280,                 // power: short range (close combat)
      radius: 7,
      lifetime: 1500,             // proportional to range
      piercing: false,
    },
    tiers: [
      { cost: 5, name: 'Sert Vuruş', description: 'Daha çok itme, daha çok hasar', mods: { knockbackForce: 0.02, damage: 1 } },
      { cost: 6, name: 'Çarpma Dalgası', description: 'Çarptığında patlar', mods: { explosionRadius: 40 } },
      { cost: 8, name: 'Sarsıntı', description: 'Daha geniş patlama, daha çok itme', mods: { explosionRadius: 15, knockbackForce: 0.02 } },
      { cost: 10, name: 'Zelzele', description: 'Yıkıcı patlama, kısa sersemletme', mods: { damage: 2, knockbackForce: 0.02, stunDuration: 300 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // W — MOBILITY (6 spells, 2 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'blink': {
    base: {
      type: 'blink',
      cooldown: 5500,
      range: 220,
      damage: 0,
      knockbackForce: 0,
    },
    tiers: [
      { cost: 6, name: 'Uzun Adım', description: 'Daha uzağa ışınlan', mods: { range: 60 } },
      { cost: 10, name: 'Burak', description: 'Çok daha uzağa, daha kısa bekleme', mods: { range: 80, cooldown: -1000 } },
    ],
  },

  'dash': {
    base: {
      type: 'dash',
      cooldown: 5500,
      range: 160,
      dashDamage: 3,
      dashKnockback: 0.04,       // bump: useful near edge, not a weapon
      dashWidth: 12,
    },
    tiers: [
      { cost: 6, name: 'Ağır Hücum', description: 'Daha sert çarpma, daha çok hasar', mods: { dashKnockback: 0.02, dashDamage: 2 } },
      { cost: 10, name: 'Koç Başı', description: 'Daha geniş, kısa bekleme, daha çok itme', mods: { dashWidth: 10, cooldown: -1000, dashKnockback: 0.02 } },
    ],
  },

  'flash': {
    base: {
      type: 'buff',
      cooldown: 6500,
      buffDuration: 2000,
      speedBoost: 0.6,          // +60% movement speed
      frictionReduction: 0.003, // reduce air friction during flash
    },
    tiers: [
      { cost: 6, name: 'Alev Topuk', description: 'Daha uzun hız, daha hızlı koşu', mods: { buffDuration: 1000, speedBoost: 0.2 } },
      { cost: 10, name: 'Ateş İzi', description: 'Ardında yavaşlatan iz bırakır', mods: { cooldown: -1500, leaveTrail: true, trailSlowAmount: 0.3, trailSlowDuration: 1500 } },
    ],
  },

  'ghost': {
    base: {
      type: 'buff',
      cooldown: 9000,
      buffDuration: 2500,
      speedBoost: 0.2,          // +20% movement speed
      intangible: true,         // projectiles pass through
    },
    tiers: [
      { cost: 6, name: 'Hayalet', description: 'Daha uzun dokunulmazlık', mods: { buffDuration: 1000 } },
      { cost: 10, name: 'Cin Çarpması', description: 'Gaybdan çıkınca etraftakileri iter', mods: { cooldown: -2000, exitPushForce: 0, exitPushRadius: 0 } },
    ],
  },

  'swap': {
    base: {
      type: 'swap',
      cooldown: 10000,
      speed: 8,
      range: 350,
      radius: 7,
      lifetime: 1800,
      damage: 0,
      knockbackForce: 0,
    },
    tiers: [
      { cost: 6, name: 'Çabuk El', description: 'Daha hızlı söz, daha kısa bekleme', mods: { speed: 3, cooldown: -2000 } },
      { cost: 10, name: 'Şaşırtma', description: 'Yer değiştirince rakip sersemler', mods: { swapStunDuration: 500, cooldown: -1500 } },
    ],
  },

  'timeshift': {
    base: {
      type: 'recall',
      cooldown: 9000,
      recallDuration: 3000,     // stores 3s of position history
    },
    tiers: [
      { cost: 6, name: 'Derin Hafıza', description: '4 sâniye geriye dön, kısa bekleme', mods: { recallDuration: 1000, cooldown: -1500 } },
      { cost: 10, name: 'Zaman Yarığı', description: 'Ayrıldığın yerde itme dalgası, kısa bekleme', mods: { departurePushForce: 0, departurePushRadius: 0, cooldown: -1500 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // E — DEBUFF / CONTROL (5 spells, 2 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'frostbolt': {
    base: {
      type: 'projectile',
      damage: 2,
      knockbackForce: 0.02,
      cooldown: 4000,
      speed: 7,
      range: 350,
      radius: 6,
      lifetime: 2000,
      piercing: false,
      slowAmount: 0.5,
      slowDuration: 2000,
      rootDuration: 400,
    },
    tiers: [
      { cost: 6, name: 'Ebedî Ayaz', description: 'Daha güçlü, daha uzun yavaşlatma', mods: { slowDuration: 500, slowAmount: 0.1 } },
      { cost: 10, name: 'Mutlak Sıfır', description: 'Derin don: uzun köklenme, sert itme', mods: { rootDuration: 400, knockbackForce: 0.02, damage: 2 } },
    ],
  },

  'blizzard': {
    base: {
      type: 'zone',
      cooldown: 7000,
      range: 300,
      zoneRadius: 45,
      zoneDuration: 3500,
      zoneDamage: 0,
      slowAmount: 0.5,
      slowDuration: 1000,
    },
    tiers: [
      { cost: 6, name: 'Yayılan Soğuk', description: 'Daha geniş alan, daha uzun süre', mods: { zoneRadius: 20, zoneDuration: 1500 } },
      { cost: 10, name: 'Buzul Çağı', description: 'Alan hasar verir, çok daha fazla yavaşlatır', mods: { zoneDamage: 1, slowAmount: 0.15 } },
    ],
  },

  'icewall': {
    base: {
      type: 'wall',
      cooldown: 10000,
      range: 200,
      wallDuration: 4000,
      wallHp: 30,
      wallRadius: 22,           // circular obstacle radius
    },
    tiers: [
      { cost: 6, name: 'Sağlam Duvar', description: 'Daha dayanıklı, daha uzun ömür', mods: { wallHp: 20, wallDuration: 2000 } },
      { cost: 10, name: 'Parçalanma', description: 'Yıkılınca patlar, yakındakileri yavaşlatır', mods: { shatterSlowAmount: 0.4, shatterSlowDuration: 1500, shatterRadius: 60, cooldown: -2000 } },
    ],
  },

  'bouncer': {
    base: {
      type: 'projectile',
      damage: 2,
      knockbackForce: 0.03,
      cooldown: 5500,
      speed: 6,
      range: 600,
      radius: 7,
      lifetime: 4000,
      piercing: false,
      maxBounces: 3,
      destroysSpells: true,     // destroys enemy projectiles on contact
    },
    tiers: [
      { cost: 6, name: 'Çarpıp Sekme', description: 'Daha çok sekme, daha hızlı söz', mods: { maxBounces: 2, speed: 2 } },
      { cost: 10, name: 'İvme', description: 'Her sekmede daha güçlü olur', mods: { kbPerBounce: 0.01, cooldown: -1000 } },
    ],
  },

  'shield': {
    base: {
      type: 'buff',
      cooldown: 10000,
      buffDuration: 2000,
      shieldHits: 2,            // blocks this many hits
    },
    tiers: [
      { cost: 6, name: 'Pekişmiş', description: 'Daha çok darbe emer, daha uzun sürer', mods: { shieldHits: 1, buffDuration: 1000 } },
      { cost: 10, name: 'Yansıtma', description: 'Kırılınca son darbeyi yansıtır. Kısa bekleme.', mods: { reflectOnBreak: true, cooldown: -2000 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // R — ULTIMATE (7 spells, 2 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'hook': {
    base: {
      type: 'hook',
      damage: 3,
      knockbackForce: 0,
      cooldown: 12000,
      speed: 12,
      range: 300,
      radius: 10,
      lifetime: 1500,
      pullSpeed: 3.5,
      pullDuration: 300,
      throwForce: 0.13,           // powerful throw but not the strongest
      throwGrace: 200,
    },
    tiers: [
      { cost: 6, name: 'Sivri Kanca', description: 'Daha sert fırlatma, daha çok hasar', mods: { throwForce: 0.01, damage: 2, cooldown: -1500 } },
      { cost: 10, name: 'Ölüm Kavraması', description: 'Uzun menzil, hızlı çekim, sert savurma', mods: { range: 60, pullSpeed: 1.5, throwForce: 0.01, pullDuration: 100 } },
    ],
  },

  'grappling': {
    base: {
      type: 'hook',
      damage: 0,
      knockbackForce: 0,
      cooldown: 9000,
      speed: 12,
      range: 320,
      radius: 8,
      lifetime: 1500,
      pullSelf: true,
      pullSpeed: 4,
      launchSpeedBonus: 0,
      flightDuration: 500,
    },
    tiers: [
      { cost: 6, name: 'Uzun Zincir', description: 'Daha hızlı çekim, daha uzun menzil', mods: { pullSpeed: 2, range: 80, cooldown: -1500 } },
      { cost: 10, name: 'Gülle', description: 'Uçarken rakiplere çarpar', mods: { flightCollision: true, flightDamage: 4, flightKnockback: 0.03 } },
    ],
  },

  'lightning': {
    base: {
      type: 'instant',
      damage: 3,
      knockbackForce: 0.15,
      castTime: 750,            // 750ms channeling windup before firing
      cooldown: 8500,
      radius: 70,               // AoE radius around caster
    },
    tiers: [
      { cost: 6, name: 'Hamle', description: 'Daha geniş menzil, daha sert itme', mods: { radius: 40, knockbackForce: 0.03 } },
      { cost: 10, name: 'Zincirleme Sitem', description: 'İkinci rakibe yarı güçle sıçrar', mods: { chainCount: 1, chainKbFactor: 0.5, cooldown: -1500 } },
    ],
  },

  'homing': {
    base: {
      type: 'homing',
      damage: 3,
      knockbackForce: 0.08,      // pressure tool, forces movement — not a kill tool
      cooldown: 15000,
      speed: 3.5,
      radius: 7,
      lifetime: 6000,
      turnRate: 0.08,           // radians per tick (how fast it steers)
      trackingRange: 400,       // max distance to acquire a target
    },
    tiers: [
      { cost: 6, name: 'Sebat', description: 'Daha uzun izler, daha keskin döner', mods: { lifetime: 2000, turnRate: 0.03 } },
      { cost: 10, name: 'Harp Başı', description: 'Daha hızlı, daha güçlü, çarpınca patlar', mods: { speed: 2, knockbackForce: 0.03, explosionRadius: 30 } },
    ],
  },

  'meteor': {
    base: {
      type: 'zone',
      damage: 5,
      knockbackForce: 0.16,      // hardest KB in game — kills at ≤94HP from center
      cooldown: 13000,
      range: 150,               // close range cast — high risk, high reward
      impactDelay: 2000,        // 2s delay before impact
      impactRadius: 45,         // smaller AoE — powerful but hard to hit
      isMeteor: true,           // flag for special meteor behavior
    },
    tiers: [
      { cost: 6, name: 'Çabuk Düşüş', description: 'Daha hızlı çarpar, biraz daha geniş patlar', mods: { impactDelay: -500, impactRadius: 10, cooldown: -2000 } },
      { cost: 10, name: 'Kıyamet', description: 'Yıkıcı darbe, ardında yanan zemin bırakır', mods: { knockbackForce: 0.04, damage: 3, burnZoneDuration: 2000, burnSlowAmount: 0.3 } },
    ],
  },

  'rocketswarm': {
    base: {
      type: 'homing',
      damage: 1,
      knockbackForce: 0.04,
      cooldown: 14000,              // long CD — powerful but infrequent
      speed: 8,                   // faster missiles, more threatening
      radius: 5,
      lifetime: 4000,             // more time to find and chase targets
      turnRate: 0.10,             // sharp turns, can do near-180° corrections
      trackingRange: 280,         // detect targets much earlier, actually "seek"
      missileCount: 5,
      isSwarm: true,
    },
    tiers: [
      { cost: 6, name: 'Yaylım', description: 'Daha çok söz, daha uzun süre', mods: { missileCount: 3, lifetime: 500 } },
      { cost: 10, name: 'Doygunluk', description: 'Daha güçlü sözler, daha geniş takip', mods: { knockbackForce: 0.01, trackingRange: 50, cooldown: -2000 } },
    ],
  },

  'boomerang': {
    base: {
      type: 'boomerang',
      damage: 2,
      knockbackForce: 0.03,     // base KB at close range
      maxKnockbackForce: 0.09,  // KB at max range (scales linearly with distance)
      cooldown: 8500,
      speed: 7,
      range: 70,                // barely goes forward before returning
      radius: 8,
      lifetime: 4000,           // generous for short outbound + return + overshoot
      overshootRange: 500,      // how far past the caster it travels (accelerates through)
    },
    tiers: [
      { cost: 6, name: 'Uzun Fırlatma', description: 'Daha uzak menzil, daha sert dönüş', mods: { range: 100, maxKnockbackForce: 0.02, lifetime: 2000 } },
      { cost: 10, name: 'Tut ve Fırlat', description: 'Dönüşte de vurur, yakalayınca bekleme azalır', mods: { hitsOnReturn: true, cooldownOnCatch: -2000 } },
    ],
  },

  'bade': {
    base: {
      type: 'barrel',
      damage: 4,
      knockbackForce: 0.08,      // snowplow drag + slow
      cooldown: 13000,
      speed: 5,
      range: 1050,
      radius: 16,
      lifetime: 10500,
      slowAmount: 0.4,           // slows enemies after contact so they can't escape
      slowDuration: 1500,
    },
    tiers: [
      { cost: 6, name: 'Ağır Varil', description: 'Daha geniş ve sert varil', mods: { radius: 4, speed: 1, knockbackForce: 0.02 } },
      { cost: 10, name: 'Yıkım Topu', description: 'Daha hızlı, engelleri yıkar', mods: { speed: 1.5, cooldown: -2500, destroysObstacles: true } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // W — SACMA & SEMA (new W spells, 2 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'sacma': {
    base: {
      type: 'projectile',
      damage: 1,
      knockbackForce: 0.012,     // very weak per pellet — 7 pellets combo-stack, keep low
      cooldown: 4500,
      speed: 7,
      range: 150,                // very short range — close-quarters only
      radius: 2,                 // tiny pellets
      lifetime: 900,
      piercing: false,
      projectileCount: 7,        // seven tiny pellets
      coneAngle: 0.70,           // ~40 degree spread
    },
    tiers: [
      { cost: 6, name: 'Sıkı Nişan', description: 'Daha çok parça, daralan hunı', mods: { projectileCount: 2, coneAngle: -0.15 } },
      { cost: 10, name: 'Kurşun Yağmuru', description: 'Daha kısa bekleme, daha sert itme', mods: { cooldown: -800, knockbackForce: 0.006 } },
    ],
  },

  'sema': {
    base: {
      type: 'buff',
      cooldown: 10000,
      buffDuration: 2500,
      pushRadius: 50,            // push enemies within 50px
      pushForce: 0.012,          // gentle per-tick push (NOT knockback)
      speedPenalty: 0.3,         // 30% slower while spinning
      deflectsProjectiles: true, // bounces enemy projectiles away
      isSema: true,
    },
    tiers: [
      { cost: 6, name: 'Dönen Pervane', description: 'Daha uzun, daha geniş itme', mods: { buffDuration: 1000, pushRadius: 15 } },
      { cost: 10, name: 'Kasırga', description: 'Hız cezası kalkar, son anda patlama', mods: { speedPenalty: -0.3, burstPushForce: 0.06 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // E — RABITA & KEMENT (new E spells, 2 tiers each)
  // ═══════════════════════════════════════════════════════════════
  'rabita': {
    base: {
      type: 'link',
      damage: 2,
      knockbackForce: 0,         // no KB on hit — the link IS the weapon
      cooldown: 12000,
      speed: 8,
      range: 300,
      radius: 7,
      lifetime: 1500,            // projectile phase
      linkDuration: 4000,        // shared-KB phase
      linkedKbMultiplier: 0,     // 0 = equal sharing, T1 adds 0.25 (enemy gets 25% more)
      linkForwardForce: 0.008,   // Body.applyForce factor for KB forwarding
      linkForwardKb: 0.003,      // applyKnockback factor for KB forwarding
    },
    tiers: [
      { cost: 6, name: 'Ağır Bağ', description: 'Bağlanan daha çok savrulur, daha uzun süre', mods: { linkedKbMultiplier: 0.25, linkDuration: 1000 } },
      { cost: 10, name: 'Kader Ortağı', description: 'Daha kısa bekleme, çok daha uzun bağ', mods: { cooldown: -2500, linkDuration: 1000 } },
    ],
  },

  'kement': {
    base: {
      type: 'tether',
      cooldown: 11000,
      speed: 10,
      range: 200,                // cast range
      radius: 8,
      lifetime: 1500,            // projectile flight phase
      tetherLength: 140,         // rope length
      tetherDuration: 3500,      // how long the rope lasts
      pullStrength: 0.002,       // soft elastic pull-back force multiplier
    },
    tiers: [
      { cost: 6, name: 'Sağlam Urgan', description: 'Daha uzun süre, kısa bekleme', mods: { tetherDuration: 2000, cooldown: -2000 } },
      { cost: 10, name: 'Kısa İp', description: 'Daha kısa ip, daha sıkı çekim', mods: { tetherLength: -40, pullStrength: 0.003 } },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // R — CEKIM (new R spell, 2 tiers)
  // ═══════════════════════════════════════════════════════════════
  'cekim': {
    base: {
      type: 'zone',
      cooldown: 12000,
      range: 250,
      zoneRadius: 55,
      zoneDuration: 3500,
      zoneDamage: 0,             // no damage — purely positional
      pullForce: 0.010,          // per-tick pull toward center
      slowAmount: 0,
      isGravityWell: true,
    },
    tiers: [
      { cost: 6, name: 'Derin Kuyu', description: 'Daha güçlü çekim, daha geniş alan', mods: { pullForce: 0.004, zoneRadius: 15 } },
      { cost: 10, name: 'Kara Delik', description: 'Bitince dışa patlama', mods: { burstPushForce: 0.08, burstPushRadius: 70 } },
    ],
  },
};

/**
 * Compute effective stats for a spell at a given tier level.
 *
 * @param {string} spellId - e.g. 'fireball-focus', 'blink', 'hook', etc.
 * @param {number} tierLevel - 0 = base only, 1 = first tier upgrade, 2 = second, etc.
 * @returns {Object} computed stats with all modifiers applied additively
 */
export function computeSpellStats(spellId, tierLevel) {
  const tree = SKILL_TREES[spellId];
  if (!tree) return null;

  // Start with a copy of base stats
  const stats = { ...tree.base };

  // If tier 0, return base stats
  if (!tierLevel || tierLevel <= 0) return stats;

  // Apply tiers 0 through tierLevel-1 (clamped to available tiers)
  const maxTier = Math.min(tierLevel, tree.tiers.length);
  for (let i = 0; i < maxTier; i++) {
    const tier = tree.tiers[i];
    for (const [key, value] of Object.entries(tier.mods)) {
      if (typeof value === 'boolean') {
        // Boolean mods override (e.g., piercing: true, pullSelf: true)
        stats[key] = value;
      } else if (typeof value === 'number') {
        // Numeric mods are additive
        stats[key] = (stats[key] || 0) + value;
      }
    }
  }

  return stats;
}

/**
 * Get the cost to upgrade to the next tier for a spell.
 *
 * @param {string} spellId
 * @param {number} currentTier - current tier level (0-based)
 * @returns {number|null} cost in SP, or null if max tier reached
 */
export function getUpgradeCost(spellId, currentTier) {
  const tree = SKILL_TREES[spellId];
  if (!tree) return null;

  if (currentTier >= tree.tiers.length) return null; // already max
  return tree.tiers[currentTier].cost;
}

/**
 * Get info about the next tier upgrade.
 *
 * @param {string} spellId
 * @param {number} currentTier
 * @returns {{ name, description, cost, mods }|null}
 */
export function getNextTierInfo(spellId, currentTier) {
  const tree = SKILL_TREES[spellId];
  if (!tree) return null;

  if (currentTier >= tree.tiers.length) return null;
  return tree.tiers[currentTier];
}

/**
 * Get max tier count for a spell.
 */
export function getMaxTier(spellId) {
  const tree = SKILL_TREES[spellId];
  return tree ? tree.tiers.length : 0;
}
