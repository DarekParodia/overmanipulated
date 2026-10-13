// What the briefing tells about the dealt run (S7-25): how many folders it holds, the points two
// and three stars take, and the share rule behind them, as whole percent of the run's best
// possible score (the same rounding the results' „Skąd te progi?” uses).
import type { RunSummary } from '@redakcja/shared';

export type BriefingRun = {
  folders: number;
  maxScore: number;
  two: number;
  three: number;
  /** Thresholds as whole percent of `maxScore`; null when the run has no score to share. */
  shares: { two: number; three: number } | null;
};

/** The briefing's run line; null before the run is dealt and in endless (no stars). */
export function briefingRun(run: RunSummary | null): BriefingRun | null {
  if (!run?.stars) {
    return null;
  }
  const { two, three } = run.stars;
  const shares =
    run.maxScore > 0
      ? {
          two: Math.round((two / run.maxScore) * 100),
          three: Math.round((three / run.maxScore) * 100),
        }
      : null;
  return { folders: run.folders, maxScore: run.maxScore, two, three, shares };
}
