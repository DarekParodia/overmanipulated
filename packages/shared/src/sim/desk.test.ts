import { describe, expect, it } from 'bun:test';
import type { Priority, Truth, Verdict } from '../domain.ts';
import { correctVerdictFor } from '../domain.ts';
import type { Folder } from '../entities.ts';
import type { GameEvent } from '../protocol.ts';
import {
  runStep,
  TEST_MAP,
  TEST_STORIES,
  testCommand,
  testContext,
  testInput,
} from './__fixtures__/greybox.ts';
import type { SimStory } from './content.ts';
import { canExtendDeadline, evaluateVerdict, stepDesk } from './desk.ts';
import type { QueuedCommand, SimFrame } from './frame.ts';
import { addPlayer, createGameState, type GameState } from './state.ts';

function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('missing test fixture value');
  }
  return value;
}

/** Row 6, col 9; players spawn facing down (+π/2), i.e. at desk-0 (row 7, col 9). */
const AT_DESK = { x: 9.5, y: 6.5 };

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'f1',
    storyId: 't-true',
    location: { kind: 'fixture', fixtureId: 'desk-0' },
    stamps: ['t-true-image'],
    spawnedAtMs: 0,
    deadlineMs: 60_000,
    warned: false,
    ...overrides,
  };
}

function story(truth: Truth, priority: Priority): SimStory {
  return {
    id: 's',
    type: 'photo',
    truth,
    priority,
    correctVerdict: correctVerdictFor(truth, priority),
    stamps: [
      { id: 's-image', station: 'imageSearch', relevance: 'decisive' },
      { id: 's-archive', station: 'archive', relevance: 'irrelevant' },
    ],
    justifyingStamps: ['s-image'],
  };
}

const collected = (overrides: Partial<Folder> = {}): Folder =>
  folder({ storyId: 's', stamps: ['s-image'], ...overrides });

/** A state with player p1 at desk-0 and the given folder on it. */
function deskState(f: Folder = folder(), players = 1): GameState {
  let state = createGameState({ map: TEST_MAP, seed: 7 });
  for (let i = 1; i <= players; i++) {
    // Players pass through each other, so p2 can stand at the desk too.
    state = addPlayer(state, `p${i}`, i <= 2 ? AT_DESK : { x: 2.5, y: 2.5 });
  }
  return { ...state, folders: { [f.id]: f } };
}

function frameFor(
  state: GameState,
  commands: QueuedCommand[] = [],
  intents: Partial<Record<string, { work?: boolean; moving?: boolean }>> = {},
): SimFrame {
  const all: SimFrame['intents'] = Object.fromEntries(
    Object.keys(state.players).map((id) => [
      id,
      { interact: false, work: intents[id]?.work ?? false, moving: intents[id]?.moving ?? false },
    ]),
  );
  return { ctx: testContext(), intents: all, commands, events: [] };
}

function withOperator(state: GameState, playerId = 'p1'): GameState {
  return { ...state, desks: { ...state.desks, 'desk-0': { id: 'desk-0', operatorId: playerId } } };
}

function kinds(events: GameEvent[]): string[] {
  return events.map((e) => e.kind);
}

