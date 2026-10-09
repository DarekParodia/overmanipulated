// Adaptive quality controller (S5-07): a pure state machine that watches frame times and says
// whether to cut one more thing (+1), win one back (-1) or stay (0). It never touches React or
// three.js, so the timing rules are unit-tested. The ladder it walks is `degradeLadder`.
//
// Rules, in order of importance:
// - Dropping is quick (a few slow seconds), recovering is slow and careful.
// - After any change the next `SETTLE_S` seconds are ignored (shader recompiles, resizes).
// - A recovery that makes the game slow again within `RELAPSE_S` is undone, the step is never
//   tried again, and the next attempt waits twice as long. After `MAX_RELAPSES` the controller
//   stops trying to recover at all. This is what keeps it from flapping.
// - Stalls (hidden tab, debugger, GC hitch above `MAX_FRAME_S`) are not samples.

export const ADAPTIVE = {
  /** Frame times are averaged over windows of this length. */
  WINDOW_S: 1,
  /** A window averaging above this counts as slow (under ~45 FPS). */
  SLOW_MS: 22,
  /** A window averaging below this counts as comfortable (holding ~57+ FPS). */
  FAST_MS: 17.5,
  /** Consecutive slow windows before a step down. */
  SLOW_WINDOWS: 3,
  /** Consecutive comfortable windows before a first recovery attempt. */
  FAST_WINDOWS: 20,
  /** Upper bound of the recovery wait after repeated relapses. */
  MAX_FAST_WINDOWS: 160,
  /** Ignore frames for this long after a change. */
  SETTLE_S: 2,
  /** A step up that turns slow within this long counts as a relapse. */
  RELAPSE_S: 25,
  /** After this many relapses recovery is switched off for the session. */
  MAX_RELAPSES: 2,
  /** Longer frames are stalls, not performance samples. */
  MAX_FRAME_S: 0.25,
} as const;

export type AdaptiveDecision = -1 | 0 | 1;

export type AdaptiveController = {
  /**
   * Feeds one frame. `stage` is the current degrade stage and `maxStage` the last step of the
   * ladder. Returns +1 to degrade one more step, -1 to restore one, 0 to stay.
   */
  update(deltaS: number, stage: number, maxStage: number): AdaptiveDecision;
  /** Forgets all history, e.g. after the player picked another preset. */
  reset(): void;
  /** Diagnostics for tests and the debug overlay. */
  readonly state: Readonly<{
    relapses: number;
    minStage: number;
    fastNeeded: number;
    recoveryOff: boolean;
  }>;
};

export function createAdaptiveController(): AdaptiveController {
  let windowTime = 0;
  let windowFrames = 0;
  let slowStreak = 0;
  let fastStreak = 0;
  let settle: number = ADAPTIVE.SETTLE_S;
  let sinceRaise = Number.POSITIVE_INFINITY;
  let relapses = 0;
  let minStage = 0;
  let fastNeeded: number = ADAPTIVE.FAST_WINDOWS;

  const clearWindow = () => {
    windowTime = 0;
    windowFrames = 0;
    slowStreak = 0;
    fastStreak = 0;
  };

  const state = {
    get relapses() {
      return relapses;
    },
    get minStage() {
      return minStage;
    },
    get fastNeeded() {
      return fastNeeded;
    },
    get recoveryOff() {
      return relapses >= ADAPTIVE.MAX_RELAPSES;
    },
  };

  return {
    state,
    reset() {
      clearWindow();
      settle = ADAPTIVE.SETTLE_S;
      sinceRaise = Number.POSITIVE_INFINITY;
      relapses = 0;
      minStage = 0;
      fastNeeded = ADAPTIVE.FAST_WINDOWS;
    },
    update(deltaS, stage, maxStage) {
      sinceRaise += deltaS;
      if (deltaS <= 0 || deltaS > ADAPTIVE.MAX_FRAME_S) {
        clearWindow();
        return 0;
      }
      if (settle > 0) {
        settle -= deltaS;
        return 0;
      }
      windowTime += deltaS;
      windowFrames++;
      if (windowTime < ADAPTIVE.WINDOW_S) {
        return 0;
      }
      const averageMs = (windowTime / windowFrames) * 1000;
      windowTime = 0;
      windowFrames = 0;

      if (averageMs > ADAPTIVE.SLOW_MS) {
        fastStreak = 0;
        slowStreak++;
        if (slowStreak < ADAPTIVE.SLOW_WINDOWS || stage >= maxStage) {
          return 0;
        }
        clearWindow();
        settle = ADAPTIVE.SETTLE_S;
        if (sinceRaise < ADAPTIVE.RELAPSE_S) {
          // The step we just won back did not hold: put it back for good.
          relapses++;
          minStage = stage + 1;
          fastNeeded = Math.min(ADAPTIVE.MAX_FAST_WINDOWS, fastNeeded * 2);
        }
        sinceRaise = Number.POSITIVE_INFINITY;
        return 1;
      }

      slowStreak = 0;
      if (averageMs < ADAPTIVE.FAST_MS && stage > minStage && relapses < ADAPTIVE.MAX_RELAPSES) {
        fastStreak++;
        if (fastStreak >= fastNeeded) {
          clearWindow();
          settle = ADAPTIVE.SETTLE_S;
          sinceRaise = 0;
          return -1;
        }
      } else {
        fastStreak = 0;
      }
      return 0;
    },
  };
}
