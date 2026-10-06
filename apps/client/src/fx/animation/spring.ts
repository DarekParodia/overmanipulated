// Damped spring step (allocation-free), for smoothing values like lean, squash and pop.
export type SpringState = { value: number; velocity: number };

/** Semi-implicit Euler is only stable for ω·dt < 2, so long frames are split into substeps. */
const MAX_SUBSTEP_S = 1 / 120;
/** Frames longer than this (tab was hidden, device stalled) are treated as this long. */
const MAX_FRAME_S = 0.25;

/**
 * Advances a spring towards `target`. `frequency` in Hz controls speed; `damping` 1 = critical.
 * Stable for any frame time: slow devices get the same motion, just sampled less often.
 */
export function stepSpring(
  state: SpringState,
  target: number,
  dtSeconds: number,
  frequency = 6,
  damping = 1,
): void {
  const omega = 2 * Math.PI * frequency;
  let remaining = Math.min(Math.max(dtSeconds, 0), MAX_FRAME_S);
  while (remaining > 0) {
    const dt = Math.min(remaining, MAX_SUBSTEP_S);
    const acceleration =
      omega * omega * (target - state.value) - 2 * damping * omega * state.velocity;
    state.velocity += acceleration * dt;
    state.value += state.velocity * dt;
    remaining -= dt;
  }
}
