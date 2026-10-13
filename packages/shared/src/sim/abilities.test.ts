import { describe, expect, it } from 'bun:test';
import { SCORE, TICK_MS } from '../constants.ts';
import type { Role } from '../domain.ts';
import type { Folder } from '../entities.ts';
import type { GameEvent } from '../protocol.ts';
import {
  runStep,
  TEST_LEVEL,
  TEST_MAP,
  TEST_STORIES,
  testCommand,
  testContext,
  testFolder,
} from './__fixtures__/greybox.ts';
import {
  type AbilityBlockReason,
  abilityEnvOf,
  abilityPreview,
  pickExtendTarget,
  stepAbilities,
} from './abilities.ts';
import type { SimStory } from './content.ts';
import { evaluateVerdict } from './desk.ts';
import type { SimContext, SimFrame } from './frame.ts';
import { GREYBOX_LAYOUT, parseLayout } from './map.ts';
import { addPlayer, createGameState, type GameState } from './state.ts';

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

function ofKind<K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) {
  return events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);
}

describe('1. ability state on join', () => {
  it('starts ready, unarmed, without a call; rescues follow ROLE_PERKS', () => {
    const state = crewOf(['reporter', 'managingEditor', null], 0);
    for (const id of ['p1', 'p2', 'p3']) {
      expect(state.crew[id]).toMatchObject({
        abilityReadyAtMs: 0,
        abilityArmed: false,
        fieldCall: null,
        rescuesLeft: 0,
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
  /** The rescue is keyed on `rescuesLeft`, so any crew member with a charge stands in for it. */
  function rescuer(folders: readonly Folder[], rescuesLeft = 1, elapsedMs = 30_000) {
    return withCrew(crewOf(['reporter', 'managingEditor'], elapsedMs, TEST_MAP, folders), 'p1', {
      rescuesLeft,
    });
  }

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

  it('does nothing on a table, without rescues or before the deadline', () => {
    for (const state of [
      rescuer([onTable('f1', { deadlineMs: 30_000 })]),
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

describe('13. ability preview (S7-37 rules)', () => {
  it('previews the managing editor’s and the reporter’s press', () => {
    const state = crewOf(['managingEditor', 'reporter'], 10_000, TEST_MAP, [
      carriedBy('p2', 'f1', { storyId: 't-phone' }),
    ]);
    const env = abilityEnvOf(PHONE_CONTEXT);
    expect(abilityPreview(state, 'p1', env)).toEqual({ kind: 'now', folderId: 'f1' });
    // The greybox (like l0–l2) has no phone.
    expect(abilityPreview(state, 'p2', env)).toEqual({ kind: 'blocked', reason: 'noPhone' });
  });
});
