import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
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

export interface WorldStore {
  describe: string;
  load(): Promise<WorldSnapshot | null>;
  save(snapshot: WorldSnapshot): Promise<void>;
}

function parse(json: string, where: string): WorldSnapshot | null {
  const data = JSON.parse(json);
  if (data?.version !== 1) {
    console.warn(`Ignoring world at ${where}: unknown version ${data?.version}`);
    return null;
  }
  return data as WorldSnapshot;
}

// --- A JSON file: local development ---
export function fileStore(file: string): WorldStore {
  return {
    describe: file,
    async load() {
      if (!fs.existsSync(file)) return null;
      return parse(fs.readFileSync(file, 'utf8'), file);
    },
    // Write to a temporary file and rename, so a crash mid-write never leaves a half-saved world
    async save(snapshot) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snapshot));
      fs.renameSync(tmp, file);
    },
  };
}

// --- Firestore: production ---
// The world is gzipped and split across documents under 1 MiB. Each save writes a new generation of
// parts first and points the manifest at it last, so a save that dies halfway leaves the old world intact.
const PART_BYTES = 900 * 1024;

export function firestoreStore(projectId: string, worldId: string): WorldStore {
  if (getApps().length === 0) initializeApp({ projectId });
  const db: Firestore = getFirestore();
  const manifestRef = db.collection('worlds').doc(worldId);
  const parts = manifestRef.collection('parts');

  return {
    describe: `firestore:worlds/${worldId}`,
    async load() {
      const manifest = await manifestRef.get();
      if (!manifest.exists) return null;
      const { generation, count } = manifest.data() as { generation: number; count: number };
      const docs = await Promise.all(
        Array.from({ length: count }, (_, i) => parts.doc(`${generation}-${i}`).get()));
      const gz = Buffer.concat(docs.map(d => Buffer.from(d.get('data'))));
      return parse(zlib.gunzipSync(gz).toString('utf8'), `firestore:worlds/${worldId}`);
    },
    async save(snapshot) {
      const gz = zlib.gzipSync(JSON.stringify(snapshot));
      const count = Math.ceil(gz.length / PART_BYTES);
      const previous = await manifestRef.get();
      const generation = (previous.exists ? (previous.get('generation') as number) : 0) + 1;
      // Parts go in batches of a few documents to stay under Firestore's request size limit
      for (let i = 0; i < count; i += 8) {
        const batch = db.batch();
        for (let j = i; j < Math.min(count, i + 8); j++) {
          batch.set(parts.doc(`${generation}-${j}`), { data: gz.subarray(j * PART_BYTES, (j + 1) * PART_BYTES) });
        }
        await batch.commit();
      }
      await manifestRef.set({ generation, count, bytes: gz.length, savedAt: Date.now(), version: 1 });
      // Only now is the previous generation unreferenced
      if (previous.exists) {
        const old = previous.data() as { generation: number; count: number };
        const batch = db.batch();
        for (let i = 0; i < old.count; i++) batch.delete(parts.doc(`${old.generation}-${i}`));
        await batch.commit();
      }
    },
  };
}

// Firestore when a Firebase project is configured (or WORLD_STORE=firestore), a local file otherwise
export function createWorldStore(): WorldStore {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const kind = process.env.WORLD_STORE || (projectId ? 'firestore' : 'file');
  if (kind === 'firestore') {
    if (!projectId) throw new Error('WORLD_STORE=firestore needs FIREBASE_PROJECT_ID');
    return firestoreStore(projectId, process.env.WORLD_ID || 'main');
  }
  return fileStore(process.env.WORLD_FILE || path.join(process.cwd(), 'saves', 'world.json'));
}
