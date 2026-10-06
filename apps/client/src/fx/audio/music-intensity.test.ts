import { describe, expect, it } from 'bun:test';
import { DEADLINE_WARNING_MS } from '@redakcja/shared';
import {
  MUSIC_TUNING,
  type MusicGameState,
  slew,
  targetIntensity,
  targetRate,
  urgentFolderCount,
} from './music-intensity.ts';

function game(overrides: Partial<MusicGameState> = {}): MusicGameState {
  return {
    tick: 10,
    elapsedMs: 100_000,
    timeLeftMs: 300_000,
    folders: [],
    levelEnd: null,
    ...overrides,
  };
}

describe('music intensity', () => {
  it('is calm with plenty of time and no urgent folders', () => {
    expect(targetIntensity(game({ folders: [{ deadlineMs: 200_000 }] }))).toBe(0);
  });

  it('is zero before the first snapshot and after the level ends', () => {
    expect(targetIntensity(game({ tick: 0, timeLeftMs: 0 }))).toBe(0);
    expect(targetIntensity(game({ timeLeftMs: 0, levelEnd: { score: 1 } }))).toBe(0);
  });

  it('rises linearly over the last minute', () => {
    expect(targetIntensity(game({ timeLeftMs: 60_000 }))).toBe(0);
    expect(targetIntensity(game({ timeLeftMs: 30_000 }))).toBeCloseTo(0.5);
    expect(targetIntensity(game({ timeLeftMs: 0 }))).toBe(1);
  });

  it('counts folders closer to their deadline than the warning threshold', () => {
    const elapsedMs = 50_000;
    const folders = [
      { deadlineMs: elapsedMs + DEADLINE_WARNING_MS - 1 },
      { deadlineMs: elapsedMs + DEADLINE_WARNING_MS },
      { deadlineMs: elapsedMs + 1_000 },
    ];
    expect(urgentFolderCount(folders, elapsedMs)).toBe(2);
    const one = targetIntensity(game({ elapsedMs, folders: folders.slice(0, 1) }));
    const two = targetIntensity(game({ elapsedMs, folders }));
    expect(one).toBeCloseTo(MUSIC_TUNING.perUrgentFolder);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThanOrEqual(1);
  });

  it('combines time and urgency without exceeding 1', () => {
    const elapsedMs = 0;
    const folders = Array.from({ length: 5 }, () => ({ deadlineMs: 1_000 }));
    const both = targetIntensity(game({ elapsedMs, folders, timeLeftMs: 30_000 }));
    expect(both).toBe(1);
    const mixed = targetIntensity(
      game({ elapsedMs, folders: folders.slice(0, 1), timeLeftMs: 30_000 }),
    );
    expect(mixed).toBeGreaterThan(0.5);
    expect(mixed).toBeLessThan(1);
  });

  it('speeds the tempo up only in the last 30 s of a running level', () => {
    expect(targetRate(game({ timeLeftMs: 31_000 }))).toBe(1);
    expect(targetRate(game({ timeLeftMs: 29_000 }))).toBe(MUSIC_TUNING.tempoUpRate);
    expect(targetRate(game({ tick: 0, timeLeftMs: 0 }))).toBe(1);
  });
});

describe('slew', () => {
  it('limits the change per step in both directions', () => {
    expect(slew(0, 1, 0.4, 0.15, 0.5)).toBeCloseTo(0.2);
    expect(slew(1, 0, 0.4, 0.15, 1)).toBeCloseTo(0.85);
    expect(slew(0.5, 0.55, 0.4, 0.15, 1)).toBe(0.55);
    expect(slew(0.5, 0.45, 0.4, 0.15, 1)).toBe(0.45);
  });

  it('never jumps: a sudden target change takes several seconds to follow', () => {
    let value = 0;
    let steps = 0;
    while (value < 1) {
      value = slew(value, 1, MUSIC_TUNING.intensityUpPerS, MUSIC_TUNING.intensityDownPerS, 0.05);
      steps++;
    }
    expect(steps * 0.05).toBeGreaterThanOrEqual(2);
  });
});
