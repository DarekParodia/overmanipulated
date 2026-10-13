import { describe, expect, it } from 'bun:test';
import { CROSS_CHECK_CARDS, createRng, DIFFICULTIES } from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import {
  ANSWERS,
  type Conclusion,
  type CoverageCard,
  type CrossCheckPuzzle,
  conclude,
  crossCheckOutcome,
  generatePuzzle,
  initialState,
  isIndependent,
  reduce,
  sourceLine,
} from './crossCheck.logic.ts';

const t = pl.minigames.crossCheck;
type Truth = 'true' | 'false' | 'misleading' | 'satire' | 'unverifiable';
const TRUTHS: readonly Truth[] = ['true', 'false', 'misleading', 'satire', 'unverifiable'];
const story = (truth: Truth, source = 'Grupa „Sąsiedzi z Błoni”') => ({
  headline: 'Most na Nadrzeczu zamknięty do jesieni',
  truth,
  source,
});
const stamp = (relevance: 'decisive' | 'misleading' | 'irrelevant') => ({
  relevance,
  text: 'Test',
});

const card = (
  kind: CoverageCard['kind'],
  stance: CoverageCard['stance'],
  via: string | null = stance === 'echoes' ? 'post z grupy' : null,
): CoverageCard => ({ outlet: `${kind}-${stance}`, kind, stance, via });

// A stamp decides without touching the RNG; a throwing RNG proves it.
const noRng = {
  next: () => {
    throw new Error('rng used');
  },
  int: () => {
    throw new Error('rng used');
  },
};
const roll = (value: number) => ({ next: () => value, int: () => 0 });

describe('isIndependent', () => {
  it('counts only agencies and newsrooms that report on their own', () => {
    expect(isIndependent(card('agency', 'confirms'))).toBe(true);
    expect(isIndependent(card('newsroom', 'denies'))).toBe(true);
    expect(isIndependent(card('newsroom', 'echoes'))).toBe(false);
    expect(isIndependent(card('agency', 'echoes'))).toBe(false);
    expect(isIndependent(card('satire', 'confirms'))).toBe(false);
    expect(isIndependent(card('anonymous', 'confirms'))).toBe(false);
    expect(isIndependent(card('junk', 'echoes'))).toBe(false);
    expect(isIndependent(card('junk', 'denies'))).toBe(false);
  });
});

describe('conclude', () => {
  it('confirms with two independent confirmations', () => {
    expect(conclude([card('agency', 'confirms'), card('newsroom', 'confirms')])).toBe('confirmed');
    expect(
      conclude([
        card('agency', 'confirms'),
        card('newsroom', 'confirms'),
        card('newsroom', 'confirms'),
        card('junk', 'echoes'),
        card('satire', 'confirms'),
      ]),
    ).toBe('confirmed');
  });

  it('does not count echoes, satire, anonymous groups or clones as confirmations', () => {
    expect(conclude([card('agency', 'confirms'), card('newsroom', 'echoes')])).toBe('unconfirmed');
    expect(
      conclude([
        card('newsroom', 'confirms'),
        card('agency', 'echoes'),
        card('satire', 'confirms'),
        card('anonymous', 'confirms'),
        card('junk', 'echoes'),
      ]),
    ).toBe('unconfirmed');
    expect(conclude([])).toBe('unconfirmed');
  });

  it('lets one independent denial win', () => {
    expect(conclude([card('newsroom', 'denies'), card('junk', 'echoes')])).toBe('denied');
    expect(
      conclude([
        card('agency', 'confirms'),
        card('newsroom', 'confirms'),
        card('agency', 'denies'),
      ]),
    ).toBe('denied');
  });

  it('ignores a denial that is not independent', () => {
    expect(conclude([card('anonymous', 'denies'), card('junk', 'denies')])).toBe('unconfirmed');
  });
});

