// Music ducking (S5-08): the music bus dips for a moment under big stingers (win, lose, alarms,
// level events) so they stay clear, and deeper under intro voice lines (S7-98) so speech stays
// intelligible. Pure, with the clock passed in; music.ts applies the gain.
import { slew } from './music-intensity.ts';
import sprite from './sfx-sprite.json';

export const DUCK_TUNING = {
  /** Music gain while a stinger rings (1 = no dip). */
  depth: 0.45,
  /** Music gain under an intro voice line; deeper than a stinger, speech needs more room. */
  voiceDepth: 0.3,
  /** How fast the music dips and comes back, gain per second. */
  downPerS: 6,
  upPerS: 1.2,
  /** Sounds shorter than this do not duck at all. */
  minMs: 350,
} as const;

/** Sprite ids that duck the music, for as long as the sound lasts. Anything else never ducks. */
export const DUCKING_SOUNDS: ReadonlySet<string> = new Set([
  'win',
  'lose',
  'fanfare',
  'alarm',
  'lowsting',
  'lastsec',
  'evviral',
  'evboss',
  'evraid',
  'evoutage',
  'evcorrection',
  'evclear',
  'evback',
]);

/** How long a sound rings, from the sprite (ms); 0 for unknown ids. */
export function soundDurationMs(id: string): number {
  return (sprite as unknown as Record<string, [number, number, boolean]>)[id]?.[1] ?? 0;
}

export type Ducker = {
  /**
   * Asks for a dip to `depth` until `nowMs + durationMs` (keeps the later of two deadlines at the
   * same depth). While several dips are active the lowest depth wins.
   */
  request(nowMs: number, durationMs: number, depth?: number): void;
  /** Ends every dip at `depth` now (a voice line cut short); the gain then recovers as usual. */
  release(depth: number): void;
  /** Advances the gain by `dtS` and returns it. */
  step(nowMs: number, dtS: number): number;
  gain(): number;
};

export function createDucker(): Ducker {
  /** Deadline per depth; only a handful of depths exist, so this stays tiny. */
  const until = new Map<number, number>();
  let gain = 1;
  return {
    request(nowMs, durationMs, depth = DUCK_TUNING.depth) {
      if (durationMs >= DUCK_TUNING.minMs) {
        until.set(
          depth,
          Math.max(until.get(depth) ?? Number.NEGATIVE_INFINITY, nowMs + durationMs),
        );
      }
    },
    release(depth) {
      until.delete(depth);
    },
    step(nowMs, dtS) {
      let target = 1;
      for (const [depth, end] of until) {
        if (nowMs < end) {
          target = Math.min(target, depth);
        } else {
          until.delete(depth);
        }
      }
      gain = slew(gain, target, DUCK_TUNING.upPerS, DUCK_TUNING.downPerS, dtS);
      return gain;
    },
    gain: () => gain,
  };
}

/** The shared instance used by the game. */
export const musicDucker = createDucker();
