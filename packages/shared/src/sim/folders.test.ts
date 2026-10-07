import { describe, expect, it } from 'bun:test';
import type { Folder, FolderLocation } from '../entities.ts';
import type { GameEvent } from '../protocol.ts';
import { runStep, TEST_LEVEL, TEST_MAP, testContext, testInput } from './__fixtures__/greybox.ts';
import type { SimLevel } from './content.ts';
import { stepFolders } from './folders.ts';
import type { PlayerIntent, SimContext, SimFrame } from './frame.ts';
import { addPlayer, carriedFolder, createGameState, type GameState } from './state.ts';
import type { PlayerInput } from './step.ts';

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;
const RIGHT = 0;

/** Standing spots (on floor) facing each fixture used in these tests. */
const SPOT = {
  conveyor0: { x: 1.5, y: 2.5, facing: UP },
  conveyor1: { x: 2.5, y: 2.5, facing: UP },
  imageSearch: { x: 8.5, y: 2.5, facing: UP },
  table0: { x: 9.5, y: 3.5, facing: DOWN },
  desk0: { x: 9.5, y: 6.5, facing: DOWN },
  openFloor: { x: 5.5, y: 6.5, facing: RIGHT },
} as const;

type Spot = { x: number; y: number; facing: number };

function withPlayers(spots: Record<string, Spot>, state = createGameState({ map: TEST_MAP })) {
  let next = state;
  for (const [id, spot] of Object.entries(spots)) {
    next = addPlayer(next, id, spot);
    const player = next.players[id];
    if (player) {
      next = { ...next, players: { ...next.players, [id]: { ...player, facing: spot.facing } } };
    }
  }
  return next;
}

function folder(id: string, location: FolderLocation, overrides: Partial<Folder> = {}): Folder {
  return {
    id,
    storyId: 't-true',
    location,
    stamps: [],
    spawnedAtMs: 0,
    deadlineMs: 60_000,
    warned: false,
    ...overrides,
  };
}

function withFolders(state: GameState, ...folders: Folder[]): GameState {
  const record = { ...state.folders };
  for (const f of folders) {
    record[f.id] = f;
  }
  return { ...state, folders: record };
}

/** An empty schedule, so interaction tests are not disturbed by spawns. */
const QUIET_LEVEL: SimLevel = { ...TEST_LEVEL, schedule: [] };

function runFolders(
  state: GameState,
  interacting: readonly string[] = [],
  ctx: SimContext = testContext({ level: QUIET_LEVEL }),
): { state: GameState; events: GameEvent[] } {
  const intents: Record<string, PlayerIntent> = {};
  for (const id of Object.keys(state.players)) {
    intents[id] = { interact: interacting.includes(id), work: false, moving: false };
  }
  const frame: SimFrame = { ctx, intents, commands: [], events: [] };
  return { state: stepFolders(state, frame), events: frame.events };
}

const onFixture = (fixtureId: string): FolderLocation => ({ kind: 'fixture', fixtureId });
const carriedBy = (playerId: string): FolderLocation => ({ kind: 'carried', playerId });

