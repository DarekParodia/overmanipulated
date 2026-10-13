// Seeded pseudo-random number generator (mulberry32). The simulation never uses Math.random();
// the RNG state is a plain number so it can live inside serialisable game state. Minigame seeds
// are not drawn from a running RNG but derived from the match seed (`minigameSeedFor`), so they
// depend only on which folder, station and attempt they are for.
import type { StationKind } from '../domain.ts';

export type RngState = number;

/** Upper bound (exclusive) for minigame seeds: any non-negative 31-bit integer. */
export const MINIGAME_SEED_MAX = 2 ** 31 - 1;

/** Returns a float in [0, 1) and the next RNG state. */
export function nextRandom(state: RngState): [value: number, next: RngState] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Returns an integer in [0, maxExclusive) and the next RNG state. */
export function nextInt(state: RngState, maxExclusive: number): [value: number, next: RngState] {
  const [value, next] = nextRandom(state);
  return [Math.floor(value * maxExclusive), next];
}

/** A stateful RNG: `next()` is a float in [0, 1), `int(max)` an integer in [0, max). */
export type Rng = { next: () => number; int: (max: number) => number };

/** Convenience wrapper for code outside the simulation (tests, tools) that wants a stateful RNG. */
export function createRng(seed: number): Rng {
  let state: RngState = seed | 0;
  return {
    next() {
      const [value, next] = nextRandom(state);
      state = next;
      return value;
    },
    int(max) {
      const [value, next] = nextInt(state, max);
      state = next;
      return value;
    },
  };
}

/** 32-bit FNV-1a hash of a string, as a signed integer. */
export function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

/**
 * The minigame seed for one attempt at a station of `kind` on the folder spawned as `spawnKey`,
 * in a match with sim seed `seed`: FNV-1a over the key, mixed with the seed and scrambled by one
 * mulberry32 step into [0, MINIGAME_SEED_MAX). Pure, so two newsrooms with the same seed get the
 * same puzzles whatever order they work their folders in.
 */
export function minigameSeedFor(
  seed: number,
  spawnKey: string,
  kind: StationKind,
  attempt: number,
): number {
  const [value] = nextInt(seed ^ hashText(`${spawnKey}|${kind}|${attempt}`), MINIGAME_SEED_MAX);
  return value;
}
