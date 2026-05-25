import { GameState, ResourceNode, Building, MapZone } from '../../src/types';
import { constants } from '../../data';
import { Server } from 'socket.io';

const CHUNK_SIZE = constants.CHUNK_SIZE;
const generatedChunks = new Set<string>();
let totalOutpostsGenerated = 0;

export function generateChunk(cx: number, cy: number, gameState: GameState, io: Server) {
  const key = `${cx},${cy}`;
  if (generatedChunks.has(key)) return;
  generatedChunks.add(key);

  const bx = cx * CHUNK_SIZE;
  const by = cy * CHUNK_SIZE;

  const res: ResourceNode[] = [];
  // 0. Outpost Generation (Every 600 units)
  const OUTPOST_SPACING = 600;
  for (let x = Math.ceil(bx / OUTPOST_SPACING) * OUTPOST_SPACING; x < bx + CHUNK_SIZE; x += OUTPOST_SPACING) {
    for (let y = Math.ceil(by / OUTPOST_SPACING) * OUTPOST_SPACING; y < by + CHUNK_SIZE; y += OUTPOST_SPACING) {
      const oId = `outpost-${x}-${y}`;
      if (!gameState.buildings[oId]) {
        totalOutpostsGenerated++;
        let subType: Building['subType'] = undefined;
        let health = 500;
        if (totalOutpostsGenerated % 10 === 0) {
          const types: Building['subType'][] = ['refinery', 'guard_tower', 'market', 'sanctuary', 'fortress'];
          subType = types[Math.floor(Math.random() * types.length)];
          if (subType === 'fortress') health = 1500;
        }
        gameState.buildings[oId] = {
          id: oId,
          ownerId: 'neutral',
          type: 'outpost',
          subType,
          x, y, health,
          captureProgress: 0,
          capturingPlayerId: null,
          isConflict: false
        };
        io.emit('building_created', gameState.buildings[oId]);
      }
    }
  }

  // 1. Resources
  for (let i = 0; i < 40; i++) {
    const rx = Math.floor(Math.random() * CHUNK_SIZE) + bx;
    const ry = Math.floor(Math.random() * CHUNK_SIZE) + by;
    const type = Math.random() > 0.6 ? (Math.random() > 0.5 ? 'stone' : 'gold') : 'wood';
    const id = `res-${rx}-${ry}`;
    if (!gameState.resources[id]) {
      gameState.resources[id] = { id, type, x: rx, y: ry, amount: 100 };
    }
  }

  // 2. Map Zones (Clusters)
  const resourceNodes = Object.values(gameState.resources).filter(r =>
    r.x >= bx && r.x < bx + CHUNK_SIZE && r.y >= by && r.y < by + CHUNK_SIZE
  );

  const clusters: Record<string, ResourceNode[]> = {};
  resourceNodes.forEach(r => {
    const key = `${Math.floor(r.x/300)},${Math.floor(r.y/300)}`;
    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(r);
  });

  Object.entries(clusters).forEach(([key, nodes]) => {
    if (nodes.length >= 4) {
      const typeCount: Record<string, number> = {};
      nodes.forEach(n => typeCount[n.type] = (typeCount[n.type] || 0) + 1);
      const dominantType = Object.entries(typeCount).sort((a,b) => b[1] - a[1])[0][0];

      let zoneType: MapZone['type'] = 'forest';
      if (dominantType === 'stone') zoneType = 'mountain';
      if (dominantType === 'gold') zoneType = 'desert';

      const avgX = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
      const avgY = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;

      const zoneId = `zone-${key}`;
      if (!gameState.zones[zoneId]) {
        gameState.zones[zoneId] = {
          id: zoneId,
          type: zoneType,
          x: avgX,
          y: avgY,
          radius: 300
        };
      }
    }
  });
}