describe('evaluateVerdict — scoring table', () => {
  it('gives +10 for a correct verdict on a normal story', () => {
    const r = evaluateVerdict(story('true', 'normal'), collected(), 'publish', 's-image', 40_000);
    expect(r).toMatchObject({ outcome: 'correct', scoreDelta: 10, credibilityDelta: 0 });
  });

  it('gives +20 and +5 credibility for a correct verdict on an important story', () => {
    const r = evaluateVerdict(
      story('false', 'important'),
      collected(),
      'reject',
      's-image',
      40_000,
    );
    expect(r).toMatchObject({ outcome: 'correct', scoreDelta: 20, credibilityDelta: 5 });
  });

  it('gives +20 and +5 credibility for a correct verdict on an urgent story', () => {
    const r = evaluateVerdict(story('true', 'urgent'), collected(), 'publish', 's-image', 40_000);
    expect(r).toMatchObject({ outcome: 'correct', scoreDelta: 20, credibilityDelta: 5 });
  });

  it('gives +30 and +5 credibility for a correct "publish with context", whatever the priority', () => {
    for (const priority of ['normal', 'urgent'] as const) {
      const r = evaluateVerdict(
        story('misleading', priority),
        collected(),
        'publishWithContext',
        's-image',
        40_000,
      );
      expect(r).toMatchObject({ outcome: 'correct', scoreDelta: 30, credibilityDelta: 5 });
    }
  });

  it('adds a +5 speed bonus when more than half of the folder time is left', () => {
    const f = collected({ spawnedAtMs: 10_000, deadlineMs: 70_000 });
    const fast = evaluateVerdict(story('true', 'normal'), f, 'publish', 's-image', 39_999);
    expect(fast).toMatchObject({ scoreDelta: 15, speedBonus: true });
    // Exactly half left is not "more than half".
    const boundary = evaluateVerdict(story('true', 'normal'), f, 'publish', 's-image', 40_000);
    expect(boundary).toMatchObject({ scoreDelta: 10, speedBonus: false });
  });

  it('takes 20 points and 25 credibility for a published fake', () => {
    const r = evaluateVerdict(story('false', 'normal'), collected(), 'publish', 's-image', 0);
    expect(r).toMatchObject({ outcome: 'wrong', scoreDelta: -20, credibilityDelta: -25 });
  });

  it('takes 10 points and 10 credibility for a rejected true story', () => {
    const r = evaluateVerdict(story('true', 'normal'), collected(), 'reject', 's-image', 0);
    expect(r).toMatchObject({ outcome: 'wrong', scoreDelta: -10, credibilityDelta: -10 });
  });

  it('never pays a speed bonus for a wrong verdict', () => {
    const r = evaluateVerdict(story('true', 'normal'), collected(), 'reject', 's-image', 0);
    expect(r.speedBonus).toBe(false);
  });
});

describe('evaluateVerdict — truth × priority × verdict matrix', () => {
  type Row = [Truth, Verdict, string, number, number];
  // [truth, verdict, outcome, score (normal priority, no speed bonus), credibility]
  const rows: Row[] = [
    ['true', 'publish', 'correct', 10, 0],
    ['true', 'reject', 'wrong', -10, -10],
    ['true', 'publishWithContext', 'wrong', -5, 0],
    ['false', 'publish', 'wrong', -20, -25],
    ['false', 'reject', 'correct', 10, 0],
    ['false', 'publishWithContext', 'wrong', -20, -25],
    ['misleading', 'publish', 'wrong', -10, -10],
    ['misleading', 'reject', 'wrong', -5, 0],
    ['misleading', 'publishWithContext', 'correct', 30, 5],
    ['satire', 'publish', 'wrong', -10, -10],
    ['satire', 'reject', 'wrong', -5, 0],
    ['satire', 'publishWithContext', 'correct', 30, 5],
    ['unverifiable', 'publish', 'wrong', -20, -25],
    ['unverifiable', 'reject', 'correct', 10, 0],
    ['unverifiable', 'publishWithContext', 'wrong', -20, -25],
  ];
  const priorities: Priority[] = ['normal', 'important', 'urgent'];
  for (const [truth, verdict, outcome, score, credibility] of rows) {
    for (const priority of priorities) {
      it(`${truth} / ${priority} / ${verdict} → ${outcome}`, () => {
        // Half the time is used up: no speed bonus.
        const r = evaluateVerdict(story(truth, priority), collected(), verdict, 's-image', 30_000);
        const raisedByPriority =
          outcome === 'correct' && verdict !== 'publishWithContext' && priority !== 'normal';
        expect(r.outcome).toBe(outcome as typeof r.outcome);
        expect(r.scoreDelta).toBe(raisedByPriority ? 20 : score);
        expect(r.credibilityDelta).toBe(raisedByPriority ? 5 : credibility);
        expect(r.speedBonus).toBe(false);
      });
    }
  }
});

