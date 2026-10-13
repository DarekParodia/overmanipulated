import { describe, expect, test } from 'bun:test';
import {
  type FolderOutcome,
  type FolderReason,
  type FolderResult,
  folderReasonSchema,
} from '@redakcja/shared';
import type { DebriefStory } from './debrief-model.ts';
import {
  kolegiumCards,
  lossReasonOf,
  resultTotals,
  revealedByKind,
  revealPlan,
  starProgress,
} from './results-model.ts';
import { revealTimes } from './use-reveal.ts';

function result(folderId: string, storyId: string, patch: Partial<FolderResult> = {}) {
  return {
    folderId,
    spawnKey: `s${folderId.slice(1)}`,
    storyId,
    outcome: 'correct',
    reason: 'correctNormal',
    verdict: 'publish',
    scoreDelta: 10,
    credibilityDelta: 0,
    justifyingStampIds: [`${storyId}-image`],
    requiredStamps: 1,
    bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
    ...patch,
  } satisfies FolderResult;
}

/** The design fixture (cluster F §2), also the dev HUD fixture's level end. */
const DESIGN_FIXTURE: FolderResult[] = [
  result('f1', 'l1-a', {
    reason: 'correctImportant',
    verdict: 'reject',
    scoreDelta: 25,
    credibilityDelta: 5,
    bonuses: { speed: 5, multiStamp: 0, bossCall: 0 },
  }),
  result('f2', 'l1-b'),
  result('f3', 'l1-c', { outcome: 'wrongJustification', reason: 'weakProof', scoreDelta: 5 }),
  result('f4', 'l1-d', {
    outcome: 'wrong',
    reason: 'publishedFake',
    scoreDelta: -20,
    credibilityDelta: -25,
  }),
  result('f5', 'l1-e', {
    outcome: 'expired',
    reason: 'expired',
    verdict: null,
    scoreDelta: -5,
    credibilityDelta: -5,
    justifyingStampIds: [],
  }),
  result('f6', 'l1-f', {
    outcome: 'unfinished',
    reason: 'unfinished',
    verdict: null,
    scoreDelta: 0,
    justifyingStampIds: [],
  }),
];