describe('stepFolders: picking up', () => {
  it('picks up a folder from a conveyor tile', () => {
    const state = withFolders(
      withPlayers({ a: SPOT.conveyor0 }),
      folder('f1', onFixture('conveyor-0')),
    );
    const { state: next, events } = runFolders(state, ['a']);
    expect(next.folders.f1?.location).toEqual(carriedBy('a'));
    expect(events).toEqual([{ kind: 'folderPickedUp', folderId: 'f1', playerId: 'a' }]);
  });

  it('picks up from a table, a free station and a free desk', () => {
    for (const [spot, fixtureId] of [
      [SPOT.table0, 'table-0'],
      [SPOT.imageSearch, 'imageSearch-0'],
      [SPOT.desk0, 'desk-0'],
    ] as const) {
      const state = withFolders(withPlayers({ a: spot }), folder('f1', onFixture(fixtureId)));
      const { state: next } = runFolders(state, ['a']);
      expect(next.folders.f1?.location).toEqual(carriedBy('a'));
    }
  });

  it('refuses to take a folder from a station someone is operating', () => {
    let state = withFolders(
      withPlayers({ a: SPOT.imageSearch }),
      folder('f1', onFixture('imageSearch-0')),
    );
    const station = state.stations['imageSearch-0'];
    if (!station) throw new Error('missing station');
    state = {
      ...state,
      stations: { ...state.stations, 'imageSearch-0': { ...station, operatorId: 'b' } },
    };
    const { state: next, events } = runFolders(state, ['a']);
    expect(next.folders.f1?.location).toEqual(onFixture('imageSearch-0'));
    expect(events).toEqual([]);
  });

  it('refuses to take a folder from a desk someone is operating', () => {
    let state = withFolders(withPlayers({ a: SPOT.desk0 }), folder('f1', onFixture('desk-0')));
    state = { ...state, desks: { ...state.desks, 'desk-0': { id: 'desk-0', operatorId: 'b' } } };
    const { state: next, events } = runFolders(state, ['a']);
    expect(next.folders.f1?.location).toEqual(onFixture('desk-0'));
    expect(events).toEqual([]);
  });

  it('picks up the nearest floor folder within reach', () => {
    const state = withFolders(
      withPlayers({ a: SPOT.openFloor }),
      folder('far', { kind: 'floor', x: 6.5, y: 6.5 }),
      folder('near', { kind: 'floor', x: 5.5, y: 7 }),
      folder('out', { kind: 'floor', x: 5.5, y: 8 }),
    );
    const { state: next } = runFolders(state, ['a']);
    expect(next.folders.near?.location).toEqual(carriedBy('a'));
    expect(next.folders.far?.location.kind).toBe('floor');
  });

  it('ignores floor folders out of reach', () => {
    const state = withFolders(
      withPlayers({ a: SPOT.openFloor }),
      folder('f1', { kind: 'floor', x: 5.5, y: 8 }),
    );
    const { events } = runFolders(state, ['a']);
    expect(events).toEqual([]);
  });

  it('does nothing without the interact intent', () => {
    const state = withFolders(
      withPlayers({ a: SPOT.conveyor0 }),
      folder('f1', onFixture('conveyor-0')),
    );
    const { state: next, events } = runFolders(state);
    expect(next.folders.f1?.location).toEqual(onFixture('conveyor-0'));
    expect(events).toEqual([]);
  });

  it('gives a contested folder to the first player in join order only', () => {
    // Both players stand below conveyor-0, facing it.
    const state = withFolders(
      withPlayers({ a: SPOT.conveyor0, b: { x: 1.6, y: 2.4, facing: UP } }),
      folder('f1', onFixture('conveyor-0')),
    );
    const { state: next, events } = runFolders(state, ['a', 'b']);
    expect(next.folders.f1?.location).toEqual(carriedBy('a'));
    expect(events).toEqual([{ kind: 'folderPickedUp', folderId: 'f1', playerId: 'a' }]);
  });
});

