// Character passive ability definitions — shared between client and server.
// Each character has one unique passive that adds strategic depth and counter-pick value.

export const CHARACTER_PASSIVES = {
  'demon-red': {
    id: 'demonic-vitality',
    name: 'Kırk Canlı',
    description: 'Daha fazla Nefes ile başlar',
    bonusHp: 20,
  },
  'knight': {
    id: 'iron-armor',
    name: 'Metin Gönül',
    description: 'Tüm darbelerden az etkilenir',
    damageReduction: 0.12,
  },
  'eskimo': {
    id: 'frost-resistance',
    name: 'Soğukkanlı',
    description: 'Yavaşlama ve köklenme etkilerinden az etkilenir',
    slowResist: 0.30,
  },
  'ninja-red': {
    id: 'fire-resistance',
    name: 'Sözden Yılmaz',
    description: 'Söz hünerlerinden az etkilenir',
    fireResist: 0.30,
  },
  'boy': {
    id: 'quick-learner',
    name: 'Hazırcevap',
    description: 'Sözleri daha çabuk hazır eder',
    cdReduction: 0.15,
  },
  'ninja-green': {
    id: 'shadow-step',
    name: 'Tez Ayak',
    description: 'Hareket sözleri daha uzağa ulaşır',
    mobilityRangeBonus: 0.20,
  },
  'mask-racoon': {
    id: 'bully',
    name: 'Sözütok',
    description: 'Sözleri daha sert savurur',
    knockbackBonus: 0.15,
  },
  'fighter-white': {
    id: 'rush',
    name: 'Koçaklama',
    description: 'İtilince daha az savrulur',
    knockbackResist: 0.15,
  },
};

export function getPassive(characterId) {
  return CHARACTER_PASSIVES[characterId] || {};
}
