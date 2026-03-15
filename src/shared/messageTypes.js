// Network message types shared between client and server

export const MSG = {
  // Client -> Server
  CLIENT_JOIN: 'c:join',
  CLIENT_INPUT: 'c:input',
  CLIENT_PING: 'c:ping',

  // Client -> Server (spells)
  CLIENT_SPELL_CAST: 'c:spell',
  CLIENT_HOOK_RELEASE: 'c:hookRelease',

  // Client -> Server (sandbox)
  CLIENT_SANDBOX_SHOP_TOGGLE: 'c:sandboxShopToggle',

  // Client -> Server (shop)
  CLIENT_SHOP_CHOOSE_SPELL: 'c:shopChooseSpell',
  CLIENT_SHOP_UPGRADE_TIER: 'c:shopUpgradeTier',

  // Client -> Server (crafting / items)
  CLIENT_CRAFT_ITEM: 'c:craft',
  CLIENT_DISASSEMBLE_ITEM: 'c:disassemble',
  CLIENT_EQUIP_ITEM: 'c:equip',
  CLIENT_UNEQUIP_ITEM: 'c:unequip',
  CLIENT_NAZAR_SPEND: 'c:nazar',

  // Client -> Server (lobby)
  CLIENT_LIST_ROOMS: 'c:listRooms',
  CLIENT_START_GAME: 'c:startGame',

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
  SERVER_SPELL_CAST: 's:spellCast',
  SERVER_ELIMINATED: 's:eliminated',
  SERVER_PONG: 's:pong',
  SERVER_OBSTACLE_EVENT: 's:obstacleEvent',
  SERVER_CHANNELING: 's:channeling',

  // Server -> Client (lobby)
  SERVER_ROOM_LIST: 's:roomList',
  SERVER_LOBBY_UPDATE: 's:lobbyUpdate',
  SERVER_LOBBY_ERROR: 's:lobbyError',
};
