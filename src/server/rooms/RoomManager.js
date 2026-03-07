import { readFileSync } from 'fs';
import path from 'path';
import { Room } from './Room.js';
import { MATCH } from '../../shared/constants.js';
import { PHASE } from '../game/RoundManager.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();    // roomId -> Room
    this.nextRoomId = 1;
    this.arenaMaps = [];       // Loaded once at startup, shared by all rooms
  }

  // Load arena maps once at startup (avoids blocking I/O in Room constructor)
  loadMaps(mapsDir) {
    for (let i = 0; i <= 9; i++) {
      try {
        const mapPath = path.join(mapsDir, `arena${i}.json`);
        this.arenaMaps.push(JSON.parse(readFileSync(mapPath, 'utf-8')));
      } catch (e) { /* skip missing */ }
    }
    if (this.arenaMaps.length === 0) {
      try {
        const mapPath = path.join(mapsDir, 'arena-default.json');
        this.arenaMaps.push(JSON.parse(readFileSync(mapPath, 'utf-8')));
      } catch (e) {
        console.warn('No arena maps found');
      }
    }
    console.log(`Loaded ${this.arenaMaps.length} arena maps`);
  }

  // Find a room with space, or create a new one (skips lobby & sandbox rooms)
  findOrCreateRoom() {
    for (const [id, room] of this.rooms) {
      if (room.sandbox) continue;
      if (room.lobby) continue;
      if (room.rounds.phase === PHASE.MATCH_END) continue;
      if (room.playerCount < MATCH.MAX_PLAYERS) {
        return room;
      }
    }
    return this.createRoom();
  }

  createRoom() {
    const roomId = `room-${this.nextRoomId++}`;
    const room = new Room(roomId, { arenaMaps: this.arenaMaps });
    this.rooms.set(roomId, room);
    console.log(`Created room: ${roomId}`);
    return room;
  }

  createLobbyRoom() {
    const roomId = `lobby-${this.nextRoomId++}`;
    const room = new Room(roomId, { lobby: true, arenaMaps: this.arenaMaps });
    this.rooms.set(roomId, room);
    console.log(`Created lobby room: ${roomId}`);
    return room;
  }

  getOpenLobbies() {
    const lobbies = [];
    for (const [id, room] of this.rooms) {
      if (!room.lobby) continue;
      if (room.running) continue;
      if (room.playerCount >= MATCH.MAX_PLAYERS) continue;
      // Find host name
      const hostPlayer = room.hostId ? room.players.get(room.hostId) : null;
      lobbies.push({
        roomId: id,
        hostName: hostPlayer ? hostPlayer.name : '???',
        playerCount: room.playerCount,
        maxPlayers: MATCH.MAX_PLAYERS,
      });
    }
    return lobbies;
  }

  createSandboxRoom() {
    const roomId = `sandbox-${this.nextRoomId++}`;
    const room = new Room(roomId, { sandbox: true, arenaMaps: this.arenaMaps });
    this.rooms.set(roomId, room);
    console.log(`Created sandbox room: ${roomId}`);
    return room;
  }

  removeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.destroy();
      this.rooms.delete(roomId);
      console.log(`Removed room: ${roomId}`);
    }
  }

  // Find which room a player is in
  findPlayerRoom(playerId) {
    for (const [id, room] of this.rooms) {
      if (room.players.has(playerId)) {
        return room;
      }
    }
    return null;
  }

  // Clean up empty rooms
  cleanup() {
    for (const [id, room] of this.rooms) {
      if (room.playerCount === 0) {
        this.removeRoom(id);
      }
    }
  }
}