const sumOf = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe('result totals', () => {
  test('the design fixture adds up to 15 points', () => {
    const totals = resultTotals(DESIGN_FIXTURE);
    expect(totals.rows).toEqual([
      { id: 'correct', count: 2, points: 30, credibility: 5 },
      { id: 'speed', count: 1, points: 5, credibility: 0 },
      { id: 'weakProof', count: 1, points: 5, credibility: 0 },
      { id: 'wrong', count: 1, points: -20, credibility: -25 },
      { id: 'expired', count: 1, points: -5, credibility: -5 },
      { id: 'unfinished', count: 1, points: 0, credibility: 0 },
    ]);
    expect(totals.points).toBe(15);
    expect(totals.credibility).toBe(-25);
  });

  test('rows add up to the sum of the score deltas', () => {
    const results = [
      ...DESIGN_FIXTURE,
      result('f7', 'l1-g', {
        reason: 'correctionFiled',
        scoreDelta: 23,
        credibilityDelta: 8,
        bonuses: { speed: 0, multiStamp: 5, bossCall: 3 },
      }),
      result('f8', 'l1-h', {
        outcome: 'wrongJustification',
        reason: 'incompleteProof',
        scoreDelta: 8,
        bonuses: { speed: 3, multiStamp: 0, bossCall: 0 },
      }),
      result('f9', 'l1-i', {
        outcome: 'expired',
        reason: 'expiredUnpenalized',
        verdict: null,
        scoreDelta: 0,
      }),
    ];
    const totals = resultTotals(results);
    expect(sumOf(totals.rows.map((row) => row.points))).toBe(
      sumOf(results.map((r) => r.scoreDelta)),
    );
    expect(totals.points).toBe(46);
    expect(totals.rows.map((row) => [row.id, row.count, row.points])).toEqual([
      ['correct', 2, 30],
      ['correction', 1, 15],
      ['speed', 2, 8],
      ['proofs', 1, 5],
      ['bossCall', 1, 3],
      ['weakProof', 2, 10],
      ['wrong', 1, -20],
      ['expired', 2, -5],
      ['unfinished', 1, 0],
    ]);
  });

  test('every reason and bonus kind keeps the sum of the rows equal to the score deltas', () => {
    const outcomeOf = {
      correctNormal: 'correct',
      correctImportant: 'correct',
      correctWithContext: 'correct',
      correctionFiled: 'correct',
      weakProof: 'wrongJustification',
      incompleteProof: 'wrongJustification',
      publishedFake: 'wrong',
      rejectedTrue: 'wrong',
      contextOnTrue: 'wrong',
      publishedWithoutContext: 'wrong',
      rejectedContextStory: 'wrong',
      expired: 'expired',
      expiredUnpenalized: 'expired',
      unfinished: 'unfinished',
    } as const satisfies Record<FolderReason, FolderOutcome>;
    const results = folderReasonSchema.options.map((reason, i) => {
      const bonuses = { speed: i % 2 === 0 ? 5 : 0, multiStamp: i % 3 === 0 ? 4 : 0, bossCall: i };
      return result(`f${i + 1}`, `l1-${reason}`, {
        outcome: outcomeOf[reason],
        reason,
        scoreDelta: (i % 4) * 10 - 15 + bonuses.speed + bonuses.multiStamp + bonuses.bossCall,
        credibilityDelta: (i % 3) * 5 - 5,
        bonuses,
      });
    });
    const totals = resultTotals(results);
    const scoreSum = sumOf(results.map((r) => r.scoreDelta));
    expect(sumOf(totals.rows.map((row) => row.points))).toBe(scoreSum);
    expect(totals.points).toBe(scoreSum);
    expect(totals.credibility).toBe(sumOf(results.map((r) => r.credibilityDelta)));
    // Each folder lands in exactly one outcome row; correctionFiled has its own.
    const outcomeRows = new Set([
      'correct',
      'correction',
      'weakProof',
      'wrong',
      'expired',
      'unfinished',
    ]);
    const outcomeCount = sumOf(
      totals.rows.filter((row) => outcomeRows.has(row.id)).map((row) => row.count),
    );
    expect(outcomeCount).toBe(results.length);
    expect(totals.rows.find((row) => row.id === 'correction')?.count).toBe(1);
  });

  test('results capped by the server leave an Inne row with the difference', () => {
    const totals = resultTotals(DESIGN_FIXTURE, 140);
    expect(totals.rows.at(-1)).toEqual({ id: 'other', count: 0, points: 125, credibility: 0 });
    expect(totals.points).toBe(140);
    expect(resultTotals(DESIGN_FIXTURE, 15).rows.some((row) => row.id === 'other')).toBe(false);
  });

  test('no results give no rows', () => {
    expect(resultTotals([])).toEqual({ rows: [], points: 0, credibility: 0 });
  });
});

describe('star progress', () => {
  const thresholds = { two: 205, three: 320 };

  test('names the next star, the missing points and the shares of the best score', () => {
    expect(starProgress(305, true, 2, thresholds, 400)).toEqual({
      earned: 2,
      won: true,
      thresholds,
      next: { stars: 3, missing: 15 },
      shares: { two: 51, three: 80 },
    });
    expect(starProgress(150, true, 1, thresholds, 400).next).toEqual({ stars: 2, missing: 55 });
  });

  test('has no next star with three stars or a lost level', () => {
    expect(starProgress(320, true, 3, thresholds, 400).next).toBeNull();
    const lost = starProgress(-5, false, 0, thresholds, 400);
    expect(lost.next).toBeNull();
    expect(lost.won).toBe(false);
    expect(lost.earned).toBe(0);
  });

  test('has no shares without a best possible score', () => {
    expect(starProgress(305, true, 2, thresholds, null).shares).toBeNull();
  });
});

