import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

import { GameState, ResourceNode, Building, Player, MapZone, Unit, LedgerEntry, ScoreRow, RatesReport, DepotRate } from './src/types'; // Types
import { constants, buildings, upgrades } from './data';
import { isPointInTerritory } from './src/utils/geometry';
import { planRequirement, planInstalment, scoreFor, heroMaxSpeed, visionCircles, canSee, VisionCircle, demolishRefund, maxHealthOf, desiredLabour, RESOURCE_TYPES } from './src/rules';
import { createWorldStore, WorldSnapshot } from './server/persistence';
import { createIdentifier, AuthRejected } from './server/auth';
import { startupStep, setPhase, setFact, serverStatus } from './server/status';

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
let totalOutpostsGenerated = 0;
const chunkData = new Map<string, { resources: ResourceNode[], zones: MapZone[] }>();
const zoneTypes: MapZone['type'][] = ['forest', 'desert', 'mountain'];

const VISION_SYNC_TICKS = 5; // twice a second
const STANDINGS_TICKS = 20; // every two seconds
const SAVE_INTERVAL_MS = 30000;

// Workers within this distance of one of their owner's walls are on a supply road
const SUPPLY_ROAD_RANGE = 150;

// Income only ever arrives with a worker. Where the worker unloads decides what the load is worth.
function deliveryMultiplier(player: Player, dropoff: Building, type: ResourceNode['type']): number {
  let multiplier = 1;
  if (dropoff.type === 'base') multiplier += (player.upgrades?.base_depot || 0) * 0.05;
  if (dropoff.type === 'outpost' && dropoff.subType === 'refinery' && type === 'gold') multiplier += 0.5;
  if (dropoff.type === 'outpost' && dropoff.subType === 'market' && type !== 'gold') multiplier += 0.25;
  return multiplier;
}



function isPointInValidMiningArea(x: number, y: number, ownerId: string, gameState: GameState, constants: any): boolean {
  const playerBase = Object.values(gameState.buildings).find(b => b.ownerId === ownerId && b.type === 'base');
  const ownedOutposts = Object.values(gameState.buildings).filter(b => b.ownerId === ownerId && b.type === 'outpost');
  const OUTPOST_BUILD_RADIUS = 400;
  const OUTPOST_SPACING = 600;

  // Check base
  if (playerBase) {
    const dist = Math.sqrt(Math.pow(playerBase.x - x, 2) + Math.pow(playerBase.y - y, 2));
    if (dist <= constants.BUILD_RANGE) return true;
  }

  // Check owned outposts and bridges
  for (const o of ownedOutposts) {
    const dist = Math.sqrt(Math.pow(o.x - x, 2) + Math.pow(o.y - y, 2));
    if (dist <= OUTPOST_BUILD_RADIUS) return true;
  }

  // Bridges between owned outposts
  for (let i = 0; i < ownedOutposts.length; i++) {
    for (let j = i + 1; j < ownedOutposts.length; j++) {
      const a = ownedOutposts[i], b = ownedOutposts[j];
      const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
      if ((Math.abs(dx - OUTPOST_SPACING) < 1 && dy < 1) || (dx < 1 && Math.abs(dy - OUTPOST_SPACING) < 1)) {
        const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
        const maxX = Math.max(a.x, b.x), maxY = Math.max(a.y, b.y);
        if (dx > dy) {
           if (x >= minX && x <= maxX && y >= a.y - 200 && y <= a.y + 200) return true;
        } else {
           if (x >= a.x - 200 && x <= a.x + 200 && y >= minY && y <= maxY) return true;
        }
      }
    }
  }


  // 2D Squares between owned outposts
  for (const o of ownedOutposts) {
    const hasTR = ownedOutposts.some(ot => Math.abs(ot.x - (o.x + OUTPOST_SPACING)) < 1 && Math.abs(ot.y - o.y) < 1);
    const hasBL = ownedOutposts.some(ot => Math.abs(ot.x - o.x) < 1 && Math.abs(ot.y - (o.y + OUTPOST_SPACING)) < 1);
    const hasBR = ownedOutposts.some(ot => Math.abs(ot.x - (o.x + OUTPOST_SPACING)) < 1 && Math.abs(ot.y - (o.y + OUTPOST_SPACING)) < 1);

    if (hasTR && hasBL && hasBR) {
      if (x >= o.x && x <= o.x + OUTPOST_SPACING && y >= o.y && y <= o.y + OUTPOST_SPACING) return true;
    }
  }

  // Check adjacent neutral outposts
  const neutralOutposts = Object.values(gameState.buildings).filter(b => b.ownerId === 'neutral' && b.type === 'outpost');
  for (const no of neutralOutposts) {
    const isAdjacentToOwned = ownedOutposts.some(oo => {
      const dx = Math.abs(oo.x - no.x), dy = Math.abs(oo.y - no.y);
      return (Math.abs(dx - OUTPOST_SPACING) < 1 && dy < 1) || (dx < 1 && Math.abs(dy - OUTPOST_SPACING) < 1);
    });
    if (isAdjacentToOwned) {
      const dist = Math.sqrt(Math.pow(no.x - x, 2) + Math.pow(no.y - y, 2));
      if (dist <= OUTPOST_BUILD_RADIUS) return true;
    }
  }

  return false;
}

