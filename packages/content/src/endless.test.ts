import { describe, expect, it } from 'bun:test';
import {
  createGameState,
  DIFFICULTIES,
  type Difficulty,
  ENDLESS,
  ENDLESS_LEVEL_ID,
  levelOutcome,
  NORMAL_TUNING,
  parseLayout,
  type SimLevel,
  scaledDeadlineS,
  step,
  TICK_MS,
} from '@redakcja/shared';
import { bagStations, decidingStations } from './bag.ts';
import {
  ENDLESS_STATIONS,
  endlessDeadlineS,
  endlessDecks,
  endlessIntervalS,
  endlessStoryPool,
  generateEndlessLevel,
  storiesForEndless,
} from './endless.ts';
import { getLevel, LEVELS, STORIES } from './index.ts';
import type { Story } from './schema.ts';

const generate = (seed: number, difficulty?: Difficulty) =>
  generateEndlessLevel(seed, LEVELS, STORIES, difficulty);

describe('generateEndlessLevel', () => {
  it('is deterministic per seed and difficulty and differs between seeds', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(generate(7, difficulty)).toEqual(generate(7, difficulty));
    }
    expect(generate(7)).toEqual(generate(7, 'normal'));
    expect(generate(7).schedule).not.toEqual(generate(8).schedule);
    expect(generate(7, 'easy').schedule).not.toEqual(generate(7, 'expert').schedule);
  });

  it('scales the first deadline by the difficulty: 104 / 80 / 68 / 60', () => {
    const first = (difficulty: Difficulty) => generate(4, difficulty).schedule[0]?.deadlineS;
    expect(first('easy')).toBe(104);
    expect(first('normal')).toBe(80);
    expect(first('hard')).toBe(68);
    expect(first('expert')).toBe(60);
  });

  it('packs more folders into the hour on a harder difficulty', () => {
    const length = (difficulty: Difficulty) => generate(4, difficulty).schedule.length;
    expect(length('easy')).toBeLessThan(length('normal'));
    expect(length('normal')).toBeLessThan(length('hard'));
    expect(length('hard')).toBeLessThan(length('expert'));
    for (const difficulty of DIFFICULTIES) {
      const { schedule } = generate(4, difficulty);
      expect(schedule[0]?.atS).toBe(ENDLESS.firstSpawnS);
      expect(schedule.at(-1)?.atS ?? Number.POSITIVE_INFINITY).toBeLessThan(
        ENDLESS.scheduleLengthS,
      );
      for (const spawn of schedule) {
        expect(spawn.deadlineS).toBe(scaledDeadlineS(endlessDeadlineS(spawn.atS), difficulty));
      }
    }
  });

  it('deals the same stations and stories on every difficulty; only timing changes', () => {
    const dealt = (difficulty: Difficulty) =>
      generate(9, difficulty).schedule.map((spawn) => `${spawn.station}:${spawn.storyId}`);
    const easy = dealt('easy');
    expect(easy.length).toBeGreaterThan(100);
    for (const difficulty of DIFFICULTIES) {
      expect(dealt(difficulty).slice(0, easy.length)).toEqual(easy);
    }
  });

  it('deals whole shuffled rounds over the stations that decide a pool story', () => {
    const pool = endlessStoryPool(LEVELS, STORIES);
    const stations = bagStations(pool, ENDLESS_STATIONS);
    expect(stations).toEqual(['imageSearch', 'archive', 'sourceRegistry', 'phone', 'dataLibrary']);
    const { schedule } = generate(6);
    const byId = new Map(pool.map((story) => [story.id, story]));
    for (const spawn of schedule) {
      const story = byId.get(spawn.storyId);
      if (!story || !spawn.station) {
        throw new Error(`entry ${spawn.storyId} has no pool story or station`);
      }
      expect(decidingStations(story, ENDLESS_STATIONS)).toContain(spawn.station);
    }
    for (let round = 0; round + stations.length <= schedule.length; round += stations.length) {
      const dealt = schedule.slice(round, round + stations.length).map((spawn) => spawn.station);
      expect([...dealt].sort()).toEqual([...stations].sort());
    }
  });

  it('scales event deadlines on their own stream, keeping event times and kinds', () => {
    const normal = generate(2).events;
    for (const difficulty of DIFFICULTIES) {
      const events = generate(2, difficulty).events;
      expect(events.map((e) => `${e.kind}@${e.atS}`)).toEqual(
        normal.map((e) => `${e.kind}@${e.atS}`),
      );
      for (const event of events) {
        if (event.kind !== 'outage') {
          expect(event.deadlineS).toBe(scaledDeadlineS(endlessDeadlineS(event.atS), difficulty));
        }
      }
    }
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

  it('never repeats a story back to back on any difficulty', () => {
    for (const seed of [1, 11, 42]) {
      for (const difficulty of DIFFICULTIES) {
        const { schedule } = generate(seed, difficulty);
        for (let i = 1; i < schedule.length; i++) {
          expect(schedule[i]?.storyId).not.toBe(schedule[i - 1]?.storyId);
        }
      }
    }
  });

  it('puts every pool story into some station deck, and deals from every deck', () => {
    const pool = endlessStoryPool(LEVELS, STORIES);
    const decks = endlessDecks(pool);
    const inDecks = new Set([...decks.values()].flat().map((story) => story.id));
    expect([...inDecks].sort()).toEqual(pool.map((story) => story.id).sort());
    expect(new Set(generate(11).schedule.map((spawn) => spawn.station))).toEqual(
      new Set(decks.keys()),
    );
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
      // Level 1 deals from a bag; the test level schedules its stories instead.
      bag: undefined,
    } as (typeof LEVELS)[number];
    const pool = endlessStoryPool([...LEVELS, l3], [...STORIES, ...extra]);
    expect(pool.map((s) => s.id)).toEqual(expect.arrayContaining(extra.map((s) => s.id)));
    expect(pool.some((s) => s.id.startsWith('l0-'))).toBe(false);
    const numbers = pool.map((s) => Number(/^l(\d+)-/.exec(s.id)?.[1]));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it('draws a multi-stamp story only when the six stations give all its proofs', () => {
    const original = STORIES.find((s) => s.id.startsWith('l1-') && s.justifyingStamps.length === 1);
    if (!original) {
      throw new Error('level 1 needs a story with one justifying stamp');
    }
    const poolWith = (variant: Story) =>
      endlessStoryPool(
        LEVELS,
        STORIES.map((s) => (s.id === original.id ? variant : s)),
      ).map((s) => s.id);
    expect(poolWith(original)).toContain(original.id);
    // Two proofs required, one available: never drawn.
    expect(poolWith({ ...original, requiredStamps: 2 })).not.toContain(original.id);
    const proven: Story = {
      ...original,
      stamps: original.stamps.map((stamp) => ({ ...stamp, relevance: 'decisive' as const })),
      justifyingStamps: original.stamps.map((stamp) => stamp.id),
      requiredStamps: 2,
    };
    expect(poolWith(proven)).toContain(original.id);
  });

  it('builds a deck per deciding station; a flex story sits in each of its decks', () => {
    const [one, two, three] = STORIES.filter((story) => story.id.startsWith('l1-'));
    if (!one || !two || !three) {
      throw new Error('level 1 needs three stories');
    }
    const only = (story: Story, station: Story['stamps'][number]['station']): Story => ({
      ...story,
      stamps: [{ id: `${story.id}-x`, station, text: 'x', relevance: 'decisive' }],
      justifyingStamps: [`${story.id}-x`],
      requiredStamps: 1,
    });
    const flex: Story = {
      ...three,
      stamps: [
        { id: 'f-phone', station: 'phone', text: 'x', relevance: 'decisive' },
        { id: 'f-ai', station: 'aiScanner', text: 'x', relevance: 'decisive' },
        { id: 'f-archive', station: 'archive', text: 'x', relevance: 'decisive' },
      ],
      justifyingStamps: ['f-phone', 'f-ai', 'f-archive'],
      requiredStamps: 1,
    };
    const decks = endlessDecks([only(one, 'phone'), only(two, 'dataLibrary'), flex]);
    expect([...decks].map(([station, deck]) => [station, deck.map((s) => s.id)])).toEqual([
      ['archive', [three.id]],
      ['phone', [one.id, three.id]],
      ['dataLibrary', [two.id]],
    ]);
  });

  it('redraws from the deck on a repeat, and lets the next station take a one-story deck slot', () => {
    const [one, two] = STORIES.filter((story) => story.id.startsWith('l1-'));
    if (!one || !two) {
      throw new Error('level 1 needs two stories');
    }
    const at = (story: Story, stations: Story['stamps'][number]['station'][]): Story => ({
      ...story,
      stamps: stations.map((station) => ({
        id: `${story.id}-${station}`,
        station,
        text: 'x',
        relevance: 'decisive' as const,
      })),
      justifyingStamps: stations.map((station) => `${story.id}-${station}`),
      requiredStamps: 1,
    });
    // Archive's deck holds only the flex story, so the phone deck must redraw after it.
    const tiny = [at(one, ['phone']), at(two, ['phone', 'archive'])];
    for (const seed of [1, 2, 3]) {
      const { schedule } = generateEndlessLevel(seed, [], tiny, 'expert');
      expect(schedule.length).toBeGreaterThan(100);
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i]?.storyId).not.toBe(schedule[i - 1]?.storyId);
      }
    }
    // A single story cannot avoid repeating; the generator still finishes the schedule.
    const single = generateEndlessLevel(1, [], [at(one, ['phone'])]);
    expect(single.schedule.length).toBeGreaterThan(100);
    expect(new Set(single.schedule.map((spawn) => `${spawn.station}:${spawn.storyId}`))).toEqual(
      new Set([`phone:${one.id}`]),
    );
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
      lossReason: 'credibility',
    });
  });
});

