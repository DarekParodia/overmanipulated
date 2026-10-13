import { describe, expect, it } from 'bun:test';
import { SCORE, TICK_MS } from '../constants.ts';
import type { Role } from '../domain.ts';
import type { Folder, Station } from '../entities.ts';
import type { GameEvent } from '../protocol.ts';
import {
  runStep,
  TEST_LEVEL,
  TEST_MAP,
  TEST_STORIES,
  testCommand,
  testContext,
  testFolder,
  testInput,
} from './__fixtures__/greybox.ts';
import {
  type AbilityBlockReason,
  type AbilityPreview,
  abilityEnvOf,
  abilityPreview,
  pickExtendTarget,
  pickPassTarget,
  stepAbilities,
} from './abilities.ts';
import type { SimStory } from './content.ts';
import { evaluateVerdict } from './desk.ts';
import type { SimContext, SimFrame } from './frame.ts';
import { GREYBOX_LAYOUT, parseLayout } from './map.ts';
import { addPlayer, createGameState, type GameState } from './state.ts';
import { drawMinigameSeed, stepStations } from './stations.ts';

function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('missing test fixture value');
  }
  return value;
}

/** The greybox with the source registry swapped for a phone (`phone-0`, row 1, col 16). */
const PHONE_MAP = parseLayout(
  GREYBOX_LAYOUT.map((row, index) => (index === 1 ? row.replace('R', 'P') : row)),
);

/** A true story with a phone stamp. */
const PHONE_STORY: SimStory = {
  id: 't-phone',
  type: 'quote',
  priority: 'normal',
  truth: 'true',
  correctVerdict: 'publish',
  stamps: [
    { id: 's-image', station: 'imageSearch', relevance: 'irrelevant' },
    { id: 's-phone', station: 'phone', relevance: 'decisive' },
  ],
  justifyingStamps: ['s-phone'],
};

/** No scheduled folders, so only the folders a test sets up are in play. */
const QUIET_LEVEL = { ...TEST_LEVEL, schedule: [] };

const PHONE_CONTEXT = testContext({
  map: PHONE_MAP,
  level: QUIET_LEVEL,
  stories: { ...TEST_STORIES, 't-phone': PHONE_STORY },
});

const GREYBOX_ENV = abilityEnvOf(testContext({ level: QUIET_LEVEL }));

/** Players p1, p2, … with the given roles, side by side on row 2, at level time `elapsedMs`. */
function crewOf(
  roles: readonly (Role | null)[],
  elapsedMs = 10_000,
  map = TEST_MAP,
  folders: readonly Folder[] = [],
): GameState {
  let state = createGameState({ map, seed: 7 });
  roles.forEach((role, index) => {
    state = addPlayer(state, `p${index + 1}`, { x: 2.5 + index, y: 2.5 }, role);
  });
  return {
    ...state,
    elapsedMs,
    folders: Object.fromEntries(folders.map((folder) => [folder.id, folder])),
  };
}

function onTable(id: string, patch: Partial<Folder> = {}): Folder {
  return testFolder(id, { location: { kind: 'fixture', fixtureId: 'table-0' }, ...patch });
}

function carriedBy(playerId: string, id: string, patch: Partial<Folder> = {}): Folder {
  return testFolder(id, { location: { kind: 'carried', playerId }, ...patch });
}

function frameFor(
  state: GameState,
  pressedBy: readonly string[] = [],
  ctx: SimContext = testContext({ level: QUIET_LEVEL }),
): SimFrame {
  const intents = Object.fromEntries(
    Object.keys(state.players).map((id) => [id, { interact: false, work: false, moving: false }]),
  );
  return {
    ctx,
    intents,
    commands: pressedBy.map((id) => testCommand(id, { kind: 'useAbility' })),
    events: [],
  };
}

/** Runs `stepAbilities` once with the given presses. */
function press(state: GameState, pressedBy: readonly string[], ctx?: SimContext) {
  const frame = frameFor(state, pressedBy, ctx);
  return { state: stepAbilities(state, frame), events: frame.events };
}

function withCrew(state: GameState, playerId: string, patch: Partial<GameState['crew'][string]>) {
  return {
    ...state,
    crew: { ...state.crew, [playerId]: { ...must(state.crew[playerId]), ...patch } },
  };
}

const FACING_UP = -Math.PI / 2;
const FACING_DOWN = Math.PI / 2;
const QUIET_CONTEXT = testContext({ level: QUIET_LEVEL });

/** Moves a player to (x, y), facing `facing`. */
function placed(state: GameState, playerId: string, x: number, y: number, facing = FACING_UP) {
  const player = must(state.players[playerId]);
  return { ...state, players: { ...state.players, [playerId]: { ...player, x, y, facing } } };
}

function withStation(state: GameState, stationId: string, patch: Partial<Station>): GameState {
  const station = must(state.stations[stationId]);
  return { ...state, stations: { ...state.stations, [stationId]: { ...station, ...patch } } };
}

