// The server's startup, step by step, with timings. Every step is logged as it happens (Cloud Run
// keeps these in Cloud Logging), and the whole record is served at /api/health and sent to each app
// as it connects, so a player stuck on "connecting" can see how far the server got.

export type Phase = 'booting' | 'loading_world' | 'ready' | 'stopping';

export interface StartupStep {
  step: string;
  atMs: number; // milliseconds since the process started
  detail?: string;
}

const bootedAt = Date.now();
let phase: Phase = 'booting';
const steps: StartupStep[] = [];
const facts: Record<string, string | number | boolean> = {};

export function startupStep(step: string, detail?: string) {
  const atMs = Date.now() - bootedAt;
  steps.push({ step, atMs, detail });
  console.log(`[startup +${atMs}ms] ${step}${detail ? ` - ${detail}` : ''}`);
}

export function setPhase(next: Phase) {
  phase = next;
  startupStep(`phase: ${next}`);
}

/** Records a fact about this instance for the status report (world source, auth mode, ...). */
export function setFact(key: string, value: string | number | boolean) {
  facts[key] = value;
}

export function serverStatus(live: { playersOnline: number; players: number; buildings: number }) {
  const uptimeMs = Date.now() - bootedAt;
  return {
    phase,
    // Cloud Run sets K_REVISION; a local server reports "local"
    revision: process.env.K_REVISION || 'local',
    bootedAt: new Date(bootedAt).toISOString(),
    uptimeMs,
    // A connection in the first minute most likely woke the server from sleep
    coldStart: uptimeMs < 60_000,
    ...facts,
    ...live,
    startup: steps,
  };
}
