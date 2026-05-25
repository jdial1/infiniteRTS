import { GameState } from '../src/types';

export const gameState: GameState = {
  players: {},
  resources: {},
  buildings: {},
  units: {},
  zones: {},
};

export const socketToUser = new Map<string, string>();
export const userToSocket = new Map<string, string>();
export const generatedChunks = new Set<string>();
export const chunkData = new Map<string, { resources: any[], zones: any[] }>();
