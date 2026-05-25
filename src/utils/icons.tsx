import React from 'react';
import * as GiIcons from 'react-icons/gi';
import * as LucideIcons from 'lucide-react';
import { renderToString } from 'react-dom/server';
import { icons } from '../../data';

export const getIconComponent = (name: string, library: string) => {
  if (library === 'gi') return (GiIcons as any)[name];
  if (library === 'lucide') return (LucideIcons as any)[name];
  return null;
};

export const getMascot = (traits: string[]) => {
  if (!traits || traits.length < 2) return null;
  const sorted = [...traits].sort();
  if (sorted.includes('speed') && sorted.includes('strength')) return icons.mascots.speed_strength;
  if (sorted.includes('speed') && sorted.includes('cost')) return icons.mascots.speed_cost;
  if (sorted.includes('strength') && sorted.includes('cost')) return icons.mascots.strength_cost;
  return null;
};

export const DynamicIcon = ({ name, library, ...props }: { name: string; library: string; [key: string]: any }) => {
  const Icon = getIconComponent(name, library);
  return Icon ? <Icon {...props} /> : null;
};

export function createIconImage(Icon: any, color: string): HTMLImageElement {
  const svgString = renderToString(<Icon color={color} size={32} />);
  const withXmlns = svgString.includes('xmlns') ? svgString : svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const encoded = encodeURIComponent(withXmlns);
  const dataUri = `data:image/svg+xml;charset=utf-8,${encoded}`;
  const img = new Image();
  img.src = dataUri;
  return img;
}

export const woodIconImg = createIconImage(getIconComponent(icons.resources.wood.name, icons.resources.wood.library), icons.resources.wood.color);
export const stoneIconImg = createIconImage(getIconComponent(icons.resources.stone.name, icons.resources.stone.library), icons.resources.stone.color);
export const goldIconImg = createIconImage(getIconComponent(icons.resources.gold.name, icons.resources.gold.library), icons.resources.gold.color);

export const baseIconWhite = createIconImage(getIconComponent(icons.buildings.base.name, icons.buildings.base.library), icons.buildings.base.color);
export const wallIconWhite = createIconImage(getIconComponent(icons.buildings.wall.name, icons.buildings.wall.library), icons.buildings.wall.color);
export const turretIconWhite = createIconImage(getIconComponent(icons.buildings.turret.name, icons.buildings.turret.library), icons.buildings.turret.color);
export const minerIconWhite = createIconImage(getIconComponent(icons.buildings.miner.name, icons.buildings.miner.library), icons.buildings.miner.color);
export const outpostIconWhite = createIconImage(getIconComponent(icons.buildings.outpost.name, icons.buildings.outpost.library), icons.buildings.outpost.color);
export const refineryIconWhite = createIconImage(getIconComponent(icons.buildings.refinery.name, icons.buildings.refinery.library), icons.buildings.refinery.color);
export const guardTowerIconWhite = createIconImage(getIconComponent(icons.buildings.guard_tower.name, icons.buildings.guard_tower.library), icons.buildings.guard_tower.color);
export const marketIconWhite = createIconImage(getIconComponent(icons.buildings.market.name, icons.buildings.market.library), icons.buildings.market.color);
export const sanctuaryIconWhite = createIconImage(getIconComponent(icons.buildings.sanctuary.name, icons.buildings.sanctuary.library), icons.buildings.sanctuary.color);
export const fortressIconWhite = createIconImage(getIconComponent(icons.buildings.fortress.name, icons.buildings.fortress.library), icons.buildings.fortress.color);
