import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './rooms/RoomManager.js';
import { MSG } from '../shared/messageTypes.js';
import { CHARACTER_PASSIVES } from '../shared/characterPassives.js';

const VALID_CHARACTERS = new Set(Object.keys(CHARACTER_PASSIVES));
const MAX_ROOMS = 50;
const JOIN_COOLDOWN_MS = 2000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve the built client files (from `npx vite build`)
app.use(express.static(path.join(__dirname, '../../dist')));
const httpServer = createServer(app);

// CORS: use explicit origins from env var, or allow all origins (safe for same-origin deploys like Railway)
let ALLOWED_ORIGINS = true; // true = allow all origins (client is served from same server)
if (process.env.CORS_ORIGINS) {
  const origins = process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
  const invalid = origins.filter(o => !/^https?:\/\/.+/.test(o));
  if (invalid.length > 0) {
    console.error(`[CORS] Invalid origins (must start with http:// or https://): ${invalid.join(', ')}`);
    process.exit(1);
  }
  ALLOWED_ORIGINS = origins;
}

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();
roomManager.loadMaps(path.join(__dirname, '../../public/assets/maps'));

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  let currentRoom = null;
  let lastJoinTime = 0;

  // Player joins a match
  socket.on(MSG.CLIENT_JOIN, (data) => {
    // Rate limit: 1 join per 2 seconds per socket
    const now = Date.now();
    if (now - lastJoinTime < JOIN_COOLDOWN_MS) return;
    lastJoinTime = now;

    // Clean up previous room if player re-joins
    if (currentRoom) {
      currentRoom.removePlayer(socket.id);
      if (currentRoom.playerCount === 0) roomManager.removeRoom(currentRoom.id);
      currentRoom = null;
    }

    const { playerName, characterId, mode, roomId } = data || {};

    // Sanitize playerName: type check, strip HTML/control chars/RTL overrides, max 20 chars
    let safeName = null;
    if (typeof playerName === 'string') {
      safeName = playerName
        .replace(/<[^>]*>/g, '')       // strip HTML tags
        .replace(/[\x00-\x1f]/g, '')   // strip control characters
        .replace(/[\u202A-\u202E\u2066-\u2069\u200F\u200E\u061C]/g, '') // strip RTL/LTR override & bidi control chars
        .replace(/[\uFFF0-\uFFFF]/g, '') // strip specials block (includes replacement char)
        .trim()
        .slice(0, 20);
      if (safeName.length === 0) safeName = null;
    }

    // Validate characterId against whitelist
    const safeCharacterId = (typeof characterId === 'string' && VALID_CHARACTERS.has(characterId))
      ? characterId : 'boy';

    if (mode === 'sandbox') {
      // Global room cap
      if (roomManager.rooms.size >= MAX_ROOMS) {
        socket.emit(MSG.SERVER_LOBBY_ERROR, { error: 'SUNUCU DOLU' });
        return;
      }
      currentRoom = roomManager.createSandboxRoom();
    } else if (mode === 'join') {
      // Join an existing lobby by roomId
      if (typeof roomId !== 'string') return;
      const room = roomManager.rooms.get(roomId);
      if (!room || !room.lobby) {
        socket.emit(MSG.SERVER_LOBBY_ERROR, { error: 'ODA BULUNAMADI' });
        return;
      }
      if (room.running) {
        socket.emit(MSG.SERVER_LOBBY_ERROR, { error: 'OYUN BAŞLADI' });
        return;
      }
      if (room.playerCount >= 8) {
        socket.emit(MSG.SERVER_LOBBY_ERROR, { error: 'ODA DOLU' });
        return;
      }
      currentRoom = room;
    } else {
      // Normal mode: create a new lobby room
      if (roomManager.rooms.size >= MAX_ROOMS) {
        socket.emit(MSG.SERVER_LOBBY_ERROR, { error: 'SUNUCU DOLU' });
        return;
      }
      currentRoom = roomManager.createLobbyRoom();
    }
    currentRoom.addPlayer(socket, safeName, safeCharacterId);
    console.log(`${socket.id} joined ${currentRoom.id} (${currentRoom.playerCount} players) mode: ${mode || 'normal'}`);
  });

  // List open lobby rooms
  socket.on(MSG.CLIENT_LIST_ROOMS, () => {
    socket.emit(MSG.SERVER_ROOM_LIST, { rooms: roomManager.getOpenLobbies() });
  });

  // Note: c:startGame listener is registered per-player inside Room.addPlayer() for lobby rooms

  // Player sends input
  socket.on(MSG.CLIENT_INPUT, (input) => {
    if (currentRoom) {
      currentRoom.handleInput(socket.id, input);
    }
  });

  // Ping for latency measurement
  socket.on(MSG.CLIENT_PING, (data) => {
    socket.emit(MSG.SERVER_PONG, {
      timestamp: data.timestamp,
      serverTime: Date.now(),
    });
  });

  // Player disconnects
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    if (currentRoom) {
      currentRoom.removePlayer(socket.id);
      if (currentRoom.playerCount === 0) {
        roomManager.removeRoom(currentRoom.id);
      }
      currentRoom = null;
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', rooms: roomManager.rooms.size, uptime: process.uptime() });
});

// SPA fallback — serve index.html for any non-API/non-asset route
// Skip if the request looks like a file (has an extension)
app.get('/{*splat}', (req, res) => {
  if (req.path !== '/' && path.extname(req.path)) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, '../../dist/index.html'));
});

const PORT = parseInt(process.env.PORT, 10) || 3001;
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`[FATAL] Invalid PORT: ${process.env.PORT}. Must be a number between 1 and 65535.`);
  process.exit(1);
}
httpServer.listen(PORT, () => {
  console.log(`Game server running on port ${PORT}`);
});

// Prevent silent crashes — log fatal errors
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});
