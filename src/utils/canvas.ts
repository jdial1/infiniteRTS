type Point = { x: number; y: number };

export function intersect(p1: Point, p2: Point, midX: number, midY: number, dx: number, dy: number): Point {
  const v1x = p2.x - p1.x;
  const v1y = p2.y - p1.y;
  const t = ((midX - p1.x) * dx + (midY - p1.y) * dy) / (v1x * dx + v1y * dy);
  return { x: p1.x + t * v1x, y: p1.y + t * v1y };
}

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

export function getTerritoryPaths(userId: string, buildings: any, constants: any, voronoiBounds: any) {
  const allSites = Object.values(buildings)
    .filter((b: any) => b.type === 'base' || b.type === 'outpost')
    .map((b: any) => ({
      x: b.x,
      y: b.y,
      ownerId: b.ownerId,
      radius: b.type === 'base' ? constants.BUILD_RANGE : 400
    }));

  const mySites = allSites.filter(s => s.ownerId === userId);
  if (mySites.length === 0) return null;

  const ownedOutposts = Object.values(buildings).filter((b: any) => b.ownerId === userId && b.type === 'outpost') as any[];
  const playerBase = Object.values(buildings).find((b: any) => b.ownerId === userId && b.type === 'base');
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
      for (let i = 1; i < cell.length; i++) {
        const p1 = cell[i];
        clipPath.lineTo(p1.x, p1.y);
      }
      clipPath.closePath();

      for (let i = 0; i < cell.length; i++) {
        const p1 = cell[i];
        const p2 = cell[(i + 1) % cell.length];
        const midP = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        const isSharedWithOther = otherSites.some(os => {
          const dx = os.x - site.x;
          const dy = os.y - site.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < 1) return false;
          const midX = (site.x + os.x) / 2;
          const midY = (site.y + os.y) / 2;
          const distToBisector = Math.abs(dx * (midP.x - midX) + dy * (midP.y - midY)) / Math.sqrt(d2);
          return distToBisector < 0.1;
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

const hatchCanvasCache: Record<string, HTMLCanvasElement> = {};

export function getHatchCanvas(color: string): HTMLCanvasElement {
  if (hatchCanvasCache[color]) return hatchCanvasCache[color];
  const cvs = document.createElement('canvas');
  cvs.width = 10;
  cvs.height = 10;
  const ctx = cvs.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(10, 0);
  ctx.stroke();
  hatchCanvasCache[color] = cvs;
  return cvs;
}

let cachedRedHatchCanvas: HTMLCanvasElement | null = null;
export function getRedHatchCanvas(): HTMLCanvasElement {
  if (cachedRedHatchCanvas) return cachedRedHatchCanvas;
  const cvs = document.createElement('canvas');
  cvs.width = 10;
  cvs.height = 10;
  const ctx = cvs.getContext('2d')!;
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 10);
  ctx.stroke();
  cachedRedHatchCanvas = cvs;
  return cvs;
}

export function drawTextAlongArc(ctx: CanvasRenderingContext2D, str: string, centerX: number, centerY: number, radius: number, angle: number) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle - (str.length * 0.05));
  for (let i = 0; i < str.length; i++) {
    ctx.save();
    ctx.rotate(i * 0.1);
    ctx.fillText(str[i], 0, -radius);
    ctx.restore();
  }
  ctx.restore();
}
