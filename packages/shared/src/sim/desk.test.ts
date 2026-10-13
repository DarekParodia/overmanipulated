import { describe, expect, it } from 'bun:test';
import { simTuning } from '../difficulty.ts';
import type { Priority, Truth, Verdict } from '../domain.ts';
import { correctVerdictFor } from '../domain.ts';
import type { Folder, FolderReason, FolderResult } from '../entities.ts';
import { type GameEvent, gameEventSchema } from '../protocol.ts';
import {
  runStep,
  TEST_MAP,
  TEST_STORIES,
  testCommand,
  testContext,
  testFolder,
  testInput,
} from './__fixtures__/greybox.ts';
import { countsAsProof, type SimStory } from './content.ts';
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
  return testFolder(overrides.id ?? 'f1', {
    location: { kind: 'fixture', fixtureId: 'desk-0' },
    stamps: ['t-true-image'],
    ...overrides,
  });
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
  ctx = testContext(),
): SimFrame {
  const all: SimFrame['intents'] = Object.fromEntries(
    Object.keys(state.players).map((id) => [
      id,
      { interact: false, work: intents[id]?.work ?? false, moving: intents[id]?.moving ?? false },
    ]),
  );
  return { ctx, intents: all, commands, events: [] };
}

function withOperator(state: GameState, playerId = 'p1'): GameState {
  return { ...state, desks: { ...state.desks, 'desk-0': { id: 'desk-0', operatorId: playerId } } };
}

function kinds(events: GameEvent[]): string[] {
  return events.map((e) => e.kind);
}

describe('evaluateVerdict — scoring table', () => {
  it('gives +10 for a correct verdict on a normal story', () => {
    const r = evaluateVerdict(story('true', 'normal'), collected(), 'publish', ['s-image'], 40_000);
    expect(r).toEqual({
      outcome: 'correct',
      reason: 'correctNormal',
      scoreDelta: 10,
      credibilityDelta: 0,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    });
  });

  it('gives +20 and +5 credibility for a correct verdict on an important story', () => {
    const r = evaluateVerdict(
      story('false', 'important'),
      collected(),
      'reject',
      ['s-image'],
      40_000,
    );
    expect(r).toMatchObject({
      outcome: 'correct',
      reason: 'correctImportant',
      scoreDelta: 20,
      credibilityDelta: 5,
    });
  });

  it('gives +20 and +5 credibility for a correct verdict on an urgent story', () => {
    const r = evaluateVerdict(story('true', 'urgent'), collected(), 'publish', ['s-image'], 40_000);
    expect(r).toMatchObject({ outcome: 'correct', scoreDelta: 20, credibilityDelta: 5 });
  });

  it('gives +30 and +5 credibility for a correct "publish with context", whatever the priority', () => {
    for (const priority of ['normal', 'urgent'] as const) {
      const r = evaluateVerdict(
        story('misleading', priority),
        collected(),
        'publishWithContext',
        ['s-image'],
        40_000,
      );
      expect(r).toMatchObject({
        outcome: 'correct',
        reason: 'correctWithContext',
        scoreDelta: 30,
        credibilityDelta: 5,
      });
    }
  });

  it('adds a +5 speed bonus when more than half of the folder time is left', () => {
    const f = collected({ spawnedAtMs: 10_000, deadlineMs: 70_000 });
    const fast = evaluateVerdict(story('true', 'normal'), f, 'publish', ['s-image'], 39_999);
    expect(fast).toMatchObject({
      scoreDelta: 15,
      bonuses: { speed: 5, multiStamp: 0, bossCall: 0 },
    });
    // Exactly half left is not "more than half".
    const boundary = evaluateVerdict(story('true', 'normal'), f, 'publish', ['s-image'], 40_000);
    expect(boundary).toMatchObject({ scoreDelta: 10, bonuses: { speed: 0 } });
  });

  it('takes 20 points and 25 credibility for a published fake', () => {
    const r = evaluateVerdict(story('false', 'normal'), collected(), 'publish', ['s-image'], 0);
    expect(r).toMatchObject({
      outcome: 'wrong',
      reason: 'publishedFake',
      scoreDelta: -20,
      credibilityDelta: -25,
    });
  });

  it('takes 10 points and 10 credibility for a rejected true story', () => {
    const r = evaluateVerdict(story('true', 'normal'), collected(), 'reject', ['s-image'], 0);
    expect(r).toMatchObject({
      outcome: 'wrong',
      reason: 'rejectedTrue',
      scoreDelta: -10,
      credibilityDelta: -10,
    });
  });

  it('never pays a speed bonus for a wrong verdict', () => {
    const r = evaluateVerdict(story('true', 'normal'), collected(), 'reject', ['s-image'], 0);
    expect(r.bonuses).toEqual({ speed: 0, multiStamp: 0, bossCall: 0 });
  });
});

