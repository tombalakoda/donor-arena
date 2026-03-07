import { Room } from './Room.js';
import { MATCH } from '../../shared/constants.js';
import { PHASE } from '../game/RoundManager.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();    // roomId -> Room
    this.nextRoomId = 1;
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
    const room = new Room(roomId);
    this.rooms.set(roomId, room);
    console.log(`Created room: ${roomId}`);
    return room;
  }

  createLobbyRoom() {
    const roomId = `lobby-${this.nextRoomId++}`;
    const room = new Room(roomId, { lobby: true });
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
    const room = new Room(roomId, { sandbox: true });
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
