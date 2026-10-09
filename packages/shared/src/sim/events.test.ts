import { describe, expect, it } from 'bun:test';
import { CREDIBILITY_START, EVENTS, SCORE } from '../constants.ts';
import type { Folder } from '../entities.ts';
import { folderSchema, stationSchema } from '../entities.ts';
import type { GameEvent } from '../protocol.ts';
import {
  runStep,
  TEST_LEVEL,
  TEST_MAP,
  testCommand,
  testContext,
  testInput,
} from './__fixtures__/greybox.ts';
import type { SimLevel, SimLevelEvent } from './content.ts';
import { viralShares } from './events.ts';
import type { QueuedCommand, SimContext } from './frame.ts';
import { addPlayer, createGameState, type GameState } from './state.ts';

/** A level without a schedule so only the events under test spawn folders. */
function levelWith(events: SimLevelEvent[], extra: Partial<SimLevel> = {}): SimLevel {
  return { ...TEST_LEVEL, schedule: [], events, ...extra };
}

function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('missing test fixture value');
  }
  return value;
}

const AT_DESK = { x: 9.5, y: 6.5 };
const AT_IMAGE_SEARCH = { x: 8.5, y: 2.5 };

type Run = { state: GameState; events: GameEvent[]; ctx: SimContext; seq: number };

function newRun(level: SimLevel, players: Record<string, { x: number; y: number }> = {}): Run {
  let state = createGameState({ map: TEST_MAP, seed: 5 });
  for (const [id, at] of Object.entries(players)) {
    state = addPlayer(state, id, at);
  }
  return { state, events: [], ctx: testContext({ level }), seq: 0 };
}

function tick(
  run: Run,
  commands: QueuedCommand[] = [],
  actions: { work?: boolean } = {},
  elapsedMs?: number,
): GameEvent[] {
  if (elapsedMs !== undefined) {
    run.state = { ...run.state, elapsedMs };
  }
  const inputs = Object.fromEntries(
    Object.keys(run.state.players).map((id) => [
      id,
      [testInput(run.seq++, { x: 0, y: 0 }, { work: actions.work ?? false })],
    ]),
  );
  const result = runStep(run.state, inputs, commands, run.ctx);
  run.state = result.state;
  run.events.push(...result.events);
  return result.events;
}

/** Ticks until level time `ms`. */
function runUntil(run: Run, ms: number): void {
  while (run.state.elapsedMs < ms && !run.state.ended) {
    tick(run);
  }
}

const levelEvents = (events: GameEvent[], phase?: 'start' | 'end') =>
  events.filter((e) => e.kind === 'levelEvent' && (!phase || e.phase === phase));

/** Moves a folder onto the desk and opens the sheet for player `p`. */
function putOnDesk(run: Run, folderId: string, stamps: string[] = ['t-true-image']): void {
  const folder = run.state.folders[folderId];
  if (!folder) {
    throw new Error('no folder');
  }
  run.state = {
    ...run.state,
    folders: {
      ...run.state.folders,
      [folderId]: { ...folder, location: { kind: 'fixture', fixtureId: 'desk-0' }, stamps },
    },
    desks: { 'desk-0': { id: 'desk-0', operatorId: 'p' } },
  };
}

const verdict = (folderId: string, v: 'publish' | 'reject' | 'publishWithContext') =>
  testCommand('p', { kind: 'verdict', folderId, verdict: v, justifyingStampId: 't-true-image' });

describe('viralShares', () => {
  it('grows exponentially from the start value and is 0 for untagged folders', () => {
    const f = { spawnedAtMs: 1000, tag: { kind: 'viral' } as const };
    expect(viralShares(f, 1000)).toBe(EVENTS.viralSharesStart);
    expect(viralShares(f, 11_000)).toBe(
      Math.round(EVENTS.viralSharesStart * EVENTS.viralGrowthPerS ** 10),
    );
    expect(viralShares(f, 0)).toBe(EVENTS.viralSharesStart);
    expect(viralShares({ spawnedAtMs: 0 }, 5000)).toBe(0);
  });
});