describe('evaluateVerdict — difficulty (Stage 7)', () => {
  const fake = story('false', 'normal');

  it('takes 30 points and 38 credibility for a published fake on expert', () => {
    const r = evaluateVerdict(fake, collected(), 'publish', ['s-image'], 0, simTuning('expert'));
    expect(r).toMatchObject({ reason: 'publishedFake', scoreDelta: -30, credibilityDelta: -38 });
  });

  it('takes 10 points and 13 credibility for a published fake on easy', () => {
    const r = evaluateVerdict(fake, collected(), 'publish', ['s-image'], 0, simTuning('easy'));
    expect(r).toMatchObject({ reason: 'publishedFake', scoreDelta: -10, credibilityDelta: -13 });
  });

  it('scales the penalties the table adds for context stories', () => {
    const r = evaluateVerdict(
      story('misleading', 'normal'),
      collected(),
      'publish',
      ['s-image'],
      0,
      simTuning('hard'),
    );
    expect(r).toMatchObject({
      reason: 'publishedWithoutContext',
      scoreDelta: -13,
      credibilityDelta: -13,
    });
  });

  it('never scales a reward, a half reward or the speed bonus', () => {
    const expert = simTuning('expert');
    const fast = evaluateVerdict(
      story('misleading', 'normal'),
      collected(),
      'publishWithContext',
      ['s-image'],
      0,
      expert,
    );
    expect(fast).toMatchObject({ scoreDelta: 35, credibilityDelta: 5 });
    const weak = evaluateVerdict(
      story('true', 'important'),
      collected(),
      'publish',
      ['s-archive'],
      30_000,
      expert,
    );
    expect(weak).toMatchObject({ reason: 'weakProof', scoreDelta: 10, credibilityDelta: 0 });
  });
});

describe('evaluateVerdict — truth × priority × verdict matrix', () => {
  type Row = [Truth, Verdict, string, FolderReason, number, number];
  // [truth, verdict, outcome, reason (normal priority), score (no speed bonus), credibility]
  const rows: Row[] = [
    ['true', 'publish', 'correct', 'correctNormal', 10, 0],
    ['true', 'reject', 'wrong', 'rejectedTrue', -10, -10],
    ['true', 'publishWithContext', 'wrong', 'contextOnTrue', -5, 0],
    ['false', 'publish', 'wrong', 'publishedFake', -20, -25],
    ['false', 'reject', 'correct', 'correctNormal', 10, 0],
    ['false', 'publishWithContext', 'wrong', 'publishedFake', -20, -25],
    ['misleading', 'publish', 'wrong', 'publishedWithoutContext', -10, -10],
    ['misleading', 'reject', 'wrong', 'rejectedContextStory', -5, 0],
    ['misleading', 'publishWithContext', 'correct', 'correctWithContext', 30, 5],
    ['satire', 'publish', 'wrong', 'publishedWithoutContext', -10, -10],
    ['satire', 'reject', 'wrong', 'rejectedContextStory', -5, 0],
    ['satire', 'publishWithContext', 'correct', 'correctWithContext', 30, 5],
    ['unverifiable', 'publish', 'wrong', 'publishedFake', -20, -25],
    ['unverifiable', 'reject', 'correct', 'correctNormal', 10, 0],
    ['unverifiable', 'publishWithContext', 'wrong', 'publishedFake', -20, -25],
  ];
  const priorities: Priority[] = ['normal', 'important', 'urgent'];
  for (const [truth, verdict, outcome, reason, score, credibility] of rows) {
    for (const priority of priorities) {
      it(`${truth} / ${priority} / ${verdict} → ${outcome}`, () => {
        // Half the time is used up: no speed bonus.
        const r = evaluateVerdict(
          story(truth, priority),
          collected(),
          verdict,
          ['s-image'],
          30_000,
        );
        const raisedByPriority = reason === 'correctNormal' && priority !== 'normal';
        expect(r.outcome).toBe(outcome as typeof r.outcome);
        expect(r.reason).toBe(raisedByPriority ? 'correctImportant' : reason);
        expect(r.scoreDelta).toBe(raisedByPriority ? 20 : score);
        expect(r.credibilityDelta).toBe(raisedByPriority ? 5 : credibility);
        expect(r.bonuses.speed).toBe(0);
      });
    }
  }
});