describe('loss reason', () => {
  test('falls back to the credibility bar, then the score', () => {
    expect(lossReasonOf({ credibility: 0, won: false, lossReason: undefined })).toBe('credibility');
    expect(lossReasonOf({ credibility: 40, won: false })).toBe('score');
  });

  test("prefers the server's reason and is null for a won level", () => {
    expect(lossReasonOf({ credibility: 0, won: false, lossReason: 'score' })).toBe('score');
    expect(lossReasonOf({ credibility: 60, won: true, lossReason: null })).toBeNull();
  });
});

describe('reveal plan', () => {
  test('stars, progress line, totals rows, then marks', () => {
    const plan = revealPlan({ stars: 2, rows: 3, marks: 2 });
    expect(plan.map((step) => [step.kind, step.atMs])).toEqual([
      ['star', 520],
      ['star', 940],
      ['progress', 1620],
      ['row', 1920],
      ['row', 2060],
      ['row', 2200],
      ['mark', 2460],
      ['mark', 2840],
    ]);
    expect(plan.map((step) => step.index)).toEqual([0, 1, 0, 0, 1, 2, 0, 1]);
  });

  test('without stars, rows or a progress line the marks follow the pop-in', () => {
    expect(revealPlan({ stars: 0, rows: 0, marks: 1 }).map((s) => s.atMs)).toEqual([520, 820]);
    expect(revealPlan({ stars: 0, rows: 0, marks: 2, progress: false })).toEqual([
      { atMs: 520, kind: 'mark', index: 0 },
      { atMs: 900, kind: 'mark', index: 1 },
    ]);
  });

  test('counts the shown steps of each kind', () => {
    const plan = revealPlan({ stars: 2, rows: 3, marks: 2 });
    expect(revealedByKind(plan, 0)).toEqual({ star: 0, progress: 0, row: 0, mark: 0 });
    expect(revealedByKind(plan, 4)).toEqual({ star: 2, progress: 1, row: 1, mark: 0 });
    expect(revealedByKind(plan, Number.POSITIVE_INFINITY)).toEqual({
      star: 2,
      progress: 1,
      row: 3,
      mark: 2,
    });
  });

  test('phones: stars, the progress line and the rows, no marks', () => {
    expect(revealPlan({ stars: 1, rows: 6, marks: 0 }).map((s) => s.atMs)).toEqual([
      520, 1200, 1500, 1640, 1780, 1920, 2060, 2200,
    ]);
  });

  test('revealTimes keeps the stars-then-marks timing', () => {
    expect(revealTimes(2, 2)).toEqual([520, 940, 1620, 2000]);
    expect(revealTimes(0, 1)).toEqual([520]);
  });
});

const stories: Record<string, DebriefStory> = {
  'l1-a': {
    headline: 'Rynek pod wodą',
    correctVerdict: 'publishWithContext',
    stamps: [
      { id: 'l1-a-image', station: 'imageSearch', text: 'Zdjęcie z 2019 r.' },
      { id: 'l1-a-source', station: 'sourceRegistry', text: 'Konto aktywne od lat.' },
      { id: 'l1-a-ai', station: 'aiScanner', text: 'Skaner: 70–90% AI.' },
    ],
    debrief: {
      what: 'Stare zdjęcie.',
      technique: 'Nowy podpis.',
      tool: 'Lupa.',
      realWorld: 'Po burzach.',
    },
  },
  'l1-b': { headline: 'Nocny autobus', correctVerdict: 'publish' },
  // Two proofs required: the image search and the archive; the phone is on another level only,
  // the AI scanner is a hint.
  'l1-m': {
    headline: 'Pożar w porcie',
    correctVerdict: 'reject',
    stamps: [
      { id: 'l1-m-image', station: 'imageSearch', text: 'Zdjęcie z innego portu.' },
      { id: 'l1-m-ai', station: 'aiScanner', text: 'Skaner: 60% AI.' },
      { id: 'l1-m-archive', station: 'archive', text: 'Brak pożaru w archiwum.' },
      { id: 'l1-m-phone', station: 'phone', text: 'Straż: spokojna noc.' },
      { id: 'l1-m-source', station: 'sourceRegistry', text: 'Konto założone wczoraj.' },
    ],
    justifyingStamps: ['l1-m-image', 'l1-m-ai', 'l1-m-archive', 'l1-m-phone'],
  },
};
const lookup = (id: string) => stories[id];
const L1_STATIONS = ['imageSearch', 'archive', 'sourceRegistry', 'aiScanner'] as const;