describe('viral', () => {
  it('spawns a tagged folder on a conveyor and ends when it is gone', () => {
    const run = newRun(levelWith([{ kind: 'viral', atS: 1, storyId: 't-true', deadlineS: 5 }]));
    runUntil(run, 1000);
    const folder = run.state.folders.f1;
    expect(folder?.tag).toEqual({ kind: 'viral' });
    expect(folder?.location.kind).toBe('fixture');
    expect(levelEvents(run.events)).toEqual([
      { kind: 'levelEvent', event: 'viral', phase: 'start', folderIds: ['f1'] },
    ]);
    runUntil(run, 6100);
    expect(run.state.folders.f1).toBeUndefined();
    expect(levelEvents(run.events, 'end')).toEqual([
      { kind: 'levelEvent', event: 'viral', phase: 'end', folderIds: ['f1'] },
    ]);
    expect(run.state.activeEvents).toEqual([]);
  });
});

describe('conveyor full', () => {
  it('waits for a free tile and never skips the event', () => {
    const run = newRun(levelWith([{ kind: 'bossCall', atS: 1, storyId: 't-true', deadlineS: 30 }]));
    const filler: Record<string, Folder> = {};
    for (let i = 0; i < 4; i++) {
      filler[`x${i}`] = {
        id: `x${i}`,
        storyId: 't-false',
        location: { kind: 'fixture', fixtureId: `conveyor-${i}` },
        stamps: [],
        spawnedAtMs: 0,
        deadlineMs: 600_000,
        warned: false,
      };
    }
    run.state = { ...run.state, folders: filler };
    runUntil(run, 3000);
    expect(run.state.nextEventIndex).toBe(0);
    expect(levelEvents(run.events)).toHaveLength(0);

    const { x2: _taken, ...rest } = run.state.folders;
    run.state = { ...run.state, folders: rest };
    tick(run);
    expect(run.state.nextEventIndex).toBe(1);
    const spawned = Object.values(run.state.folders).find((f) => f.tag);
    expect(spawned?.location).toEqual({ kind: 'fixture', fixtureId: 'conveyor-2' });
    expect(spawned?.tag).toMatchObject({ kind: 'bossCall' });
  });
});

describe('bossCall', () => {
  function started(storyId: string) {
    const run = newRun(levelWith([{ kind: 'bossCall', atS: 1, storyId, deadlineS: 40 }]), {
      p: AT_DESK,
    });
    runUntil(run, 1000);
    return run;
  }

  it('tags the folder with the end of the window', () => {
    const run = started('t-true');
    expect(run.state.folders.f1?.tag).toEqual({
      kind: 'bossCall',
      untilMs: 1000 + EVENTS.bossCallWindowMs,
    });
  });

  it('obeying on a true story adds the bonus and ends the event', () => {
    const run = started('t-true');
    putOnDesk(run, 'f1');
    const events = tick(run, [verdict('f1', 'publish')]);
    const result = events.find((e) => e.kind === 'verdictResult');
    expect(result).toMatchObject({ outcome: 'correct' });
    // Correct publish of a normal story: 10 points (+ speed bonus 5) + the boss bonus.
    expect(run.state.score).toBe(
      (result?.kind === 'verdictResult' ? result.scoreDelta : -1) as number,
    );
    expect(run.state.score).toBeGreaterThanOrEqual(EVENTS.bossCallBonusScore);
    expect(run.state.results[0]?.scoreDelta).toBe(run.state.score);
    expect(levelEvents(events, 'end')).toHaveLength(1);
  });

  it('obeying gives no bonus when the story is not true', () => {
    const plain = newRun(levelWith([]), { p: AT_DESK });
    plain.state = {
      ...plain.state,
      folders: {
        f1: {
          id: 'f1',
          storyId: 't-false',
          location: { kind: 'fixture', fixtureId: 'desk-0' },
          stamps: ['t-false-image'],
          spawnedAtMs: 0,
          deadlineMs: 60_000,
          warned: false,
        },
      },
      desks: { 'desk-0': { id: 'desk-0', operatorId: 'p' } },
    };
    tick(plain, [verdict('f1', 'publish')]);
    const baseline = plain.state.score;

    const run = started('t-false');
    putOnDesk(run, 'f1', ['t-false-image']);
    tick(run, [verdict('f1', 'publish')]);
    expect(run.state.score).toBe(baseline);
  });

  it('publishing after the window earns no bonus', () => {
    const run = started('t-true');
    runUntil(run, 1000 + EVENTS.bossCallWindowMs + 100);
    expect(levelEvents(run.events, 'end')).toHaveLength(1);
    putOnDesk(run, 'f1');
    tick(run, [verdict('f1', 'publish')]);
    expect(run.state.results[0]?.scoreDelta).toBe(SCORE.correctNormal + SCORE.speedBonus);
  });

  it('ignoring it costs nothing', () => {
    const run = started('t-true');
    runUntil(run, 1000 + EVENTS.bossCallWindowMs + 100);
    expect(run.state.score).toBe(0);
    expect(run.state.credibility).toBe(CREDIBILITY_START);
    expect(run.state.folders.f1).toBeDefined();
    expect(levelEvents(run.events, 'end')).toHaveLength(1);
  });
});

