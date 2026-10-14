// Mutable perf counters written by the scene each frame and read by the overlay twice a second.

/** One canvas's renderer counters (each GameView canvas has its own renderer, S7-85). */
export type ViewCounters = { drawCalls: number; triangles: number };

export const perfStats = {
  fps: 0,
  frameMs: 0,
  /** Sums over every mounted canvas (`views`). */
  drawCalls: 0,
  triangles: 0,
  gpu: '',
  /** Counters per canvas, by its view key. */
  views: {} as Record<string, ViewCounters>,
};

/** Writes one canvas's counters (no allocation per frame) and refreshes the sums. */
export function recordViewCounters(viewKey: string, drawCalls: number, triangles: number): void {
  let entry = perfStats.views[viewKey];
  if (!entry) {
    entry = { drawCalls: 0, triangles: 0 };
    perfStats.views[viewKey] = entry;
  }
  entry.drawCalls = drawCalls;
  entry.triangles = triangles;
  let totalCalls = 0;
  let totalTriangles = 0;
  for (const key in perfStats.views) {
    totalCalls += perfStats.views[key]?.drawCalls ?? 0;
    totalTriangles += perfStats.views[key]?.triangles ?? 0;
  }
  perfStats.drawCalls = totalCalls;
  perfStats.triangles = totalTriangles;
}

/** An unmounted canvas stops counting (the sums follow on the next recorded frame). */
export function forgetViewCounters(viewKey: string): void {
  delete perfStats.views[viewKey];
}

/** Live particle count, written by the particle renderer. */
export const particleStats = { alive: 0 };

/** Exponential moving average of frame time, seeded on first sample. */
export function smoothFrameTime(previous: number, sampleMs: number, weight = 0.05): number {
  return previous === 0 ? sampleMs : previous + (sampleMs - previous) * weight;
}
