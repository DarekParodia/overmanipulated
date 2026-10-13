import { describe, expect, it } from 'bun:test';
import {
  MINIGAME_FAIL_LOCKOUT_MS,
  MINIGAME_STABLE_SEED_STATIONS,
  ROLE_WORK_TIME_FACTOR,
  STATION_WORK_MS,
  TICK_MS,
} from '../constants.ts';
import type { Role } from '../domain.ts';
import type { Folder } from '../entities.ts';
import type { GameEvent } from '../protocol.ts';
import {
  runStep,
  TEST_MAP,
  testCommand,
  testContext,
  testFolder,
  testInput,
} from './__fixtures__/greybox.ts';
import type { PlayerIntent, QueuedCommand, SimFrame } from './frame.ts';
import { minigameSeedFor } from './rng.ts';
import { addPlayer, createGameState, type GameState } from './state.ts';
import { drawMinigameSeed, minigameAttemptKey, stepStations } from './stations.ts';

const FACING_UP = -Math.PI / 2;
/** Floor tiles directly below the stations (row 2), facing up. */
const BELOW = {
  imageSearch: { x: 8.5, y: 2.5 },
  archive: { x: 12.5, y: 2.5 },
  sourceRegistry: { x: 16.5, y: 2.5 },
} as const;

type Spot = keyof typeof BELOW;

function makeFolder(id: string, fixtureId: string, stamps: string[] = []): Folder {
  return testFolder(id, { location: { kind: 'fixture', fixtureId }, stamps });
}

function withPlayer(state: GameState, id: string, spot: Spot, role: Role | null = null) {
  const next = addPlayer(state, id, BELOW[spot], role);
  const player = next.players[id];
  if (!player) {
    throw new Error('player missing');
  }
  return { ...next, players: { ...next.players, [id]: { ...player, facing: FACING_UP } } };
}

function withFolder(state: GameState, folder: Folder): GameState {
  return { ...state, folders: { ...state.folders, [folder.id]: folder } };
}

function setup(
  players: { id: string; spot: Spot; role?: Role }[],
  folders: Folder[] = [makeFolder('f1', 'imageSearch-0')],
): GameState {
  let state = createGameState({ map: TEST_MAP, seed: 7 });
  for (const p of players) {
    state = withPlayer(state, p.id, p.spot, p.role ?? null);
  }
  for (const folder of folders) {
    state = withFolder(state, folder);
  }
  // Folders placed by hand take their ids from the counter, so scheduled spawns don't reuse them.
  return { ...state, nextFolderNumber: folders.length + 1 };
}

function intent(work: boolean): PlayerIntent {
  return { interact: false, work, moving: false };
}

/** Runs stepStations once. `working` lists the players holding work. */
function tick(
  state: GameState,
  working: string[],
  commands: QueuedCommand[] = [],
): { state: GameState; events: GameEvent[] } {
  const intents: Record<string, PlayerIntent> = {};
  for (const id of Object.keys(state.players)) {
    intents[id] = intent(working.includes(id));
  }
  const frame: SimFrame = { ctx: testContext(), intents, commands, events: [] };
  return { state: stepStations(state, frame), events: frame.events };
}

/** Ticks with `working` holding work until the given station reaches the minigame. */
function workUntilMinigame(
  state: GameState,
  working: string[],
  stationId: string,
): { state: GameState; events: GameEvent[]; ticks: number } {
  let current = state;
  const events: GameEvent[] = [];
  for (let ticks = 1; ticks < 1000; ticks++) {
    const result = tick(current, working);
    current = result.state;
    events.push(...result.events);
    if (current.stations[stationId]?.phase === 'minigame') {
      return { state: current, events, ticks };
    }
  }
  throw new Error('minigame never started');
}

const kinds = (events: GameEvent[]) => events.map((e) => e.kind);

