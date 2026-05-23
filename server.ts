import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { v4 as uuidv4 } from 'uuid';

import { GameState, ResourceNode, Building, Player, MapZone, Unit } from './src/types'; // Types
import { constants, buildings, upgrades } from './data';

// Initialize game state
const gameState: GameState = {
  players: {},
  resources: {},
  buildings: {},
  units: {},
  zones: {},
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const CHUNK_SIZE = constants.CHUNK_SIZE;
const generatedChunks = new Set<string>();
const chunkData = new Map<string, { resources: ResourceNode[], zones: MapZone[] }>();
const zoneTypes: MapZone['type'][] = ['forest', 'desert', 'mountain'];


async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: '*' } // Be permissive for dev
  });


function generateChunk(cx: number, cy: number) {
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
        gameState.buildings[oId] = {
          id: oId,
          ownerId: 'neutral',
          type: 'outpost',
          x,
          y,
          health: 500,
          captureProgress: 0,
          capturingPlayerId: null,
          isConflict: false
        };
        io.emit('building_created', gameState.buildings[oId]);
      }
    }
  }
  const zns: MapZone[] = [];

  // 1. Cluster Generation (Rare: 10% chance)
  if (Math.random() < 0.1) {
    const typeInt = Math.random();
    const type: ResourceNode["type"] = typeInt > 0.8 ? "gold" : typeInt > 0.4 ? "stone" : "wood";
    const zoneType: MapZone["type"] = type === "wood" ? "forest" : type === "stone" ? "mountain" : "desert";

    const centerX = bx + randomInt(200, CHUNK_SIZE - 200);
    const centerY = by + randomInt(200, CHUNK_SIZE - 200);

    let sumX = 0;
    let sumY = 0;

    for (let i = 0; i < 4; i++) {
      const rId = uuidv4();
      const rx = centerX + randomInt(-100, 100);
      const ry = centerY + randomInt(-100, 100);
      const dist = Math.sqrt(rx * rx + ry * ry);
      const scale = 1 + Math.log10(dist + 1);

      const r: ResourceNode = {
        id: rId,
        type,
        x: rx,
        y: ry,
        amount: Math.floor(randomInt(100, 500) * scale * 10)
      };
      gameState.resources[rId] = r;
      res.push(r);
      sumX += rx;
      sumY += ry;
    }

    // Trigger Zone
    const zId = uuidv4();
    let nameBase = zoneType.charAt(0).toUpperCase() + zoneType.slice(1);
    const z: MapZone = {
      id: zId,
      x: sumX / 4,
      y: sumY / 4,
      radius: 300,
      type: zoneType,
      name: `${nameBase} ${randomInt(1, 100)}`
    };
    gameState.zones[zId] = z;
    zns.push(z);
  }

  // 2. Individual Resource Generation (Scatter)
  for (let i = 0; i < 5; i++) {
    const rId = uuidv4();
    const typeInt = Math.random();
    const type: ResourceNode["type"] = typeInt > 0.8 ? "gold" : typeInt > 0.4 ? "stone" : "wood";
    const x = bx + randomInt(0, CHUNK_SIZE);
    const y = by + randomInt(0, CHUNK_SIZE);
    const dist = Math.sqrt(x * x + y * y);
    const scale = 1 + Math.log10(dist + 1);
    const r: ResourceNode = {
      id: rId,
      type,
      x,
      y,
      amount: Math.floor(randomInt(100, 500) * scale * 10)
    };
    gameState.resources[rId] = r;
    res.push(r);
  }
  
  chunkData.set(key, { resources: res, zones: zns });
}

  // Track socket to user mapping
  const socketToUser = new Map<string, string>();
  const userToSocket = new Map<string, string>();

  // API Route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.auth.userId;
    if (!userId) {
      console.error('Connection rejected: No userId provided');
      socket.disconnect();
      return;
    }

    console.log(`Player connected: ${socket.id} (User: ${userId})`);

    // Handle session takeover
    const existingSocketId = userToSocket.get(userId);
    if (existingSocketId && existingSocketId !== socket.id) {
      const existingSocket = io.sockets.sockets.get(existingSocketId);
      if (existingSocket) {
        console.log(`Taking over session for User: ${userId}. Disconnecting old socket: ${existingSocketId}`);
        existingSocket.disconnect();
      }
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
        inventory: { wood: 300, stone: 200, gold: 100 }, // starting resources
        score: 0,
        traits: [],
        upgrades: initialUpgrades
      };
      // Broadcast to others ONLY if new player
      socket.broadcast.emit('player_joined', gameState.players[userId]);
    } else {
      console.log(`Player reconnected: ${userId}`);
    }

    const player = gameState.players[userId];

    // Send initial state to the player
    const initState = {
      players: gameState.players,
      buildings: gameState.buildings,
      units: gameState.units,
      zones: {},
      resources: {}
    };
    socket.emit('init', initState);

    socket.on('select_traits', (traits: ('speed' | 'strength' | 'cost')[]) => {
      const player = gameState.players[userId];
      if (player && player.traits.length === 0 && traits.length === 2) {
        player.traits = traits;
        io.emit('player_updated', player);
      }
    });

    socket.on('request_chunks', (chunkKeys: string[]) => {
      const result: { resources: Record<string, ResourceNode>, zones: Record<string, MapZone> } = { resources: {}, zones: {} };
      
      for (const key of chunkKeys) {
        if (!generatedChunks.has(key)) {
          const [cxStr, cyStr] = key.split(',');
          const cx = parseInt(cxStr, 10);
          const cy = parseInt(cyStr, 10);
          generateChunk(cx, cy);
        }
        
        const cData = chunkData.get(key);
        if (cData) {
           for (const r of cData.resources) {
              if (gameState.resources[r.id]) {
                 result.resources[r.id] = gameState.resources[r.id];
              }
           }
           for (const z of cData.zones) {
              result.zones[z.id] = z;
           }
        }
      }
      
      socket.emit('chunk_data', result);
    });

    socket.on('move', (data: { x: number; y: number }) => {
      const player = gameState.players[userId];
      if (player) {
         player.x = data.x;
         player.y = data.y;
      }
    });

    socket.on('build', (data: { type: Building['type'], x: number, y: number }) => {
      const player = gameState.players[userId];
      if (!player) return;

      if (data.type === 'miner' as any) return;

      if (data.type === 'base') {
        const hasBase = Object.values(gameState.buildings).some(b => b.ownerId === userId && b.type === 'base');
        if (hasBase) return;
      } else {
        // Must have a base or owned outpost and be within range (BUILD_RANGE units) of it
        const ownedBuildings = Object.values(gameState.buildings).filter(b => b.ownerId === userId && (b.type === 'base' || b.type === 'outpost'));

        const inRange = ownedBuildings.some(ob => {
          const dx = data.x - ob.x;
          const dy = data.y - ob.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist <= constants.BUILD_RANGE;
        });

        if (!inRange) return;
      }

      const buildingData = (buildings as any)[data.type];
      if (!buildingData) return;
      const cost = buildingData.cost;
      if (!cost) return;

      const hasCostTrait = player.traits.includes('cost');
      const costModifier = hasCostTrait ? 0.75 : 1.0; 

      const baseConstructionLvl = player.upgrades?.base_construction || 0;
      const traitCostLvl = player.upgrades?.trait_cost_upg || 0;
      const discountFactor = Math.max(0.4, 1.0 - (baseConstructionLvl * 0.01) - (traitCostLvl * 0.01));

      const finalCost = {
        wood: Math.floor(cost.wood * costModifier * discountFactor),
        stone: Math.floor(cost.stone * costModifier * discountFactor),
        gold: Math.floor(cost.gold * costModifier * discountFactor)
      };

      if (player.inventory.wood >= finalCost.wood && 
          player.inventory.stone >= finalCost.stone && 
          player.inventory.gold >= finalCost.gold) {
        
        // deduct cost
        player.inventory.wood -= finalCost.wood;
        player.inventory.stone -= finalCost.stone;
        player.inventory.gold -= finalCost.gold;

        const hasStrengthTrait = player.traits.includes('strength');
        const traitStrengthLvl = player.upgrades?.trait_strength_upg || 0;
        const healthModifier = (hasStrengthTrait ? 1.5 : 1.0) * (1 + traitStrengthLvl * 0.02);

        const bId = uuidv4();
        const b: Building = {
          id: bId,
          type: data.type,
          x: data.x,
          y: data.y,
          ownerId: userId,
          health: Math.floor(buildingData.health * healthModifier)
        };
        gameState.buildings[bId] = b;
        io.emit('building_created', b);
        socket.emit('inventory_updated', player.inventory);
      }
    });

    socket.on('train_unit', (data: { type: 'miner' }) => {
      const player = gameState.players[socket.id];
      if (!player) return;

      if (data.type === 'miner') {
        const buildingData = (buildings as any).miner;
        const baseCost = buildingData.cost;
        const hasCostTrait = player.traits.includes('cost');
        const costModifier = hasCostTrait ? 0.75 : 1.0;
        
        const baseConstructionLvl = player.upgrades?.base_construction || 0;
        const traitCostLvl = player.upgrades?.trait_cost_upg || 0;
        const discountFactor = Math.max(0.4, 1.0 - (baseConstructionLvl * 0.01) - (traitCostLvl * 0.01));

        const numWorkers = Object.values(gameState.units).filter(u => u.ownerId === socket.id && u.type === 'miner').length;
        const workerCostMultiplier = Math.pow(2, Math.floor(numWorkers / 10));

        const finalCost = {
          wood: Math.floor(baseCost.wood * costModifier * discountFactor * workerCostMultiplier),
          stone: Math.floor(baseCost.stone * costModifier * discountFactor * workerCostMultiplier),
          gold: Math.floor(baseCost.gold * costModifier * discountFactor * workerCostMultiplier)
        };

        if (player.inventory.wood >= finalCost.wood && 
            player.inventory.stone >= finalCost.stone && 
            player.inventory.gold >= finalCost.gold) {
          
          const base = Object.values(gameState.buildings).find(b => b.ownerId === socket.id && b.type === 'base');
          if (!base) return;

          player.inventory.wood -= finalCost.wood;
          player.inventory.stone -= finalCost.stone;
          player.inventory.gold -= finalCost.gold;

          const minerCapacityLvl = player.upgrades?.miner_capacity || 0;

          const uId = uuidv4();
          const u: Unit = {
            id: uId,
            ownerId: socket.id,
            type: 'miner',
            x: base.x,
            y: base.y,
            state: 'idle',
            inventory: { type: null, amount: 0 },
            capacity: buildingData.baseCapacity + (minerCapacityLvl * 1),
            assignedResource: null
          };
          gameState.units[uId] = u;
          io.emit('unit_created', u);
          socket.emit('inventory_updated', player.inventory);
        }
      }
    });

    socket.on('purchase_upgrade', (data: { upgradeId: string }) => {
      const player = gameState.players[userId];
      if (!player) return;

      const upgradeMetadata = upgrades.find(u => u.id === data.upgradeId);
      if (!upgradeMetadata) return;

      if ((upgradeMetadata as any).requiredTrait && !player.traits.includes((upgradeMetadata as any).requiredTrait)) {
        return;
      }

      if (!player.upgrades) {
        player.upgrades = {};
        upgrades.forEach(u => { player.upgrades[u.id] = 0; });
      }

      const currentLvl = player.upgrades[data.upgradeId] || 0;
      
      // Cost factor scales with 1.5x of the last cost
      const baseCost = upgradeMetadata.baseCost;
      const costFactor = Math.pow(1.5, currentLvl);
      const finalCost = {
        wood: Math.round(baseCost.wood * costFactor),
        stone: Math.round(baseCost.stone * costFactor),
        gold: Math.round(baseCost.gold * costFactor)
      };

      if (player.inventory.wood >= finalCost.wood &&
          player.inventory.stone >= finalCost.stone &&
          player.inventory.gold >= finalCost.gold) {
        
        player.inventory.wood -= finalCost.wood;
        player.inventory.stone -= finalCost.stone;
        player.inventory.gold -= finalCost.gold;

        player.upgrades[data.upgradeId] = currentLvl + 1;

        // Apply capacity upgrades to existing miners immediately
        if (data.upgradeId === 'miner_capacity') {
          const newCapacity = (buildings as any).miner.baseCapacity + ((currentLvl + 1) * 1);
          Object.values(gameState.units).forEach(u => {
            if (u.ownerId === player.id && u.type === 'miner') {
              u.capacity = newCapacity;
              io.emit('unit_updated', u);
            }
          });
        }

        io.emit('player_updated', player);
        socket.emit('inventory_updated', player.inventory);
      }
    });

    socket.on('assign_miner', (data: { resource: 'wood' | 'stone' | 'gold', delta: number }) => {
      const playerMiners = Object.values(gameState.units).filter(u => u.ownerId === userId && u.type === 'miner');
      if (data.delta === 1) {
        const unassigned = playerMiners.find(u => !u.assignedResource);
        if (unassigned) {
          unassigned.assignedResource = data.resource;
          unassigned.state = 'idle';
          unassigned.targetId = undefined;
          // Notice we don't strictly need unit_updated since state_tick sends it, but lets emit for immediate update
          io.emit('unit_updated', unassigned);
        }
      } else if (data.delta === -1) {
        const assigned = playerMiners.find(u => u.assignedResource === data.resource);
        if (assigned) {
          assigned.assignedResource = null;
          assigned.state = 'returning';
          assigned.targetId = undefined;
          io.emit('unit_updated', assigned);
        }
      }
    });
    
    socket.on('gather', (resourceId: string) => {
      const player = gameState.players[userId];
      const resource = gameState.resources[resourceId];
      if (player && resource && resource.amount > 0) {
         const dx = player.x - resource.x;
         const dy = player.y - resource.y;
         const dist = Math.sqrt(dx*dx + dy*dy);
         if (dist < constants.MANUAL_GATHER_RANGE) { // range check
           // Apply +50% bonus if matching zone type
           let bonus = 1.0;
           for (const zId in gameState.zones) {
              const z = gameState.zones[zId];
              if ((z.type === 'forest' && resource.type === 'wood') ||
                  (z.type === 'desert' && resource.type === 'gold') ||
                  (z.type === 'mountain' && resource.type === 'stone')) {
                 const zdx = resource.x - z.x;
                 const zdy = resource.y - z.y;
                 const zdist = Math.sqrt(zdx * zdx + zdy * zdy);
                 if (zdist <= z.radius) {
                    bonus = 1.5;
                    break;
                 }
              }
           }
           const turretBeamLvl = player.upgrades?.turret_beam || 0;
           const extraGather = turretBeamLvl * 1;
           const finalAmount = Math.round((10 + extraGather) * bonus);
           resource.amount -= 10;
           player.inventory[resource.type] += finalAmount;
           if (resource.amount <= 0) {
             delete gameState.resources[resourceId];
             io.emit('resource_depleted', resourceId);
           } else {
             io.emit('resource_updated', resource);
           }
           socket.emit('inventory_updated', player.inventory);
         }
      }
    });

    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id} (User: ${userId})`);
      socketToUser.delete(socket.id);
      if (userToSocket.get(userId) === socket.id) {
        userToSocket.delete(userId);
      }
      io.emit('player_left', userId);
    });
  });

  // Game Tick Loop (Server authority)
  const TICK_RATE = constants.TICK_RATE; // 10 ticks per second
  let ticksCount = 0;
  setInterval(() => {
    const dt = 1 / TICK_RATE;
    ticksCount++;
    
    // Process passive upgrade resource generation in intervals
    if (ticksCount % constants.PASSIVE_INCOME_INTERVAL_TICKS === 0) { // Every 2 seconds
      Object.values(gameState.players).forEach(p => {
        let updated = false;
        
        // 1. Base Tax Income
        const baseTaxLvl = p.upgrades?.base_tax || 0;
        if (baseTaxLvl > 0) {
          const hasBase = Object.values(gameState.buildings).some(b => b.ownerId === p.id && b.type === 'base');
          if (hasBase) {
            p.inventory.wood += baseTaxLvl * 1;
            p.inventory.stone += baseTaxLvl * 1;
            p.inventory.gold += baseTaxLvl * 1;
            updated = true;
          }
        }
        
        // 2. Wall Solar Generation
        const wallSolarLvl = p.upgrades?.wall_solar || 0;
        if (wallSolarLvl > 0) {
          const wallCount = Object.values(gameState.buildings).filter(b => b.ownerId === p.id && b.type === 'wall').length;
          if (wallCount > 0) {
            p.inventory.wood += wallSolarLvl * wallCount * 1;
            p.inventory.stone += wallSolarLvl * wallCount * 1;
            updated = true;
          }
        }

        if (updated) {
          const sId = userToSocket.get(p.id);
          if (sId) io.to(sId).emit('inventory_updated', p.inventory);
        }
      });
    }

    if (ticksCount % constants.TURRET_COLLECTOR_INTERVAL_TICKS === 0) { // Every 5 seconds
      Object.values(gameState.players).forEach(p => {
        let updated = false;
        
        // 3. Turret Collectors
        const turretCollectorLvl = p.upgrades?.turret_collector || 0;
        if (turretCollectorLvl > 0) {
          const turretCount = Object.values(gameState.buildings).filter(b => b.ownerId === p.id && b.type === 'turret').length;
          if (turretCount > 0) {
            p.inventory.wood += turretCollectorLvl * turretCount * 1;
            p.inventory.stone += turretCollectorLvl * turretCount * 1;
            p.inventory.gold += turretCollectorLvl * turretCount * 1;
            updated = true;
          }
        }

        if (updated) {
          const sId = userToSocket.get(p.id);
          if (sId) io.to(sId).emit('inventory_updated', p.inventory);
        }
      });
    }

    let combatEvents: { from: {x:number, y:number, id:string}, to: {x:number, y:number, id:string}, damage: number }[] = [];

    // Turret attacking
    if (ticksCount % constants.TURRET_ATTACK_INTERVAL_TICKS === 0) { // Every 1 second
      Object.values(gameState.buildings).forEach(b => {
        if (b.type === 'turret') {
          // Find closest enemy building
          let closestDist = constants.TURRET_RANGE;
          let target = null;
          for (let eId in gameState.buildings) {
            const eb = gameState.buildings[eId];
            if (eb.ownerId !== b.ownerId && eb.type !== 'outpost') {
              const dist = Math.sqrt(Math.pow(eb.x - b.x, 2) + Math.pow(eb.y - b.y, 2));
              if (dist <= closestDist) {
                closestDist = dist;
                target = eb;
              }
            }
          }
          if (target) {
            target.health -= 10;
            combatEvents.push({
              from: { x: b.x, y: b.y, id: b.id },
              to: { x: target.x, y: target.y, id: target.id },
              damage: 10
            });
            if (target.health <= 0) {
              delete gameState.buildings[target.id];
              io.emit('building_destroyed', target.id);
            } else {
              io.emit('building_updated', target);
            }
          }
        }
      });
    }


    // Outpost capture logic
    Object.values(gameState.buildings).forEach(b => {
      if (b.type === 'outpost') {
        const playersNear = Object.values(gameState.players).filter(p => {
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          return Math.sqrt(dx*dx + dy*dy) <= 150; // Capture radius
        });

        const uniqueTeams = new Set(playersNear.map(p => p.id));

        const oldProgress = b.captureProgress || 0;
        const oldOwner = b.ownerId;
        const oldCapturer = b.capturingPlayerId;
        const oldConflict = b.isConflict;

        if (playersNear.length === 0) {
          b.isConflict = false;
          b.capturingPlayerId = null;
          // Slow decay
          if (b.captureProgress && b.captureProgress > 0 && b.ownerId === 'neutral') {
            b.captureProgress = Math.max(0, b.captureProgress - 0.5);
          } else if (b.ownerId !== 'neutral' && b.captureProgress && b.captureProgress < 100) {
             b.captureProgress = Math.min(100, b.captureProgress + 0.5);
          }
        } else if (uniqueTeams.size > 1) {
          b.isConflict = true;
        } else {
          b.isConflict = false;
          const capturerId = playersNear[0].id;
          b.capturingPlayerId = capturerId;

          if (b.ownerId === 'neutral') {
            b.captureProgress = Math.min(100, (b.captureProgress || 0) + 1);
            if (b.captureProgress === 100) {
              b.ownerId = capturerId;
            }
          } else if (b.ownerId === capturerId) {
            b.captureProgress = Math.min(100, (b.captureProgress || 0) + 1);
          } else {
            // Neutralize enemy outpost
            b.captureProgress = Math.max(0, (b.captureProgress || 0) - 1);
            if (b.captureProgress === 0) {
              b.ownerId = 'neutral';
            }
          }
        }

        if (b.captureProgress !== oldProgress || b.ownerId !== oldOwner || b.capturingPlayerId !== oldCapturer || b.isConflict !== oldConflict) {
          io.emit('building_updated', b);
        }
      }
    });

    if (combatEvents.length > 0) {
      io.emit('combat_events', combatEvents);
    }

    const positions = Object.values(gameState.players).map(p => ({id: p.id, x: p.x, y: p.y}));
    const unitPositions = Object.values(gameState.units).map(u => ({
      id: u.id, x: u.x, y: u.y, state: u.state, targetId: u.targetId, inventory: u.inventory, capacity: u.capacity
    }));
    io.emit('state_tick', { players: positions, units: unitPositions });
    
    let resourceUpdates: ResourceNode[] = [];
    let inventoryUpdates: Record<string, Player['inventory']> = {};

    Object.values(gameState.units).forEach(u => {
       if (u.type === 'miner') {
         const p = gameState.players[u.ownerId];
         if (!p) return; 
         
         const hasSpeedTrait = p.traits.includes('speed');
         const minerSpeedLvl = p.upgrades?.miner_speed || 0;
         const traitSpeedLvl = p.upgrades?.trait_speed_upg || 0;
         const MINER_SPEED = ((hasSpeedTrait ? constants.MINER_SPEED_BOOST : constants.MINER_SPEED) + (minerSpeedLvl * 2)) * (1 + traitSpeedLvl * 0.01);
         
         if (u.state === 'idle') {
            if (!u.assignedResource) return;
            let nearestRes = null;
            let minDist = Infinity;
            for (const rId in gameState.resources) {
              const r = gameState.resources[rId];
              if (r.type !== u.assignedResource) continue;
              const dx = r.x - u.x;
              const dy = r.y - u.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist < minDist) {
                minDist = dist;
                nearestRes = rId;
              }
            }
            if (nearestRes) {
              u.targetId = nearestRes;
              u.state = 'moving_to_resource';
            }
         } else if (u.state === 'moving_to_resource') {
            const r = gameState.resources[u.targetId!];
            if (!r || r.amount <= 0) {
              u.state = 'idle';
              return;
            }
            const dx = r.x - u.x;
            const dy = r.y - u.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 20) {
              u.state = 'mining';
            } else {
              const moveDist = MINER_SPEED * dt;
              if (dist <= moveDist) {
                u.x = r.x; u.y = r.y; u.state = 'mining';
              } else {
                u.x += (dx / dist) * moveDist;
                u.y += (dy / dist) * moveDist;
              }
            }
         } else if (u.state === 'mining') {
            const r = gameState.resources[u.targetId!];
            if (!r || r.amount <= 0 || u.inventory.amount >= u.capacity) {
              u.state = 'returning';
              return;
            }
            
            // Apply +50% bonus if matching zone type
            let bonus = 1.0;
            for (const zId in gameState.zones) {
               const z = gameState.zones[zId];
               if ((z.type === 'forest' && r.type === 'wood') ||
                   (z.type === 'desert' && r.type === 'gold') ||
                   (z.type === 'mountain' && r.type === 'stone')) {
                  const zdx = r.x - z.x;
                  const zdy = r.y - z.y;
                  const zdist = Math.sqrt(zdx * zdx + zdy * zdy);
                  if (zdist <= z.radius) {
                     bonus = 1.5;
                     break;
                  }
               }
            }

            u.inventory.type = r.type;
            const amountMined = Math.min(2, r.amount, u.capacity - u.inventory.amount);
            r.amount -= amountMined;
            u.inventory.amount += Math.round(amountMined * bonus);
            
            if (r.amount <= 0) {
               delete gameState.resources[r.id];
               io.emit('resource_depleted', r.id);
            } else {
               resourceUpdates.push(r);
            }
            
            if (u.inventory.amount >= u.capacity || r.amount <= 0) {
              u.state = 'returning';
            }
         } else if (u.state === 'returning') {
            const base = Object.values(gameState.buildings).find(b => b.ownerId === u.ownerId && b.type === 'base');
            if (!base) {
              u.state = 'idle';
              return;
            }
            const dx = base.x - u.x;
            const dy = base.y - u.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 30) {
              if (u.inventory.type) {
                p.inventory[u.inventory.type] += u.inventory.amount;
                inventoryUpdates[p.id] = p.inventory;
              }
              u.inventory = { type: null, amount: 0 };
              u.state = 'idle';
            } else {
              const moveDist = MINER_SPEED * dt;
              u.x += (dx / dist) * moveDist;
              u.y += (dy / dist) * moveDist;
            }
         }
       }
    });

    if (resourceUpdates.length > 0) {
      resourceUpdates.forEach(r => io.emit('resource_updated', r));
    }
    
    for (const pId in inventoryUpdates) {
       const sId = userToSocket.get(pId);
       if (sId) io.to(sId).emit('inventory_updated', inventoryUpdates[pId]);
    }
    
  }, 1000 / TICK_RATE);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);
