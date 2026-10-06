// Global FX clock scale for hit-stop: a big impact (stamp slam) briefly freezes FX motion so it
// lands with weight. Scene code multiplies its frame delta by `fxTimeScale()`. The simulation
// and networking never read this (FX never affect the simulation).

/** Clock speed while a hit-stop is active (not zero, so nothing looks broken). */
export const HIT_STOP_SCALE = 0.05;
/** Upper bound for one freeze, so it never reads as a stall. */
export const MAX_HIT_STOP_MS = 120;

export type HitStopState = { until: number };

export function createHitStop(): HitStopState {
  return { until: 0 };
}

/** Starts a freeze of `ms` (capped); impacts during a running freeze never extend it. */
export function triggerHitStop(state: HitStopState, ms: number, now: number): void {
  if (now < state.until) {
    return;
  }
  state.until = now + Math.min(ms, MAX_HIT_STOP_MS);
}

export function timeScaleAt(state: HitStopState, now: number): number {
  return now < state.until ? HIT_STOP_SCALE : 1;
}

const globalHitStop = createHitStop();

export function hitStop(ms: number): void {
  triggerHitStop(globalHitStop, ms, performance.now());
}

/** Scale for this frame's FX delta: 1 normally, ~0 during a hit-stop. */
export function fxTimeScale(): number {
  return timeScaleAt(globalHitStop, performance.now());
}
