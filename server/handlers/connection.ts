import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { gameState, socketToUser, userToSocket } from '../state';
import { randomInt } from '../utils';
import { upgrades } from '../../data';
import { generateChunk } from '../map/generator';

export function handleConnection(io: Server, socket: Socket) {
    const userId = socket.handshake.auth.userId || uuidv4();

    // Force disconnect old socket if user is already active
    const oldSocketId = userToSocket.get(userId);
    if (oldSocketId && oldSocketId !== socket.id) {
        io.to(oldSocketId).emit('error', 'Connected from another location');
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) oldSocket.disconnect(true);
    }

    socketToUser.set(socket.id, userId);
    userToSocket.set(userId, socket.id);

    // Create or retrieve player
    if (!gameState.players[userId]) {
      const initialUpgrades: Record<string, number> = {};
      upgrades.forEach(u => {
        initialUpgrades[u.id] = 0;
      });

      gameState.players[userId] = {
        id: userId,
        name: `Player ${userId.substring(0, 4)}`,
        x: randomInt(-500, 500),
        y: randomInt(-500, 500),
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        inventory: { wood: 300, stone: 200, gold: 100 },
        score: 0,
        traits: [],
        upgrades: initialUpgrades
      };
      socket.broadcast.emit('player_joined', gameState.players[userId]);
    }

    const player = gameState.players[userId];
    const initState = {
      players: gameState.players,
      buildings: gameState.buildings,
      units: gameState.units,
      zones: {},
      resources: {}
    };
    socket.emit('init', initState);

    return userId;
}