describe('stepStations: occupancy', () => {
  it('starts work for a player holding work at a station with a folder', () => {
    const { state, events } = tick(setup([{ id: 'a', spot: 'imageSearch' }]), ['a']);
    const station = state.stations['imageSearch-0'];
    expect(station?.phase).toBe('working');
    expect(station?.operatorId).toBe('a');
    expect(station?.durationMs).toBe(STATION_WORK_MS.imageSearch);
    expect(events).toEqual([{ kind: 'workStarted', stationId: 'imageSearch-0', playerId: 'a' }]);
  });

  it('does not start without a folder, without holding work or out of reach', () => {
    expect(tick(setup([{ id: 'a', spot: 'imageSearch' }], []), ['a']).events).toEqual([]);
    expect(tick(setup([{ id: 'a', spot: 'imageSearch' }]), []).events).toEqual([]);
    const state = setup([{ id: 'a', spot: 'imageSearch' }]);
    const player = state.players.a;
    if (!player) throw new Error('player missing');
    const away = { ...state, players: { a: { ...player, y: 3.5 } } };
    expect(tick(away, ['a']).state.stations['imageSearch-0']?.phase).toBe('idle');
  });

  it('lets only one player operate a station', () => {
    let state = setup([{ id: 'a', spot: 'imageSearch' }]);
    state = tick(state, ['a']).state;
    // A second player at the same spot, also holding work.
    state = withPlayer(state, 'b', 'imageSearch');
    const result = tick(state, ['a', 'b']);
    expect(result.state.stations['imageSearch-0']?.operatorId).toBe('a');
    expect(kinds(result.events)).toEqual([]);
  });

  it('gives a contested free station to exactly one player', () => {
    const state = setup([
      { id: 'a', spot: 'imageSearch' },
      { id: 'b', spot: 'imageSearch' },
    ]);
    const result = tick(state, ['a', 'b']);
    expect(result.state.stations['imageSearch-0']?.operatorId).toBe('a');
    expect(kinds(result.events)).toEqual(['workStarted']);
  });

  it('cannot work a folder that already carries this station’s stamp', () => {
    const state = setup(
      [{ id: 'a', spot: 'imageSearch' }],
      [makeFolder('f1', 'imageSearch-0', ['t-true-image'])],
    );
    const result = tick(state, ['a']);
    expect(result.state.stations['imageSearch-0']?.phase).toBe('idle');
    expect(result.events).toEqual([]);
  });

  it('can work a folder stamped only by other stations', () => {
    const state = setup(
      [{ id: 'a', spot: 'imageSearch' }],
      [makeFolder('f1', 'imageSearch-0', ['t-true-archive'])],
    );
    expect(tick(state, ['a']).state.stations['imageSearch-0']?.phase).toBe('working');
  });
});