describe('endless spawn keys', () => {
  it('names schedule folders s<index> and event folders e<eventIndex>.<waveIndex>', () => {
    const level = generate(1);
    const map = parseLayout(level.layout);
    const ctx = {
      dtMs: TICK_MS,
      map,
      level,
      stories: storiesForEndless(level, STORIES),
      tuning: NORMAL_TUNING,
    };
    let state = createGameState({ map, seed: 1 });
    const seen = new Map<string, string>();
    while (state.elapsedMs < 400_000) {
      state = step(state, {}, [], ctx).state;
      for (const folder of Object.values(state.folders)) {
        seen.set(folder.spawnKey, folder.storyId);
      }
      // A team that clears the belt at once, so every spawn and event arrives on time.
      state = { ...state, folders: {} };
    }
    const scheduled = [...seen].filter(([key]) => key.startsWith('s'));
    const fromEvents = [...seen].filter(([key]) => key.startsWith('e'));
    expect(scheduled.length).toBeGreaterThan(10);
    expect(fromEvents.length).toBeGreaterThan(0);
    for (const [key, storyId] of scheduled) {
      expect(level.schedule[Number(key.slice(1))]?.storyId).toBe(storyId);
    }
    for (const [key, storyId] of fromEvents) {
      const [eventIndex, waveIndex] = key.slice(1).split('.').map(Number);
      const event = level.events[eventIndex ?? -1];
      expect(event && event.kind !== 'outage' ? event.storyId : null).toBe(storyId);
      expect(waveIndex).toBeLessThan(event?.kind === 'botRaid' ? event.count : 1);
    }
  });
});
