import { describe, expect, it } from 'bun:test';
import { STORIES } from '@redakcja/content';
import { createRng, TRANSCRIPT_LINES, TRANSCRIPT_MAX_MISTAKES } from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import {
  type Action,
  answerTarget,
  cutWords,
  type GameState,
  generatePuzzle,
  initialState,
  keptWordCount,
  reduce,
  type TranscriptPuzzle,
  transcriptVariant,
} from './transcript.logic.ts';

const t = pl.minigames.transcript;
const DECOYS: readonly string[] = t.absent.map((entry) => entry.decoy);
const FILLER: readonly string[] = t.filler;
const story = (truth: 'true' | 'false' | 'misleading' | 'unverifiable') => ({
  headline: 'Burmistrz o mostach',
  truth,
});
const stamp = (relevance: 'decisive' | 'misleading' | 'irrelevant') => ({
  relevance,
  text: 'Test',
});

const RECORD = [
  'Dzień dobry, witam wszystkich na dzisiejszym spotkaniu.',
  'Nie obchodzą mnie plotki – obchodzą mnie problemy mieszkańców.',
  'Dziękuję radnym za pracę w komisjach.',
  'Dziękuję, przejdźmy do głosowania.',
];
const cut: TranscriptPuzzle = {
  setting: 'Sesja rady miasta',
  clip: 'Nie obchodzą mnie problemy mieszkańców.',
  lines: RECORD,
  answerLine: 1,
  variant: 'cut',
};
const fair: TranscriptPuzzle = {
  ...cut,
  clip: 'Basen na Błoniach otworzymy w czerwcu.',
  lines: [RECORD[0] ?? '', 'Basen na Błoniach otworzymy w czerwcu – tak, jak obiecywaliśmy.'],
  answerLine: 1,
  variant: 'fair',
};
const absent: TranscriptPuzzle = {
  ...cut,
  clip: 'Szkoła na Wzgórzu zostanie zamknięta.',
  lines: [
    RECORD[0] ?? '',
    'Szkoła na Wzgórzu dostanie nowy dach.',
    RECORD[2] ?? '',
    RECORD[3] ?? '',
  ],
  answerLine: null,
  variant: 'absent',
};

function run(state: GameState, actions: Action[]): GameState {
  return actions.reduce((s, action) => reduce(s, action)[0], state);
}

describe('transcriptVariant', () => {
  // A stamp decides without touching the RNG; a throwing RNG proves it.
  const noRng = {
    next: () => {
      throw new Error('rng used');
    },
    int: () => {
      throw new Error('rng used');
    },
  };

  it('maps the stamp to the variant', () => {
    expect(transcriptVariant({ truth: 'false' }, stamp('decisive'), noRng)).toBe('absent');
    expect(transcriptVariant({ truth: 'unverifiable' }, stamp('decisive'), noRng)).toBe('absent');
    expect(transcriptVariant({ truth: 'misleading' }, stamp('decisive'), noRng)).toBe('cut');
    expect(transcriptVariant({ truth: 'true' }, stamp('decisive'), noRng)).toBe('fair');
    expect(transcriptVariant({ truth: 'true' }, stamp('misleading'), noRng)).toBe('cut');
    expect(transcriptVariant({ truth: 'false' }, stamp('misleading'), noRng)).toBe('fair');
    expect(transcriptVariant({ truth: 'true' }, stamp('irrelevant'), noRng)).toBe('fair');
    expect(transcriptVariant({ truth: 'false' }, stamp('irrelevant'), noRng)).toBe('fair');
  });

  it('rolls the problem chance without a stamp', () => {
    const roll = (value: number) => ({ next: () => value, int: () => 0 });
    expect(transcriptVariant({ truth: 'true' }, undefined, roll(0))).toBe('cut');
    expect(transcriptVariant({ truth: 'false' }, undefined, roll(0.49))).toBe('absent');
    expect(transcriptVariant({ truth: 'false' }, undefined, roll(0.5))).toBe('fair');
    expect(transcriptVariant({ truth: 'true' }, undefined, roll(0.99))).toBe('fair');
  });

  it('gives both outcomes over many unstamped rolls', () => {
    const rng = createRng(5);
    const seen = new Set(
      Array.from({ length: 200 }, () => transcriptVariant({ truth: 'false' }, undefined, rng)),
    );
    expect([...seen].sort()).toEqual(['absent', 'fair']);
  });
});

