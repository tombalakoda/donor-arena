// Character passive ability definitions — shared between client and server.
// Each character has one unique passive that adds strategic depth and counter-pick value.

export const CHARACTER_PASSIVES = {
  'demon-red': {
    id: 'demonic-vitality',
    name: 'Demonic Vitality',
    description: '+20 Max HP',
    bonusHp: 20,
  },
  'knight': {
    id: 'iron-armor',
    name: 'Iron Armor',
    description: '20% damage reduction',
    damageReduction: 0.20,
  },
  'eskimo': {
    id: 'frost-resistance',
    name: 'Frost Resistance',
    description: '40% frost slow/root reduction',
    frostResist: 0.40,
  },
  'ninja-red': {
    id: 'fire-resistance',
    name: 'Fire Resistance',
    description: '30% fire damage reduction',
    fireResist: 0.30,
  },
  'boy': {
    id: 'quick-learner',
    name: 'Quick Learner',
    description: '15% cooldown reduction',
    cdReduction: 0.15,
  },
  'ninja-green': {
    id: 'shadow-step',
    name: 'Shadow Step',
    description: '25% blink range',
    blinkRangeBonus: 0.25,
  },
  'mask-racoon': {
    id: 'bully',
    name: 'Bully',
    description: '15% bonus knockback',
    knockbackBonus: 0.15,
  },
  'fighter-white': {
    id: 'rush',
    name: 'Rush',
    description: '25% dash range',
    dashRangeBonus: 0.25,
  },
};

export function getPassive(characterId) {
  return CHARACTER_PASSIVES[characterId] || {};
}