describe('evaluateVerdict — justification', () => {
  it('halves the points and gives no credibility for a non-justifying stamp', () => {
    const f = collected({ stamps: ['s-image', 's-archive'] });
    const r = evaluateVerdict(story('false', 'urgent'), f, 'reject', ['s-archive'], 0);
    expect(r).toEqual({
      outcome: 'wrongJustification',
      reason: 'weakProof',
      scoreDelta: 10,
      credibilityDelta: 0,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    });
  });

  it('treats an uncollected justifying stamp as a wrong justification and reports it missed', () => {
    const f = collected({ stamps: ['s-archive'] });
    const r = evaluateVerdict(
      story('misleading', 'normal'),
      f,
      'publishWithContext',
      ['s-image'],
      0,
    );
    expect(r).toMatchObject({
      outcome: 'wrongJustification',
      reason: 'weakProof',
      scoreDelta: 15,
      credibilityDelta: 0,
    });
    expect(r.missedStampIds).toEqual(['s-image']);
  });

  it('applies the full wrong-verdict penalty regardless of the justification', () => {
    const r = evaluateVerdict(story('false', 'normal'), collected(), 'publish', ['s-archive'], 0);
    expect(r).toMatchObject({ outcome: 'wrong', scoreDelta: -20, credibilityDelta: -25 });
  });
});

describe('evaluateVerdict — cited proof (Stage 7)', () => {
  /** Two thirds of the folder time used: no speed bonus muddies the points. */
  const LATE = 40_000;
  /** A normal story with the given justifying stamps; every stamp below exists on it. */
  function proofStory(truth: Truth, justifyingStamps: string[]): SimStory {
    return {
      ...story(truth, 'normal'),
      stamps: [
        { id: 's-image', station: 'imageSearch', relevance: 'decisive' },
        { id: 's-archive', station: 'archive', relevance: 'decisive' },
        { id: 's-source', station: 'sourceRegistry', relevance: 'irrelevant' },
        { id: 's-ai', station: 'aiScanner', relevance: 'decisive' },
        { id: 's-phone', station: 'phone', relevance: 'decisive' },
      ],
      justifyingStamps,
    };
  }

  it('reports nothing missed after a correct verdict, even with a justifying stamp left unchecked', () => {
    const twoJustifying = proofStory('false', ['s-image', 's-archive']);
    const f = collected({ stamps: ['s-image'] });
    const r = evaluateVerdict(twoJustifying, f, 'reject', ['s-image'], LATE);
    expect(r).toEqual({
      outcome: 'correct',
      reason: 'correctNormal',
      scoreDelta: 10,
      credibilityDelta: 0,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    });
    // Errors still name what the folder lacked.
    const wrong = evaluateVerdict(twoJustifying, f, 'publish', ['s-image'], LATE);
    expect(wrong.missedStampIds).toEqual(['s-archive']);
  });

  it('calls the proof weak when any cited stamp is not valid proof', () => {
    const f = collected({ stamps: ['s-image'] });
    const r = evaluateVerdict(
      proofStory('false', ['s-image']),
      f,
      'reject',
      ['s-image', 's-source'],
      LATE,
    );
    expect(r).toEqual({
      outcome: 'wrongJustification',
      reason: 'weakProof',
      scoreDelta: 5,
      credibilityDelta: 0,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    });
  });

  it('never counts the hint-only AI scanner as proof', () => {
    const scanned = proofStory('true', ['s-ai', 's-phone']);
    const f = collected({ stamps: ['s-ai', 's-phone'] });
    const aiOnly = evaluateVerdict(scanned, f, 'publish', ['s-ai'], LATE);
    expect(aiOnly).toEqual({
      outcome: 'wrongJustification',
      reason: 'incompleteProof',
      scoreDelta: 5,
      credibilityDelta: 0,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    });
    const withPhone = evaluateVerdict(scanned, f, 'publish', ['s-ai', 's-phone'], LATE);
    expect(withPhone).toMatchObject({
      outcome: 'correct',
      reason: 'correctNormal',
      scoreDelta: 10,
    });
  });

  it('asks for as many countable proofs as the story requires', () => {
    const twoProofs = { ...proofStory('false', ['s-image', 's-archive']), requiredStamps: 2 };
    const f = collected({ stamps: ['s-image', 's-archive'] });
    expect(evaluateVerdict(twoProofs, f, 'reject', ['s-image'], LATE)).toMatchObject({
      outcome: 'wrongJustification',
      reason: 'incompleteProof',
      scoreDelta: 5,
    });
    expect(evaluateVerdict(twoProofs, f, 'reject', ['s-image', 's-archive'], LATE)).toMatchObject({
      outcome: 'correct',
      scoreDelta: 20,
      bonuses: { speed: 0, multiStamp: 10, bossCall: 0 },
    });
  });

  it('counts only justifying stamps from stations that are not hint-only as proof', () => {
    const scanned = proofStory('true', ['s-ai', 's-phone']);
    expect(countsAsProof(scanned, 's-phone')).toBe(true);
    expect(countsAsProof(scanned, 's-ai')).toBe(false);
    expect(countsAsProof(scanned, 's-image')).toBe(false);
    expect(countsAsProof(scanned, 'unknown')).toBe(false);
  });

  it('counts a stamp cited twice once', () => {
    const f = collected({ stamps: ['s-image'] });
    const r = evaluateVerdict(
      proofStory('false', ['s-image']),
      f,
      'reject',
      ['s-image', 's-image'],
      LATE,
    );
    expect(r).toMatchObject({ outcome: 'correct', reason: 'correctNormal', scoreDelta: 10 });
  });
});

