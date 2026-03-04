import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './rooms/RoomManager.js';
import { MSG } from '../shared/messageTypes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve the built client files (from `npx vite build`)
app.use(express.static(path.join(__dirname, '../../dist')));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const roomManager = new RoomManager();

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  let currentRoom = null;

  // Player joins a match
  socket.on(MSG.CLIENT_JOIN, (data) => {
    const { playerName, characterId, mode } = data || {};
    if (mode === 'sandbox') {
      currentRoom = roomManager.createSandboxRoom();
    } else {
      currentRoom = roomManager.findOrCreateRoom();
    }
    currentRoom.addPlayer(socket, playerName, characterId);
    console.log(`${socket.id} joined ${currentRoom.id} (${currentRoom.playerCount} players) mode: ${mode || 'normal'}`);
  });

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

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Game server running on port ${PORT}`);
});
