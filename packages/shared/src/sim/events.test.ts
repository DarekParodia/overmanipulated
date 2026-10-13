import { describe, expect, it } from 'bun:test';
import { CREDIBILITY_START, EVENTS, SCORE } from '../constants.ts';
import type { Folder } from '../entities.ts';
import { folderSchema, stationSchema } from '../entities.ts';
import type { GameEvent } from '../protocol.ts';
import {
  BELT_FULL_RAID_AT_MS,
  BELT_FULL_RAID_LEVEL,
  takeOffBelt,
} from './__fixtures__/belt-full-raid.ts';
import {
  runStep,
  TEST_LEVEL,
  TEST_MAP,
  testCommand,
  testContext,
  testFolder,
  testInput,
} from './__fixtures__/greybox.ts';
import type { SimLevel, SimLevelEvent } from './content.ts';
import { viralShares } from './events.ts';
import { freeConveyors } from './folders.ts';
import type { QueuedCommand, SimContext } from './frame.ts';
import { minigameSeedFor } from './rng.ts';
import { addPlayer, createGameState, type GameState } from './state.ts';
import { drawMinigameSeed } from './stations.ts';

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
  testCommand('p', { kind: 'verdict', folderId, verdict: v, justifyingStampIds: ['t-true-image'] });

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
      filler[`x${i}`] = testFolder(`x${i}`, {
        storyId: 't-false',
        location: { kind: 'fixture', fixtureId: `conveyor-${i}` },
        deadlineMs: 600_000,
      });
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
    expect(result).toMatchObject({
      outcome: 'correct',
      reason: 'correctNormal',
      bonuses: { speed: SCORE.speedBonus, multiStamp: 0, bossCall: EVENTS.bossCallBonusScore },
    });
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
        f1: testFolder('f1', {
          storyId: 't-false',
          location: { kind: 'fixture', fixtureId: 'desk-0' },
          stamps: ['t-false-image'],
        }),
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
          testFolder(`x${i}`, {
            location: { kind: 'fixture', fixtureId: `conveyor-${i}` },
            deadlineMs: 600_000,
          }),
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
        f1: testFolder('f1', {
          location: { kind: 'fixture', fixtureId: 'imageSearch-0' },
          deadlineMs: 600_000,
        }),
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
        f1: testFolder('f1', {
          location: { kind: 'fixture', fixtureId: 'imageSearch-0' },
          deadlineMs: 600_000,
        }),
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
        justifyingStampIds: ['whatever'],
      }),
    ]);
    expect(run.state.credibility).toBe(
      CREDIBILITY_START - EVENTS.correctionCredibilityLoss + EVENTS.correctionCredibilityLoss / 2,
    );
    expect(run.state.score).toBe(EVENTS.correctionScore);
    expect(levelEvents(events, 'end')).toHaveLength(1);
    expect(run.state.results).toHaveLength(1);
    expect(run.state.results[0]).toMatchObject({
      outcome: 'correct',
      reason: 'correctionFiled',
      justifyingStampIds: ['whatever'],
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    });
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
    expect(run.state.ended).toEqual({ won: false, stars: 0, lossReason: 'credibility' });
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
        justifyingStampIds: ['x'],
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