describe('botRaid', () => {
  const raid = (count: number): SimLevelEvent => ({
    kind: 'botRaid',
    atS: 1,
    storyId: 't-false',
    deadlineS: 20,
    count,
  });

  it('spawns the wave sharing one raidId', () => {
    const run = newRun(levelWith([raid(3)]));
    runUntil(run, 1000);
    const wave = Object.values(run.state.folders);
    expect(wave).toHaveLength(3);
    const ids = new Set(wave.map((f) => (f.tag?.kind === 'botRaid' ? f.tag.raidId : '')));
    expect(ids.size).toBe(1);
    expect(levelEvents(run.events, 'start')[0]).toMatchObject({
      event: 'botRaid',
      folderIds: ['f1', 'f2', 'f3'],
    });
  });

  it('is capped by the conveyor length', () => {
    const run = newRun(levelWith([raid(6)]));
    runUntil(run, 1000);
    expect(Object.keys(run.state.folders)).toHaveLength(4);
  });

  it('takes as many free tiles as there are, at least two', () => {
    const fillers = (n: number): Record<string, Folder> =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          `x${i}`,
          {
            id: `x${i}`,
            storyId: 't-true',
            location: { kind: 'fixture', fixtureId: `conveyor-${i}` },
            stamps: [],
            spawnedAtMs: 0,
            deadlineMs: 600_000,
            warned: false,
          } satisfies Folder,
        ]),
      );
    const crowded = newRun(levelWith([raid(4)]));
    crowded.state = { ...crowded.state, folders: fillers(3) };
    runUntil(crowded, 1000);
    // One free tile is not a wave: the raid waits.
    expect(crowded.state.nextEventIndex).toBe(0);

    const roomy = newRun(levelWith([raid(4)]));
    roomy.state = { ...roomy.state, folders: fillers(2) };
    runUntil(roomy, 1000);
    expect(Object.values(roomy.state.folders).filter((f) => f.tag)).toHaveLength(2);
  });

  it('one verdict resolves the wave with a single result', () => {
    const run = newRun(levelWith([raid(3)]), { p: AT_DESK });
    runUntil(run, 1000);
    putOnDesk(run, 'f2', ['t-false-image']);
    const events = tick(run, [verdict('f2', 'reject')]);
    expect(Object.keys(run.state.folders)).toEqual([]);
    expect(run.state.results).toHaveLength(1);
    expect(run.state.results[0]?.folderId).toBe('f2');
    expect(events.find((e) => e.kind === 'raidResolved')).toMatchObject({
      byFolderId: 'f2',
      folderIds: ['f1', 'f3'],
    });
    expect(levelEvents(events, 'end')).toHaveLength(1);
    expect(run.state.activeEvents).toEqual([]);
  });

  it('expiry of the wave is counted once', () => {
    const run = newRun(levelWith([raid(3)]));
    runUntil(run, 21_100);
    expect(Object.keys(run.state.folders)).toEqual([]);
    expect(run.events.filter((e) => e.kind === 'folderExpired')).toHaveLength(3);
    expect(run.state.results).toHaveLength(1);
    expect(run.state.results[0]).toMatchObject({ outcome: 'expired', scoreDelta: -5 });
    expect(run.state.score).toBe(-5);
    expect(run.state.credibility).toBe(CREDIBILITY_START - 5);
    expect(levelEvents(run.events, 'end')).toHaveLength(1);
  });

  it('an extended sibling does not outlive the wave', () => {
    const run = newRun(levelWith([raid(2)]));
    runUntil(run, 1000);
    const f2 = run.state.folders.f2;
    if (f2) {
      run.state = {
        ...run.state,
        folders: { ...run.state.folders, f2: { ...f2, deadlineMs: f2.deadlineMs + 30_000 } },
      };
    }
    runUntil(run, 21_100);
    expect(Object.keys(run.state.folders)).toEqual([]);
    expect(run.state.results).toHaveLength(1);
  });
});