describe('stepFolders: putting down', () => {
  it('puts a carried folder on an empty table, station and desk', () => {
    for (const [spot, fixtureId] of [
      [SPOT.table0, 'table-0'],
      [SPOT.imageSearch, 'imageSearch-0'],
      [SPOT.desk0, 'desk-0'],
    ] as const) {
      const state = withFolders(withPlayers({ a: spot }), folder('f1', carriedBy('a')));
      const { state: next, events } = runFolders(state, ['a']);
      expect(next.folders.f1?.location).toEqual(onFixture(fixtureId));
      expect(events).toEqual([
        { kind: 'folderPutDown', folderId: 'f1', playerId: 'a', location: onFixture(fixtureId) },
      ]);
    }
  });

  it('never puts a folder back on the conveyor', () => {
    const state = withFolders(withPlayers({ a: SPOT.conveyor1 }), folder('f1', carriedBy('a')));
    const { state: next, events } = runFolders(state, ['a']);
    expect(next.folders.f1?.location).toEqual(carriedBy('a'));
    expect(events).toEqual([]);
  });

  it('refuses a fixture that already holds a folder', () => {
    const state = withFolders(
      withPlayers({ a: SPOT.table0 }),
      folder('f1', carriedBy('a')),
      folder('f2', onFixture('table-0')),
    );
    const { state: next, events } = runFolders(state, ['a']);
    expect(next.folders.f1?.location).toEqual(carriedBy('a'));
    expect(events).toEqual([]);
  });

  it('refuses an operated station or desk', () => {
    let state = withFolders(
      withPlayers({ a: SPOT.imageSearch, b: SPOT.desk0 }),
      folder('f1', carriedBy('a')),
      folder('f2', carriedBy('b')),
    );
    const station = state.stations['imageSearch-0'];
    if (!station) throw new Error('missing station');
    state = {
      ...state,
      stations: { ...state.stations, 'imageSearch-0': { ...station, operatorId: 'c' } },
      desks: { ...state.desks, 'desk-0': { id: 'desk-0', operatorId: 'c' } },
    };
    const { state: next, events } = runFolders(state, ['a', 'b']);
    expect(next.folders.f1?.location).toEqual(carriedBy('a'));
    expect(next.folders.f2?.location).toEqual(carriedBy('b'));
    expect(events).toEqual([]);
  });

  it('drops the folder on the floor in front of the player when no fixture is in reach', () => {
    const state = withFolders(withPlayers({ a: SPOT.openFloor }), folder('f1', carriedBy('a')));
    const { state: next, events } = runFolders(state, ['a']);
    const location = next.folders.f1?.location;
    expect(location?.kind).toBe('floor');
    if (location?.kind !== 'floor') throw new Error('expected floor');
    expect(location.x).toBeCloseTo(6.1, 2);
    expect(location.y).toBeCloseTo(6.5, 5);
    expect(events).toEqual([{ kind: 'folderPutDown', folderId: 'f1', playerId: 'a', location }]);
  });

  it('drops at the player position when the point in front is not floor', () => {
    // Facing the left wall with no fixture in reach (the T table is at col 2, row 9).
    const state = withFolders(
      withPlayers({ a: { x: 1.3, y: 6.5, facing: Math.PI } }),
      folder('f1', carriedBy('a')),
    );
    const { state: next } = runFolders(state, ['a']);
    expect(next.folders.f1?.location).toEqual({ kind: 'floor', x: 1.3, y: 6.5 });
  });

  it('lets a player carry only one folder: interacting while carrying puts down', () => {
    const state = withFolders(
      withPlayers({ a: SPOT.openFloor }),
      folder('f1', carriedBy('a')),
      folder('f2', { kind: 'floor', x: 5.5, y: 7 }),
    );
    const { state: next } = runFolders(state, ['a']);
    expect(next.folders.f1?.location.kind).toBe('floor');
    expect(next.folders.f2?.location.kind).toBe('floor');
    expect(carriedFolder(next, 'a')).toBeUndefined();
  });

  it('lets a later player pick up what an earlier player put down in the same tick', () => {
    const state = withFolders(
      withPlayers({ a: SPOT.table0, b: { x: 10.5, y: 3.5, facing: Math.PI * 0.75 } }),
      folder('f1', carriedBy('a')),
    );
    // b faces down-left; the tile in front is table-0 (col 9, row 4).
    const { state: next } = runFolders(state, ['a', 'b']);
    expect(next.folders.f1?.location).toEqual(carriedBy('b'));
  });

  it('does not mutate the input state', () => {
    const state = withFolders(withPlayers({ a: SPOT.table0 }), folder('f1', carriedBy('a')));
    const snapshot = structuredClone(state);
    runFolders(state, ['a']);
    expect(state).toEqual(snapshot);
  });
});