describe('spawn keys across newsrooms (S7-13)', () => {
  /** Ticks until level time `ms`, remembering every folder by its spawn key (first sighting). */
  function runRecording(run: Run, ms: number, seen: Map<string, Folder>): void {
    while (run.state.elapsedMs < ms && !run.state.ended) {
      tick(run);
      for (const folder of Object.values(run.state.folders)) {
        if (!seen.has(folder.spawnKey)) {
          seen.set(folder.spawnKey, folder);
        }
      }
    }
  }

  /** Works the folder spawned as `spawnKey` at image search and returns the minigame seed. */
  function imageSearchSeed(run: Run, spawnKey: string): number {
    const folder = must(Object.values(run.state.folders).find((f) => f.spawnKey === spawnKey));
    run.state = {
      ...run.state,
      folders: {
        ...run.state.folders,
        [folder.id]: { ...folder, location: { kind: 'fixture', fixtureId: 'imageSearch-0' } },
      },
      players: { p: { ...must(run.state.players.p), facing: -Math.PI / 2 } },
    };
    for (let i = 0; i < 200; i++) {
      const started = tick(run, [], { work: true }).find((e) => e.kind === 'minigameStarted');
      if (started?.kind === 'minigameStarted') {
        expect(started.folderId).toBe(folder.id);
        return started.seed;
      }
    }
    throw new Error('minigame never started');
  }

  it('match when one newsroom meets a botRaid with one free tile less', () => {
    const a = newRun(BELT_FULL_RAID_LEVEL, { p: AT_IMAGE_SEARCH });
    const b = newRun(BELT_FULL_RAID_LEVEL, { p: AT_IMAGE_SEARCH });
    const seenA = new Map<string, Folder>();
    const seenB = new Map<string, Folder>();
    runRecording(a, 2000, seenA);
    runRecording(b, 2000, seenB);
    // Newsroom B takes s0 off the belt before the raid; newsroom A leaves it there.
    b.state = takeOffBelt(b.state, 's0');
    expect(freeConveyors(a.state, TEST_MAP)).toHaveLength(2);
    expect(freeConveyors(b.state, TEST_MAP)).toHaveLength(3);

    runRecording(a, BELT_FULL_RAID_AT_MS, seenA);
    runRecording(b, BELT_FULL_RAID_AT_MS, seenB);
    const wave = (run: Run) =>
      Object.values(run.state.folders)
        .filter((f) => f.tag?.kind === 'botRaid')
        .map((f) => f.spawnKey);
    expect(wave(a)).toEqual(['e0.0', 'e0.1']);
    expect(wave(b)).toEqual(['e0.0', 'e0.1', 'e0.2']);

    // The raid expires at 7 s; s2 and s3 waited for the belt and arrive then.
    runRecording(a, 8000, seenA);
    runRecording(b, 8000, seenB);
    expect([...seenA.keys()].sort()).toEqual(['e0.0', 'e0.1', 's0', 's1', 's2', 's3']);
    expect([...seenB.keys()].sort()).toEqual(['e0.0', 'e0.1', 'e0.2', 's0', 's1', 's2', 's3']);
    // Folder ids diverge from the raid on; the keys do not.
    expect(seenA.get('s2')?.id).toBe('f5');
    expect(seenB.get('s2')?.id).toBe('f6');
    expect(seenB.get('e0.2')?.id).toBe('f5');

    for (const [key, folderA] of seenA) {
      const folderB = must(seenB.get(key));
      expect(folderB.storyId).toBe(folderA.storyId);
      for (const kind of BELT_FULL_RAID_LEVEL.stations) {
        expect(drawMinigameSeed(b.state, folderB, kind)).toBe(
          drawMinigameSeed(a.state, folderA, kind),
        );
      }
    }
    // The expired wave is one result in each newsroom, under the same key.
    expect(a.state.results.map((r) => [r.spawnKey, r.outcome])).toEqual([['e0.0', 'expired']]);
    expect(b.state.results.map((r) => [r.spawnKey, r.outcome])).toEqual([['e0.0', 'expired']]);

    // Working the same later folder gives both newsrooms the same puzzle.
    const seedA = imageSearchSeed(a, 's2');
    const seedB = imageSearchSeed(b, 's2');
    expect(seedA).toBe(seedB);
    expect(seedA).toBe(minigameSeedFor(5, 's2', 'imageSearch', 0));
  });

  it('names every event folder e<eventIndex>.<waveIndex>', () => {
    const run = newRun(
      levelWith([
        { kind: 'outage', atS: 1, station: 'archive', durationS: 2 },
        { kind: 'viral', atS: 1, storyId: 't-true', deadlineS: 30 },
        { kind: 'botRaid', atS: 1, storyId: 't-false', deadlineS: 30, count: 2 },
      ]),
    );
    runUntil(run, 1000);
    expect(Object.values(run.state.folders).map((f) => [f.id, f.spawnKey])).toEqual([
      ['f1', 'e1.0'],
      ['f2', 'e2.0'],
      ['f3', 'e2.1'],
    ]);
  });
});
