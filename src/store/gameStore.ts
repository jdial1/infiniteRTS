import { GameState, Player } from '../types';

export class GameStore {
  state: GameState | null = null;
  me: Player | null = null;
  inventory = { wood: 0, stone: 0, gold: 0 };
  combatEffects: {
    lines: { from: {x:number, y:number}, to: {x:number, y:number}, time: number, maxLifetime: number }[];
    damageTexts: { x: number, y: number, value: number, time: number, maxLifetime: number }[];
  } = { lines: [], damageTexts: [] };
}

export const store = new GameStore();
