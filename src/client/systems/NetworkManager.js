import { io } from 'socket.io-client';
import { MSG } from '../../shared/messageTypes.js';
import { PHYSICS } from '../../shared/constants.js';

export class NetworkManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.playerId = null;
    this.ping = 0;

    // Callbacks
    this.onJoined = null;          // (data) => {}
    this.onPlayerJoin = null;      // (data) => {}
    this.onPlayerLeave = null;     // (data) => {}
    this.onStateUpdate = null;     // (snapshot) => {}
    this.onSpellCast = null;       // (data) => {}
    this.onRoundStart = null;
    this.onRoundEnd = null;
    this.onEliminated = null;
    this.onMatchEnd = null;
    this.onShopOpen = null;        // (data) => {}
    this.onShopUpdate = null;      // (data) => {} — progression state after purchase
    this.onLobbyUpdate = null;     // (data) => {} — lobby player list / host change
    this.onLobbyError = null;      // (data) => {} — lobby error message

    // Input sending throttle
    this.lastInputSendTime = 0;
    this.inputSendInterval = PHYSICS.TICK_MS; // 50ms = 20Hz
  }

  connect(serverUrl) {
    if (!serverUrl) {
      // Auto-detect: use the same origin as the page
      // Works for localhost, LAN, and tunnels (e.g. cloudflared)
      serverUrl = window.location.origin;
    }
    this.socket = io(serverUrl, {
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('Connected to server:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.playerId = null;
      console.log('Disconnected from server');
    });

    // Server confirmed our join
    this.socket.on(MSG.SERVER_JOINED, (data) => {
      this.playerId = data.playerId;
      console.log('Joined room:', data.roomId, 'as', this.playerId);
      if (this.onJoined) this.onJoined(data);
    });

    // Another player joined
    this.socket.on(MSG.SERVER_PLAYER_JOIN, (data) => {
      if (this.onPlayerJoin) this.onPlayerJoin(data);
    });

    // A player left
    this.socket.on(MSG.SERVER_PLAYER_LEAVE, (data) => {
      if (this.onPlayerLeave) this.onPlayerLeave(data);
    });

    // Authoritative state update from server
    this.socket.on(MSG.SERVER_STATE, (snapshot) => {
      if (this.onStateUpdate) this.onStateUpdate(snapshot);
    });

    // Spell cast broadcast from server
    this.socket.on(MSG.SERVER_SPELL_CAST, (data) => {
      if (this.onSpellCast) this.onSpellCast(data);
    });

    // Round events
    this.socket.on(MSG.SERVER_ROUND_START, (data) => {
      if (this.onRoundStart) this.onRoundStart(data);
    });

    this.socket.on(MSG.SERVER_ROUND_END, (data) => {
      if (this.onRoundEnd) this.onRoundEnd(data);
    });

    this.socket.on(MSG.SERVER_ELIMINATED, (data) => {
      if (this.onEliminated) this.onEliminated(data);
    });

    this.socket.on(MSG.SERVER_MATCH_END, (data) => {
      if (this.onMatchEnd) this.onMatchEnd(data);
    });

    // Shop events
    this.socket.on(MSG.SERVER_SHOP_OPEN, (data) => {
      if (this.onShopOpen) this.onShopOpen(data);
    });

    this.socket.on(MSG.SERVER_SHOP_UPDATE, (data) => {
      if (this.onShopUpdate) this.onShopUpdate(data);
    });

    // Lobby events
    this.socket.on(MSG.SERVER_LOBBY_UPDATE, (data) => {
      if (this.onLobbyUpdate) this.onLobbyUpdate(data);
    });

    this.socket.on(MSG.SERVER_LOBBY_ERROR, (data) => {
      if (this.onLobbyError) this.onLobbyError(data);
    });

    // Ping/pong
    this.socket.on(MSG.SERVER_PONG, (data) => {
      this.ping = Date.now() - data.timestamp;
    });

    // Start ping interval
    this.pingInterval = setInterval(() => {
      if (this.connected) {
        this.socket.emit(MSG.CLIENT_PING, { timestamp: Date.now() });
      }
    }, 2000);
  }

  join(playerName, characterId, mode = 'normal', roomId = null) {
    if (!this.connected) return;
    this.socket.emit(MSG.CLIENT_JOIN, { playerName, characterId, mode, roomId });
  }

  sendStartGame() {
    if (!this.connected) return;
    this.socket.emit(MSG.CLIENT_START_GAME);
  }

  sendInput(input) {
    if (!this.connected) return;

    const now = Date.now();
    if (now - this.lastInputSendTime < this.inputSendInterval) return;
    this.lastInputSendTime = now;

    this.socket.emit(MSG.CLIENT_INPUT, input);
  }

  sendSpellCast(slot, spellId, targetX, targetY) {
    if (!this.connected) return;
    this.socket.emit(MSG.CLIENT_SPELL_CAST, { slot, spellId, targetX, targetY });
  }

  sendHookRelease() {
    if (!this.connected) return;
    this.socket.emit(MSG.CLIENT_HOOK_RELEASE);
  }

  sendShopUnlockSlot(slot) {
    if (!this.connected) return;
    this.socket.emit(MSG.CLIENT_SHOP_UNLOCK_SLOT, { slot });
  }

  sendShopChooseSpell(slot, spellId) {
    if (!this.connected) return;
    this.socket.emit(MSG.CLIENT_SHOP_CHOOSE_SPELL, { slot, spellId });
  }

  sendShopUpgradeTier(slot) {
    if (!this.connected) return;
    this.socket.emit(MSG.CLIENT_SHOP_UPGRADE_TIER, { slot });
  }

  disconnect() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.socket) {
      // Remove all listeners to prevent duplicates on reconnect
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.playerId = null;
  }
}
