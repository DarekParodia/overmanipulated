// Newsroom ambience (S3-07): over the room-tone loop, quiet distant one-shots — a phone ringing,
// a printer, a fax, someone typing — at random, never two at once. The whole bed ducks while the
// local player works in a station or desk overlay (and on the results screen), so the minigame
// sounds stay clear. Pure scheduler over a small backend so it can be tested without Howler;
// audio-manager.ts wires it to the sfx sprite (master/sfx volume and mute apply there).
import type { CueId } from '../cues.ts';

export type AmbienceCue = Extract<CueId, `ambience.${string}`>;

export type AmbienceBackend = {
  /** Plays one ambience cue's sound at `gain` (0..1, on top of the cue volume) and `pan`. */
  play(cue: AmbienceCue, gain: number, pan: number): void;
  /** Sets the room-tone loop's gain (0..1, on top of its base level). */
  setBedGain(gain: number): void;
};

/** Each layer waits a random gap in [min, max] seconds between plays. */
export const AMBIENCE_LAYERS: readonly { cue: AmbienceCue; minGapS: number; maxGapS: number }[] = [
  { cue: 'ambience.phone', minGapS: 24, maxGapS: 55 },
  { cue: 'ambience.printer', minGapS: 18, maxGapS: 40 },
  { cue: 'ambience.fax', minGapS: 40, maxGapS: 80 },
  { cue: 'ambience.typing', minGapS: 9, maxGapS: 22 },
];

export const AMBIENCE_TUNING = {
  /** Gain of the whole bed while ducked. */
  duckedGain: 0.3,
  /** One-shots are skipped (and rescheduled) while the bed is below this gain. */
  quietBelow: 0.6,
  /** Ducking speed, gain per second, down and up. */
  duckPerS: 3,
  unduckPerS: 0.8,
  /** No two one-shots closer than this. */
  minSpacingS: 4,
  /** Nothing in the first seconds of a level (the start bell and music take the stage). */
  startDelayS: 6,
  /** Random gain spread per one-shot, e.g. 0.3 → 0.7–1.0. */
  gainSpread: 0.3,
  /** Distant sounds come from the sides: |pan| up to this. */
  maxPan: 0.6,
} as const;

/** Longest step the ducking slew takes (a stalled tab must not jump). */
const MAX_DT_S = 0.25;

export type Ambience = {
  /** Advances time: ducks or recovers the bed and plays one-shots that are due. */
  tick(nowMs: number, ducked: boolean): void;
  /** Starts a fresh schedule at `nowMs` (a new level). */
  reset(nowMs: number): void;
  /** Current bed gain (for tests and the debug overlay). */
  gain(): number;
};

export function createAmbience(
  backend: AmbienceBackend,
  random: () => number = Math.random,
): Ambience {
  const due = new Map<AmbienceCue, number>();
  let gain = 1;
  let lastMs = 0;
  let lastPlayMs = Number.NEGATIVE_INFINITY;

  const gap = (layer: (typeof AMBIENCE_LAYERS)[number]) =>
    (layer.minGapS + random() * (layer.maxGapS - layer.minGapS)) * 1000;

  function reset(nowMs: number): void {
    lastMs = nowMs;
    lastPlayMs = Number.NEGATIVE_INFINITY;
    for (const layer of AMBIENCE_LAYERS) {
      due.set(layer.cue, nowMs + AMBIENCE_TUNING.startDelayS * 1000 + gap(layer) * random());
    }
  }

  return {
    reset,
    gain: () => gain,
    tick(nowMs, ducked) {
      const dt = Math.min(MAX_DT_S, Math.max(0, (nowMs - lastMs) / 1000));
      lastMs = nowMs;
      const target = ducked ? AMBIENCE_TUNING.duckedGain : 1;
      const rate = target < gain ? AMBIENCE_TUNING.duckPerS : AMBIENCE_TUNING.unduckPerS;
      gain =
        target < gain ? Math.max(target, gain - rate * dt) : Math.min(target, gain + rate * dt);
      backend.setBedGain(gain);

      for (const layer of AMBIENCE_LAYERS) {
        const at = due.get(layer.cue);
        if (at === undefined || nowMs < at) {
          continue;
        }
        if (gain < AMBIENCE_TUNING.quietBelow) {
          // Ducked: skip this one and try again after a short while.
          due.set(layer.cue, nowMs + gap(layer) / 3);
          continue;
        }
        if (nowMs - lastPlayMs < AMBIENCE_TUNING.minSpacingS * 1000) {
          due.set(layer.cue, lastPlayMs + AMBIENCE_TUNING.minSpacingS * 1000 + random() * 2000);
          continue;
        }
        const spread = AMBIENCE_TUNING.gainSpread;
        const pan = (random() * 2 - 1) * AMBIENCE_TUNING.maxPan;
        backend.play(layer.cue, gain * (1 - spread + random() * spread), pan);
        lastPlayMs = nowMs;
        due.set(layer.cue, nowMs + gap(layer));
      }
    },
  };
}