function onStation(id: string, stationId: string, patch: Partial<Folder> = {}): Folder {
  return testFolder(id, { location: { kind: 'fixture', fixtureId: stationId }, ...patch });
}

/** Runs `stepStations` once: `working` hold work, `commands` arrived this tick. */
function stationTick(
  state: GameState,
  working: readonly string[],
  commands: SimFrame['commands'] = [],
) {
  const frame = frameFor(state, [], QUIET_CONTEXT);
  const intents = Object.fromEntries(
    Object.keys(state.players).map((id) => [
      id,
      { interact: false, work: working.includes(id), moving: false },
    ]),
  );
  const run = { ...frame, intents, commands };
  return { state: stepStations(state, run), events: run.events };
}

function minigameResult(playerId: string, stationId: string, success: boolean) {
  return testCommand(playerId, { kind: 'minigameResult', stationId, success });
}

/** The greybox without its image search (like l4) and without its archive (like l1). */
const NO_IMAGE_MAP = parseLayout(
  GREYBOX_LAYOUT.map((row, index) => (index === 1 ? row.replace('I', '.') : row)),
);
const NO_ARCHIVE_MAP = parseLayout(
  GREYBOX_LAYOUT.map((row, index) => (index === 1 ? row.replace('A', '.') : row)),
);

function ofKind<K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) {
  return events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);
}

describe('1. ability state on join', () => {
  it('starts ready, unarmed, without a call; rescues follow ROLE_PERKS', () => {
    const state = crewOf(['reporter', 'managingEditor', null, 'generalist', 'rescuer'], 0);
    for (const [id, rescuesLeft] of [
      ['p1', 0],
      ['p2', 0],
      ['p3', 0],
      ['p4', 0],
      ['p5', 1],
    ] as const) {
      expect(state.crew[id]).toMatchObject({
        abilityReadyAtMs: 0,
        abilityArmed: false,
        fieldCall: null,
        rescuesLeft,
      });
    }
  });
});

describe('2. Przedłużenie', () => {
  const base = crewOf(['managingEditor'], 10_000, TEST_MAP, [
    onTable('f1', { deadlineMs: 50_000, warned: true }),
  ]);

  it('adds 20 s to the folder, records it and starts the cooldown', () => {
    const run = press(base, ['p1']);
    expect(run.state.folders.f1).toMatchObject({
      deadlineMs: 70_000,
      extendedMs: 20_000,
      warned: false,
    });
    expect(run.events).toEqual([
      {
        kind: 'ability',
        playerId: 'p1',
        ability: 'extendDeadline',
        stage: 'done',
        folderId: 'f1',
        addedMs: 20_000,
      },
    ]);
    expect(run.state.crew.p1?.abilityReadyAtMs).toBe(70_000);
    expect(run.state.crew.p1?.abilityArmed).toBe(false);
  });

  it('is ready again exactly when the cooldown ends', () => {
    const used = press(base, ['p1']).state;
    const early = { ...used, elapsedMs: 69_950 };
    const tooEarly = press(early, ['p1']);
    expect(tooEarly.state).toBe(early);
    expect(tooEarly.events).toEqual([]);
    const again = press({ ...used, elapsedMs: 70_000 }, ['p1']);
    expect(again.state.folders.f1).toMatchObject({ deadlineMs: 90_000, extendedMs: 40_000 });
    expect(again.state.crew.p1?.abilityReadyAtMs).toBe(130_000);
  });
});

describe('3. Przedłużenie target', () => {
  it('prefers the carried folder over the most urgent one', () => {
    const state = crewOf(['managingEditor'], 10_000, TEST_MAP, [
      onTable('f1', { deadlineMs: 30_000 }),
      carriedBy('p1', 'f2', { deadlineMs: 50_000 }),
    ]);
    expect(pickExtendTarget(state, 'p1')).toBe('f2');
    expect(press(state, ['p1']).state.folders.f2?.deadlineMs).toBe(70_000);
  });

  it('takes the most urgent folder when nothing is carried (ties: earlier spawn, then id)', () => {
    const state = crewOf(['managingEditor'], 10_000, TEST_MAP, [
      onTable('f2', { deadlineMs: 50_000 }),
      onTable('f1', { deadlineMs: 30_000 }),
    ]);
    expect(pickExtendTarget(state, 'p1')).toBe('f1');
    expect(press(state, ['p1']).state.folders.f1?.deadlineMs).toBe(50_000);
    const tied = crewOf(['managingEditor'], 10_000, TEST_MAP, [
      onTable('f3', { deadlineMs: 30_000, spawnedAtMs: 2000 }),
      onTable('f2', { deadlineMs: 30_000, spawnedAtMs: 1000 }),
      onTable('f1', { deadlineMs: 30_000, spawnedAtMs: 2000 }),
    ]);
    expect(pickExtendTarget(tied, 'p1')).toBe('f2');
    const { f2: _f2, ...rest } = tied.folders;
    expect(pickExtendTarget({ ...tied, folders: rest }, 'p1')).toBe('f1');
  });

  it('prefers the folder on the desk the player operates over the most urgent one', () => {
    const base = crewOf(['managingEditor'], 10_000, TEST_MAP, [
      onTable('f1', { deadlineMs: 30_000 }),
      testFolder('f3', { location: { kind: 'fixture', fixtureId: 'desk-0' }, deadlineMs: 80_000 }),
    ]);
    const state = {
      ...base,
      desks: { ...base.desks, 'desk-0': { id: 'desk-0', operatorId: 'p1' } },
    };
    expect(pickExtendTarget(state, 'p1')).toBe('f3');
    expect(press(state, ['p1']).state.folders.f3?.deadlineMs).toBe(100_000);
  });

  it('has no target without folders', () => {
    const state = crewOf(['managingEditor']);
    expect(pickExtendTarget(state, 'p1')).toBeNull();
    expect(abilityPreview(state, 'p1', GREYBOX_ENV)).toEqual({
      kind: 'blocked',
      reason: 'noFolders',
    });
  });
});

