// Game rules shared by the server and the client, so every number the UI shows is the number the server uses.
import { Building, GameState, Player, ResourceNode } from './types';
import { buildings, constants } from '../data';

export type Resources = { wood: number; stone: number; gold: number };
export const RESOURCE_TYPES: ResourceNode['type'][] = ['wood', 'stone', 'gold'];

// --- The Plan: the infinite sink. Each phase asks for more than the last, forever. ---
const PLAN_BASE: Resources = { wood: 300, stone: 300, gold: 100 };
const PLAN_GROWTH = 1.35;

export function planRequirement(phasesDone: number): Resources {
  const f = Math.pow(PLAN_GROWTH, phasesDone);
  return {
    wood: Math.round(PLAN_BASE.wood * f),
    stone: Math.round(PLAN_BASE.stone * f),
    gold: Math.round(PLAN_BASE.gold * f),
  };
}

// One delivery commits at most a quarter of the phase, so the Plan can never empty the purse in one click
export function planInstalment(phasesDone: number): Resources {
  const need = planRequirement(phasesDone);
  return { wood: Math.ceil(need.wood / 4), stone: Math.ceil(need.stone / 4), gold: Math.ceil(need.gold / 4) };
}

// --- The score: the map is the ledger. Only held ground and fulfilled Plan phases count. ---
export const SCORE_PER_OUTPOST = 100;
export const SCORE_PER_PLAN_PHASE = 150;

export function scoreFor(playerId: string, player: Player | undefined, allBuildings: Record<string, Building>) {
  const outposts = Object.values(allBuildings).filter(b => b.ownerId === playerId && b.type === 'outpost').length;
  const planPhase = player?.plan?.phase || 0;
  return { outposts, planPhase, score: outposts * SCORE_PER_OUTPOST + planPhase * SCORE_PER_PLAN_PHASE };
}

// --- Hero movement: the fastest a hero can legally move, used by the server to clamp reported positions. ---
export function heroMaxSpeed(player: Player): number {
  const base = player.traits.includes('speed') ? constants.HERO_SPEED_BOOST : constants.HERO_SPEED;
  const traitSpeedLvl = player.upgrades?.trait_speed_upg || 0;
  const wallMagneticLvl = player.upgrades?.wall_magnetic || 0;
  return base * (1 + traitSpeedLvl * 0.01) * (1 + wallMagneticLvl * 0.01);
}

// --- Vision: what a player can see. The server only sends rival state inside these circles. ---
export type VisionCircle = { x: number; y: number; r: number };
const OUTPOST_VISION = 450; // covers the outpost's build radius and the middle of a filled square

export function visionCircles(playerId: string, state: GameState): VisionCircle[] {
  const circles: VisionCircle[] = [];
  const p = state.players[playerId];
  if (p) circles.push({ x: p.x, y: p.y, r: constants.FOG_VISION_HERO });
  for (const b of Object.values(state.buildings)) {
    if (b.ownerId !== playerId) continue;
    if (b.type === 'base') circles.push({ x: b.x, y: b.y, r: constants.FOG_VISION_BASE });
    else if (b.type === 'turret') circles.push({ x: b.x, y: b.y, r: constants.FOG_VISION_TURRET });
    else if (b.type === 'outpost') circles.push({ x: b.x, y: b.y, r: OUTPOST_VISION });
    else circles.push({ x: b.x, y: b.y, r: 200 });
  }
  for (const u of Object.values(state.units)) {
    if (u.ownerId === playerId) circles.push({ x: u.x, y: u.y, r: constants.FOG_VISION_MINER });
  }
  return circles;
}

export function canSee(circles: VisionCircle[], x: number, y: number): boolean {
  for (const c of circles) {
    const dx = x - c.x, dy = y - c.y;
    if (dx * dx + dy * dy <= c.r * c.r) return true;
  }
  return false;
}

// --- Demolition: refactoring is free, but a damaged building can't be sold to escape a rival. ---
export function maxHealthOf(b: Building): number {
  return b.maxHealth ?? (buildings as any)[b.type]?.health ?? 100;
}

export function demolishRefund(b: Building): Resources {
  const paid: Resources = b.paid ?? (buildings as any)[b.type]?.cost ?? { wood: 0, stone: 0, gold: 0 };
  const share = Math.max(0, Math.min(1, b.health / maxHealthOf(b)));
  return {
    wood: Math.floor(paid.wood * share),
    stone: Math.floor(paid.stone * share),
    gold: Math.floor(paid.gold * share),
  };
}

// --- Standing orders: the player sets the labour split, the machine keeps it. ---
export function desiredLabour(total: number, ratio: Resources): Resources {
  const weight = ratio.wood + ratio.stone + ratio.gold;
  const out: Resources = { wood: 0, stone: 0, gold: 0 };
  if (weight <= 0 || total <= 0) return out;
  const exact = RESOURCE_TYPES.map(t => ({ t, v: (total * ratio[t]) / weight }));
  let assigned = 0;
  for (const e of exact) { out[e.t] = Math.floor(e.v); assigned += out[e.t]; }
  // Largest remainder gets the leftover workers
  exact.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
  for (let i = 0; assigned < total; i++, assigned++) out[exact[i % exact.length].t]++;
  return out;
}