async function startServer() {
  startupStep('process started', `node ${process.version}, NODE_ENV=${process.env.NODE_ENV || 'development'}, revision ${process.env.K_REVISION || 'local'}`);
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    // CORS only applies to browsers; the Android client sends no Origin. Keep ALLOWED_ORIGINS (comma-separated)
    // for any browser tool that needs to connect.
    cors: { origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : '*' }
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

  // The ledger: every change to a player's map, written down so a loss always has a receipt,
  // including the ones that happen while the player is away.
  const LEDGER_LIMIT = 50;
  const ledgers = new Map<string, LedgerEntry[]>();
  const lastSeenAt = new Map<string, number>();

  const playerName = (id: string) => gameState.players[id]?.name || 'An unknown commander';
  const buildingLabel = (b: Building) =>
    b.type === 'outpost' ? `${b.subType ? b.subType.replace('_', ' ') + ' ' : ''}outpost` : b.type;

  function recordLedger(playerId: string, kind: LedgerEntry['kind'], text: string, x: number, y: number) {
    if (!gameState.players[playerId]) return;
    const entry: LedgerEntry = { id: uuidv4(), time: Date.now(), kind, text, x: Math.round(x), y: Math.round(y) };
    const entries = ledgers.get(playerId) || [];
    entries.push(entry);
    if (entries.length > LEDGER_LIMIT) entries.splice(0, entries.length - LEDGER_LIMIT);
    ledgers.set(playerId, entries);
    const sId = userToSocket.get(playerId);
    if (sId) io.to(sId).emit('ledger_entry', entry);
  }

  // --- Vision: rivals' buildings, units, and heroes are only sent inside the receiver's vision ---
  type VisionState = {
    circles: VisionCircle[];
    known: Map<string, number>; // rival buildings this client has seen, by id -> health last sent
    knownAt: Map<string, { x: number; y: number }>;
    units: Set<string>; // rival units currently visible
    players: Set<string>; // rival heroes currently visible
  };
  const vision = new Map<string, VisionState>();

  const newVisionState = (): VisionState => ({ circles: [], known: new Map(), knownAt: new Map(), units: new Set(), players: new Set() });
  const isPublic = (b: Building) => b.type === 'outpost'; // the political map is public; what stands on it is not

  function publicPlayer(p: Player, visible: boolean): Player {
    return {
      id: p.id, name: p.name, color: p.color, traits: p.traits,
      x: visible ? p.x : 0, y: visible ? p.y : 0, hidden: !visible,
      inventory: { wood: 0, stone: 0, gold: 0 }, score: 0, upgrades: {},
    };
  }

  function sendToPlayer(playerId: string, event: string, payload: any) {
    const sId = userToSocket.get(playerId);
    if (sId) io.to(sId).emit(event, payload);
  }

  // A rival building changed: tell its owner, and anyone who can see it right now
  function emitBuilding(event: 'building_created' | 'building_updated' | 'building_destroyed', b: Building) {
    if (isPublic(b)) {
      io.emit(event, event === 'building_destroyed' ? b.id : b);
      return;
    }
    for (const [pid, v] of vision) {
      if (pid !== b.ownerId && !canSee(v.circles, b.x, b.y)) continue;
      sendToPlayer(pid, event, event === 'building_destroyed' ? b.id : b);
      if (pid === b.ownerId) continue;
      if (event === 'building_destroyed') { v.known.delete(b.id); v.knownAt.delete(b.id); }
      else { v.known.set(b.id, b.health); v.knownAt.set(b.id, { x: b.x, y: b.y }); }
    }
  }

  function emitUnit(event: 'unit_created' | 'unit_updated', u: Unit) {
    for (const [pid, v] of vision) {
      if (pid !== u.ownerId && !v.units.has(u.id)) continue;
      sendToPlayer(pid, event, u);
    }
  }

  function emitPlayerUpdated(p: Player) {
    for (const [pid, v] of vision) {
      sendToPlayer(pid, 'player_updated', pid === p.id ? p : publicPlayer(p, v.players.has(p.id)));
    }
  }

  // Recompute what one player can see, and send them what entered or left their view
  function syncVision(pid: string) {
    const v = vision.get(pid);
    if (!v) return;
    v.circles = visionCircles(pid, gameState);
    const upserts: Building[] = [];
    const removed: string[] = [];
    for (const b of Object.values(gameState.buildings)) {
      if (b.ownerId === pid || isPublic(b)) continue;
      if (!canSee(v.circles, b.x, b.y)) continue;
      if (v.known.get(b.id) !== b.health) upserts.push(b);
      v.known.set(b.id, b.health);
      v.knownAt.set(b.id, { x: b.x, y: b.y });
    }
    // A remembered building is only forgotten once its spot is back in view and it isn't there
    for (const [id, at] of v.knownAt) {
      if (!gameState.buildings[id] && canSee(v.circles, at.x, at.y)) {
        removed.push(id);
        v.known.delete(id);
        v.knownAt.delete(id);
      }
    }
    const units: Unit[] = [];
    const nowUnits = new Set<string>();
    for (const u of Object.values(gameState.units)) {
      if (u.ownerId === pid || !canSee(v.circles, u.x, u.y)) continue;
      nowUnits.add(u.id);
      if (!v.units.has(u.id)) units.push(u);
    }
    const removedUnits = [...v.units].filter(id => !nowUnits.has(id));
    v.units = nowUnits;
    const shown: Player[] = [];
    const nowPlayers = new Set<string>();
    for (const p of Object.values(gameState.players)) {
      if (p.id === pid || !userToSocket.has(p.id) || !canSee(v.circles, p.x, p.y)) continue;
      nowPlayers.add(p.id);
      if (!v.players.has(p.id)) shown.push(publicPlayer(p, true));
    }
    const hiddenPlayers = [...v.players].filter(id => !nowPlayers.has(id));
    v.players = nowPlayers;
    if (upserts.length || removed.length || units.length || removedUnits.length || shown.length || hiddenPlayers.length) {
      sendToPlayer(pid, 'vision', { buildings: upserts, removedBuildings: removed, units, removedUnits, players: shown, hiddenPlayers });
    }
  }

  // The snapshot a joining client starts from: its own state, the public map, and only what it can see
  function initialStateFor(pid: string) {
    const v = newVisionState();
    vision.set(pid, v);
    v.circles = visionCircles(pid, gameState);
    const players: Record<string, Player> = {};
    for (const p of Object.values(gameState.players)) {
      if (p.id === pid) { players[p.id] = p; continue; }
      const visible = userToSocket.has(p.id) && canSee(v.circles, p.x, p.y);
      if (visible) v.players.add(p.id);
      players[p.id] = publicPlayer(p, visible);
    }
    const bs: Record<string, Building> = {};
    for (const b of Object.values(gameState.buildings)) {
      if (b.ownerId === pid || isPublic(b)) { bs[b.id] = b; continue; }
      if (canSee(v.circles, b.x, b.y)) {
        bs[b.id] = b;
        v.known.set(b.id, b.health);
        v.knownAt.set(b.id, { x: b.x, y: b.y });
      }
    }
    const us: Record<string, Unit> = {};
    for (const u of Object.values(gameState.units)) {
      if (u.ownerId === pid) { us[u.id] = u; continue; }
      if (canSee(v.circles, u.x, u.y)) { us[u.id] = u; v.units.add(u.id); }
    }
    return { players, buildings: bs, units: us, zones: {}, resources: {} };
  }

  // --- Hero movement: the client reports, the server decides ---
  const moveBudgets = new Map<string, { budget: number; at: number }>();
  const MOVE_TOLERANCE = 1.25; // headroom for frame timing
  const MAX_BANKED_SECONDS = 1; // how much unused movement a hero can save up

  // --- Rates: every delivery is logged, so the player can see which route pays ---
  const RATE_WINDOW_MS = 60000;
  const deliveries = new Map<string, { t: number; type: ResourceNode['type']; amount: number; depotId: string; label: string; x: number; y: number }[]>();

  function logDelivery(pid: string, type: ResourceNode['type'], amount: number, depotId: string, label: string, x: number, y: number) {
    const list = deliveries.get(pid) || [];
    list.push({ t: Date.now(), type, amount, depotId, label, x, y });
    deliveries.set(pid, list);
  }

  function ratesFor(pid: string): RatesReport {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    const list = (deliveries.get(pid) || []).filter(d => d.t >= cutoff);
    deliveries.set(pid, list);
    const perMinute = { wood: 0, stone: 0, gold: 0 };
    const depots = new Map<string, DepotRate>();
    for (const d of list) {
      perMinute[d.type] += d.amount;
      const row = depots.get(d.depotId) || { id: d.depotId, label: d.label, x: d.x, y: d.y, wood: 0, stone: 0, gold: 0 };
      row[d.type] += d.amount;
      depots.set(d.depotId, row);
    }
    return { perMinute, depots: [...depots.values()].sort((a, b) => (b.wood + b.stone + b.gold) - (a.wood + a.stone + a.gold)) };
  }

  const depotLabel = (b: Building) => b.type === 'base' ? 'Command Base' : b.type === 'turret' ? 'Forward depot' : `${b.subType ? b.subType.replace('_', ' ') + ' ' : ''}outpost`;

  // --- Standing orders: keep each player's labour split at the ratio they set ---
  function balanceLabour(p: Player) {
    const ratio = p.laborRatio;
    if (!ratio) return;
    const miners = Object.values(gameState.units).filter(u => u.ownerId === p.id && u.type === 'miner');
    const want = desiredLabour(miners.length, ratio);
    const have = { wood: 0, stone: 0, gold: 0 };
    miners.forEach(u => { if (u.assignedResource) have[u.assignedResource]++; });
    const reassign = (u: Unit, to: ResourceNode['type']) => {
      if (u.assignedResource) have[u.assignedResource]--;
      u.assignedResource = to;
      have[to]++;
      u.targetId = undefined;
      u.stall = null;
      u.state = u.inventory.amount > 0 ? 'returning' : 'idle';
      emitUnit('unit_updated', u);
    };
    const deficit = () => RESOURCE_TYPES.filter(t => have[t] < want[t]).sort((a, b) => (want[b] - have[b]) - (want[a] - have[a]))[0];
    for (const u of miners) {
      const t = deficit();
      if (!t) break;
      if (!u.assignedResource || have[u.assignedResource] > want[u.assignedResource]) reassign(u, t);
    }
  }

  // --- Standings: held ground and fulfilled Plan phases, nothing else ---
  function scoreboard(): ScoreRow[] {
    return Object.values(gameState.players).map(p => {
      const s = scoreFor(p.id, p, gameState.buildings);
      return { id: p.id, name: p.name, color: p.color, traits: p.traits, score: s.score, outposts: s.outposts, planPhase: s.planPhase, online: userToSocket.has(p.id) };
    }).sort((a, b) => b.score - a.score);
  }

  // API Route
  const liveCounts = () => ({
    playersOnline: userToSocket.size,
    players: Object.keys(gameState.players).length,
    buildings: Object.keys(gameState.buildings).length,
  });

  // Health and startup report: the phase, how long each startup step took, and the world's size
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', ...serverStatus(liveCounts()) });
  });

  // Every connection proves who it is before it reaches the game: a verified Firebase ID token
  // (Google sign-in), or a guest id when running locally without a Firebase project
  const identifier = createIdentifier();
  setFact('auth', identifier.mode);
  startupStep('auth configured', identifier.mode);
  io.use((socket, next) => {
    const started = Date.now();
    const transport = socket.conn.transport.name;
    identifier.identify(socket.handshake.auth)
      .then(uid => {
        socket.data.userId = uid;
        socket.data.authMs = Date.now() - started;
        next();
      })
      .catch((e) => {
        const reason = e instanceof AuthRejected ? e.reason : `identification failed (${e?.message || e})`;
        console.warn(`[connect] refused ${socket.id} over ${transport} after ${Date.now() - started}ms: ${reason}`);
        // The app shows this reason in its connection log
        const err: any = new Error('unauthorized');
        err.data = { reason };
        next(err);
      });
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;

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
        upgrades: initialUpgrades,
        plan: { phase: 0, delivered: { wood: 0, stone: 0, gold: 0 } },
        laborRatio: { wood: 1, stone: 1, gold: 1 }
      };
      // Broadcast to others ONLY if new player
      socket.broadcast.emit('player_joined', publicPlayer(gameState.players[userId], false));
    } else {
      console.log(`Player reconnected: ${userId}`);
    }

    const player = gameState.players[userId];
    if (!player.plan) player.plan = { phase: 0, delivered: { wood: 0, stone: 0, gold: 0 } };
    if (player.laborRatio === undefined) player.laborRatio = { wood: 1, stone: 1, gold: 1 };
    moveBudgets.set(userId, { budget: 0, at: Date.now() });

    // Tell the app how the server is doing (and whether this connection just woke it), then the world
    socket.emit('server_status', serverStatus(liveCounts()));
    const init = initialStateFor(userId);
    socket.emit('init', init);
    console.log(`[connect] ${userId} joined over ${socket.conn.transport.name}: token verified in ${socket.data.authMs}ms, sent ${Object.keys(init.players).length} players, ${Object.keys(init.buildings).length} buildings, ${Object.keys(init.units).length} workers`);
    socket.emit('scoreboard', scoreboard());
    socket.emit('ledger_history', { entries: ledgers.get(userId) || [], lastSeen: lastSeenAt.get(userId) ?? null });

    socket.on('select_traits', (traits: ('speed' | 'strength' | 'cost')[]) => {
      const player = gameState.players[userId];
      if (player && player.traits.length === 0 && traits.length === 2) {
        player.traits = traits;
        emitPlayerUpdated(player);
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

    // The hero spends a movement budget that refills at its legal top speed. A report that
    // outruns the budget is cut short, and the client is told where its hero really is.
    socket.on('move', (data: { x: number; y: number }) => {
      const player = gameState.players[userId];
      if (!player || !Number.isFinite(data?.x) || !Number.isFinite(data?.y)) return;
      const now = Date.now();
      const speed = heroMaxSpeed(player) * MOVE_TOLERANCE;
      const m = moveBudgets.get(userId) || { budget: 0, at: now };
      m.budget = Math.min(speed * MAX_BANKED_SECONDS, m.budget + speed * (now - m.at) / 1000);
      m.at = now;
      const dx = data.x - player.x, dy = data.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= m.budget) {
        player.x = data.x;
        player.y = data.y;
        m.budget -= dist;
      } else {
        const f = m.budget / dist;
        player.x += dx * f;
        player.y += dy * f;
        m.budget = 0;
        socket.emit('position_corrected', { x: player.x, y: player.y });
      }
      moveBudgets.set(userId, m);
    });

    socket.on('build', (data: { type: Building['type'], x: number, y: number }) => {
      const player = gameState.players[userId];
      if (!player) return;

      // Outposts are captured, never built; workers are trained
      if (data.type !== 'base' && data.type !== 'wall' && data.type !== 'turret') return;
      if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return;

      if (data.type === 'base') {
        const hasBase = Object.values(gameState.buildings).some(b => b.ownerId === userId && b.type === 'base');
        if (hasBase) return;
      } else {
        if (!isPointInTerritory(data.x, data.y, userId, gameState, constants)) return;
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
          health: Math.floor(buildingData.health * healthModifier),
          paid: finalCost
        };
        b.maxHealth = b.health;
        gameState.buildings[bId] = b;
        emitBuilding('building_created', b);
        socket.emit('inventory_updated', player.inventory);
      }
    });

    socket.on('train_unit', (data: { type: 'miner' }) => {
      const player = gameState.players[userId];
      if (!player) return;

      if (data.type === 'miner') {
        const buildingData = (buildings as any).miner;
        const baseCost = buildingData.cost;
        const hasCostTrait = player.traits.includes('cost');
        const costModifier = hasCostTrait ? 0.75 : 1.0;
        
        const baseConstructionLvl = player.upgrades?.base_construction || 0;
        const traitCostLvl = player.upgrades?.trait_cost_upg || 0;
        const discountFactor = Math.max(0.4, 1.0 - (baseConstructionLvl * 0.01) - (traitCostLvl * 0.01));

        const numWorkers = Object.values(gameState.units).filter(u => u.ownerId === userId && u.type === 'miner').length;
        const workerCostMultiplier = Math.pow(2, Math.floor(numWorkers / 10));

        const finalCost = {
          wood: Math.floor(baseCost.wood * costModifier * discountFactor * workerCostMultiplier),
          stone: Math.floor(baseCost.stone * costModifier * discountFactor * workerCostMultiplier),
          gold: Math.floor(baseCost.gold * costModifier * discountFactor * workerCostMultiplier)
        };

        if (player.inventory.wood >= finalCost.wood && 
            player.inventory.stone >= finalCost.stone && 
            player.inventory.gold >= finalCost.gold) {
          
          const base = Object.values(gameState.buildings).find(b => b.ownerId === userId && b.type === 'base');
          if (!base) return;

          player.inventory.wood -= finalCost.wood;
          player.inventory.stone -= finalCost.stone;
          player.inventory.gold -= finalCost.gold;

          const minerCapacityLvl = player.upgrades?.miner_capacity || 0;

          const uId = uuidv4();
          const u: Unit = {
            id: uId,
            ownerId: userId,
            type: 'miner',
            x: base.x,
            y: base.y,
            state: 'idle',
            inventory: { type: null, amount: 0 },
            capacity: buildingData.baseCapacity + (minerCapacityLvl * 1),
            assignedResource: null
          };
          gameState.units[uId] = u;
          sendToPlayer(userId, 'unit_created', u);
          balanceLabour(player);
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
      const maxLevel = (upgradeMetadata as any).maxLevel;
      if (maxLevel !== undefined && currentLvl >= maxLevel) return;
      
      // Cost factor scales with 1.5x of the last cost
      const baseCost = upgradeMetadata.baseCost;
      const multiplier = data.upgradeId === "base_expansion" ? 4 : 1.5;
      const costFactor = Math.pow(multiplier, currentLvl);
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
              emitUnit('unit_updated', u);
            }
          });
        }

        emitPlayerUpdated(player);
        socket.emit('inventory_updated', player.inventory);
      }
    });

    socket.on('assign_miner', (data: { resource: 'wood' | 'stone' | 'gold', delta: number }) => {
      // Under standing orders the ratio decides; hand assignment is for players who turned them off
      if (gameState.players[userId]?.laborRatio) return;
      if (!RESOURCE_TYPES.includes(data.resource)) return;
      const playerMiners = Object.values(gameState.units).filter(u => u.ownerId === userId && u.type === 'miner');
      if (data.delta === 1) {
        const unassigned = playerMiners.find(u => !u.assignedResource);
        if (unassigned) {
          unassigned.assignedResource = data.resource;
          unassigned.state = 'idle';
          unassigned.targetId = undefined;
          emitUnit('unit_updated', unassigned);
        }
      } else if (data.delta === -1) {
        const assigned = playerMiners.find(u => u.assignedResource === data.resource);
        if (assigned) {
          assigned.assignedResource = null;
          assigned.state = 'returning';
          assigned.targetId = undefined;
          emitUnit('unit_updated', assigned);
        }
      }
    });
    
    socket.on('set_labor_ratio', (ratio: { wood: number; stone: number; gold: number } | null) => {
      const player = gameState.players[userId];
      if (!player) return;
      if (ratio === null) {
        player.laborRatio = null;
      } else {
        const clean = { wood: 0, stone: 0, gold: 0 };
        for (const t of RESOURCE_TYPES) {
          const n = Math.round(Number(ratio?.[t]));
          if (!Number.isFinite(n)) return;
          clean[t] = Math.max(0, Math.min(9, n));
        }
        player.laborRatio = clean;
        balanceLabour(player);
      }
      emitPlayerUpdated(player);
    });

    // The Plan is delivered to the Command Base, at most a quarter of the phase per delivery
    socket.on('plan_deliver', () => {
      const player = gameState.players[userId];
      if (!player) return;
      const base = Object.values(gameState.buildings).find(b => b.ownerId === userId && b.type === 'base');
      if (!base) return;
      const plan = player.plan || (player.plan = { phase: 0, delivered: { wood: 0, stone: 0, gold: 0 } });
      const need = planRequirement(plan.phase);
      const instalment = planInstalment(plan.phase);
      for (const t of RESOURCE_TYPES) {
        const give = Math.max(0, Math.min(Math.floor(player.inventory[t]), need[t] - plan.delivered[t], instalment[t]));
        player.inventory[t] -= give;
        plan.delivered[t] += give;
      }
      if (RESOURCE_TYPES.every(t => plan.delivered[t] >= need[t])) {
        plan.phase += 1;
        plan.delivered = { wood: 0, stone: 0, gold: 0 };
        recordLedger(userId, 'gained', `Phase ${plan.phase} of the Plan fulfilled.`, base.x, base.y);
        io.emit('scoreboard', scoreboard());
      }
      emitPlayerUpdated(player);
      socket.emit('inventory_updated', player.inventory);
    });

    socket.on('demolish', (buildingId: string) => {
      const player = gameState.players[userId];
      const b = gameState.buildings[buildingId];
      if (!player || !b || b.ownerId !== userId || b.type === 'outpost') return;
      const refund = demolishRefund(b);
      for (const t of RESOURCE_TYPES) player.inventory[t] += refund[t];
      delete gameState.buildings[b.id];
      emitBuilding('building_destroyed', b);
      socket.emit('inventory_updated', player.inventory);
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
           logDelivery(userId, resource.type, finalAmount, 'hand', 'Gathered by hand', resource.x, resource.y);
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
        vision.delete(userId);
        lastSeenAt.set(userId, Date.now());
        io.emit('player_left', userId);
      }
      // The last commander left: save now. Cloud Run throttles an instance with no open connections
      // and later stops it, so the world rests from here until someone connects again.
      if (userToSocket.size === 0) {
        console.log('No players connected: saving the world before it rests');
        saveNow();
      }
    });
  });

  // Game Tick Loop (Server authority)
  const TICK_RATE = constants.TICK_RATE; // 10 ticks per second
  let ticksCount = 0;
  setInterval(() => {
    const dt = 1 / TICK_RATE;
    ticksCount++;
    
    let combatEvents: { from: {x:number, y:number, id:string}, to: {x:number, y:number, id:string}, damage: number }[] = [];

    // Turret and Guard Tower attacking
    if (ticksCount % constants.TURRET_ATTACK_INTERVAL_TICKS === 0) { // Every 1 second
      Object.values(gameState.buildings).forEach(b => {
        const isTurret = b.type === 'turret';
        const isGuardTower = b.type === 'outpost' && b.ownerId !== 'neutral' && b.subType === 'guard_tower';

        if (isTurret || isGuardTower) {
          const damage = isGuardTower ? 20 : 10;
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
            target.health -= damage;
            combatEvents.push({
              from: { x: b.x, y: b.y, id: b.id },
              to: { x: target.x, y: target.y, id: target.id },
              damage: damage
            });
            if (target.health <= 0) {
              delete gameState.buildings[target.id];
              emitBuilding('building_destroyed', target);
              const shooter = isGuardTower ? 'guard tower' : 'turret';
              recordLedger(target.ownerId, 'lost', `${playerName(b.ownerId)}'s ${shooter} destroyed your ${buildingLabel(target)}.`, target.x, target.y);
              recordLedger(b.ownerId, 'gained', `Your ${shooter} destroyed ${playerName(target.ownerId)}'s ${buildingLabel(target)}.`, target.x, target.y);
            } else {
              emitBuilding('building_updated', target);
            }
          }
        }
      });
    }


    // Outpost capture logic
    Object.values(gameState.buildings).forEach(b => {
      if (b.type === 'outpost') {
        // Only a hero whose commander is present can stake ground; a parked, absent hero holds nothing
        const playersNear = Object.values(gameState.players).filter(p => {
          if (!userToSocket.has(p.id)) return false;
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

          const captureSpeed = b.subType === 'fortress' ? 0.5 : 1.0;

          if (b.ownerId === 'neutral') {
            const player = gameState.players[capturerId];
            const ownedOutposts = Object.values(gameState.buildings).filter((ob: any) => ob.ownerId === capturerId && ob.type === 'outpost').length;
            const expansionLvl = player?.upgrades?.base_expansion || 0;
            const maxOutposts = Math.pow(expansionLvl + 2, 2);
            if (ownedOutposts >= maxOutposts) {
              b.captureProgress = 0;
            } else {
              b.captureProgress = Math.min(100, (b.captureProgress || 0) + captureSpeed);
              if (b.captureProgress >= 100) {
                b.captureProgress = 100;
                b.ownerId = capturerId;
                recordLedger(capturerId, 'gained', `You took a neutral ${buildingLabel(b)}.`, b.x, b.y);
              }
            }
          } else if (b.ownerId === capturerId) {
            b.captureProgress = Math.min(100, (b.captureProgress || 0) + captureSpeed);
          } else {
            // Neutralize enemy outpost
            b.captureProgress = Math.max(0, (b.captureProgress || 0) - captureSpeed);
            if (b.captureProgress <= 0) {
              b.captureProgress = 0;
              recordLedger(b.ownerId, 'lost', `${playerName(capturerId)} neutralized your ${buildingLabel(b)}.`, b.x, b.y);
              recordLedger(capturerId, 'gained', `You neutralized ${playerName(b.ownerId)}'s ${buildingLabel(b)}.`, b.x, b.y);
              b.ownerId = 'neutral';
            }
          }
        }

        if (b.captureProgress !== oldProgress || b.ownerId !== oldOwner || b.capturingPlayerId !== oldCapturer || b.isConflict !== oldConflict) {
          emitBuilding('building_updated', b);
        }
      }
    });

    // Sanctuary Healing - Every 5 seconds
    if (ticksCount % 50 === 0) {
      let healingEvents: { x: number, y: number, radius: number }[] = [];
      Object.values(gameState.buildings).forEach(b => {
        if (b.type === 'outpost' && b.ownerId !== 'neutral' && b.subType === 'sanctuary') {
          let healed = false;
          Object.values(gameState.buildings).forEach(eb => {
            if (eb.ownerId === b.ownerId) {
              const maxHealth = maxHealthOf(eb);
              if (eb.health < maxHealth) {
                const dist = Math.sqrt(Math.pow(eb.x - b.x, 2) + Math.pow(eb.y - b.y, 2));
                if (dist <= 300) {
                  eb.health = Math.min(eb.health + 5, maxHealth);
                  emitBuilding('building_updated', eb);
                  healed = true;
                }
              }
            }
          });
          if (healed) {
            sendToPlayer(b.ownerId, 'healing_events', [{ x: b.x, y: b.y, radius: 300 }]);
          }
        }
      });
    }

    // Each client hears only the fights it can see or is part of
    if (combatEvents.length > 0) {
      for (const [pid, v] of vision) {
        const seen = combatEvents.filter(ev =>
          gameState.buildings[ev.from.id]?.ownerId === pid || canSee(v.circles, ev.from.x, ev.from.y) || canSee(v.circles, ev.to.x, ev.to.y));
        if (seen.length > 0) sendToPlayer(pid, 'combat_events', seen);
      }
    }

    if (ticksCount % VISION_SYNC_TICKS === 0) {
      for (const pid of vision.keys()) syncVision(pid);
    }
    if (ticksCount % STANDINGS_TICKS === 0) {
      Object.values(gameState.players).forEach(balanceLabour);
      io.emit('scoreboard', scoreboard());
      for (const pid of vision.keys()) sendToPlayer(pid, 'rates', ratesFor(pid));
    }

    // Positions: every client gets its own hero and units, and rivals only while visible
    for (const [pid, v] of vision) {
      const players = Object.values(gameState.players)
        .filter(p => p.id === pid || v.players.has(p.id))
        .map(p => ({ id: p.id, x: p.x, y: p.y }));
      const units = Object.values(gameState.units)
        .filter(u => u.ownerId === pid || v.units.has(u.id))
        .map(u => ({ id: u.id, x: u.x, y: u.y, state: u.state, targetId: u.targetId, inventory: u.inventory, capacity: u.capacity, stall: u.ownerId === pid ? (u.stall ?? null) : null }));
      sendToPlayer(pid, 'state_tick', { players, units });
    }
    
    let resourceUpdates: ResourceNode[] = [];
    let inventoryUpdates: Record<string, Player['inventory']> = {};

    const wallsByOwner = new Map<string, Building[]>();
    Object.values(gameState.buildings).forEach(b => {
      if (b.type !== 'wall') return;
      const list = wallsByOwner.get(b.ownerId) || [];
      list.push(b);
      wallsByOwner.set(b.ownerId, list);
    });

    Object.values(gameState.units).forEach(u => {
       if (u.type === 'miner') {
         const p = gameState.players[u.ownerId];
         if (!p) return; 
         
         const hasSpeedTrait = p.traits.includes('speed');
         const minerSpeedLvl = p.upgrades?.miner_speed || 0;
         const traitSpeedLvl = p.upgrades?.trait_speed_upg || 0;
         const roadsLvl = p.upgrades?.wall_roads || 0;
         const onRoad = roadsLvl > 0 && (wallsByOwner.get(p.id) || []).some(w =>
           Math.abs(w.x - u.x) <= SUPPLY_ROAD_RANGE && Math.abs(w.y - u.y) <= SUPPLY_ROAD_RANGE &&
           Math.hypot(w.x - u.x, w.y - u.y) <= SUPPLY_ROAD_RANGE);
         const roadMultiplier = onRoad ? 1 + roadsLvl * 0.1 : 1;
         const MINER_SPEED = ((hasSpeedTrait ? constants.MINER_SPEED_BOOST : constants.MINER_SPEED) + (minerSpeedLvl * 2)) * (1 + traitSpeedLvl * 0.01) * roadMultiplier;
         
         if (u.state === 'idle') {
            if (!u.assignedResource) {
              u.stall = null;
              return;
            }
            let nearestRes = null;
            let minDist = Infinity;
            for (const rId in gameState.resources) {
              const r = gameState.resources[rId];
              if (r.type !== u.assignedResource) continue;
              const dx = r.x - u.x;
              const dy = r.y - u.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              // The territory check is the expensive one, so only run it on a closer candidate
              if (dist < minDist && isPointInValidMiningArea(r.x, r.y, u.ownerId, gameState, constants)) {
                minDist = dist;
                nearestRes = rId;
              }
            }
            if (nearestRes) {
              u.targetId = nearestRes;
              u.state = 'moving_to_resource';
              u.stall = null;
            } else {
              u.stall = `No ${u.assignedResource} left inside your borders`;
            }
         } else if (u.state === 'moving_to_resource') {
            const r = gameState.resources[u.targetId!];
            if (!r || r.amount <= 0 || !isPointInValidMiningArea(r.x, r.y, u.ownerId, gameState, constants)) {
              u.state = 'idle';
              u.targetId = null;
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
            if (!r || r.amount <= 0 || u.inventory.amount >= u.capacity || !isPointInValidMiningArea(r.x, r.y, u.ownerId, gameState, constants)) {
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
            const hasForwardDepots = (p.upgrades?.turret_depot || 0) > 0;
            const validDropoffs = Object.values(gameState.buildings).filter(b =>
              b.ownerId === u.ownerId && (b.type === 'base' || b.type === 'outpost' || (hasForwardDepots && b.type === 'turret'))
            );

            let nearestDropoff = null;
            let minDistDropoff = Infinity;

            validDropoffs.forEach(b => {
              const dx = b.x - u.x;
              const dy = b.y - u.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist < minDistDropoff) {
                minDistDropoff = dist;
                nearestDropoff = b;
              }
            });

            if (!nearestDropoff) {
              u.stall = 'No depot to unload at';
              u.state = 'idle';
              return;
            }
            u.stall = null;
            const dropoff = nearestDropoff as Building;

            const dx = nearestDropoff.x - u.x;
            const dy = nearestDropoff.y - u.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < 30) {
              if (u.inventory.type) {
                const delivered = Math.round(u.inventory.amount * deliveryMultiplier(p, dropoff, u.inventory.type));
                p.inventory[u.inventory.type] += delivered;
                logDelivery(p.id, u.inventory.type, delivered, dropoff.id, depotLabel(dropoff), dropoff.x, dropoff.y);
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

  // --- Persistence: the world outlives the process ---
  const snapshot = (): WorldSnapshot => ({
    version: 1,
    gameState,
    generatedChunks: [...generatedChunks],
    chunkResourceIds: [...chunkData].map(([key, c]) => [key, c.resources.map(r => r.id), c.zones.map(z => z.id)]),
    totalOutpostsGenerated,
    ledgers: [...ledgers],
    lastSeenAt: [...lastSeenAt],
  });
  const worldStore = createWorldStore();
  setFact('worldStore', worldStore.describe);
  setPhase('loading_world');
  startupStep('loading world', worldStore.describe);
  const loadStarted = Date.now();
  const saved = await worldStore.load().catch(e => {
    // Refuse to start over a world we couldn't read, rather than overwrite it with an empty one
    console.error(`[startup] could not load the world from ${worldStore.describe}:`, e);
    process.exit(1);
  });
  setFact('worldLoadMs', Date.now() - loadStarted);
  if (!saved) startupStep('no saved world found', 'starting a fresh one');
  if (saved) {
    Object.assign(gameState, saved.gameState);
    saved.generatedChunks.forEach(k => generatedChunks.add(k));
    for (const [key, rIds, zIds] of saved.chunkResourceIds) {
      chunkData.set(key, {
        resources: rIds.map(id => gameState.resources[id]).filter(Boolean),
        zones: zIds.map(id => gameState.zones[id]).filter(Boolean),
      });
    }
    totalOutpostsGenerated = saved.totalOutpostsGenerated;
    saved.ledgers.forEach(([k, v]) => ledgers.set(k, v));
    saved.lastSeenAt.forEach(([k, v]) => lastSeenAt.set(k, v));
    // Everyone was away while the server was down
    const now = Date.now();
    Object.keys(gameState.players).forEach(id => { if (!lastSeenAt.has(id)) lastSeenAt.set(id, now); });
    startupStep('world loaded', `${Date.now() - loadStarted}ms: ${Object.keys(gameState.players).length} players, ${Object.keys(gameState.buildings).length} buildings, ${Object.keys(gameState.resources).length} resource nodes`);
  }
  let saving: Promise<void> | null = null;
  const saveNow = () => {
    if (saving) return saving;
    saving = worldStore.save(snapshot())
      .catch(e => console.error(`Could not save the world to ${worldStore.describe}:`, e))
      .finally(() => { saving = null; });
    return saving;
  };
  setInterval(saveNow, SAVE_INTERVAL_MS);
  // Cloud Run sends SIGTERM (a new revision, or an idle instance scaling to zero) and allows a few
  // seconds before stopping the container
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
      setPhase('stopping');
      console.log(`[shutdown] ${signal}: ${userToSocket.size} players connected; saving the world`);
      const now = Date.now();
      for (const id of userToSocket.keys()) lastSeenAt.set(id, now);
      if (saving) await saving;
      await saveNow();
      process.exit(0);
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    startupStep('listening', `port ${PORT}`);
    setPhase('ready');
  });
}

startServer().catch(console.error);
