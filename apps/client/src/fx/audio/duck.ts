// Music ducking (S5-08): the music bus dips for a moment under big stingers (win, lose, alarms,
// level events) so they stay clear. Pure, with the clock passed in; music.ts applies the gain.
import { slew } from './music-intensity.ts';

export const DUCK_TUNING = {
  /** Music gain while a stinger rings (1 = no dip). */
  depth: 0.45,
  /** How fast the music dips and comes back, gain per second. */
  downPerS: 6,
  upPerS: 1.2,
  /** Sounds shorter than this do not duck at all. */
  minMs: 350,
} as const;

/** Sprite ids that duck the music, with how long (ms). Anything else never ducks. */
export const DUCKING_SOUNDS: Readonly<Record<string, number>> = {
  win: 1500,
  lose: 1500,
  fanfare: 1000,
  alarm: 900,
  lowsting: 700,
  lastsec: 750,
  evviral: 450,
  evboss: 850,
  evraid: 600,
  evoutage: 800,
  evcorrection: 900,
  evclear: 600,
  evback: 600,
};

export type Ducker = {
  /** Asks for a dip until `nowMs + durationMs` (keeps the later of two deadlines). */
  request(nowMs: number, durationMs: number): void;
  /** Advances the gain by `dtS` and returns it. */
  step(nowMs: number, dtS: number): number;
  gain(): number;
};

export function createDucker(): Ducker {
  let until = Number.NEGATIVE_INFINITY;
  let gain = 1;
  return {
    request(nowMs, durationMs) {
      if (durationMs >= DUCK_TUNING.minMs) {
        until = Math.max(until, nowMs + durationMs);
      }
    },
    step(nowMs, dtS) {
      const target = nowMs < until ? DUCK_TUNING.depth : 1;
      gain = slew(gain, target, DUCK_TUNING.upPerS, DUCK_TUNING.downPerS, dtS);
      return gain;
    },
    gain: () => gain,
  };
}

/** The shared instance used by the game. */
export const musicDucker = createDucker();