describe('4. Przedłużenie on a raid wave', () => {
  it('gives every folder of the wave the time', () => {
    const raidTag = { kind: 'botRaid', raidId: 'raid1' } as const;
    const base = crewOf(['managingEditor'], 10_000, TEST_MAP, [
      onTable('f1', { deadlineMs: 20_000, tag: raidTag }),
      carriedBy('p1', 'f2', { deadlineMs: 20_000, tag: raidTag }),
      testFolder('f3', { deadlineMs: 20_000, tag: raidTag }),
    ]);
    const state: GameState = {
      ...base,
      activeEvents: [{ kind: 'botRaid', raidId: 'raid1', folderIds: ['f1', 'f2', 'f3'] }],
    };
    const run = press(state, ['p1']);
    for (const id of ['f1', 'f2', 'f3']) {
      expect(run.state.folders[id]).toMatchObject({ deadlineMs: 40_000, extendedMs: 20_000 });
    }
    expect(run.events).toEqual([
      {
        kind: 'ability',
        playerId: 'p1',
        ability: 'extendDeadline',
        stage: 'done',
        folderId: 'f2',
        addedMs: 20_000,
      },
    ]);
  });
});

describe('5. a press on the deadline tick', () => {
  it('lands before the folder expires', () => {
    const state = crewOf(['managingEditor'], 19_950, TEST_MAP, [
      onTable('f1', { deadlineMs: 20_000 }),
    ]);
    const run = runStep(
      state,
      {},
      [testCommand('p1', { kind: 'useAbility' })],
      testContext({ level: QUIET_LEVEL }),
    );
    expect(run.state.elapsedMs).toBe(20_000);
    expect(run.state.folders.f1?.deadlineMs).toBe(40_000);
    expect(ofKind(run.events, 'folderExpired')).toEqual([]);
    expect(ofKind(run.events, 'ability')).toHaveLength(1);
  });

  it('is too late without the press', () => {
    const state = crewOf(['managingEditor'], 19_950, TEST_MAP, [
      onTable('f1', { deadlineMs: 20_000 }),
    ]);
    const run = runStep(state, {}, [], testContext({ level: QUIET_LEVEL }));
    expect(run.state.folders.f1).toBeUndefined();
    expect(ofKind(run.events, 'folderExpired')).toHaveLength(1);
  });
});

describe('6. Koło ratunkowe', () => {
  /** A Ratownik (p1, one rescue from ROLE_PERKS) and a managing editor (p2). */
  function rescuer(folders: readonly Folder[], rescuesLeft?: number, elapsedMs = 30_000) {
    const state = crewOf(['rescuer', 'managingEditor'], elapsedMs, TEST_MAP, folders);
    return rescuesLeft === undefined ? state : withCrew(state, 'p1', { rescuesLeft });
  }

  it('gives the Ratownik one rescue', () => {
    expect(rescuer([]).crew.p1?.rescuesLeft).toBe(1);
  });

  it('saves a carried folder at its deadline once', () => {
    const state = rescuer([carriedBy('p1', 'f1', { deadlineMs: 30_000 })]);
    const run = press(state, []);
    expect(run.events).toEqual([
      { kind: 'folderRescued', playerId: 'p1', folderId: 'f1', addedMs: 20_000, folderIds: ['f1'] },
    ]);
    expect(run.state.folders.f1).toMatchObject({ deadlineMs: 50_000, extendedMs: 20_000 });
    expect(run.state.crew.p1?.rescuesLeft).toBe(0);

    const later = runStep(
      { ...run.state, elapsedMs: 50_000 - TICK_MS },
      {},
      [],
      testContext({ level: QUIET_LEVEL }),
    );
    expect(ofKind(later.events, 'folderRescued')).toEqual([]);
    expect(ofKind(later.events, 'folderExpired').map((e) => e.folderId)).toEqual(['f1']);
  });

  it('saves the whole raid wave together', () => {
    const raidTag = { kind: 'botRaid', raidId: 'raid1' } as const;
    const base = rescuer([
      carriedBy('p1', 'f1', { deadlineMs: 30_000, tag: raidTag }),
      onTable('f2', { deadlineMs: 30_000, tag: raidTag }),
    ]);
    const state: GameState = {
      ...base,
      activeEvents: [{ kind: 'botRaid', raidId: 'raid1', folderIds: ['f1', 'f2', 'f3'] }],
    };
    const run = press(state, []);
    expect(ofKind(run.events, 'folderRescued')[0]?.folderIds).toEqual(['f1', 'f2']);
    expect(run.state.folders.f2?.deadlineMs).toBe(50_000);
  });

  it('does nothing on a table, for another role, without rescues or before the deadline', () => {
    for (const state of [
      rescuer([onTable('f1', { deadlineMs: 30_000 })]),
      crewOf(['reporter'], 30_000, TEST_MAP, [carriedBy('p1', 'f1', { deadlineMs: 30_000 })]),
      rescuer([carriedBy('p1', 'f1', { deadlineMs: 30_000 })], 0),
      rescuer([carriedBy('p2', 'f1', { deadlineMs: 30_000 })]),
      rescuer([carriedBy('p1', 'f1', { deadlineMs: 30_050 })]),
    ]) {
      const run = press(state, []);
      expect(run.state).toBe(state);
      expect(run.events).toEqual([]);
    }
  });

  it('keeps the charge when Przedłużenie saves the folder on the same tick', () => {
    const state = rescuer([carriedBy('p1', 'f1', { deadlineMs: 30_000 })]);
    const run = press(state, ['p2']);
    expect(run.state.folders.f1?.deadlineMs).toBe(50_000);
    expect(run.state.crew.p1?.rescuesLeft).toBe(1);
    expect(run.events.map((e) => e.kind)).toEqual(['ability']);
  });
});

