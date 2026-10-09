// Which foot contacts become footstep cues (S5-02). The animation emits a contact at every
// planted foot (up to ~7 per second at a sprint, for every player); the cue catalogue gets only
// the local player's steps and those of the nearest remote players, each rate-limited, and
// everything together stays under a global budget so a crowded room never turns into a drum roll.

/** Shortest time between two steps of one player. */
export const STEP_MIN_INTERVAL_S = 0.16;
/** Remote players that may be heard: the nearest this many to the local player. */
export const STEP_NEAREST_REMOTE = 2;
/** Cap on audible steps over any STEP_WINDOW_S, all players together. */
export const STEP_GLOBAL_MAX = 6;
export const STEP_WINDOW_S = 0.5;

export type FootstepGate = {
  lastByPlayer: Map<string, number>;
  recent: number[];
};

export function createFootstepGate(): FootstepGate {
  return { lastByPlayer: new Map(), recent: [] };
}

export type StepCandidate = {
  id: string;
  local: boolean;
  /** Seconds on any monotonic clock. */
  now: number;
  /** Position of the stepping player. */
  x: number;
  y: number;
};

type Positioned = { x: number; y: number; local?: boolean };

/** True when `id` is among the `limit` remote players nearest to the local one. */
export function isNearestRemote(
  id: string,
  players: ReadonlyMap<string, Positioned>,
  limit: number = STEP_NEAREST_REMOTE,
): boolean {
  let anchor: Positioned | undefined;
  for (const player of players.values()) {
    if (player.local) {
      anchor = player;
    }
  }
  const self = players.get(id);
  if (!anchor || !self) {
    return false;
  }
  const own = (self.x - anchor.x) ** 2 + (self.y - anchor.y) ** 2;
  let nearer = 0;
  for (const [otherId, player] of players) {
    if (otherId === id || player.local) {
      continue;
    }
    if ((player.x - anchor.x) ** 2 + (player.y - anchor.y) ** 2 < own) {
      nearer += 1;
    }
  }
  return nearer < limit;
}

/** Decides whether a foot contact should be sent to the cue catalogue, and records it if so. */
export function allowFootstep(
  gate: FootstepGate,
  step: StepCandidate,
  players: ReadonlyMap<string, Positioned>,
): boolean {
  if (!step.local && !isNearestRemote(step.id, players)) {
    return false;
  }
  const last = gate.lastByPlayer.get(step.id);
  if (last !== undefined && step.now - last < STEP_MIN_INTERVAL_S) {
    return false;
  }
  while (gate.recent.length > 0 && step.now - (gate.recent[0] ?? 0) > STEP_WINDOW_S) {
    gate.recent.shift();
  }
  if (gate.recent.length >= STEP_GLOBAL_MAX) {
    return false;
  }
  gate.lastByPlayer.set(step.id, step.now);
  gate.recent.push(step.now);
  return true;
}