describe('crossCheckOutcome', () => {
  it('follows the outcome table for every stamp and truth', () => {
    const table: Record<'decisive' | 'misleading' | 'irrelevant', Record<Truth, Conclusion>> = {
      decisive: {
        true: 'confirmed',
        false: 'denied',
        misleading: 'denied',
        satire: 'unconfirmed',
        unverifiable: 'unconfirmed',
      },
      misleading: {
        true: 'unconfirmed',
        false: 'unconfirmed',
        misleading: 'unconfirmed',
        satire: 'unconfirmed',
        unverifiable: 'unconfirmed',
      },
      irrelevant: {
        true: 'unconfirmed',
        false: 'unconfirmed',
        misleading: 'unconfirmed',
        satire: 'unconfirmed',
        unverifiable: 'unconfirmed',
      },
    };
    for (const relevance of ['decisive', 'misleading', 'irrelevant'] as const) {
      for (const truth of TRUTHS) {
        expect(crossCheckOutcome({ truth }, stamp(relevance), noRng), `${relevance}/${truth}`).toBe(
          table[relevance][truth],
        );
      }
    }
  });

  it('rolls the coverage chance without a stamp', () => {
    expect(crossCheckOutcome({ truth: 'true' }, undefined, roll(0))).toBe('confirmed');
    expect(crossCheckOutcome({ truth: 'true' }, undefined, roll(0.49))).toBe('confirmed');
    expect(crossCheckOutcome({ truth: 'true' }, undefined, roll(0.5))).toBe('unconfirmed');
    expect(crossCheckOutcome({ truth: 'false' }, undefined, roll(0.2))).toBe('denied');
    expect(crossCheckOutcome({ truth: 'misleading' }, undefined, roll(0.2))).toBe('denied');
    expect(crossCheckOutcome({ truth: 'false' }, undefined, roll(0.99))).toBe('unconfirmed');
    // Satire and unverifiable stories are never covered: no draw at all.
    expect(crossCheckOutcome({ truth: 'satire' }, undefined, noRng)).toBe('unconfirmed');
    expect(crossCheckOutcome({ truth: 'unverifiable' }, undefined, noRng)).toBe('unconfirmed');
  });
});

describe('generatePuzzle', () => {
  it('is deterministic for a seed, story and stamp', () => {
    expect(generatePuzzle(11, story('false'), stamp('decisive'))).toEqual(
      generatePuzzle(11, story('false'), stamp('decisive')),
    );
    expect(generatePuzzle(11, story('false'), stamp('decisive')).claim).toBe(
      'Most na Nadrzeczu zamknięty do jesieni',
    );
  });

  it('gives 5 consistent cards over 200 seeds for every conclusion', () => {
    const cases = [
      { truth: 'true', relevance: 'decisive', conclusion: 'confirmed' },
      { truth: 'false', relevance: 'decisive', conclusion: 'denied' },
      { truth: 'true', relevance: 'irrelevant', conclusion: 'unconfirmed' },
    ] as const;
    for (const { truth, relevance, conclusion } of cases) {
      const independentCounts = new Set<number>();
      for (let seed = 0; seed < 200; seed++) {
        const p = generatePuzzle(seed, story(truth), stamp(relevance));
        expect(p.conclusion).toBe(conclusion);
        expect(p.cards).toHaveLength(CROSS_CHECK_CARDS);
        expect(conclude(p.cards)).toBe(conclusion);
        // Every outlet appears once.
        expect(new Set(p.cards.map((c) => c.outlet)).size).toBe(CROSS_CHECK_CARDS);
        // An echo always names what it copied; no other card does.
        for (const c of p.cards) {
          expect(c.via !== null, c.outlet).toBe(c.stance === 'echoes');
        }
        // There is always at least one agency or newsroom copy: the lesson of the station.
        expect(
          p.cards.some(
            (c) => (c.kind === 'agency' || c.kind === 'newsroom') && c.stance === 'echoes',
          ),
        ).toBe(true);
        const independent = p.cards.filter(isIndependent);
        independentCounts.add(independent.length);
        if (conclusion === 'confirmed') {
          expect(independent.every((c) => c.stance === 'confirms')).toBe(true);
        }
        if (conclusion === 'denied') {
          expect(independent.every((c) => c.stance === 'denies')).toBe(true);
        }
      }
      const expected = { confirmed: [2, 3], denied: [1, 2], unconfirmed: [0, 1] }[conclusion];
      expect([...independentCounts].sort(), conclusion).toEqual(expected);
    }
  });

  it('never lets the story source cover its own claim', () => {
    for (const source of ['Kurier Nowobrzeski', 'Portal Brzeski Kurier Absurdu', 'Agencja Fala']) {
      for (let seed = 0; seed < 200; seed++) {
        for (const conclusion of ['true', 'false'] as const) {
          const p = generatePuzzle(seed, story(conclusion, source), stamp('decisive'));
          expect(p.cards).toHaveLength(CROSS_CHECK_CARDS);
          expect(
            p.cards.some((c) => source.includes(c.outlet)),
            `${source} ${seed}`,
          ).toBe(false);
        }
      }
    }
  });

  it('mixes every outlet kind over many seeds', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      for (const c of generatePuzzle(seed, story('true'), stamp('misleading')).cards) {
        kinds.add(c.kind);
      }
    }
    expect([...kinds].sort()).toEqual(['agency', 'anonymous', 'junk', 'newsroom', 'satire']);
  });

  it('gives a covered or an open puzzle without a stamp', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      seen.add(generatePuzzle(seed, story('true'), undefined).conclusion);
    }
    expect([...seen].sort()).toEqual(['confirmed', 'unconfirmed']);
    const rng = createRng(5);
    expect(crossCheckOutcome({ truth: 'satire' }, undefined, rng)).toBe('unconfirmed');
  });
});