describe('7. Ekspertyza', () => {
  /** An armed photo editor below the image search, facing it, with f1 on the station. */
  function armedAt(x: number, stationId: string) {
    const state = crewOf(['photoEditor'], 10_000, TEST_MAP, [onStation('f1', stationId)]);
    return withCrew(placed(state, 'p1', x, 2.5), 'p1', { abilityArmed: true });
  }

  /** Steps the whole tick with p1 holding work until `until` or 200 ticks. */
  function holdWork(state: GameState, until: (events: readonly GameEvent[]) => boolean) {
    let current = state;
    const events: GameEvent[] = [];
    for (let seq = 1; seq <= 200; seq++) {
      const run = runStep(
        current,
        { p1: [testInput(seq, { x: 0, y: 0 }, { work: true })] },
        [],
        QUIET_CONTEXT,
      );
      current = run.state;
      events.push(...run.events);
      if (until(run.events)) {
        break;
      }
    }
    return { state: current, events };
  }

  it('arms away from a minigame and disarms on a second press', () => {
    const state = crewOf(['photoEditor']);
    expect(abilityPreview(state, 'p1', GREYBOX_ENV)).toEqual({ kind: 'arm' });
    const armed = press(state, ['p1']);
    expect(armed.events).toEqual([
      { kind: 'ability', playerId: 'p1', ability: 'expertise', stage: 'armed' },
    ]);
    expect(armed.state.crew.p1).toMatchObject({ abilityArmed: true, abilityReadyAtMs: 0 });
    expect(abilityPreview(armed.state, 'p1', GREYBOX_ENV)).toEqual({ kind: 'armed' });
    const disarmed = press(armed.state, ['p1']);
    expect(disarmed.events).toEqual([
      { kind: 'ability', playerId: 'p1', ability: 'expertise', stage: 'disarmed' },
    ]);
    expect(disarmed.state.crew.p1).toMatchObject({ abilityArmed: false, abilityReadyAtMs: 0 });
  });

  it('stamps after the 2.4 s hold at a station of its family instead of opening the minigame', () => {
    const run = holdWork(armedAt(8.5, 'imageSearch-0'), (events) =>
      events.some((e) => e.kind === 'stampApplied'),
    );
    expect(run.state.elapsedMs).toBe(12_450);
    expect(ofKind(run.events, 'minigameStarted')).toEqual([]);
    expect(run.events.filter((e) => e.kind !== 'workStarted')).toEqual([
      {
        kind: 'stampApplied',
        stationId: 'imageSearch-0',
        playerId: 'p1',
        folderId: 'f1',
        stampId: 't-true-image',
        via: 'expertise',
      },
      {
        kind: 'ability',
        playerId: 'p1',
        ability: 'expertise',
        stage: 'done',
        stationId: 'imageSearch-0',
        folderId: 'f1',
      },
    ]);
    expect(run.state.stations['imageSearch-0']).toMatchObject({ phase: 'idle', operatorId: null });
    expect(run.state.folders.f1?.stamps).toEqual(['t-true-image']);
    expect(run.state.crew.p1).toMatchObject({ abilityArmed: false, abilityReadyAtMs: 72_450 });
    expect(run.state.minigameAttempts).toEqual({});
  });

  it('opens the minigame as usual outside its family and stays armed', () => {
    const run = holdWork(armedAt(12.5, 'archive-0'), (events) =>
      events.some((e) => e.kind === 'minigameStarted'),
    );
    expect(run.state.elapsedMs).toBe(15_050);
    expect(ofKind(run.events, 'minigameStarted')).toHaveLength(1);
    expect(ofKind(run.events, 'stampApplied')).toEqual([]);
    expect(run.state.crew.p1).toMatchObject({ abilityArmed: true, abilityReadyAtMs: 0 });
  });

  it('solves a running minigame of its family at once; the late result is ignored', () => {
    const base = crewOf(['photoEditor'], 10_000, TEST_MAP, [onStation('f1', 'imageSearch-0')]);
    const state = withStation(placed(base, 'p1', 8.5, 2.5), 'imageSearch-0', {
      operatorId: 'p1',
      phase: 'minigame',
      progressMs: 2400,
      durationMs: 2400,
      minigameSeed: 99,
    });
    expect(abilityPreview(state, 'p1', GREYBOX_ENV)).toEqual({
      kind: 'now',
      stationId: 'imageSearch-0',
      folderId: 'f1',
    });
    const run = runStep(
      state,
      {},
      [testCommand('p1', { kind: 'useAbility' }), minigameResult('p1', 'imageSearch-0', false)],
      QUIET_CONTEXT,
    );
    expect(run.events.map((e) => e.kind)).toEqual(['stampApplied', 'ability']);
    expect(ofKind(run.events, 'stampApplied')[0]?.via).toBe('expertise');
    expect(run.state.stations['imageSearch-0']).toMatchObject({ phase: 'idle', lockoutMs: 0 });
    expect(run.state.folders.f1?.stamps).toEqual(['t-true-image']);
    expect(run.state.crew.p1?.abilityReadyAtMs).toBe(70_050);
  });

  it('arms in a minigame its family does not cover', () => {
    const base = crewOf(['photoEditor'], 10_000, TEST_MAP, [onStation('f1', 'archive-0')]);
    const state = withStation(base, 'archive-0', { operatorId: 'p1', phase: 'minigame' });
    expect(abilityPreview(state, 'p1', GREYBOX_ENV)).toEqual({ kind: 'arm' });
  });
});

