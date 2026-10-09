import { describe, expect, it } from 'bun:test';
import {
  createGameState,
  ENDLESS,
  ENDLESS_LEVEL_ID,
  levelOutcome,
  parseLayout,
  type SimLevel,
} from '@redakcja/shared';
import {
  ENDLESS_STATIONS,
  endlessDeadlineS,
  endlessIntervalS,
  endlessStoryPool,
  generateEndlessLevel,
  storiesForEndless,
} from './endless.ts';
import { getLevel, LEVELS, STORIES } from './index.ts';
import type { Story } from './schema.ts';

const generate = (seed: number) => generateEndlessLevel(seed, LEVELS, STORIES);

describe('generateEndlessLevel', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(generate(7)).toEqual(generate(7));
    expect(generate(7).schedule).not.toEqual(generate(8).schedule);
  });

  it('returns an endless level with a huge duration and a layout holding all six stations', () => {
    const level = generate(1);
    expect(level.id).toBe(ENDLESS_LEVEL_ID);
    expect(level.endless).toBe(true);
    expect(level.durationS).toBe(ENDLESS.durationS);
    const map = parseLayout(level.layout);
    const placed = map.fixtures.flatMap((f) => (f.station ? [f.station] : []));
    expect([...placed].sort()).toEqual([...ENDLESS_STATIONS].sort());
    expect(level.stations).toEqual([...ENDLESS_STATIONS]);
    expect(map.fixtures.some((f) => f.kind === 'desk')).toBe(true);
    expect(map.fixtures.filter((f) => f.kind === 'table').length).toBeGreaterThanOrEqual(2);
    expect(map.fixtures.some((f) => f.kind === 'conveyor')).toBe(true);
    expect(map.spawns).toHaveLength(4);
  });

  it('schedules about an hour, sorted, with accelerating spawns and shrinking deadlines', () => {
    const { schedule } = generate(3);
    for (let i = 1; i < schedule.length; i++) {
      expect((schedule[i]?.atS ?? 0) >= (schedule[i - 1]?.atS ?? 0)).toBe(true);
    }
    const last = schedule.at(-1);
    expect(last?.atS).toBeGreaterThan(ENDLESS.scheduleLengthS - 30);
    expect(last?.atS).toBeLessThan(ENDLESS.scheduleLengthS);
    const inMinute = (m: number) => schedule.filter((s) => s.atS >= m * 60 && s.atS < (m + 1) * 60);
    expect(inMinute(0).length).toBeLessThan(inMinute(5).length);
    expect(inMinute(5).length).toBeLessThan(inMinute(15).length);
    const minute = (m: number) => inMinute(m)[0]?.deadlineS ?? 0;
    expect(minute(0)).toBeGreaterThan(minute(5));
    expect(minute(5)).toBeGreaterThan(minute(20));
    expect(Math.min(...schedule.map((s) => s.deadlineS))).toBe(ENDLESS.minDeadlineS);
    expect(Math.min(...schedule.map((s) => s.deadlineS))).toBeGreaterThan(0);
  });

  it('interval and deadline curves respect their limits', () => {
    expect(endlessIntervalS(0)).toBe(ENDLESS.startIntervalS);
    expect(endlessIntervalS(3000)).toBe(ENDLESS.minIntervalS);
    expect(endlessDeadlineS(0)).toBe(ENDLESS.startDeadlineS);
    expect(endlessDeadlineS(3000)).toBe(ENDLESS.minDeadlineS);
  });

  it('only schedules known stories that the six stations can solve', () => {
    const level = generate(5);
    const byId = new Map(STORIES.map((s) => [s.id, s]));
    const ids = [
      ...level.schedule.map((s) => s.storyId),
      ...level.events.flatMap((e) => (e.kind === 'outage' ? [] : [e.storyId])),
    ];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const story = byId.get(id);
      expect(story).toBeDefined();
      const decisive = story?.justifyingStamps.some(
        (stampId) =>
          story.stamps.find((s) => s.id === stampId)?.station !== 'aiScanner' &&
          level.stations.includes(story.stamps.find((s) => s.id === stampId)?.station ?? 'archive'),
      );
      expect(decisive).toBe(true);
    }
    const book = storiesForEndless(level, STORIES);
    expect(Object.keys(book).length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(book[id]).toBeDefined();
    }
  });

  it('never repeats a story back to back and uses the whole pool', () => {
    const { schedule } = generate(11);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]?.storyId).not.toBe(schedule[i - 1]?.storyId);
    }
    const pool = endlessStoryPool(LEVELS, STORIES);
    expect(new Set(schedule.map((s) => s.storyId)).size).toBe(pool.length);
  });

  it('sprinkles sorted events of several kinds from the start delay on', () => {
    const { events } = generate(2);
    expect(events.length).toBeGreaterThan(10);
    expect(events[0]?.atS).toBeGreaterThanOrEqual(ENDLESS.eventsStartS);
    for (let i = 1; i < events.length; i++) {
      expect((events[i]?.atS ?? 0) >= (events[i - 1]?.atS ?? 0)).toBe(true);
    }
    expect(new Set(events.map((e) => e.kind)).size).toBeGreaterThanOrEqual(4);
  });

  it('picks up stories of levels added later and keeps the greybox out', () => {
    const extra: Story[] = STORIES.filter((s) => s.id.startsWith('l1-')).map((s) => ({
      ...s,
      id: s.id.replace('l1-', 'l3-'),
    }));
    const l3 = {
      ...LEVELS.find((l) => l.id === 'l1-burza'),
      id: 'l3-test',
      schedule: extra.map((s, i) => ({ atS: i, storyId: s.id, deadlineS: 30 })),
    } as (typeof LEVELS)[number];
    const pool = endlessStoryPool([...LEVELS, l3], [...STORIES, ...extra]);
    expect(pool.some((s) => s.id.startsWith('l3-'))).toBe(true);
    expect(pool.some((s) => s.id.startsWith('l0-'))).toBe(false);
    const numbers = pool.map((s) => Number(/^l(\d+)-/.exec(s.id)?.[1]));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it('getLevel serves a preview of the endless level', () => {
    expect(getLevel(ENDLESS_LEVEL_ID)?.title).toBe(generate(0).title);
  });
});

describe('endless outcome', () => {
  it('is a SimLevel and ends only at 0 credibility', () => {
    const level: SimLevel = generate(1);
    const state = createGameState({ map: parseLayout(level.layout) });
    expect(
      levelOutcome({ ...state, elapsedMs: level.durationS * 1000 * 2, score: 999 }, level),
    ).toBeNull();
    expect(levelOutcome({ ...state, elapsedMs: 5_000_000, credibility: 1 }, level)).toBeNull();
    expect(levelOutcome({ ...state, credibility: 0, score: 250 }, level)).toEqual({
      won: false,
      stars: 0,
    });
  });
});