describe('outage', () => {
  const outage = (atS = 1, durationS = 2): SimLevelEvent => ({
    kind: 'outage',
    atS,
    station: 'imageSearch',
    durationS,
  });

  it('takes the station down, counts down and announces the end', () => {
    const run = newRun(levelWith([outage()]));
    runUntil(run, 1000);
    expect(run.state.stations['imageSearch-0']?.outageMs).toBe(2000);
    expect(levelEvents(run.events, 'start')).toEqual([
      {
        kind: 'levelEvent',
        event: 'outage',
        phase: 'start',
        folderIds: [],
        stationId: 'imageSearch-0',
        durationMs: 2000,
      },
    ]);
    runUntil(run, 3200);
    expect(run.state.stations['imageSearch-0']?.outageMs).toBe(0);
    expect(levelEvents(run.events, 'end')).toEqual([
      {
        kind: 'levelEvent',
        event: 'outage',
        phase: 'end',
        folderIds: [],
        stationId: 'imageSearch-0',
      },
    ]);
  });

  it('accepts no work while down, then works again', () => {
    const run = newRun(levelWith([outage(0, 1)]), { p: AT_IMAGE_SEARCH });
    run.state = {
      ...run.state,
      folders: {
        f1: {
          id: 'f1',
          storyId: 't-true',
          location: { kind: 'fixture', fixtureId: 'imageSearch-0' },
          stamps: [],
          spawnedAtMs: 0,
          deadlineMs: 600_000,
          warned: false,
        },
      },
      players: { p: { ...must(run.state.players.p), facing: -Math.PI / 2 } },
    };
    tick(run); // the outage starts in this tick, after the stations ran
    for (let i = 0; i < 10; i++) {
      tick(run, [], { work: true });
    }
    expect(run.state.stations['imageSearch-0']?.phase).toBe('idle');
    expect(run.events.some((e) => e.kind === 'workStarted')).toBe(false);
    runUntil(run, 1300);
    tick(run, [], { work: true });
    tick(run, [], { work: true });
    expect(run.state.stations['imageSearch-0']?.phase).toBe('working');
  });

  it('kicks out an operator who is mid-minigame', () => {
    const run = newRun(levelWith([outage(5, 3)]), { p: AT_IMAGE_SEARCH });
    run.state = {
      ...run.state,
      folders: {
        f1: {
          id: 'f1',
          storyId: 't-true',
          location: { kind: 'fixture', fixtureId: 'imageSearch-0' },
          stamps: [],
          spawnedAtMs: 0,
          deadlineMs: 600_000,
          warned: false,
        },
      },
      players: { p: { ...must(run.state.players.p), facing: -Math.PI / 2 } },
      stations: {
        'imageSearch-0': {
          ...must(run.state.stations['imageSearch-0']),
          operatorId: 'p',
          phase: 'minigame',
          progressMs: 1000,
          durationMs: 1000,
        },
      },
    };
    runUntil(run, 5000);
    expect(run.state.stations['imageSearch-0']?.outageMs).toBe(3000);
    const after = tick(run, [], { work: true });
    expect(after).toContainEqual({
      kind: 'workCancelled',
      stationId: 'imageSearch-0',
      playerId: 'p',
    });
    expect(run.state.stations['imageSearch-0']).toMatchObject({
      operatorId: null,
      phase: 'idle',
    });
    // A late minigame result from the kicked-out player changes nothing.
    tick(run, [
      testCommand('p', { kind: 'minigameResult', stationId: 'imageSearch-0', success: true }),
    ]);
    expect(run.state.folders.f1?.stamps).toEqual([]);
  });

  it('is skipped when the level has no station of that kind', () => {
    const run = newRun(levelWith([{ kind: 'outage', atS: 1, station: 'phone', durationS: 2 }]));
    runUntil(run, 1100);
    expect(run.state.nextEventIndex).toBe(1);
    expect(levelEvents(run.events)).toHaveLength(0);
  });
});