describe('8. Telefon z terenu', () => {
  const start = 10_000;
  const calling = () =>
    crewOf(['reporter'], start, PHONE_MAP, [carriedBy('p1', 'f1', { storyId: 't-phone' })]);

  it('dials for 6 s, then stamps the folder as the phone station and cools down', () => {
    const pressed = press(calling(), ['p1'], PHONE_CONTEXT);
    expect(pressed.events).toEqual([
      { kind: 'ability', playerId: 'p1', ability: 'fieldCall', stage: 'started', folderId: 'f1' },
    ]);
    expect(pressed.state.crew.p1?.fieldCall).toEqual({ folderId: 'f1', endsAtMs: 16_000 });
    expect(abilityPreview(pressed.state, 'p1', GREYBOX_ENV)).toEqual({
      kind: 'calling',
      folderId: 'f1',
      endsAtMs: 16_000,
    });

    let state = pressed.state;
    const events: GameEvent[] = [];
    for (let tick = 0; tick < 120; tick++) {
      const run = runStep(state, {}, [], PHONE_CONTEXT);
      state = run.state;
      events.push(...run.events);
    }
    expect(state.elapsedMs).toBe(16_000);
    expect(events).toEqual([
      {
        kind: 'stampApplied',
        stationId: 'phone-0',
        playerId: 'p1',
        folderId: 'f1',
        stampId: 's-phone',
        via: 'fieldCall',
      },
      { kind: 'ability', playerId: 'p1', ability: 'fieldCall', stage: 'done', folderId: 'f1' },
    ]);
    expect(state.folders.f1?.stamps).toEqual(['s-phone']);
    expect(state.crew.p1?.fieldCall).toBeNull();
    expect(state.crew.p1?.abilityReadyAtMs).toBe(76_000);
  });

  it('is cancelled without a cooldown when the folder leaves the caller’s hands', () => {
    let state = press(calling(), ['p1'], PHONE_CONTEXT).state;
    for (let tick = 0; tick < 10; tick++) {
      state = runStep(state, {}, [], PHONE_CONTEXT).state;
    }
    const folder = must(state.folders.f1);
    state = {
      ...state,
      folders: { f1: { ...folder, location: { kind: 'fixture', fixtureId: 'table-0' } } },
    };
    const run = runStep(state, {}, [], PHONE_CONTEXT);
    expect(ofKind(run.events, 'ability')).toEqual([
      {
        kind: 'ability',
        playerId: 'p1',
        ability: 'fieldCall',
        stage: 'cancelled',
        folderId: 'f1',
        reason: 'dropped',
      },
    ]);
    expect(run.state.crew.p1).toMatchObject({ fieldCall: null, abilityReadyAtMs: 0 });
    expect(run.state.folders.f1?.stamps).toEqual([]);
  });

  it('is cancelled when the folder is gone', () => {
    const state = press(calling(), ['p1'], PHONE_CONTEXT).state;
    const run = press({ ...state, folders: {} }, [], PHONE_CONTEXT);
    expect(ofKind(run.events, 'ability')[0]).toMatchObject({ stage: 'cancelled', reason: 'gone' });
    expect(run.state.crew.p1?.abilityReadyAtMs).toBe(0);
  });

  it('is ignored without a phone station, a phone stamp or with the stamp already on', () => {
    const cases: [GameState, SimContext, AbilityBlockReason][] = [
      [
        crewOf(['reporter'], start, TEST_MAP, [carriedBy('p1', 'f1', { storyId: 't-phone' })]),
        testContext({ level: QUIET_LEVEL, stories: PHONE_CONTEXT.stories }),
        'noPhone',
      ],
      [crewOf(['reporter'], start, PHONE_MAP, [carriedBy('p1', 'f1')]), PHONE_CONTEXT, 'noStamp'],
      [
        crewOf(['reporter'], start, PHONE_MAP, [
          carriedBy('p1', 'f1', { storyId: 't-phone', stamps: ['s-phone'] }),
        ]),
        PHONE_CONTEXT,
        'noStamp',
      ],
      [crewOf(['reporter'], start, PHONE_MAP), PHONE_CONTEXT, 'noFolder'],
    ];
    for (const [state, ctx, reason] of cases) {
      const frame = frameFor(state, ['p1'], ctx);
      expect(abilityPreview(state, 'p1', abilityEnvOf(frame.ctx))).toEqual({
        kind: 'blocked',
        reason,
      });
      expect(stepAbilities(state, frame)).toBe(state);
      expect(frame.events).toEqual([]);
    }
  });
});