describe('evaluateVerdict — justification', () => {
  it('halves the points and gives no credibility for a non-justifying stamp', () => {
    const f = collected({ stamps: ['s-image', 's-archive'] });
    const r = evaluateVerdict(story('false', 'urgent'), f, 'reject', 's-archive', 0);
    expect(r).toMatchObject({
      outcome: 'wrongJustification',
      scoreDelta: 10,
      credibilityDelta: 0,
      speedBonus: false,
    });
  });

  it('treats an uncollected justifying stamp as a wrong justification and reports it missed', () => {
    const f = collected({ stamps: ['s-archive'] });
    const r = evaluateVerdict(story('misleading', 'normal'), f, 'publishWithContext', 's-image', 0);
    expect(r).toMatchObject({ outcome: 'wrongJustification', scoreDelta: 15, credibilityDelta: 0 });
    expect(r.missedStampIds).toEqual(['s-image']);
  });

  it('applies the full wrong-verdict penalty regardless of the justification', () => {
    const r = evaluateVerdict(story('false', 'normal'), collected(), 'publish', 's-archive', 0);
    expect(r).toMatchObject({ outcome: 'wrong', scoreDelta: -20, credibilityDelta: -25 });
  });
});

describe('stepDesk — opening and closing', () => {
  it('opens the sheet for a player holding work at a desk with a folder', () => {
    const state = deskState();
    const frame = frameFor(state, [], { p1: { work: true } });
    const next = stepDesk(state, frame);
    expect(next.desks['desk-0']?.operatorId).toBe('p1');
    expect(frame.events).toEqual([
      { kind: 'deskOpened', deskId: 'desk-0', playerId: 'p1', folderId: 'f1' },
    ]);
  });

  it('does not open an empty desk, without work held, or while moving', () => {
    const empty = { ...deskState(), folders: {} };
    expect(
      stepDesk(empty, frameFor(empty, [], { p1: { work: true } })).desks['desk-0']?.operatorId,
    ).toBeNull();
    const state = deskState();
    expect(stepDesk(state, frameFor(state)).desks['desk-0']?.operatorId).toBeNull();
    const moving = frameFor(state, [], { p1: { work: true, moving: true } });
    expect(stepDesk(state, moving).desks['desk-0']?.operatorId).toBeNull();
  });

  it('does not open a desk someone else operates, or for a player operating a station', () => {
    const taken = withOperator(deskState(folder(), 2), 'p2');
    const frame = frameFor(taken, [], { p1: { work: true } });
    expect(stepDesk(taken, frame).desks['desk-0']?.operatorId).toBe('p2');
    const busy = deskState();
    const stations = { ...busy.stations };
    stations['imageSearch-0'] = { ...must(stations['imageSearch-0']), operatorId: 'p1' };
    const atStation = { ...busy, stations };
    expect(
      stepDesk(atStation, frameFor(atStation, [], { p1: { work: true } })).desks['desk-0']
        ?.operatorId,
    ).toBeNull();
  });

  it('closes on cancel and does not reopen in the same tick', () => {
    const state = withOperator(deskState());
    const frame = frameFor(state, [testCommand('p1', { kind: 'cancel' })], { p1: { work: true } });
    const next = stepDesk(state, frame);
    expect(next.desks['desk-0']?.operatorId).toBeNull();
    expect(frame.events).toEqual([{ kind: 'deskClosed', deskId: 'desk-0', playerId: 'p1' }]);
  });

  it('keeps the sheet open while the operator stands still without holding work', () => {
    const state = withOperator(deskState());
    const frame = frameFor(state);
    expect(stepDesk(state, frame)).toBe(state);
    expect(frame.events).toEqual([]);
  });

  it('closes when the operator moves or walks away', () => {
    const state = withOperator(deskState());
    expect(
      stepDesk(state, frameFor(state, [], { p1: { moving: true } })).desks['desk-0']?.operatorId,
    ).toBeNull();
    const away = { ...state, players: { p1: { ...must(state.players.p1), x: 2.5, y: 2.5 } } };
    const frame = frameFor(away);
    expect(stepDesk(away, frame).desks['desk-0']?.operatorId).toBeNull();
    expect(kinds(frame.events)).toEqual(['deskClosed']);
  });

  it('closes when the folder disappears from the desk', () => {
    const state = { ...withOperator(deskState()), folders: {} };
    const frame = frameFor(state);
    expect(stepDesk(state, frame).desks['desk-0']?.operatorId).toBeNull();
    expect(kinds(frame.events)).toEqual(['deskClosed']);
  });
});

