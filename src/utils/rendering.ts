import { Player, Building, Unit, ResourceNode } from '../types';
import { buildings } from '../../data';
import {
  woodIconImg, stoneIconImg, goldIconImg,
  baseIconWhite, wallIconWhite, turretIconWhite,
  minerIconWhite, outpostIconWhite, refineryIconWhite,
  guardTowerIconWhite, marketIconWhite, sanctuaryIconWhite,
  fortressIconWhite
} from './icons';

export const drawResource = (ctx: CanvasRenderingContext2D, r: ResourceNode) => {
    const size = 12;
    let img = woodIconImg;
    if (r.type === 'stone') img = stoneIconImg;
    if (r.type === 'gold') img = goldIconImg;

    if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, r.x - size, r.y - size, size * 2, size * 2);
    }
};

export const drawBuilding = (ctx: CanvasRenderingContext2D, b: Building, players: Record<string, Player>) => {
    const bData = (buildings as any)[b.type];
    const playerColor = players[b.ownerId]?.color || '#ffffff';
    const size = bData.size;

    ctx.save();
    ctx.fillStyle = playerColor;
    ctx.beginPath();
    if (b.type === 'base') {
        (ctx as any).roundRect ? (ctx as any).roundRect(b.x - size, b.y - size, size * 2, size * 2, 6) : ctx.rect(b.x - size, b.y - size, size * 2, size * 2);
    } else if (b.type === 'wall') {
        (ctx as any).roundRect ? (ctx as any).roundRect(b.x - size, b.y - size, size * 2, size * 2, 3) : ctx.rect(b.x - size, b.y - size, size * 2, size * 2);
    } else if (b.type === 'turret') {
        ctx.arc(b.x, b.y, size, 0, Math.PI * 2);
    } else if (b.type === 'outpost') {
        (ctx as any).roundRect ? (ctx as any).roundRect(b.x - size, b.y - size, size * 2, size * 2, 10) : ctx.rect(b.x - size, b.y - size, size * 2, size * 2);
    }
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    let img = null;
    if (b.type === 'base') img = baseIconWhite;
    if (b.type === 'wall') img = wallIconWhite;
    if (b.type === 'turret') img = turretIconWhite;
    if (b.type === 'outpost') {
        img = outpostIconWhite;
        if (b.subType === 'refinery') img = refineryIconWhite;
        if (b.subType === 'guard_tower') img = guardTowerIconWhite;
        if (b.subType === 'market') img = marketIconWhite;
        if (b.subType === 'sanctuary') img = sanctuaryIconWhite;
        if (b.subType === 'fortress') img = fortressIconWhite;
    }

    if (img && img.complete && img.naturalWidth > 0) {
        const iconSize = b.type === 'base' ? 15 : (b.type === 'wall' ? 8 : (b.type === 'outpost' ? 15 : 11));
        ctx.drawImage(img, b.x - iconSize, b.y - iconSize, iconSize * 2, iconSize * 2);
    }
    ctx.restore();
};

export const drawUnit = (ctx: CanvasRenderingContext2D, u: Unit, players: Record<string, Player>) => {
    if (u.type === 'miner') {
        const playerColor = players[u.ownerId]?.color || '#ffffff';
        const size = (buildings as any).miner.size;

        ctx.save();
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.arc(u.x, u.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const img = minerIconWhite;
        if (img && img.complete && img.naturalWidth > 0) {
            const iconSize = 8;
            ctx.drawImage(img, u.x - iconSize, u.y - iconSize, iconSize * 2, iconSize * 2);
        }
        ctx.restore();
    }
};