describe('evaluateVerdict — multi-stamp folders (S7-18)', () => {
  const m2 = must(TEST_STORIES.m2);
  /** m2 spawned at 1 s with 60 s plus 20 s for its second proof; both proofs collected. */
  const m2Folder = (stamps: string[] = ['m2-image', 'm2-archive']): Folder =>
    folder({ storyId: 'm2', stamps, spawnedAtMs: 1000, deadlineMs: 81_000 });
  /** 61 s of 80 s left: the speed bonus is earned. */
  const EARLY = 20_000;

  it('pays 35 for m2 with both proofs cited early: 20 + speed 5 + multi-stamp 10', () => {
    const r = evaluateVerdict(m2, m2Folder(), 'reject', ['m2-image', 'm2-archive'], EARLY);
    expect(r).toEqual({
      outcome: 'correct',
      reason: 'correctImportant',
      scoreDelta: 35,
      credibilityDelta: 5,
      bonuses: { speed: 5, multiStamp: 10, bossCall: 0 },
      missedStampIds: [],
    });
  });

  it('calls one cited proof of two incomplete: half the base points, no bonuses', () => {
    const r = evaluateVerdict(m2, m2Folder(), 'reject', ['m2-image'], EARLY);
    expect(r).toEqual({
      outcome: 'wrongJustification',
      reason: 'incompleteProof',
      scoreDelta: 10,
      credibilityDelta: 0,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    });
  });

  it('calls a non-justifying cite weak even next to a valid proof', () => {
    const r = evaluateVerdict(m2, m2Folder(), 'reject', ['m2-image', 'm2-source'], EARLY);
    expect(r).toMatchObject({
      outcome: 'wrongJustification',
      reason: 'weakProof',
      scoreDelta: 10,
      credibilityDelta: 0,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    });
  });

  it('names the uncollected proof when the folder holds only one', () => {
    const r = evaluateVerdict(m2, m2Folder(['m2-image']), 'reject', ['m2-image'], EARLY);
    expect(r).toMatchObject({ reason: 'incompleteProof', scoreDelta: 10 });
    expect(r.missedStampIds).toEqual(['m2-archive']);
  });

  it('counts the same proof cited twice once', () => {
    const r = evaluateVerdict(m2, m2Folder(), 'reject', ['m2-image', 'm2-image'], EARLY);
    expect(r).toMatchObject({ reason: 'incompleteProof', scoreDelta: 10 });
  });

  it('pays the multi-stamp bonus without the speed bonus late, and never scales it', () => {
    const late = evaluateVerdict(m2, m2Folder(), 'reject', ['m2-image', 'm2-archive'], 60_000);
    expect(late).toMatchObject({ scoreDelta: 30, bonuses: { speed: 0, multiStamp: 10 } });
    const expert = simTuning('expert');
    const onExpert = evaluateVerdict(
      m2,
      m2Folder(),
      'reject',
      ['m2-image', 'm2-archive'],
      EARLY,
      expert,
    );
    expect(onExpert).toMatchObject({ scoreDelta: 35, bonuses: { speed: 5, multiStamp: 10 } });
    // A wrong verdict pays no bonus, only the scaled penalty.
    const wrong = evaluateVerdict(m2, m2Folder(), 'publish', ['m2-image'], EARLY, expert);
    expect(wrong).toMatchObject({
      outcome: 'wrong',
      reason: 'publishedFake',
      scoreDelta: -30,
      credibilityDelta: -38,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    });
  });

  it('records the bonus, the cites and the required count on the verdict result', () => {
    const state = withOperator(deskState(m2Folder()));
    const at = { ...state, elapsedMs: EARLY };
    const command = testCommand('p1', {
      kind: 'verdict',
      folderId: 'f1',
      verdict: 'reject',
      justifyingStampIds: ['m2-image', 'm2-archive'],
    });
    const frame = frameFor(at, [command]);
    const next = stepDesk(at, frame);
    expect(next.score).toBe(35);
    expect(next.credibility).toBe(100);
    expect(next.results).toEqual([
      {
        folderId: 'f1',
        spawnKey: 's1',
        storyId: 'm2',
        outcome: 'correct',
        reason: 'correctImportant',
        verdict: 'reject',
        scoreDelta: 35,
        credibilityDelta: 5,
        justifyingStampIds: ['m2-image', 'm2-archive'],
        requiredStamps: 2,
        bonuses: { speed: 5, multiStamp: 10, bossCall: 0 },
        missedStampIds: [],
      },
    ]);
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
    testCommand('p1', { kind: 'verdict', folderId, verdict: v, justifyingStampIds: [stampId] });

  it('resolves the folder, frees the desk and records the result', () => {
    const state = { ...withOperator(deskState()), elapsedMs: 40_000 };
    const frame = frameFor(state, [verdict('publish')]);
    const next = stepDesk(state, frame);
    expect(next.folders).toEqual({});
    expect(next.desks['desk-0']?.operatorId).toBeNull();
    expect(next.score).toBe(10);
    const result: FolderResult & { verdict: Verdict } = {
      folderId: 'f1',
      spawnKey: 's1',
      storyId: 't-true',
      outcome: 'correct',
      reason: 'correctNormal',
      verdict: 'publish',
      scoreDelta: 10,
      credibilityDelta: 0,
      justifyingStampIds: ['t-true-image'],
      requiredStamps: 1,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    };
    expect(next.results).toEqual([result]);
    expect(frame.events).toEqual([
      { kind: 'verdictResult', ...result, playerId: 'p1' },
      { kind: 'deskClosed', deskId: 'desk-0', playerId: 'p1' },
    ]);
    // What the sim emits is what the wire accepts.
    expect(gameEventSchema.safeParse(frame.events[0]).success).toBe(true);
  });

  it('records each cited stamp once and the proofs the story required', () => {
    const state = withOperator(deskState());
    const cites = testCommand('p1', {
      kind: 'verdict',
      folderId: 'f1',
      verdict: 'publish',
      justifyingStampIds: ['t-true-image', 't-true-image'],
    });
    const next = stepDesk(state, frameFor(state, [cites]));
    expect(next.results[0]).toMatchObject({
      outcome: 'correct',
      justifyingStampIds: ['t-true-image'],
      requiredStamps: 1,
    });
  });

  it('applies the credibility loss of a wrong verdict', () => {
    const state = withOperator(deskState(folder({ storyId: 't-false', stamps: [] })));
    const next = stepDesk(state, frameFor(state, [verdict('publish', 't-false-image')]));
    expect(next.score).toBe(-20);
    expect(next.credibility).toBe(75);
    expect(next.results[0]).toMatchObject({ outcome: 'wrong', reason: 'publishedFake' });
    expect(next.results[0]?.missedStampIds).toEqual(['t-false-image']);
  });

  it('applies the difficulty from the context to a wrong verdict', () => {
    const state = withOperator(deskState(folder({ storyId: 't-false', stamps: [] })));
    const ctx = testContext({ tuning: simTuning('expert') });
    const frame = frameFor(state, [verdict('publish', 't-false-image')], {}, ctx);
    const next = stepDesk(state, frame);
    expect(next.score).toBe(-30);
    expect(next.credibility).toBe(62);
    expect(next.results[0]).toMatchObject({ scoreDelta: -30, credibilityDelta: -38 });
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
        justifyingStampIds: ['t-true-image'],
      }),
    ]);
    const result = decided.events.find((e) => e.kind === 'verdictResult');
    expect(result).toMatchObject({
      outcome: 'correct',
      scoreDelta: 15,
      bonuses: { speed: 5, multiStamp: 0, bossCall: 0 },
    });
    expect(decided.state.score).toBe(15);
    expect(decided.state.desks['desk-0']?.operatorId).toBeNull();
    expect(decided.state.folders.f1).toBeUndefined();
    expect(TEST_STORIES['t-true']?.correctVerdict).toBe('publish');
  });
});