describe('9. Druga szansa', () => {
  /** A generalist at (x, y) and the archive locked out with f1 on it. */
  function lockedArchive(x: number, y: number, facing = FACING_UP) {
    const base = crewOf(['generalist'], 10_000, TEST_MAP, [onStation('f1', 'archive-0')]);
    return withStation(placed(base, 'p1', x, y, facing), 'archive-0', {
      phase: 'lockout',
      lockoutMs: 3000,
    });
  }

  it('reopens the faced locked station at once, without the hold', () => {
    const state = lockedArchive(12.5, 2.5);
    expect(abilityPreview(state, 'p1', GREYBOX_ENV)).toEqual({
      kind: 'now',
      stationId: 'archive-0',
      folderId: 'f1',
    });
    const seed = drawMinigameSeed(state, must(state.folders.f1), 'archive');
    const run = press(state, ['p1']);
    expect(run.events).toEqual([
      {
        kind: 'minigameStarted',
        stationId: 'archive-0',
        station: 'archive',
        playerId: 'p1',
        folderId: 'f1',
        seed,
      },
      {
        kind: 'ability',
        playerId: 'p1',
        ability: 'secondChance',
        stage: 'done',
        stationId: 'archive-0',
        folderId: 'f1',
      },
    ]);
    expect(run.state.stations['archive-0']).toMatchObject({
      phase: 'minigame',
      operatorId: 'p1',
      lockoutMs: 0,
      minigameSeed: seed,
      progressMs: 4000,
      durationMs: 4000,
    });
    expect(run.state.crew.p1).toMatchObject({ abilityArmed: false, abilityReadyAtMs: 70_000 });
  });

  it('reaches the nearest locked station within 2.5 tiles, else arms', () => {
    // Facing away, 2.24 tiles from the archive's centre.
    expect(abilityPreview(lockedArchive(10.5, 2.5, FACING_DOWN), 'p1', GREYBOX_ENV)).toEqual({
      kind: 'now',
      stationId: 'archive-0',
      folderId: 'f1',
    });
    // 3.61 tiles away.
    expect(abilityPreview(lockedArchive(9.5, 3.5, FACING_DOWN), 'p1', GREYBOX_ENV)).toEqual({
      kind: 'arm',
    });
    // A lockout without a folder is no target.
    const empty = { ...lockedArchive(12.5, 2.5), folders: {} };
    expect(abilityPreview(empty, 'p1', GREYBOX_ENV)).toEqual({ kind: 'arm' });
  });

  describe('armed', () => {
    /** p1 (`role`) plays the minigame at `stationId` with f1 on it. */
    function inMinigame(role: Role, stationId: string, armed: boolean) {
      const base = crewOf([role], 10_000, TEST_MAP, [onStation('f1', stationId)]);
      const state = withStation(base, stationId, {
        operatorId: 'p1',
        phase: 'minigame',
        progressMs: 4000,
        durationMs: 4000,
        minigameSeed: drawMinigameSeed(base, must(base.folders.f1), 'archive'),
      });
      return withCrew(state, 'p1', { abilityArmed: armed });
    }

    it('arms while the player operates a station', () => {
      const state = inMinigame('generalist', 'archive-0', false);
      expect(abilityPreview(state, 'p1', GREYBOX_ENV)).toEqual({ kind: 'arm' });
      expect(press(state, ['p1']).state.crew.p1?.abilityArmed).toBe(true);
    });

    it('turns a failure into a fresh round for the same operator, without the lockout', () => {
      const run = stationTick(
        inMinigame('generalist', 'archive-0', true),
        [],
        [minigameResult('p1', 'archive-0', false)],
      );
      expect(run.state.minigameAttempts).toEqual({ 's1:archive': 1 });
      const seed = drawMinigameSeed(run.state, must(run.state.folders.f1), 'archive');
      expect(run.events).toEqual([
        {
          kind: 'minigameFailed',
          stationId: 'archive-0',
          playerId: 'p1',
          folderId: 'f1',
          lockoutMs: 0,
        },
        {
          kind: 'ability',
          playerId: 'p1',
          ability: 'secondChance',
          stage: 'done',
          stationId: 'archive-0',
          folderId: 'f1',
        },
        {
          kind: 'minigameStarted',
          stationId: 'archive-0',
          station: 'archive',
          playerId: 'p1',
          folderId: 'f1',
          seed,
        },
      ]);
      expect(run.state.stations['archive-0']).toMatchObject({
        phase: 'minigame',
        operatorId: 'p1',
        lockoutMs: 0,
        minigameSeed: seed,
      });
      expect(run.state.crew.p1).toMatchObject({ abilityArmed: false, abilityReadyAtMs: 70_000 });
    });

    it('shows the same Kartoteka card again', () => {
      const state = inMinigame('generalist', 'sourceRegistry-0', true);
      const seed = drawMinigameSeed(state, must(state.folders.f1), 'sourceRegistry');
      const run = stationTick(state, [], [minigameResult('p1', 'sourceRegistry-0', false)]);
      expect(ofKind(run.events, 'minigameStarted')[0]?.seed).toBe(seed);
      expect(run.state.stations['sourceRegistry-0']?.minigameSeed).toBe(seed);
    });

    it('keeps the lockout without it, and for an armed Ekspertyza', () => {
      for (const state of [
        inMinigame('generalist', 'archive-0', false),
        inMinigame('photoEditor', 'archive-0', true),
      ]) {
        const run = stationTick(state, [], [minigameResult('p1', 'archive-0', false)]);
        expect(run.events).toEqual([
          {
            kind: 'minigameFailed',
            stationId: 'archive-0',
            playerId: 'p1',
            folderId: 'f1',
            lockoutMs: 3000,
          },
        ]);
        expect(run.state.stations['archive-0']).toMatchObject({
          phase: 'lockout',
          operatorId: null,
          lockoutMs: 3000,
        });
        expect(run.state.crew.p1).toEqual(state.crew.p1);
      }
    });
  });
});