describe('stepStations: progress and duration', () => {
  it('advances progress by dt while work is held and opens the minigame at full duration', () => {
    let state = tick(setup([{ id: 'a', spot: 'imageSearch' }]), ['a']).state;
    state = tick(state, ['a']).state;
    expect(state.stations['imageSearch-0']?.progressMs).toBe(TICK_MS);

    const run = workUntilMinigame(
      setup([{ id: 'a', spot: 'imageSearch' }]),
      ['a'],
      'imageSearch-0',
    );
    // One tick to start, then duration / dt ticks of progress.
    expect(run.ticks).toBe(1 + STATION_WORK_MS.imageSearch / TICK_MS);
    const started = run.events.find((e) => e.kind === 'minigameStarted');
    const station = run.state.stations['imageSearch-0'];
    expect(started).toEqual({
      kind: 'minigameStarted',
      stationId: 'imageSearch-0',
      station: 'imageSearch',
      playerId: 'a',
      folderId: 'f1',
      seed: station?.minigameSeed ?? -1,
    });
    expect(station?.operatorId).toBe('a');
    // Derived from the match seed (7), the folder's spawn key (s1), the kind and attempt 0.
    expect(station?.minigameSeed).toBe(1347914757);
    expect(station?.minigameSeed).toBe(minigameSeedFor(7, 's1', 'imageSearch', 0));
    expect(run.state.seed).toBe(7);
    expect(run.state.minigameAttempts).toEqual({});
  });

  it('is deterministic: same state and inputs give the same seed', () => {
    const a = workUntilMinigame(setup([{ id: 'a', spot: 'imageSearch' }]), ['a'], 'imageSearch-0');
    const b = workUntilMinigame(setup([{ id: 'a', spot: 'imageSearch' }]), ['a'], 'imageSearch-0');
    expect(a.state.stations['imageSearch-0']?.minigameSeed).toBe(
      b.state.stations['imageSearch-0']?.minigameSeed ?? -1,
    );
  });

  it('applies the photo editor’s bonus at image search', () => {
    const { state } = tick(setup([{ id: 'a', spot: 'imageSearch', role: 'photoEditor' }]), ['a']);
    expect(state.stations['imageSearch-0']?.durationMs).toBe(
      STATION_WORK_MS.imageSearch * ROLE_WORK_TIME_FACTOR,
    );
    expect(ROLE_WORK_TIME_FACTOR).toBe(0.6);
  });

  it('applies the archivist’s bonus at the archive only', () => {
    const archive = tick(
      setup([{ id: 'a', spot: 'archive', role: 'archivist' }], [makeFolder('f1', 'archive-0')]),
      ['a'],
    ).state.stations['archive-0'];
    expect(archive?.durationMs).toBe(STATION_WORK_MS.archive * ROLE_WORK_TIME_FACTOR);

    const image = tick(setup([{ id: 'a', spot: 'imageSearch', role: 'archivist' }]), ['a']).state
      .stations['imageSearch-0'];
    expect(image?.durationMs).toBe(STATION_WORK_MS.imageSearch);
  });

  it('gives no bonus to a reporter at the source registry', () => {
    const station = tick(
      setup(
        [{ id: 'a', spot: 'sourceRegistry', role: 'reporter' }],
        [makeFolder('f1', 'sourceRegistry-0')],
      ),
      ['a'],
    ).state.stations['sourceRegistry-0'];
    expect(station?.durationMs).toBe(STATION_WORK_MS.sourceRegistry);
  });
});

describe('stepStations: cancelling work', () => {
  const working = () => tick(setup([{ id: 'a', spot: 'imageSearch' }]), ['a']).state;
  const cancelledEvent: GameEvent = {
    kind: 'workCancelled',
    stationId: 'imageSearch-0',
    playerId: 'a',
  };

  it('cancels when the work button is released', () => {
    const result = tick(working(), []);
    expect(result.state.stations['imageSearch-0']).toMatchObject({
      phase: 'idle',
      operatorId: null,
      progressMs: 0,
    });
    expect(result.events).toEqual([cancelledEvent]);
  });

  it('cancels when the operator walks away', () => {
    const state = working();
    const player = state.players.a;
    if (!player) throw new Error('player missing');
    const moved = { ...state, players: { a: { ...player, x: 3.5, y: 6.5 } } };
    const result = tick(moved, ['a']);
    expect(result.state.stations['imageSearch-0']?.phase).toBe('idle');
    expect(result.events).toEqual([cancelledEvent]);
  });

  it('cancels on a cancel command', () => {
    const result = tick(working(), ['a'], [testCommand('a', { kind: 'cancel' })]);
    expect(result.state.stations['imageSearch-0']?.phase).toBe('idle');
    expect(result.events).toEqual([cancelledEvent]);
  });

  it('cancels when the folder is taken off the station', () => {
    const state = { ...working(), folders: {} };
    const result = tick(state, ['a']);
    expect(result.state.stations['imageSearch-0']?.phase).toBe('idle');
    expect(result.events).toEqual([cancelledEvent]);
  });

  it('frees the operator to start at another station after cancelling', () => {
    const state = withFolder(working(), makeFolder('f2', 'archive-0'));
    const player = state.players.a;
    if (!player) throw new Error('player missing');
    const moved = { ...state, players: { a: { ...player, ...BELOW.archive } } };
    let result = tick(moved, ['a']);
    expect(result.state.stations['imageSearch-0']?.phase).toBe('idle');
    result = tick(result.state, ['a']);
    expect(result.state.stations['archive-0']?.operatorId).toBe('a');
  });
});