describe('generatePuzzle', () => {
  it('gives the Stenogram-pinned l5 stories the record their stamp describes (S7-59)', () => {
    const variants = (id: string) => {
      const found = STORIES.find((s) => s.id === id);
      const record = found?.stamps.find((x) => x.station === 'transcript');
      if (!found || !record) throw new Error(`${id} has no Stenogram stamp`);
      return [
        ...new Set(
          Array.from({ length: 20 }, (_, seed) => generatePuzzle(seed, found, record).variant),
        ),
      ];
    };
    // An invented quote: nobody said it. A cut that flips the meaning. The same words in full.
    expect(variants('l5-cytat-z-sesji')).toEqual(['absent']);
    expect(variants('l5-wywiad-skrocony')).toEqual(['cut']);
    expect(variants('l5-wyciety-cytat')).toEqual(['cut']);
    expect(variants('l5-wywiad-radio')).toEqual(['fair']);
  });

  it('is deterministic for a seed, story and stamp', () => {
    expect(generatePuzzle(11, story('false'), stamp('decisive'))).toEqual(
      generatePuzzle(11, story('false'), stamp('decisive')),
    );
  });

  it('has exactly one answer line for fair and cut, none for absent', () => {
    expect(TRANSCRIPT_LINES).toBe(4);
    const linesSeen = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      for (const [truth, variant] of [
        ['true', 'fair'],
        ['misleading', 'cut'],
      ] as const) {
        const p = generatePuzzle(seed, story(truth), stamp('decisive'));
        expect(p.variant).toBe(variant);
        expect(p.lines).toHaveLength(4);
        expect(p.answerLine).not.toBeNull();
        const holding = p.lines.filter((line) => keptWordCount(line, p.clip) === wordCount(p.clip));
        expect(holding).toEqual([p.lines[p.answerLine ?? -1] ?? '']);
        linesSeen.add(p.answerLine ?? -1);
      }
      const p = generatePuzzle(seed, story('false'), stamp('decisive'));
      expect(p.variant).toBe('absent');
      expect(p.answerLine).toBeNull();
      expect(p.lines).toHaveLength(4);
      expect(p.lines.filter((line) => DECOYS.includes(line))).toHaveLength(1);
      expect(p.lines.filter((line) => keptWordCount(line, p.clip) === wordCount(p.clip))).toEqual(
        [],
      );
      expect(new Set(p.lines).size).toBe(4);
    }
    expect([...linesSeen].sort()).toEqual([0, 1, 2, 3]);
  });
});

function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