describe('stepDesk — verdicts', () => {
  const verdict = (v: Verdict, stampId = 't-true-image', folderId = 'f1') =>
    testCommand('p1', { kind: 'verdict', folderId, verdict: v, justifyingStampId: stampId });

  it('resolves the folder, frees the desk and records the result', () => {
    const state = { ...withOperator(deskState()), elapsedMs: 40_000 };
    const frame = frameFor(state, [verdict('publish')]);
    const next = stepDesk(state, frame);
    expect(next.folders).toEqual({});
    expect(next.desks['desk-0']?.operatorId).toBeNull();
    expect(next.score).toBe(10);
    expect(next.results).toEqual([
      {
        folderId: 'f1',
        storyId: 't-true',
        outcome: 'correct',
        verdict: 'publish',
        scoreDelta: 10,
        credibilityDelta: 0,
        missedStampIds: [],
      },
    ]);
    expect(frame.events).toEqual([
      {
        kind: 'verdictResult',
        folderId: 'f1',
        storyId: 't-true',
        playerId: 'p1',
        verdict: 'publish',
        justifyingStampId: 't-true-image',
        outcome: 'correct',
        scoreDelta: 10,
        credibilityDelta: 0,
        speedBonus: false,
        missedStampIds: [],
      },
      { kind: 'deskClosed', deskId: 'desk-0', playerId: 'p1' },
    ]);
  });

  it('applies the credibility loss of a wrong verdict', () => {
    const state = withOperator(deskState(folder({ storyId: 't-false', stamps: [] })));
    const next = stepDesk(state, frameFor(state, [verdict('publish', 't-false-image')]));
    expect(next.score).toBe(-20);
    expect(next.credibility).toBe(75);
    expect(next.results[0]?.missedStampIds).toEqual(['t-false-image']);
  });

  it('clamps credibility at the maximum', () => {
    const state = withOperator(
      deskState(folder({ storyId: 't-false', stamps: ['t-false-image'] })),
    );
    const next = stepDesk(state, frameFor(state, [verdict('reject', 't-false-image')]));
    expect(next.credibility).toBe(100);
    expect(next.results[0]?.credibilityDelta).toBe(5);
  });

  it('clamps credibility at zero', () => {
    const state = {
      ...withOperator(deskState(folder({ storyId: 't-false' }))),
      credibility: 10,
    };
    const next = stepDesk(state, frameFor(state, [verdict('publish')]));
    expect(next.credibility).toBe(0);
  });

  it('accepts a verdict sent in the same tick as a stray movement input', () => {
    const state = withOperator(deskState());
    const frame = frameFor(state, [verdict('publish')], { p1: { moving: true } });
    const next = stepDesk(state, frame);
    expect(next.folders).toEqual({});
    expect(kinds(frame.events)).toEqual(['verdictResult', 'deskClosed']);
  });

  it('ignores verdicts from a non-operator or for another folder', () => {
    const state = withOperator(deskState(folder(), 2), 'p2');
    const frame = frameFor(state, [verdict('publish')]);
    expect(stepDesk(state, frame).folders.f1).toBeDefined();
    const own = withOperator(deskState());
    const wrongFolder = frameFor(own, [verdict('publish', 't-true-image', 'f9')]);
    expect(stepDesk(own, wrongFolder).folders.f1).toBeDefined();
    expect(kinds(wrongFolder.events)).toEqual([]);
  });
});