describe('correction', () => {
  const correction: SimLevelEvent = {
    kind: 'correction',
    atS: 1,
    storyId: 't-misleading',
    deadlineS: 30,
  };

  it('drops credibility on the start tick and tags the folder', () => {
    const run = newRun(levelWith([correction]));
    runUntil(run, 900);
    expect(run.state.credibility).toBe(CREDIBILITY_START);
    runUntil(run, 1000);
    expect(run.state.credibility).toBe(CREDIBILITY_START - EVENTS.correctionCredibilityLoss);
    expect(run.state.folders.f1?.tag).toEqual({
      kind: 'correction',
      recoverCredibility: EVENTS.correctionCredibilityLoss / 2,
    });
  });

  it('filing it with publishWithContext recovers half and scores', () => {
    const run = newRun(levelWith([correction]), { p: AT_DESK });
    runUntil(run, 1000);
    putOnDesk(run, 'f1', []);
    const events = tick(run, [
      testCommand('p', {
        kind: 'verdict',
        folderId: 'f1',
        verdict: 'publishWithContext',
        justifyingStampId: 'whatever',
      }),
    ]);
    expect(run.state.credibility).toBe(
      CREDIBILITY_START - EVENTS.correctionCredibilityLoss + EVENTS.correctionCredibilityLoss / 2,
    );
    expect(run.state.score).toBe(EVENTS.correctionScore);
    expect(levelEvents(events, 'end')).toHaveLength(1);
    expect(run.state.results).toHaveLength(1);
  });

  it('expires like any folder and ends the event', () => {
    const run = newRun(levelWith([correction]));
    runUntil(run, 31_100);
    expect(run.state.results[0]?.outcome).toBe('expired');
    expect(levelEvents(run.events, 'end')).toHaveLength(1);
    expect(run.state.credibility).toBeLessThan(
      CREDIBILITY_START - EVENTS.correctionCredibilityLoss,
    );
  });

  it('can end the level when credibility hits zero', () => {
    const run = newRun(levelWith([correction]));
    run.state = { ...run.state, credibility: 10 };
    runUntil(run, 1100);
    expect(run.state.ended).toEqual({ won: false, stars: 0 });
  });
});

describe('several events', () => {
  it('start in the same tick, in order, with distinct folders', () => {
    const run = newRun(
      levelWith([
        { kind: 'viral', atS: 1, storyId: 't-true', deadlineS: 30 },
        { kind: 'outage', atS: 1, station: 'archive', durationS: 5 },
        { kind: 'correction', atS: 1, storyId: 't-misleading', deadlineS: 30 },
      ]),
    );
    runUntil(run, 1000);
    expect(
      levelEvents(run.events, 'start').map((e) => (e.kind === 'levelEvent' ? e.event : '')),
    ).toEqual(['viral', 'outage', 'correction']);
    expect(Object.keys(run.state.folders)).toEqual(['f1', 'f2']);
    expect(run.state.nextEventIndex).toBe(3);
    expect(run.state.activeEvents.map((e) => e.kind)).toEqual(['viral', 'correction']);
  });
});

