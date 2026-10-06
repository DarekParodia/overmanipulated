// Seeded pseudo-random number generator (mulberry32). The simulation never uses Math.random();
// the RNG state is a plain number so it can live inside serialisable game state.

export type RngState = number;

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

/** Convenience wrapper for code outside the simulation (tests, tools) that wants a stateful RNG. */
export function createRng(seed: number): { next: () => number; int: (max: number) => number } {
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