describe('stepDesk — deadline extension', () => {
  const extend = (playerId: string, folderId = 'f1') =>
    testCommand(playerId, { kind: 'extendDeadline', folderId });

  function withRoles(state: GameState, roles: Record<string, 'managingEditor' | 'archivist'>) {
    const crew = { ...state.crew };
    for (const [id, role] of Object.entries(roles)) {
      crew[id] = { ...must(crew[id]), role };
    }
    return { ...state, crew };
  }

  it('extends a folder deadline by 20 s once per level for the managing editor', () => {
    const state = withRoles(deskState(folder({ warned: true }), 4), { p2: 'managingEditor' });
    const frame = frameFor(state, [extend('p2')]);
    const next = stepDesk(state, frame);
    expect(next.folders.f1?.deadlineMs).toBe(80_000);
    expect(next.folders.f1?.warned).toBe(false);
    expect(next.deadlineExtensionUsed).toBe(true);
    expect(frame.events).toEqual([{ kind: 'deadlineExtended', folderId: 'f1', playerId: 'p2' }]);
    const again = frameFor(next, [extend('p2')]);
    expect(stepDesk(next, again).folders.f1?.deadlineMs).toBe(80_000);
    expect(again.events).toEqual([]);
  });

  it('refuses other players when someone is managing editor', () => {
    const state = withRoles(deskState(folder(), 3), { p2: 'managingEditor' });
    const frame = frameFor(state, [extend('p1')]);
    expect(stepDesk(state, frame).deadlineExtensionUsed).toBe(false);
  });

  it('lets anyone extend with three players and no managing editor, but not with four', () => {
    const three = deskState(folder(), 3);
    expect(canExtendDeadline(three, 'p3')).toBe(true);
    expect(stepDesk(three, frameFor(three, [extend('p3')])).deadlineExtensionUsed).toBe(true);
    const four = deskState(folder(), 4);
    expect(canExtendDeadline(four, 'p3')).toBe(false);
  });

  it('requires an existing folder', () => {
    const state = withRoles(deskState(), { p1: 'managingEditor' });
    const frame = frameFor(state, [extend('p1', 'f9')]);
    expect(stepDesk(state, frame).deadlineExtensionUsed).toBe(false);
  });
});

describe('desk scenario via step', () => {
  it('opens the desk, takes a verdict and scores it', () => {
    const f = folder({ deadlineMs: 600_000, stamps: ['t-true-image'] });
    let state = deskState(f);
    const opened = runStep(state, { p1: [testInput(0, { x: 0, y: 0 }, { work: true })] });
    state = opened.state;
    expect(opened.events).toContainEqual({
      kind: 'deskOpened',
      deskId: 'desk-0',
      playerId: 'p1',
      folderId: 'f1',
    });
    // The overlay captures input: the world receives neutral input.
    const decided = runStep(state, { p1: [testInput(1)] }, [
      testCommand('p1', {
        kind: 'verdict',
        folderId: 'f1',
        verdict: 'publish',
        justifyingStampId: 't-true-image',
      }),
    ]);
    const result = decided.events.find((e) => e.kind === 'verdictResult');
    expect(result).toMatchObject({ outcome: 'correct', scoreDelta: 15, speedBonus: true });
    expect(decided.state.score).toBe(15);
    expect(decided.state.desks['desk-0']?.operatorId).toBeNull();
    expect(decided.state.folders.f1).toBeUndefined();
    expect(TEST_STORIES['t-true']?.correctVerdict).toBe('publish');
  });
});