describe('stepStations: minigame', () => {
  const inMinigame = (role?: Role) =>
    workUntilMinigame(
      setup([{ id: 'a', spot: 'imageSearch', ...(role ? { role } : {}) }]),
      ['a'],
      'imageSearch-0',
    ).state;

  it('keeps waiting without a result, even if work is released', () => {
    const result = tick(inMinigame(), []);
    expect(result.state.stations['imageSearch-0']?.phase).toBe('minigame');
    expect(result.events).toEqual([]);
  });

  it('writes the story’s stamp once on success and frees the station', () => {
    const success = testCommand('a', {
      kind: 'minigameResult',
      stationId: 'imageSearch-0',
      success: true,
    });
    const result = tick(inMinigame(), ['a'], [success, success]);
    expect(result.state.folders.f1?.stamps).toEqual(['t-true-image']);
    expect(result.events).toEqual([
      {
        kind: 'stampApplied',
        stationId: 'imageSearch-0',
        playerId: 'a',
        folderId: 'f1',
        stampId: 't-true-image',
      },
    ]);
    expect(result.state.stations['imageSearch-0']).toMatchObject({
      phase: 'idle',
      operatorId: null,
    });
    // Holding work afterwards does not start a second round on the stamped folder.
    const again = tick(result.state, ['a']);
    expect(again.state.stations['imageSearch-0']?.phase).toBe('idle');
    expect(again.events).toEqual([]);
  });

  it('finishes without a stamp when the story has none for the station', () => {
    let state = inMinigame();
    const folder = state.folders.f1;
    if (!folder) throw new Error('folder missing');
    state = withFolder(state, { ...folder, storyId: 'no-stamps' });
    const ctx = testContext({
      stories: { 'no-stamps': { ...noStampsStory } },
    });
    const frame: SimFrame = {
      ctx,
      intents: { a: intent(true) },
      commands: [
        testCommand('a', { kind: 'minigameResult', stationId: 'imageSearch-0', success: true }),
      ],
      events: [],
    };
    const next = stepStations(state, frame);
    expect(next.folders.f1?.stamps).toEqual([]);
    expect(next.stations['imageSearch-0']?.phase).toBe('idle');
    expect(frame.events).toEqual([]);
  });

  it('ignores results from other players and for other stations', () => {
    let state = inMinigame();
    state = withPlayer(state, 'b', 'archive');
    const result = tick(
      state,
      [],
      [
        testCommand('b', { kind: 'minigameResult', stationId: 'imageSearch-0', success: true }),
        testCommand('a', { kind: 'minigameResult', stationId: 'archive-0', success: true }),
      ],
    );
    expect(result.state.stations['imageSearch-0']?.phase).toBe('minigame');
    expect(result.state.folders.f1?.stamps).toEqual([]);
    expect(result.events).toEqual([]);
  });

  it('locks the station out on failure, then recovers', () => {
    const fail = testCommand('a', {
      kind: 'minigameResult',
      stationId: 'imageSearch-0',
      success: false,
    });
    let result = tick(inMinigame(), ['a'], [fail]);
    expect(result.events).toEqual([
      { kind: 'minigameFailed', stationId: 'imageSearch-0', playerId: 'a', folderId: 'f1' },
    ]);
    expect(result.state.stations['imageSearch-0']).toMatchObject({
      phase: 'lockout',
      operatorId: null,
      lockoutMs: MINIGAME_FAIL_LOCKOUT_MS,
    });
    expect(result.state.folders.f1?.stamps).toEqual([]);

    // Holding work during the lockout does nothing.
    const lockoutTicks = MINIGAME_FAIL_LOCKOUT_MS / TICK_MS;
    for (let i = 0; i < lockoutTicks - 1; i++) {
      result = tick(result.state, ['a']);
      expect(result.state.stations['imageSearch-0']?.phase).toBe('lockout');
      expect(result.events).toEqual([]);
    }
    result = tick(result.state, ['a']);
    expect(result.state.stations['imageSearch-0']).toMatchObject({
      phase: 'idle',
      operatorId: null,
      lockoutMs: 0,
      outageMs: 0,
    });
    // The folder can be worked on again.
    result = tick(result.state, ['a']);
    expect(result.state.stations['imageSearch-0']?.phase).toBe('working');
  });

  it('keeps a player in a minigame from operating a second station', () => {
    const state = withFolder(inMinigame(), makeFolder('f2', 'archive-0'));
    const player = state.players.a;
    if (!player) throw new Error('player missing');
    const moved = { ...state, players: { a: { ...player, ...BELOW.archive } } };
    const result = tick(moved, ['a']);
    expect(result.state.stations['archive-0']?.phase).toBe('idle');
    expect(result.state.stations['imageSearch-0']?.operatorId).toBe('a');
    expect(result.events).toEqual([]);
  });

  it('closes on a cancel command from the operator', () => {
    const result = tick(inMinigame(), [], [testCommand('a', { kind: 'cancel' })]);
    expect(result.state.stations['imageSearch-0']?.phase).toBe('idle');
    expect(result.events).toEqual([
      { kind: 'workCancelled', stationId: 'imageSearch-0', playerId: 'a' },
    ]);
  });

  it('ends the round when the folder disappears', () => {
    const state = { ...inMinigame(), folders: {} };
    const result = tick(state, []);
    expect(result.state.stations['imageSearch-0']).toMatchObject({
      phase: 'idle',
      operatorId: null,
    });
  });

  it('ends the round when the operator leaves the game', () => {
    const state = { ...inMinigame(), players: {}, crew: {} };
    const result = tick(state, []);
    expect(result.state.stations['imageSearch-0']).toMatchObject({
      phase: 'idle',
      operatorId: null,
    });
  });

  it('does not mutate its input', () => {
    const state = inMinigame();
    const snapshot = structuredClone(state);
    tick(
      state,
      ['a'],
      [testCommand('a', { kind: 'minigameResult', stationId: 'imageSearch-0', success: true })],
    );
    expect(state).toEqual(snapshot);
  });
});

