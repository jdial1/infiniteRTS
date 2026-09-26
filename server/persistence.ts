import fs from 'fs';
import path from 'path';
import { GameState, LedgerEntry } from '../src/types';

export interface WorldSnapshot {
  version: 1;
  gameState: GameState;
  generatedChunks: string[];
  chunkResourceIds: [string, string[], string[]][]; // chunk key -> resource ids, zone ids
  totalOutpostsGenerated: number;
  ledgers: [string, LedgerEntry[]][];
  lastSeenAt: [string, number][];
}

export function loadWorld(file: string): WorldSnapshot | null {
  try {
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data?.version !== 1) {
      console.warn(`Ignoring world file ${file}: unknown version ${data?.version}`);
      return null;
    }
    return data as WorldSnapshot;
  } catch (e) {
    console.error(`Could not load world file ${file}:`, e);
    return null;
  }
}

// Write to a temporary file and rename, so a crash mid-write never leaves a half-saved world
export function saveWorld(file: string, snapshot: WorldSnapshot) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error(`Could not save world file ${file}:`, e);
  }
}
