import { describe, expect, test } from 'bun:test';
import { cues } from '../cues.ts';
import { AMBIENCE_LAYERS, AMBIENCE_TUNING, type AmbienceCue, createAmbience } from './ambience.ts';
import sprite from './sfx-sprite.json';

/** Deterministic pseudo-random sequence (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(ducked: (ms: number) => boolean, seconds: number) {
  const plays: { cue: AmbienceCue; ms: number; gain: number; pan: number }[] = [];
  const bed: number[] = [];
  let now = 0;
  const ambience = createAmbience(
    {
      play: (cue, gain, pan) => plays.push({ cue, ms: now, gain, pan }),
      setBedGain: (gain) => bed.push(gain),
    },
    seeded(7),
  );
  ambience.reset(0);
  for (now = 0; now <= seconds * 1000; now += 250) {
    ambience.tick(now, ducked(now));
  }
  return { plays, bed, ambience };
}

describe('newsroom ambience', () => {
  test('every layer is a catalogued cue on the sfx bus with a sound in the sprite', () => {
    const ids = new Set(Object.keys(sprite));
    for (const layer of AMBIENCE_LAYERS) {
      const sound = cues[layer.cue].sound;
      expect(sound.bus).toBe('sfx');
      for (const id of sound.ids) {
        expect(ids.has(id)).toBe(true);
      }
      expect(layer.minGapS).toBeLessThan(layer.maxGapS);
    }
  });

  test('plays every layer now and then, quietly spaced, never in the first seconds', () => {
    const { plays } = run(() => false, 8 * 60);
    const kinds = new Set(plays.map((p) => p.cue));
    expect(kinds.size).toBe(AMBIENCE_LAYERS.length);
    // Occasional: a handful per minute at most.
    expect(plays.length).toBeLessThan(8 * 12);
    expect(plays[0]?.ms ?? 0).toBeGreaterThanOrEqual(AMBIENCE_TUNING.startDelayS * 1000);
    for (let i = 1; i < plays.length; i++) {
      const gap = (plays[i]?.ms ?? 0) - (plays[i - 1]?.ms ?? 0);
      expect(gap).toBeGreaterThanOrEqual(AMBIENCE_TUNING.minSpacingS * 1000);
    }
    for (const play of plays) {
      expect(play.gain).toBeLessThanOrEqual(1);
      expect(play.gain).toBeGreaterThan(0);
      expect(Math.abs(play.pan)).toBeLessThanOrEqual(AMBIENCE_TUNING.maxPan);
    }
  });

  test('ducks the bed and skips one-shots while ducked, then recovers', () => {
    const { plays, ambience } = run((ms) => ms >= 60_000 && ms < 180_000, 200);
    const during = plays.filter((p) => p.ms >= 61_000 && p.ms < 180_000);
    expect(during).toHaveLength(0);
    expect(plays.some((p) => p.ms < 60_000)).toBe(true);
    expect(ambience.gain()).toBe(1);
    const ducked = run(() => true, 5).ambience;
    expect(ducked.gain()).toBe(AMBIENCE_TUNING.duckedGain);
  });
});