const noStampsStory = {
  id: 'no-stamps',
  type: 'photo',
  priority: 'normal',
  truth: 'true',
  correctVerdict: 'publish',
  stamps: [],
  justifyingStamps: [],
} as const;

describe('stations scenario via step', () => {
  it('a photo editor works a folder at image search and gets the stamp', () => {
    let state = setup([{ id: 'a', spot: 'imageSearch', role: 'photoEditor' }]);
    const events: GameEvent[] = [];
    let seq = 0;
    for (let i = 0; i < 200 && !events.some((e) => e.kind === 'minigameStarted'); i++) {
      const result = runStep(state, { a: [testInput(seq++, { x: 0, y: 0 }, { work: true })] });
      state = result.state;
      events.push(...result.events);
    }
    const started = events.find((e) => e.kind === 'minigameStarted');
    expect(started).toMatchObject({ stationId: 'imageSearch-0', playerId: 'a', folderId: 'f1' });
    expect(state.stations['imageSearch-0']?.durationMs).toBe(
      STATION_WORK_MS.imageSearch * ROLE_WORK_TIME_FACTOR,
    );

    const result = runStep(state, { a: [testInput(seq++)] }, [
      testCommand('a', { kind: 'minigameResult', stationId: 'imageSearch-0', success: true }),
    ]);
    expect(result.events.filter((e) => e.kind === 'stampApplied')).toEqual([
      {
        kind: 'stampApplied',
        stationId: 'imageSearch-0',
        playerId: 'a',
        folderId: 'f1',
        stampId: 't-true-image',
      },
    ]);
    expect(result.state.folders.f1?.stamps).toEqual(['t-true-image']);
    expect(result.state.stations['imageSearch-0']?.phase).toBe('idle');
  });
});