describe('stepFolders: spawning', () => {
  const at = (elapsedMs: number, state = createGameState({ map: TEST_MAP })) => ({
    ...state,
    elapsedMs,
  });

  it('spawns nothing before the scheduled time', () => {
    const { state, events } = runFolders(at(999), [], testContext());
    expect(state.folders).toEqual({});
    expect(events).toEqual([]);
  });

  it('spawns a folder on the first free conveyor tile at the scheduled time', () => {
    const { state, events } = runFolders(at(1000), [], testContext());
    expect(state.folders.f1).toEqual({
      id: 'f1',
      storyId: 't-true',
      location: onFixture('conveyor-0'),
      stamps: [],
      spawnedAtMs: 1000,
      deadlineMs: 61_000,
      warned: false,
    });
    expect(state.nextFolderNumber).toBe(2);
    expect(state.nextSpawnIndex).toBe(1);
    expect(events).toEqual([
      { kind: 'folderSpawned', folderId: 'f1', storyId: 't-true', fixtureId: 'conveyor-0' },
    ]);
  });

  it('spawns every due entry, each on the next free tile', () => {
    const occupied = withFolders(at(10_000), folder('f9', onFixture('conveyor-0')));
    const { state } = runFolders({ ...occupied, nextFolderNumber: 10 }, [], testContext());
    expect(state.folders.f10?.location).toEqual(onFixture('conveyor-1'));
    expect(state.folders.f11?.location).toEqual(onFixture('conveyor-2'));
    expect(state.folders.f12?.location).toEqual(onFixture('conveyor-3'));
    expect(state.folders.f12?.deadlineMs).toBe(55_000);
    expect(state.nextSpawnIndex).toBe(3);
  });

  it('waits for a free conveyor tile instead of skipping the spawn', () => {
    const full = withFolders(
      at(1000),
      folder('f1', onFixture('conveyor-0')),
      folder('f2', onFixture('conveyor-1')),
      folder('f3', onFixture('conveyor-2')),
      folder('f4', onFixture('conveyor-3')),
    );
    const blocked = runFolders({ ...full, nextFolderNumber: 5 }, [], testContext());
    expect(blocked.events).toEqual([]);
    expect(blocked.state.nextSpawnIndex).toBe(0);

    const { f3: _taken, ...rest } = blocked.state.folders;
    const freed = { ...blocked.state, elapsedMs: 3000, folders: rest };
    const { state, events } = runFolders(freed, [], testContext());
    expect(events).toEqual([
      { kind: 'folderSpawned', folderId: 'f5', storyId: 't-true', fixtureId: 'conveyor-2' },
    ]);
    // The deadline counts from the actual arrival.
    expect(state.folders.f5?.deadlineMs).toBe(63_000);
  });

  it('skips schedule entries whose story is unknown', () => {
    const level: SimLevel = {
      ...TEST_LEVEL,
      schedule: [
        { atS: 1, storyId: 'missing', deadlineS: 30 },
        { atS: 1, storyId: 't-false', deadlineS: 30 },
      ],
    };
    const { state, events } = runFolders(at(1000), [], testContext({ level }));
    expect(state.nextSpawnIndex).toBe(2);
    expect(events).toEqual([
      { kind: 'folderSpawned', folderId: 'f1', storyId: 't-false', fixtureId: 'conveyor-0' },
    ]);
  });
});

describe('stepFolders: deadlines', () => {
  const base = (elapsedMs: number, f: Folder) =>
    withFolders({ ...createGameState({ map: TEST_MAP }), elapsedMs }, f);

  it('warns once when 10 seconds are left', () => {
    const f = folder('f1', onFixture('table-0'), { deadlineMs: 30_000 });
    expect(runFolders(base(19_999, f)).events).toEqual([]);
    const warned = runFolders(base(20_000, f));
    expect(warned.events).toEqual([{ kind: 'deadlineWarning', folderId: 'f1' }]);
    expect(warned.state.folders.f1?.warned).toBe(true);
    const later = runFolders({ ...warned.state, elapsedMs: 25_000 });
    expect(later.events).toEqual([]);
  });

  it('removes an expired folder wherever it is, even when carried', () => {
    for (const location of [
      onFixture('table-0'),
      carriedBy('a'),
      { kind: 'floor', x: 5, y: 5 } as const,
    ]) {
      const f = folder('f1', location, { deadlineMs: 30_000, warned: true, storyId: 't-false' });
      const state = withPlayers({ a: SPOT.openFloor }, base(30_000, f));
      const { state: next, events } = runFolders(state);
      expect(next.folders.f1).toBeUndefined();
      expect(events).toEqual([
        { kind: 'folderExpired', folderId: 'f1', storyId: 't-false', stamps: [] },
      ]);
      expect(next.score).toBe(state.score);
      expect(next.credibility).toBe(state.credibility);
      expect(next.results).toEqual([]);
    }
  });

  it('keeps a folder until its deadline is reached', () => {
    const f = folder('f1', onFixture('table-0'), { deadlineMs: 30_000, warned: true });
    expect(runFolders(base(29_950, f)).state.folders.f1).toBeDefined();
  });
});

