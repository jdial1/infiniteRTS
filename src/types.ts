export interface ResourceNode {
  id: string;
  type: 'wood' | 'stone' | 'gold';
  x: number;
  y: number;
  amount: number;
}

export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  inventory: {
    wood: number;
    stone: number;
    gold: number;
  };
  score: number;
  traits: ('speed' | 'strength' | 'cost')[];
  upgrades: Record<string, number>;
}

export interface Building {
  id: string;
  ownerId: string;
  type: 'base' | 'wall' | 'turret' | 'outpost';
  x: number;
  y: number;
  health: number;
  captureProgress?: number;
  capturingPlayerId?: string | null;
  isConflict?: boolean;
  subType?: "refinery" | "guard_tower" | "market" | "sanctuary" | "fortress";
}

export interface Unit {
  id: string;
  ownerId: string;
  type: 'miner';
  x: number;
  y: number;
  state: 'idle' | 'moving_to_resource' | 'mining' | 'returning';
  targetId?: string;
  inventory: { type: 'wood' | 'stone' | 'gold' | null, amount: number };
  capacity: number;
  assignedResource: 'wood' | 'stone' | 'gold' | null;
}

export interface MapZone {
  id: string;
  x: number;
  y: number;
  radius: number;
  type: 'forest' | 'desert' | 'mountain';
  name: string;
}

export interface GameState {
  players: Record<string, Player>;
  resources: Record<string, ResourceNode>;
  buildings: Record<string, Building>;
  units: Record<string, Unit>;
  zones: Record<string, MapZone>;
}
