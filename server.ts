import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { gameState } from './server/state';
import { startGameLoop } from './server/logic/gameLoop';
import { handleConnection } from './server/handlers/connection';
import { registerGameActions } from './server/handlers/gameActions';

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  // Start the game loop
  startGameLoop(gameState, io);

  io.on('connection', (socket) => {
    const userId = handleConnection(io, socket);
    registerGameActions(io, socket, userId);

    socket.on('disconnect', () => {
      console.log('User disconnected:', userId);
    });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(process.cwd(), 'dist/index.html')));
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
