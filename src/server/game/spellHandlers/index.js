import { SPELL_TYPES } from '../../../shared/spellData.js';
import { projectileHandler } from './projectileHandler.js';
import { zoneHandler } from './zoneHandler.js';
import { blinkHandler } from './blinkHandler.js';
import { dashHandler } from './dashHandler.js';
import { hookHandler } from './hookHandler.js';
import { instantHandler } from './instantHandler.js';
import { buffHandler } from './buffHandler.js';
import { swapHandler } from './swapHandler.js';
import { recallHandler } from './recallHandler.js';
import { homingHandler } from './homingHandler.js';
import { boomerangHandler } from './boomerangHandler.js';
import { wallHandler } from './wallHandler.js';

export const handlers = {
  [SPELL_TYPES.PROJECTILE]: projectileHandler,
  [SPELL_TYPES.ZONE]: zoneHandler,
  [SPELL_TYPES.BLINK]: blinkHandler,
  [SPELL_TYPES.DASH]: dashHandler,
  [SPELL_TYPES.HOOK]: hookHandler,
  [SPELL_TYPES.INSTANT]: instantHandler,
  [SPELL_TYPES.BUFF]: buffHandler,
  [SPELL_TYPES.SWAP]: swapHandler,
  [SPELL_TYPES.RECALL]: recallHandler,
  [SPELL_TYPES.HOMING]: homingHandler,
  [SPELL_TYPES.BOOMERANG]: boomerangHandler,
  [SPELL_TYPES.WALL]: wallHandler,
};