describe('10. Podaj teczkę', () => {
  /** Ratownik p1 at (2.5, 2.5) carries f1; p3 at (3.5, 2.5) carries f2; p2 stands at (x, y). */
  function passScene(x = 5.5, y = 2.5) {
    const base = crewOf(['rescuer', null, null], 10_000, TEST_MAP, [
      carriedBy('p1', 'f1'),
      carriedBy('p3', 'f2'),
    ]);
    return placed(placed(placed(base, 'p1', 2.5, 2.5), 'p2', x, y), 'p3', 3.5, 2.5);
  }

  it('hands the carried folder to the nearest free teammate', () => {
    const state = passScene();
    expect(abilityPreview(state, 'p1', GREYBOX_ENV)).toEqual({
      kind: 'now',
      folderId: 'f1',
      targetPlayerId: 'p2',
    });
    const run = press(state, ['p1']);
    expect(run.events).toEqual([
      {
        kind: 'ability',
        playerId: 'p1',
        ability: 'passFolder',
        stage: 'done',
        folderId: 'f1',
        targetPlayerId: 'p2',
      },
    ]);
    expect(run.state.folders.f1?.location).toEqual({ kind: 'carried', playerId: 'p2' });
    expect(run.state.crew.p1).toMatchObject({ abilityArmed: false, abilityReadyAtMs: 70_000 });
  });

  it('reaches exactly 6 tiles', () => {
    expect(pickPassTarget(passScene(8.5), 'p1', GREYBOX_ENV)).toBe('p2');
  });

  it('passes to nobody beyond 6 tiles, at a station or desk, or away', () => {
    const away = passScene();
    const cases: [GameState, SimContext][] = [
      [passScene(8.6), QUIET_CONTEXT],
      [
        withStation(passScene(), 'imageSearch-0', { operatorId: 'p2', phase: 'working' }),
        QUIET_CONTEXT,
      ],
      [
        { ...away, desks: { ...away.desks, 'desk-0': { id: 'desk-0', operatorId: 'p2' } } },
        QUIET_CONTEXT,
      ],
      [away, testContext({ level: QUIET_LEVEL, absent: new Set(['p2']) })],
    ];
    for (const [state, ctx] of cases) {
      expect(abilityPreview(state, 'p1', abilityEnvOf(ctx))).toEqual({
        kind: 'blocked',
        reason: 'noTarget',
      });
      const run = press(state, ['p1'], ctx);
      expect(run.state).toBe(state);
      expect(run.events).toEqual([]);
    }
  });

  it('breaks a tie by join order', () => {
    // p2 and p3 both 3 tiles away and free.
    const state = placed(passScene(), 'p3', 2.5, 5.5);
    const { f2: _f2, ...folders } = state.folders;
    const tied = { ...state, folders };
    expect(pickPassTarget(tied, 'p1', GREYBOX_ENV)).toBe('p2');
    expect(pickPassTarget(placed(tied, 'p3', 2.5, 5.4), 'p1', GREYBOX_ENV)).toBe('p3');
  });

  it('needs a carried folder', () => {
    const { f1: _f1, ...folders } = passScene().folders;
    expect(abilityPreview({ ...passScene(), folders }, 'p1', GREYBOX_ENV)).toEqual({
      kind: 'blocked',
      reason: 'noFolder',
    });
  });
});