describe('stepStations: minigame seeds (S7-13)', () => {
  const fail = (stationId: string) =>
    testCommand('a', { kind: 'minigameResult', stationId, success: false });
  const cancel = testCommand('a', { kind: 'cancel' });

  /** Ends the minigame round at `stationId` with `command`, then waits out the lockout. */
  function endRound(state: GameState, stationId: string, command: QueuedCommand): GameState {
    let current = tick(state, [], [command]).state;
    for (let i = 0; i < MINIGAME_FAIL_LOCKOUT_MS / TICK_MS; i++) {
      if (current.stations[stationId]?.phase === 'idle') {
        break;
      }
      current = tick(current, []).state;
    }
    return current;
  }

  function seedAt(state: GameState, stationId: string): number {
    return state.stations[stationId]?.minigameSeed ?? -1;
  }

  const atRegistry = (folders = [makeFolder('f1', 'sourceRegistry-0')]) =>
    setup([{ id: 'a', spot: 'sourceRegistry' }], folders);

  it('keeps the Kartoteka card after a failure', () => {
    expect(MINIGAME_STABLE_SEED_STATIONS).toEqual(['sourceRegistry']);
    const first = workUntilMinigame(atRegistry(), ['a'], 'sourceRegistry-0').state;
    expect(seedAt(first, 'sourceRegistry-0')).toBe(1262930342);
    const failed = endRound(first, 'sourceRegistry-0', fail('sourceRegistry-0'));
    expect(failed.stations['sourceRegistry-0']?.phase).toBe('idle');
    const retry = workUntilMinigame(failed, ['a'], 'sourceRegistry-0').state;
    expect(seedAt(retry, 'sourceRegistry-0')).toBe(1262930342);
    expect(retry.minigameAttempts).toEqual({});
  });

  it('keeps the Kartoteka card after a cancel', () => {
    const first = workUntilMinigame(atRegistry(), ['a'], 'sourceRegistry-0').state;
    const cancelled = tick(first, [], [cancel]).state;
    expect(cancelled.stations['sourceRegistry-0']?.phase).toBe('idle');
    const retry = workUntilMinigame(cancelled, ['a'], 'sourceRegistry-0').state;
    expect(seedAt(retry, 'sourceRegistry-0')).toBe(1262930342);
    expect(retry.minigameAttempts).toEqual({});
  });

  it('gives another folder another Kartoteka card', () => {
    const other = atRegistry([makeFolder('f2', 'sourceRegistry-0')]);
    const run = workUntilMinigame(other, ['a'], 'sourceRegistry-0').state;
    expect(run.folders.f2?.spawnKey).toBe('s2');
    expect(seedAt(run, 'sourceRegistry-0')).toBe(1999573610);
  });

  it('gives an image search retry a fresh puzzle after a failure or a cancel', () => {
    const first = workUntilMinigame(
      setup([{ id: 'a', spot: 'imageSearch' }]),
      ['a'],
      'imageSearch-0',
    );
    expect(seedAt(first.state, 'imageSearch-0')).toBe(1347914757);

    const failed = endRound(first.state, 'imageSearch-0', fail('imageSearch-0'));
    expect(failed.minigameAttempts).toEqual({ 's1:imageSearch': 1 });
    const second = workUntilMinigame(failed, ['a'], 'imageSearch-0').state;
    expect(seedAt(second, 'imageSearch-0')).toBe(1518889876);

    const cancelled = tick(second, [], [cancel]).state;
    expect(cancelled.minigameAttempts).toEqual({ 's1:imageSearch': 2 });
    const third = workUntilMinigame(cancelled, ['a'], 'imageSearch-0').state;
    expect(seedAt(third, 'imageSearch-0')).toBe(minigameSeedFor(7, 's1', 'imageSearch', 2));
    expect(new Set([1347914757, 1518889876, seedAt(third, 'imageSearch-0')]).size).toBe(3);
  });

  it('counts a minigame cut short by an outage as a cancel', () => {
    const run = workUntilMinigame(
      setup([{ id: 'a', spot: 'imageSearch' }]),
      ['a'],
      'imageSearch-0',
    );
    const station = run.state.stations['imageSearch-0'];
    if (!station) throw new Error('station missing');
    const down = {
      ...run.state,
      stations: { ...run.state.stations, 'imageSearch-0': { ...station, outageMs: 1000 } },
    };
    expect(tick(down, []).state.minigameAttempts).toEqual({ 's1:imageSearch': 1 });
  });

  it('does not count a round that ends with a stamp', () => {
    const run = workUntilMinigame(
      setup([{ id: 'a', spot: 'imageSearch' }]),
      ['a'],
      'imageSearch-0',
    );
    const success = testCommand('a', {
      kind: 'minigameResult',
      stationId: 'imageSearch-0',
      success: true,
    });
    const done = tick(run.state, [], [success]).state;
    expect(done.folders.f1?.stamps).toEqual(['t-true-image']);
    expect(done.minigameAttempts).toEqual({});
  });

  it('gives two newsrooms with one seed the same puzzles whatever order they work in', () => {
    // Different folder ids, the same spawn keys: as in two versus teams whose belts differ.
    const newsroom = (imageFolderId: string, archiveFolderId: string) => {
      let state = setup(
        [
          { id: 'a', spot: 'imageSearch' },
          { id: 'b', spot: 'archive' },
        ],
        [
          testFolder(imageFolderId, {
            spawnKey: 'e0.1',
            location: { kind: 'fixture', fixtureId: 'imageSearch-0' },
          }),
          testFolder(archiveFolderId, {
            spawnKey: 's3',
            location: { kind: 'fixture', fixtureId: 'archive-0' },
          }),
        ],
      );
      state = { ...state, nextFolderNumber: 10 };
      return state;
    };
    let a = newsroom('f1', 'f2');
    a = workUntilMinigame(a, ['a'], 'imageSearch-0').state;
    a = workUntilMinigame(a, ['b'], 'archive-0').state;

    let b = newsroom('f7', 'f3');
    b = workUntilMinigame(b, ['b'], 'archive-0').state;
    b = workUntilMinigame(b, ['a'], 'imageSearch-0').state;

    expect(seedAt(a, 'imageSearch-0')).toBe(seedAt(b, 'imageSearch-0'));
    expect(seedAt(a, 'archive-0')).toBe(seedAt(b, 'archive-0'));
    expect(seedAt(a, 'imageSearch-0')).toBe(minigameSeedFor(7, 'e0.1', 'imageSearch', 0));
    expect(seedAt(a, 'archive-0')).toBe(minigameSeedFor(7, 's3', 'archive', 0));
  });

  it('drawMinigameSeed reads the attempt counter by spawn key and kind', () => {
    const state = {
      ...createGameState({ seed: 7 }),
      minigameAttempts: { [minigameAttemptKey('s1', 'imageSearch')]: 1 },
    };
    expect(minigameAttemptKey('s1', 'imageSearch')).toBe('s1:imageSearch');
    expect(drawMinigameSeed(state, { spawnKey: 's1' }, 'imageSearch')).toBe(1518889876);
    expect(drawMinigameSeed(state, { spawnKey: 's1' }, 'sourceRegistry')).toBe(1262930342);
  });
});
