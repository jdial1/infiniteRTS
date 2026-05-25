import { GameState, Building } from '../types';

export type Point = { x: number; y: number };

export function getVoronoiCell(site: Point, allSites: Point[], bounds: { minX: number; minY: number; maxX: number; maxY: number }): Point[] {
  let cell = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ];

  for (const other of allSites) {
    if (other.x === site.x && other.y === site.y) continue;
    const midX = (site.x + other.x) / 2;
    const midY = (site.y + other.y) / 2;
    const dx = other.x - site.x;
    const dy = other.y - site.y;
    const nextCell: Point[] = [];
    for (let i = 0; i < cell.length; i++) {
      const p1 = cell[i];
      const p2 = cell[(i + 1) % cell.length];
      const in1 = dx * (p1.x - midX) + dy * (p1.y - midY) <= 0.001;
      const in2 = dx * (p2.x - midX) + dy * (p2.y - midY) <= 0.001;
      if (in1 && in2) {
        nextCell.push(p2);
      } else if (in1 && !in2) {
        nextCell.push(intersect(p1, p2, midX, midY, dx, dy));
      } else if (!in1 && in2) {
        nextCell.push(intersect(p1, p2, midX, midY, dx, dy));
        nextCell.push(p2);
      }
    }
    cell = nextCell;
    if (cell.length === 0) break;
  }
  return cell;
}

export function getTerritoryPaths(userId: string, buildings: Record<string, Building>, constants: any, voronoiBounds: any) {
  const allSites = Object.values(buildings)
    .filter((b: Building) => b.type === 'base' || b.type === 'outpost')
    .map((b: Building) => ({
      x: b.x,
      y: b.y,
      ownerId: b.ownerId,
      radius: b.type === 'base' ? constants.BUILD_RANGE : 400
    }));
  const mySites = allSites.filter(s => s.ownerId === userId);
  if (mySites.length === 0) return null;
  const ownedOutposts = Object.values(buildings).filter((b: Building) => b.ownerId === userId && b.type === 'outpost');
  const playerBase = Object.values(buildings).find((b: Building) => b.ownerId === userId && b.type === 'base');
  const OUTPOST_BUILD_RADIUS = 400;
  const OUTPOST_SPACING = 600;
  const path = new Path2D();
  ownedOutposts.forEach(o => {
    path.moveTo(o.x + OUTPOST_BUILD_RADIUS, o.y);
    path.arc(o.x, o.y, OUTPOST_BUILD_RADIUS, 0, Math.PI * 2);
  });
  if (playerBase) {
    path.moveTo(playerBase.x + constants.BUILD_RANGE, playerBase.y);
    path.arc(playerBase.x, playerBase.y, constants.BUILD_RANGE, 0, Math.PI * 2);
  }
  for (let i = 0; i < ownedOutposts.length; i++) {
    for (let j = i + 1; j < ownedOutposts.length; j++) {
      const a = ownedOutposts[i], b = ownedOutposts[j];
      const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
      if ((Math.abs(dx - OUTPOST_SPACING) < 1 && dy < 1) || (dx < 1 && Math.abs(dy - OUTPOST_SPACING) < 1)) {
        const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
        const maxX = Math.max(a.x, b.x), maxY = Math.max(a.y, b.y);
        if (dx > dy) path.rect(minX, a.y - 200, maxX - minX, 400);
        else path.rect(a.x - 200, minY, 400, maxY - minY);
      }
    }
  }
  ownedOutposts.forEach(o => {
    const hasTR = ownedOutposts.some(ot => Math.abs(ot.x - (o.x + OUTPOST_SPACING)) < 1 && Math.abs(ot.y - o.y) < 1);
    const hasBL = ownedOutposts.some(ot => Math.abs(ot.x - o.x) < 1 && Math.abs(ot.y - (o.y + OUTPOST_SPACING)) < 1);
    const hasBR = ownedOutposts.some(ot => Math.abs(ot.x - (o.x + OUTPOST_SPACING)) < 1 && Math.abs(ot.y - (o.y + OUTPOST_SPACING)) < 1);
    if (hasTR && hasBL && hasBR) path.rect(o.x, o.y, OUTPOST_SPACING, OUTPOST_SPACING);
  });
  const clipPath = new Path2D();
  const conflictingEdgesPath = new Path2D();
  const otherSites = allSites.filter(s => s.ownerId !== userId);
  mySites.forEach(site => {
    const cell = getVoronoiCell(site, allSites, voronoiBounds);
    if (cell.length > 0) {
      clipPath.moveTo(cell[0].x, cell[0].y);
      for (let i = 1; i < cell.length; i++) clipPath.lineTo(cell[i].x, cell[i].y);
      clipPath.closePath();
      for (let i = 0; i < cell.length; i++) {
        const p1 = cell[i], p2 = cell[(i + 1) % cell.length], midP = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const isSharedWithOther = otherSites.some(os => {
          const dx = os.x - site.x, dy = os.y - site.y, d2 = dx*dx + dy*dy;
          if (d2 < 1) return false;
          const midX = (site.x + os.x) / 2, midY = (site.y + os.y) / 2;
          return (Math.abs(dx * (midP.x - midX) + dy * (midP.y - midY)) / Math.sqrt(d2)) < 0.1;
        });
        if (isSharedWithOther) {
          conflictingEdgesPath.moveTo(p1.x, p1.y);
          conflictingEdgesPath.lineTo(p2.x, p2.y);
        }
      }
    }
  });
  return { path, clipPath, conflictingEdgesPath };
}

export function intersect(p1: Point, p2: Point, midX: number, midY: number, dx: number, dy: number): Point {
  const v1x = p2.x - p1.x, v1y = p2.y - p1.y, denom = (dx * v1x + dy * v1y);
  if (Math.abs(denom) < 0.0001) return p1;
  const t = (dx * (midX - p1.x) + dy * (midY - p1.y)) / denom;
  return { x: p1.x + t * v1x, y: p1.y + t * v1y };
}

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