describe('11. ignored presses', () => {
  it('leaves the state untouched without a role', () => {
    const state = crewOf([null], 10_000, TEST_MAP, [onTable('f1')]);
    const run = press(state, ['p1']);
    expect(run.state).toBe(state);
    expect(run.events).toEqual([]);
    expect(abilityPreview(state, 'p1', GREYBOX_ENV)).toEqual({ kind: 'none' });
    expect(abilityPreview(state, 'p9', GREYBOX_ENV)).toEqual({ kind: 'none' });
  });

  it('leaves the state untouched while cooling, also for a second press in the same tick', () => {
    const state = crewOf(['managingEditor'], 10_000, TEST_MAP, [onTable('f1')]);
    const twice = press(state, ['p1', 'p1']);
    expect(twice.events).toHaveLength(1);
    expect(twice.state.folders.f1?.deadlineMs).toBe(80_000);
    expect(abilityPreview(twice.state, 'p1', GREYBOX_ENV)).toEqual({
      kind: 'cooling',
      readyAtMs: 70_000,
    });
    const cooling = { ...twice.state, elapsedMs: 40_000 };
    const run = press(cooling, ['p1']);
    expect(run.state).toBe(cooling);
    expect(run.events).toEqual([]);
  });
});

describe('12. speed bonus on the base deadline', () => {
  const story = must(TEST_STORIES['t-true']);
  const stamped = { stamps: ['t-true-image'], spawnedAtMs: 0 };

  it('ignores the time abilities added', () => {
    const extended = testFolder('f1', { ...stamped, deadlineMs: 80_000, extendedMs: 20_000 });
    const result = evaluateVerdict(story, extended, 'publish', ['t-true-image'], 35_000);
    expect(result.outcome).toBe('correct');
    expect(result.bonuses.speed).toBe(0);
  });

  it('still pays it for the same deadline set at spawn', () => {
    const plain = testFolder('f1', { ...stamped, deadlineMs: 80_000 });
    const result = evaluateVerdict(story, plain, 'publish', ['t-true-image'], 35_000);
    expect(result.bonuses.speed).toBe(SCORE.speedBonus);
  });
});

describe('13. ability preview per role', () => {
  it('previews the managing editor’s and the reporter’s press', () => {
    const state = crewOf(['managingEditor', 'reporter'], 10_000, TEST_MAP, [
      carriedBy('p2', 'f1', { storyId: 't-phone' }),
    ]);
    const env = abilityEnvOf(PHONE_CONTEXT);
    expect(abilityPreview(state, 'p1', env)).toEqual({ kind: 'now', folderId: 'f1' });
    // The greybox (like l0–l2) has no phone.
    expect(abilityPreview(state, 'p2', env)).toEqual({ kind: 'blocked', reason: 'noPhone' });
  });

  it('previews Ekspertyza, Druga szansa and Podaj teczkę on a fresh level', () => {
    const roles = ['photoEditor', 'archivist', 'generalist', 'rescuer'] as const;
    const greybox = crewOf(roles);
    const expected: Record<string, AbilityPreview> = {
      p1: { kind: 'arm' },
      p2: { kind: 'arm' },
      p3: { kind: 'arm' },
      p4: { kind: 'blocked', reason: 'noFolder' },
    };
    for (const [id, preview] of Object.entries(expected)) {
      expect(abilityPreview(greybox, id, GREYBOX_ENV)).toEqual(preview);
    }
    // Without a station of the family Ekspertyza has nothing to cover.
    expect(abilityPreview(crewOf(roles, 0, NO_IMAGE_MAP), 'p1', GREYBOX_ENV)).toEqual({
      kind: 'blocked',
      reason: 'noStation',
    });
    expect(abilityPreview(crewOf(roles, 0, NO_IMAGE_MAP), 'p2', GREYBOX_ENV)).toEqual({
      kind: 'arm',
    });
    expect(abilityPreview(crewOf(roles, 0, NO_ARCHIVE_MAP), 'p2', GREYBOX_ENV)).toEqual({
      kind: 'blocked',
      reason: 'noStation',
    });
  });
});
