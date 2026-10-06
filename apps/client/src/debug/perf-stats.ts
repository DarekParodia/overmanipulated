// Mutable perf counters written by the scene each frame and read by the overlay twice a second.
export const perfStats = {
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  gpu: '',
};

/** Live particle count, written by the particle renderer. */
export const particleStats = { alive: 0 };

/** Exponential moving average of frame time, seeded on first sample. */
export function smoothFrameTime(previous: number, sampleMs: number, weight = 0.05): number {
  return previous === 0 ? sampleMs : previous + (sampleMs - previous) * weight;
}