describe('folders scenario through step()', () => {
  it('spawns a folder, carries it from the conveyor to the image search station', () => {
    let state = addPlayer(
      createGameState({ map: TEST_MAP }),
      'a',
      TEST_MAP.spawns[0] ?? { x: 0, y: 0 },
    );
    let seq = 0;
    const events: GameEvent[] = [];
    const tick = (move = { x: 0, y: 0 }, actions: Partial<PlayerInput['actions']> = {}) => {
      const result = runStep(state, { a: [testInput(seq++, move, actions)] });
      state = result.state;
      events.push(...result.events);
    };
    const player = () => {
      const p = state.players.a;
      if (!p) throw new Error('player missing');
      return p;
    };

    // Walk up until the conveyor row stops the player, then left against the wall.
    for (let i = 0; i < 20; i++) tick({ x: 0, y: -1 });
    for (let i = 0; i < 20; i++) tick({ x: -1, y: 0 });
    expect(state.elapsedMs).toBeGreaterThanOrEqual(1000);
    expect(events).toContainEqual({
      kind: 'folderSpawned',
      folderId: 'f1',
      storyId: 't-true',
      fixtureId: 'conveyor-0',
    });

    tick({ x: 0, y: -1 }); // face the conveyor
    tick(undefined, { interact: true });
    expect(state.folders.f1?.location).toEqual(carriedBy('a'));

    while (player().x < 8.4) tick({ x: 1, y: 0 });
    tick({ x: 0, y: -1 }); // face the station
    tick(undefined, { interact: true });
    expect(state.folders.f1?.location).toEqual(onFixture('imageSearch-0'));
    const f1Events = events.filter((e) => 'folderId' in e && e.folderId === 'f1');
    expect(f1Events.map((e) => e.kind)).toEqual([
      'folderSpawned',
      'folderPickedUp',
      'folderPutDown',
    ]);
  });
});

describe('stepFolders: facing beats reach', () => {
  const belowConveyorFacingDown = { x: 1.5, y: 2.5, facing: DOWN };

  it('drops on the floor ahead when the only fixture in reach is behind and refuses', () => {
    const state = withFolders(
      withPlayers({ a: belowConveyorFacingDown }),
      folder('f1', carriedBy('a')),
    );
    const { state: next } = runFolders(state, ['a']);
    const location = next.folders.f1?.location;
    if (location?.kind !== 'floor') throw new Error('expected floor');
    expect(location.x).toBeCloseTo(1.5, 5);
    expect(location.y).toBeCloseTo(3.1, 2);
  });

  it('picks up the floor folder in front rather than a fixture folder behind', () => {
    const state = withFolders(
      withPlayers({ a: belowConveyorFacingDown }),
      folder('behind', onFixture('conveyor-0')),
      folder('ahead', { kind: 'floor', x: 1.5, y: 3.1 }),
    );
    const { state: next } = runFolders(state, ['a']);
    expect(next.folders.ahead?.location).toEqual(carriedBy('a'));
    expect(next.folders.behind?.location).toEqual(onFixture('conveyor-0'));
  });

  it('still reaches a fixture behind the player when no floor folder is near', () => {
    const state = withFolders(
      withPlayers({ a: belowConveyorFacingDown }),
      folder('f1', onFixture('conveyor-0')),
    );
    const { state: next } = runFolders(state, ['a']);
    expect(next.folders.f1?.location).toEqual(carriedBy('a'));
  });
});
