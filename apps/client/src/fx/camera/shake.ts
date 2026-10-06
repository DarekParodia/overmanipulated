// Trauma-based camera shake: events add trauma (0..1), shake = trauma², decaying over time.
// Offsets use smooth pseudo-noise so the shake reads as a jolt, not jitter.

export const TRAUMA_DECAY_PER_SECOND = 1.6;
export const MAX_OFFSET = 0.18;
export const MAX_ROLL = 0.035;

export type ShakeState = { trauma: number; time: number };

export function createShake(): ShakeState {
  return { trauma: 0, time: 0 };
}

export function addTrauma(state: ShakeState, amount: number): void {
  state.trauma = Math.min(1, state.trauma + amount);
}

/** Smooth noise in [-1, 1] from layered sines with incommensurate frequencies. */
function wobble(time: number, seed: number): number {
  return (
    Math.sin(time * 37.1 + seed) * 0.5 +
    Math.sin(time * 61.7 + seed * 2.3) * 0.3 +
    Math.sin(time * 91.3 + seed * 4.1) * 0.2
  );
}

export function stepShake(
  state: ShakeState,
  dtSeconds: number,
): { x: number; y: number; roll: number } {
  state.time += dtSeconds;
  state.trauma = Math.max(0, state.trauma - TRAUMA_DECAY_PER_SECOND * dtSeconds);
  const shake = state.trauma * state.trauma;
  return {
    x: MAX_OFFSET * shake * wobble(state.time, 1),
    y: MAX_OFFSET * shake * wobble(state.time, 7),
    roll: MAX_ROLL * shake * wobble(state.time, 13),
  };
}
