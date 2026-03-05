// Network message types shared between client and server

export const MSG = {
  // Client -> Server
  CLIENT_JOIN: 'c:join',
  CLIENT_INPUT: 'c:input',
  CLIENT_READY: 'c:ready',
  CLIENT_PING: 'c:ping',

  // Client -> Server (spells)
  CLIENT_HOOK_RELEASE: 'c:hookRelease',

  // Client -> Server (shop)
  CLIENT_SHOP_UNLOCK_SLOT: 'c:shopUnlockSlot',
  CLIENT_SHOP_CHOOSE_SPELL: 'c:shopChooseSpell',     // NEW: replaces CHOOSE_BRANCH
  CLIENT_SHOP_UPGRADE_TIER: 'c:shopUpgradeTier',

  // Server -> Client
  SERVER_STATE: 's:state',
  SERVER_JOINED: 's:joined',
  SERVER_PLAYER_JOIN: 's:playerJoin',
  SERVER_PLAYER_LEAVE: 's:playerLeave',
  SERVER_ROUND_START: 's:roundStart',
  SERVER_ROUND_END: 's:roundEnd',
  SERVER_SHOP_OPEN: 's:shopOpen',
  SERVER_SHOP_UPDATE: 's:shopUpdate',
  SERVER_MATCH_END: 's:matchEnd',
  SERVER_SPELL_CONFIRM: 's:spellOk',
  SERVER_SPELL_DENY: 's:spellNo',
  SERVER_PONG: 's:pong',
};