describe('content pools', () => {
  it('meets the authored minimums', () => {
    expect(t.fair.length).toBeGreaterThanOrEqual(6);
    expect(t.cut.length).toBeGreaterThanOrEqual(6);
    expect(t.absent.length).toBeGreaterThanOrEqual(6);
    expect(t.filler.length).toBeGreaterThanOrEqual(12);
    expect(t.settings.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps every fair and cut clip inside its line and out of every other line', () => {
    for (const { line, clip } of [...t.fair, ...t.cut]) {
      expect(keptWordCount(line, clip), clip).toBe(wordCount(clip));
      expect(
        cutWords(line, clip).some((segment) => segment.cut),
        clip,
      ).toBe(true);
      for (const other of FILLER) {
        expect(keptWordCount(other, clip), `${clip} / ${other}`).toBeLessThan(wordCount(clip));
      }
    }
  });

  it('gives every absent clip a decoy that shares words but not the quote', () => {
    for (const { clip, decoy } of t.absent) {
      const kept = keptWordCount(decoy, clip);
      expect(kept, clip).toBeGreaterThan(0);
      expect(kept, clip).toBeLessThan(wordCount(clip));
      for (const other of FILLER) {
        expect(keptWordCount(other, clip), `${clip} / ${other}`).toBeLessThan(wordCount(clip));
      }
    }
  });
});

describe('cutWords', () => {
  it('marks the words the clip left out', () => {
    expect(cutWords(RECORD[1] ?? '', cut.clip)).toEqual([
      { text: 'Nie', cut: false },
      { text: 'obchodzą', cut: false },
      { text: 'mnie', cut: false },
      { text: 'plotki', cut: true },
      { text: '–', cut: true },
      { text: 'obchodzą', cut: true },
      { text: 'mnie', cut: true },
      { text: 'problemy', cut: false },
      { text: 'mieszkańców.', cut: false },
    ]);
  });

  it('ignores case and punctuation and leaves a dash between kept words', () => {
    expect(
      cutWords('Basen na Błoniach otworzymy w czerwcu – tak, jak obiecywaliśmy.', fair.clip)
        .filter((segment) => segment.cut)
        .map((segment) => segment.text),
    ).toEqual(['–', 'tak,', 'jak', 'obiecywaliśmy.']);
    expect(cutWords('Port – rynek dziś', 'Port rynek').map((segment) => segment.cut)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    expect(
      cutWords('Mówi się, że podniesiemy podatki. To nieprawda.', 'Podniesiemy podatki.').map(
        (segment) => segment.cut,
      ),
    ).toEqual([true, true, true, false, false, true, true]);
  });
});

describe('reduce', () => {
  it('moves to the judge phase on the right line', () => {
    const [next, effect] = reduce(initialState(cut), { type: 'pickLine', index: 1 });
    expect(next.phase).toBe('judge');
    expect(next.outcome).toBe('playing');
    expect(next.mistakes).toBe(0);
    expect(effect).toBe('found');
    expect(answerTarget(initialState(cut))).toBe('line-1');
    expect(answerTarget(next)).toBe('changed');
  });

  it('succeeds on the right judgement', () => {
    const judging = run(initialState(cut), [{ type: 'pickLine', index: 1 }]);
    const [done, effect] = reduce(judging, { type: 'judge', changed: true });
    expect(done.outcome).toBe('success');
    expect(effect).toBe('right');
    const fairJudging = run(initialState(fair), [{ type: 'pickLine', index: 1 }]);
    expect(answerTarget(fairJudging)).toBe('same');
    expect(reduce(fairJudging, { type: 'judge', changed: false })[0].outcome).toBe('success');
  });

  it('strikes a wrong judgement and counts a mistake', () => {
    const judging = run(initialState(fair), [{ type: 'pickLine', index: 1 }]);
    const [wrong, effect] = reduce(judging, { type: 'judge', changed: true });
    expect(wrong.judgeStruck).toEqual({ same: false, changed: true });
    expect(wrong.mistakes).toBe(1);
    expect(wrong.outcome).toBe('playing');
    expect(effect).toBe('mistake');
    expect(reduce(wrong, { type: 'judge', changed: true })[1]).toBe('blocked');
  });

  it('fails after a wrong line twice on Normal', () => {
    const state = initialState(cut);
    expect(state.maxMistakes).toBe(TRANSCRIPT_MAX_MISTAKES);
    const [once, first] = reduce(state, { type: 'pickLine', index: 0 });
    expect(once.struckLines).toEqual([true, false, false, false]);
    expect(once.mistakes).toBe(1);
    expect(first).toBe('mistake');
    const [twice, effect] = reduce(once, { type: 'pickLine', index: 3 });
    expect(twice.mistakes).toBe(2);
    expect(twice.outcome).toBe('failure');
    expect(effect).toBe('failed');
  });

  it('fails after one mistake on Ekspert', () => {
    const [next, effect] = reduce(initialState(cut, 'expert'), { type: 'notInTranscript' });
    expect(next.absentStruck).toBe(true);
    expect(next.outcome).toBe('failure');
    expect(effect).toBe('failed');
  });

  it('counts the decoy as a mistake and „Nie ma w zapisie” as right when the clip is absent', () => {
    expect(answerTarget(initialState(absent))).toBe('absent');
    const [wrong, effect] = reduce(initialState(absent), { type: 'pickLine', index: 1 });
    expect(wrong.mistakes).toBe(1);
    expect(wrong.phase).toBe('find');
    expect(effect).toBe('mistake');
    const [right, rightEffect] = reduce(wrong, { type: 'notInTranscript' });
    expect(right.outcome).toBe('success');
    expect(rightEffect).toBe('right');
  });

  it('counts a struck line only once', () => {
    const [once] = reduce(initialState(cut), { type: 'pickLine', index: 2 });
    const [again, effect] = reduce(once, { type: 'pickLine', index: 2 });
    expect(again.mistakes).toBe(1);
    expect(effect).toBe('blocked');
  });

  it('ignores a judgement while finding and a line while judging', () => {
    const start = initialState(cut);
    expect(reduce(start, { type: 'judge', changed: true })).toEqual([start, null]);
    const judging = run(start, [{ type: 'pickLine', index: 1 }]);
    expect(reduce(judging, { type: 'pickLine', index: 0 })).toEqual([judging, null]);
    expect(reduce(judging, { type: 'notInTranscript' })).toEqual([judging, null]);
  });

  it('moves over the 2×2 lines and the foot button, then over the two judgements', () => {
    const start = initialState(cut);
    expect(reduce(start, { type: 'move', dRow: -1, dCol: 0 })).toEqual([start, null]);
    const [right, effect] = reduce(start, { type: 'move', dRow: 0, dCol: 1 });
    expect(right.cursor).toBe(1);
    expect(effect).toBe('move');
    const atAbsent = run(start, [
      { type: 'move', dRow: 1, dCol: 0 },
      { type: 'move', dRow: 1, dCol: 0 },
      { type: 'move', dRow: 1, dCol: 1 },
    ]);
    expect(atAbsent.cursor).toBe(4);
    expect(reduce(atAbsent, { type: 'confirm' })[0].absentStruck).toBe(true);
    const judging = reduce(right, { type: 'confirm' })[0];
    expect(judging.phase).toBe('judge');
    expect(judging.cursor).toBe(0);
    expect(reduce(judging, { type: 'move', dRow: 1, dCol: 0 })).toEqual([judging, null]);
    const atChanged = run(judging, [{ type: 'move', dRow: 0, dCol: 1 }]);
    expect(atChanged.cursor).toBe(1);
    expect(reduce(atChanged, { type: 'confirm' })[0].outcome).toBe('success');
  });

  it('ignores input after the round ends', () => {
    const [done] = reduce(initialState(absent), { type: 'notInTranscript' });
    expect(reduce(done, { type: 'pickLine', index: 0 })).toEqual([done, null]);
  });
});
