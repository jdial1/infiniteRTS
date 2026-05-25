import { GameState, Server } from 'socket.io';
import { constants } from '../../data';
import { isPointInTerritory } from '../../src/shared/territory';

export function startGameLoop(gameState: any, io: any) {
  return setInterval(() => {
    const now = Date.now();

    // 1. Capture Logic
    Object.values(gameState.buildings).forEach((b: any) => {
      if (b.type === 'outpost') {
        const capturers = Object.values(gameState.players).filter((p: any) => {
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          return Math.sqrt(dx*dx + dy*dy) <= 150;
        });

        const activePlayers = capturers.filter(p => p.ownerId !== b.ownerId);
        const uniqueTeams = new Set(activePlayers.map(p => p.ownerId));

        if (uniqueTeams.size === 1) {
          const playerId = activePlayers[0].ownerId;
          b.isConflict = false;
          b.capturingPlayerId = playerId;
          b.captureProgress = Math.min(100, b.captureProgress + 1);
          if (b.captureProgress >= 100) {
            b.ownerId = playerId;
            b.captureProgress = 100;
            io.emit('building_updated', b);
          }
          io.emit('building_capture_progress', { id: b.id, progress: b.captureProgress, capturingPlayerId: b.capturingPlayerId });
        } else if (uniqueTeams.size > 1) {
          b.isConflict = true;
          io.emit('building_updated', b);
        } else {
          // No one capturing
          if (b.captureProgress > 0 && b.captureProgress < 100) {
            b.captureProgress = Math.max(0, b.captureProgress - 0.5);
            io.emit('building_capture_progress', { id: b.id, progress: b.captureProgress, capturingPlayerId: b.capturingPlayerId });
          }
          b.isConflict = false;
        }
      }
    });

    // 2. Unit Logic (Simplified for now, would normally move more here)
    // ...

    io.emit('game_state_update', {
      players: gameState.players,
      units: gameState.units,
      buildings: gameState.buildings
    });
  }, 100);
}