describe('kolegium cards', () => {
  test('orders cards by folder arrival, not by resolution', () => {
    const cards = kolegiumCards([result('f10', 'l1-b'), result('f2', 'l1-a')], lookup, 'folder');
    expect(cards.map((c) => c.folderId)).toEqual(['f2', 'f10']);
  });

  test('gives every folder its own card, so card points add up to the score', () => {
    const results = [
      result('f3', 'l1-a', {
        outcome: 'wrong',
        reason: 'publishedWithoutContext',
        scoreDelta: -15,
      }),
      result('f1', 'l1-a', { scoreDelta: 25 }),
      result('f2', 'l1-b', { scoreDelta: -5, outcome: 'expired', reason: 'expired' }),
    ];
    const cards = kolegiumCards(results, lookup, 'folder');
    expect(cards.map((c) => [c.folderId, c.storyId, c.count, c.scoreDelta])).toEqual([
      ['f1', 'l1-a', 1, 25],
      ['f2', 'l1-b', 1, -5],
      ['f3', 'l1-a', 1, -15],
    ]);
    expect(sumOf(cards.map((c) => c.scoreDelta))).toBe(5);
  });

  test('groups an endless run per story, keeping the first folder and summing the rest', () => {
    const cards = kolegiumCards(
      [
        result('f3', 'l1-a', {
          outcome: 'wrong',
          reason: 'publishedWithoutContext',
          scoreDelta: -15,
          credibilityDelta: -10,
        }),
        result('f1', 'l1-a', {
          scoreDelta: 15,
          credibilityDelta: 5,
          bonuses: { speed: 5, multiStamp: 0, bossCall: 0 },
        }),
        result('f2', 'l1-b'),
        result('f4', 'l1-a', { bonuses: { speed: 5, multiStamp: 0, bossCall: 0 } }),
      ],
      lookup,
      'story',
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      storyId: 'l1-a',
      folderId: 'f1',
      outcome: 'correct',
      reason: 'correctNormal',
      count: 3,
      scoreDelta: 10,
      credibilityDelta: -5,
      bonuses: { speed: 10, multiStamp: 0, bossCall: 0 },
    });
    expect(cards[1]).toMatchObject({ storyId: 'l1-b', count: 1, scoreDelta: 10 });
  });

  test('carries the reason, the correct verdict, the debrief and the deciding proof', () => {
    const [card] = kolegiumCards(
      [
        result('f1', 'l1-a', {
          outcome: 'expired',
          reason: 'expired',
          verdict: null,
          scoreDelta: -5,
          credibilityDelta: -5,
          justifyingStampIds: [],
          missedStampIds: ['l1-a-image', 'l1-a-ai', 'unknown'],
        }),
      ],
      lookup,
      'folder',
    );
    expect(card?.reason).toBe('expired');
    expect(card?.verdict).toBeNull();
    expect(card?.correctVerdict).toBe('publishWithContext');
    expect(card?.credibilityDelta).toBe(-5);
    expect(card?.debrief?.technique).toBe('Nowy podpis.');
    // Without the story's justifying list the missed stamps stand in; the AI scanner's stamp is
    // a hint, never the deciding proof, and an unknown id has no text to show.
    expect(card?.proof).toEqual([
      { id: 'l1-a-image', station: 'imageSearch', text: 'Zdjęcie z 2019 r.', status: 'missing' },
    ]);
  });

  test('marks each deciding proof as cited, in the folder or never checked', () => {
    // Wrong verdict on the two-proof story: the image was cited, the archive stamp sat in the
    // folder, the phone was never asked (and is not on this level).
    const [card] = kolegiumCards(
      [
        result('f1', 'l1-m', {
          outcome: 'wrong',
          reason: 'rejectedTrue',
          verdict: 'publish',
          scoreDelta: -20,
          credibilityDelta: -25,
          justifyingStampIds: ['l1-m-image'],
          requiredStamps: 2,
          missedStampIds: ['l1-m-ai', 'l1-m-phone'],
        }),
      ],
      lookup,
      'folder',
      L1_STATIONS,
    );
    expect(card?.proof).toEqual([
      {
        id: 'l1-m-image',
        station: 'imageSearch',
        text: 'Zdjęcie z innego portu.',
        status: 'cited',
      },
      {
        id: 'l1-m-archive',
        station: 'archive',
        text: 'Brak pożaru w archiwum.',
        status: 'collected',
      },
    ]);
    // With the level unknown the phone's proof is listed as never checked.
    const [anyLevel] = kolegiumCards(
      [result('f1', 'l1-m', { outcome: 'wrong', missedStampIds: ['l1-m-phone'] })],
      lookup,
      'folder',
    );
    expect(anyLevel?.proof?.map((row) => [row.id, row.status])).toEqual([
      ['l1-m-image', 'cited'],
      ['l1-m-archive', 'collected'],
      ['l1-m-phone', 'missing'],
    ]);
  });

  test('hides the proof section on a correct folder, a correction included', () => {
    const cards = kolegiumCards(
      [
        result('f1', 'l1-m', { justifyingStampIds: ['l1-m-image', 'l1-m-archive'] }),
        result('f2', 'l1-a', { reason: 'correctionFiled', justifyingStampIds: [] }),
        result('f3', 'l1-m', {
          outcome: 'wrongJustification',
          reason: 'weakProof',
          justifyingStampIds: ['l1-m-source'],
          missedStampIds: ['l1-m-phone'],
        }),
      ],
      lookup,
      'folder',
      L1_STATIONS,
    );
    expect(cards.map((card) => card.proof?.length ?? null)).toEqual([null, null, 2]);
  });

  test('counts the cited proofs and names a hint cited without proof', () => {
    const cards = kolegiumCards(
      [
        result('f1', 'l1-m', {
          outcome: 'wrongJustification',
          reason: 'incompleteProof',
          scoreDelta: 10,
          justifyingStampIds: ['l1-m-image', 'l1-m-ai'],
          requiredStamps: 2,
          missedStampIds: [],
        }),
        result('f2', 'l1-m', {
          outcome: 'wrongJustification',
          reason: 'incompleteProof',
          scoreDelta: 10,
          justifyingStampIds: ['l1-m-ai'],
          requiredStamps: 2,
        }),
      ],
      lookup,
      'folder',
    );
    expect(cards.map((c) => [c.citedProofs, c.requiredStamps, c.hintStations])).toEqual([
      [1, 2, []],
      [0, 2, ['aiScanner']],
    ]);
  });

  test('puts the folders still in play at the end last, in arrival order', () => {
    const unfinished = { outcome: 'unfinished', reason: 'unfinished', verdict: null } as const;
    const cards = kolegiumCards(
      [
        result('f2', 'l1-b'),
        result('f5', 'l1-a', { ...unfinished, scoreDelta: 0 }),
        result('f1', 'l1-a', { ...unfinished, scoreDelta: 0 }),
        result('f4', 'l1-m', { outcome: 'expired', reason: 'expired', scoreDelta: -5 }),
      ],
      lookup,
      'folder',
    );
    expect(cards.map((c) => [c.folderId, c.outcome])).toEqual([
      ['f2', 'correct'],
      ['f4', 'expired'],
      ['f1', 'unfinished'],
      ['f5', 'unfinished'],
    ]);
  });

  test('tallies a grouped story per outcome and keeps the first proof it needed', () => {
    const cards = kolegiumCards(
      [
        result('f1', 'l1-m'),
        result('f3', 'l1-m', {
          outcome: 'wrong',
          reason: 'rejectedTrue',
          scoreDelta: -20,
          justifyingStampIds: ['l1-m-image'],
          missedStampIds: ['l1-m-ai', 'l1-m-archive', 'l1-m-phone'],
        }),
        result('f2', 'l1-m'),
        result('f9', 'l1-b', { outcome: 'unfinished', reason: 'unfinished', scoreDelta: 0 }),
        result('f8', 'l1-m', { outcome: 'unfinished', reason: 'unfinished', scoreDelta: 0 }),
        result('f4', 'l1-a'),
      ],
      lookup,
      'story',
      L1_STATIONS,
    );
    expect(cards.map((c) => [c.storyId, c.outcome, c.count, c.scoreDelta])).toEqual([
      ['l1-m', 'correct', 4, 0],
      ['l1-a', 'correct', 1, 10],
      ['l1-b', 'unfinished', 1, 0],
    ]);
    expect(cards[0]?.tally).toEqual({
      correct: 2,
      wrongJustification: 0,
      wrong: 1,
      expired: 0,
      unfinished: 1,
    });
    expect(cards[0]?.proof?.map((row) => [row.id, row.status])).toEqual([
      ['l1-m-image', 'cited'],
      ['l1-m-archive', 'missing'],
    ]);
  });

  test("a campaign level's card points add up to the level's score", () => {
    // A level end as the server sends it: a story that came twice (a correction), a bonus, a
    // half-points verdict, a fake in print, an expiry and a folder left at the end.
    const results = [
      result('f1', 'l1-a', {
        reason: 'correctImportant',
        scoreDelta: 25,
        credibilityDelta: 5,
        bonuses: { speed: 5, multiStamp: 0, bossCall: 0 },
      }),
      result('f2', 'l1-m', {
        outcome: 'wrongJustification',
        reason: 'incompleteProof',
        scoreDelta: 10,
        justifyingStampIds: ['l1-m-image'],
        requiredStamps: 2,
      }),
      result('f4', 'l1-a', { reason: 'correctionFiled', scoreDelta: 15, credibilityDelta: 10 }),
      result('f3', 'l1-b', {
        outcome: 'wrong',
        reason: 'publishedFake',
        scoreDelta: -20,
        credibilityDelta: -25,
      }),
      result('f5', 'l1-m', { outcome: 'expired', reason: 'expired', scoreDelta: -5 }),
      result('f6', 'l1-b', { outcome: 'unfinished', reason: 'unfinished', scoreDelta: 0 }),
    ];
    const levelEnd = { score: 25, results };
    const cards = kolegiumCards(levelEnd.results, lookup, 'folder', L1_STATIONS);
    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.scoreDelta)).toEqual([25, 10, -20, 15, -5, 0]);
    expect(sumOf(cards.map((c) => c.scoreDelta))).toBe(levelEnd.score);
    expect(resultTotals(levelEnd.results, levelEnd.score).points).toBe(levelEnd.score);
  });

  test('still shows a card for a story the content does not know', () => {
    const [card] = kolegiumCards([result('f1', 'l9-missing')], lookup, 'folder');
    expect(card?.headline).toBeNull();
    expect(card?.debrief).toBeNull();
    expect(card?.correctVerdict).toBeNull();
  });
});