describe('sourceLine', () => {
  it('names the source a card reports from', () => {
    expect(sourceLine(card('agency', 'confirms'))).toBe('własny reporter');
    expect(sourceLine(card('newsroom', 'echoes', 'wpis w sieci'))).toBe('za: wpis w sieci');
    expect(sourceLine(card('junk', 'echoes', 'film z sieci'))).toBe('za: film z sieci');
    expect(sourceLine(card('anonymous', 'confirms'))).toBe('bez źródła');
    expect(sourceLine(card('satire', 'confirms'))).toBe('wymyślone');
    expect(t.stances.echoes).toBe(t.stances.confirms);
  });
});

describe('reduce', () => {
  const puzzle = (conclusion: CrossCheckPuzzle['conclusion']): CrossCheckPuzzle => ({
    claim: 'Test',
    cards: [],
    conclusion,
  });

  it('succeeds on the right answer', () => {
    const [next, effect] = reduce(initialState(puzzle('denied')), {
      type: 'pick',
      answer: 'denied',
    });
    expect(next.outcome).toBe('success');
    expect(next.picked).toBe('denied');
    expect(effect).toBe('right');
  });

  it('fails on one wrong answer on every difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      const state = initialState(puzzle('unconfirmed'), difficulty);
      expect(state.maxMistakes, difficulty).toBe(1);
      const [next, effect] = reduce(state, { type: 'pick', answer: 'confirmed' });
      expect(next.outcome, difficulty).toBe('failure');
      expect(next.struck.confirmed).toBe(true);
      expect(next.mistakes).toBe(1);
      expect(effect).toBe('failed');
    }
  });

  it('moves over the three answers and confirms the cursor', () => {
    const start = initialState(puzzle('unconfirmed'));
    expect(ANSWERS).toEqual(['confirmed', 'denied', 'unconfirmed']);
    expect(start.cursor).toBe(0);
    expect(reduce(start, { type: 'move', delta: -1 })).toEqual([start, null]);
    const [one, effect] = reduce(start, { type: 'move', delta: 1 });
    expect(one.cursor).toBe(1);
    expect(effect).toBe('move');
    const [two] = reduce(one, { type: 'move', delta: 1 });
    expect(reduce(two, { type: 'move', delta: 1 })).toEqual([two, null]);
    expect(reduce(two, { type: 'confirm' })[0].outcome).toBe('success');
    expect(reduce(one, { type: 'confirm' })[0].outcome).toBe('failure');
  });

  it('ignores input after the round ends', () => {
    const [done] = reduce(initialState(puzzle('confirmed')), {
      type: 'pick',
      answer: 'confirmed',
    });
    expect(reduce(done, { type: 'pick', answer: 'denied' })).toEqual([done, null]);
    expect(reduce(done, { type: 'move', delta: 1 })).toEqual([done, null]);
  });
});
