import { GameState, Building } from '../types';

export function isPointInTerritory(px: number, py: number, userId: string, gameState: GameState, constants: any) {
  // 1. Check Base (radius 450)
  const playerBase = Object.values(gameState.buildings).find((b: any) => b.ownerId === userId && b.type === 'base');
  if (playerBase) {
    const dx = px - playerBase.x;
    const dy = py - playerBase.y;
    if (Math.sqrt(dx * dx + dy * dy) <= constants.BUILD_RANGE) return true;
  }

  // 2. Check Outposts
  const ownedOutposts = Object.values(gameState.buildings).filter((b: any) => b.ownerId === userId && b.type === 'outpost') as any[];
  const OUTPOST_BUILD_RADIUS = 400;
  const OUTPOST_SPACING = 600;

  for (const o of ownedOutposts) {
    const dx = px - o.x;
    const dy = py - o.y;
    if (Math.sqrt(dx * dx + dy * dy) <= OUTPOST_BUILD_RADIUS) return true;
  }

  // 3. Check Bridges (1D)
  for (let i = 0; i < ownedOutposts.length; i++) {
    for (let j = i + 1; j < ownedOutposts.length; j++) {
      const a = ownedOutposts[i];
      const b = ownedOutposts[j];

      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);

      if ((Math.abs(dx - OUTPOST_SPACING) < 1 && dy < 1) || (dx < 1 && Math.abs(dy - OUTPOST_SPACING) < 1)) {
        // Adjacent
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);

        if (dx > dy) { // Horizontal bridge
          if (px >= minX && px <= maxX && Math.abs(py - a.y) <= 200) return true;
        } else { // Vertical bridge
          if (py >= minY && py <= maxY && Math.abs(px - a.x) <= 200) return true;
        }
      }
    }
  }

  // 4. Check 2D Squares
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

export function isPointInValidMiningArea(x: number, y: number, ownerId: string, gameState: GameState, constants: any): boolean {
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