describe('level end with events active', () => {
  it('stops the simulation without further events', () => {
    const run = newRun(
      levelWith([{ kind: 'viral', atS: 1, storyId: 't-true', deadlineS: 500 }], { durationS: 3 }),
    );
    runUntil(run, 3000);
    expect(run.state.ended).not.toBeNull();
    const before = run.state;
    expect(tick(run)).toEqual([]);
    expect(run.state).toBe(before);
    expect(run.state.activeEvents).toHaveLength(1);
  });
});

describe('serialisation', () => {
  it('folder tags and station outages round-trip through the schemas', () => {
    const run = newRun(
      levelWith([
        { kind: 'bossCall', atS: 1, storyId: 't-true', deadlineS: 30 },
        { kind: 'botRaid', atS: 1, storyId: 't-false', deadlineS: 30, count: 2 },
        { kind: 'outage', atS: 1, station: 'imageSearch', durationS: 5 },
      ]),
    );
    runUntil(run, 1100);
    for (const folder of Object.values(run.state.folders)) {
      expect(folderSchema.parse(JSON.parse(JSON.stringify(folder)))).toEqual(folder);
    }
    expect(Object.values(run.state.folders).every((f) => f.tag)).toBe(true);
    const station = must(run.state.stations['imageSearch-0']);
    expect(stationSchema.parse(JSON.parse(JSON.stringify(station)))).toEqual(station);
    expect(station.outageMs).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('two runs of the same level give identical states and events', () => {
    const level = levelWith([
      { kind: 'viral', atS: 1, storyId: 't-true', deadlineS: 5 },
      { kind: 'botRaid', atS: 2, storyId: 't-false', deadlineS: 5, count: 3 },
      { kind: 'outage', atS: 3, station: 'imageSearch', durationS: 2 },
    ]);
    const a = newRun(level);
    const b = newRun(level);
    runUntil(a, 12_000);
    runUntil(b, 12_000);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
  });
});

describe('scripted scenario', () => {
  it('plays every event through step on a test-local level', () => {
    const level = levelWith(
      [
        { kind: 'viral', atS: 2, storyId: 't-true', deadlineS: 8 },
        { kind: 'botRaid', atS: 4, storyId: 't-false', deadlineS: 10, count: 3 },
        { kind: 'outage', atS: 6, station: 'imageSearch', durationS: 3 },
        { kind: 'bossCall', atS: 20, storyId: 't-true', deadlineS: 30 },
        { kind: 'correction', atS: 30, storyId: 't-misleading', deadlineS: 20 },
      ],
      { durationS: 90 },
    );
    const run = newRun(level, { p: AT_DESK });
    // Viral: ignored, it expires (true normal story: penalised).
    runUntil(run, 11_000);
    // Raid: resolved by one verdict at the desk.
    const raidIds = run.state.activeEvents.find((e) => e.kind === 'botRaid')?.folderIds ?? [];
    expect(raidIds).toHaveLength(3);
    putOnDesk(run, raidIds[0] as string, ['t-false-image']);
    tick(run, [verdict(raidIds[0] as string, 'reject')]);
    expect(run.state.activeEvents).toEqual([]);
    // Outage came and went.
    runUntil(run, 20_000);
    expect(run.state.stations['imageSearch-0']?.outageMs).toBe(0);
    // Boss call: obeyed.
    const boss = Object.values(run.state.folders).find((f) => f.tag?.kind === 'bossCall');
    expect(boss).toBeDefined();
    putOnDesk(run, boss?.id as string);
    tick(run, [verdict(boss?.id as string, 'publish')]);
    // Correction: filed.
    runUntil(run, 30_000);
    const fix = Object.values(run.state.folders).find((f) => f.tag?.kind === 'correction');
    putOnDesk(run, fix?.id as string, []);
    tick(run, [
      testCommand('p', {
        kind: 'verdict',
        folderId: fix?.id as string,
        verdict: 'publishWithContext',
        justifyingStampId: 'x',
      }),
    ]);
    expect(run.state.nextEventIndex).toBe(5);
    expect(run.state.activeEvents).toEqual([]);
    const starts = levelEvents(run.events, 'start').length;
    const ends = levelEvents(run.events, 'end').length;
    expect(starts).toBe(5);
    expect(ends).toBe(5);
  });
});
