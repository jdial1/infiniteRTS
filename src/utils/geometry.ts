import { GameState, Building } from '../types';

// Where a player may build and mine: the base's radius, each outpost's radius, a bridge between
// neighbouring outposts, and the interior of any square of four. The Android client ports this
// (android/.../rules/Territory.kt); keep the two in step.
export function isPointInTerritory(px: number, py: number, userId: string, gameState: GameState, constants: any) {
  if (!gameState) return false;
  const playerBase = Object.values(gameState.buildings).find((b: Building) => b.ownerId === userId && b.type === 'base');
  if (playerBase) {
    if (Math.sqrt((px - playerBase.x)**2 + (py - playerBase.y)**2) <= constants.BUILD_RANGE) return true;
  }
  const ownedOutposts = Object.values(gameState.buildings).filter((b: Building) => b.ownerId === userId && b.type === 'outpost');
  const OUTPOST_BUILD_RADIUS = 400, OUTPOST_SPACING = 600;
  for (const o of ownedOutposts) {
    if (Math.sqrt((px - o.x)**2 + (py - o.y)**2) <= OUTPOST_BUILD_RADIUS) return true;
  }
  for (let i = 0; i < ownedOutposts.length; i++) {
    for (let j = i + 1; j < ownedOutposts.length; j++) {
      const a = ownedOutposts[i], b = ownedOutposts[j], dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
      if ((Math.abs(dx - OUTPOST_SPACING) < 1 && dy < 1) || (dx < 1 && Math.abs(dy - OUTPOST_SPACING) < 1)) {
        const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
        if (dx > dy) { if (px >= minX && px <= maxX && Math.abs(py - a.y) <= 200) return true; }
        else { if (py >= minY && py <= maxY && Math.abs(px - a.x) <= 200) return true; }
      }
    }
  }
  for (const o of ownedOutposts) {
    const hasTR = ownedOutposts.some(ot => Math.abs(ot.x - (o.x + OUTPOST_SPACING)) < 1 && Math.abs(ot.y - o.y) < 1);
    const hasBL = ownedOutposts.some(ot => Math.abs(ot.x - o.x) < 1 && Math.abs(ot.y - (o.y + OUTPOST_SPACING)) < 1);
    const hasBR = ownedOutposts.some(ot => Math.abs(ot.x - (o.x + OUTPOST_SPACING)) < 1 && Math.abs(ot.y - (o.y + OUTPOST_SPACING)) < 1);
    if (hasTR && hasBL && hasBR) {
      if (px >= o.x && px <= o.x + OUTPOST_SPACING && py >= o.y && py <= o.y + OUTPOST_SPACING) return true;
    }
  }
  return false;
}
