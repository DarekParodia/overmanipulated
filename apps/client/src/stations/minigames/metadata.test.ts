import { describe, expect, it } from 'bun:test';
import { STORIES, TECHNIQUES } from '@redakcja/content';
import { createRng, METADATA_FIELDS, METADATA_MAX_MISTAKES } from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import {
  type Action,
  answerChoice,
  CHOICES,
  contradictionField,
  type GameState,
  generatePuzzle,
  initialState,
  isRight,
  METADATA_FIELD_IDS,
  type MetadataPuzzle,
  metadataOutcome,
  REAL_FILE_FIELDS,
  reasonKey,
  reduce,
  TECHNIQUE_FIELD,
} from './metadata.logic.ts';

const t = pl.minigames.metadata;
/** Pools as plain string lists, for `toContain`. */
const OLD_TIMES: readonly string[] = t.times.map((x) => x.old);
const FILE_TIMES: readonly string[] = t.times.map((x) => x.file);
const EDITED_PHOTO: readonly string[] = t.software.photo.edited;
const EDITED_RECORDING: readonly string[] = t.software.recording.edited;
const OTHER_TOWNS: readonly string[] = t.otherTowns;
const story = (
  truth: 'true' | 'false' | 'misleading',
  type: 'photo' | 'recording' | 'post' = 'photo',
  technique = 'none',
) => ({
  headline: 'Pożar w porcie',
  truth,
  type,
  technique,
});
const stamp = (relevance: 'decisive' | 'misleading' | 'irrelevant') => ({
  relevance,
  text: 'Test',
});

const CLAIM = {
  taken: 'dziś, ok. 14:00',
  device: 'zdjęcie z telefonu świadka',
  software: 'bez obróbki',
  place: 'Nowe Brzegi, Rynek',
};
const puzzle = (patch: Partial<MetadataPuzzle>): MetadataPuzzle => ({
  mediaKind: 'photo',
  claim: CLAIM,
  file: {
    taken: 'dziś, 14:03',
    device: 'Telefon, aparat tylny',
    software: 'zapis z aparatu',
    place: 'Nowe Brzegi, Rynek',
  },
  outcome: 'consistent',
  contradiction: null,
  ...patch,
});
const contradiction = puzzle({
  outcome: 'contradiction',
  contradiction: 'software',
  file: { ...puzzle({}).file, software: 'Edytor zdjęć – zapisano 3 razy' },
});
const stripped = puzzle({
  outcome: 'stripped',
  file: { taken: null, device: null, software: null, place: null },
});

function run(state: GameState, actions: Action[]): GameState {
  return actions.reduce((s, action) => reduce(s, action)[0], state);
}

describe('metadataOutcome', () => {
  // A stamp decides without touching the RNG; a throwing RNG proves it.
  const noRng = {
    next: () => {
      throw new Error('rng used');
    },
    int: () => {
      throw new Error('rng used');
    },
  };

  it('maps the stamp to the outcome', () => {
    expect(metadataOutcome({ truth: 'true' }, stamp('irrelevant'), noRng)).toBe('stripped');
    expect(metadataOutcome({ truth: 'false' }, stamp('irrelevant'), noRng)).toBe('stripped');
    expect(metadataOutcome({ truth: 'misleading' }, stamp('irrelevant'), noRng)).toBe('stripped');
    expect(metadataOutcome({ truth: 'true' }, stamp('decisive'), noRng)).toBe('consistent');
    expect(metadataOutcome({ truth: 'false' }, stamp('decisive'), noRng)).toBe('contradiction');
    expect(metadataOutcome({ truth: 'true' }, stamp('misleading'), noRng)).toBe('contradiction');
    expect(metadataOutcome({ truth: 'false' }, stamp('misleading'), noRng)).toBe('consistent');
  });

  it('rolls the weights without a stamp', () => {
    const roll = (value: number) => ({ next: () => value, int: () => 0 });
    expect(metadataOutcome({ truth: 'true' }, undefined, roll(0))).toBe('consistent');
    expect(metadataOutcome({ truth: 'true' }, undefined, roll(0.39))).toBe('consistent');
    expect(metadataOutcome({ truth: 'true' }, undefined, roll(0.4))).toBe('contradiction');
    expect(metadataOutcome({ truth: 'true' }, undefined, roll(0.79))).toBe('contradiction');
    expect(metadataOutcome({ truth: 'true' }, undefined, roll(0.8))).toBe('stripped');
    expect(metadataOutcome({ truth: 'true' }, undefined, roll(0.99))).toBe('stripped');
  });

  it('gives every outcome over many unstamped rolls', () => {
    const rng = createRng(3);
    const seen = new Set(
      Array.from({ length: 200 }, () => metadataOutcome({ truth: 'true' }, undefined, rng)),
    );
    expect([...seen].sort()).toEqual(['consistent', 'contradiction', 'stripped']);
  });
});

describe('generatePuzzle', () => {
  it('has the four fields the constants promise', () => {
    expect(METADATA_FIELD_IDS).toEqual(['taken', 'device', 'software', 'place']);
    expect(METADATA_FIELD_IDS).toHaveLength(METADATA_FIELDS);
    expect(CHOICES).toEqual(['taken', 'device', 'software', 'place', 'matches', 'noData']);
  });

  it('is deterministic for a seed, story and stamp', () => {
    expect(generatePuzzle(11, story('false'), stamp('decisive'))).toEqual(
      generatePuzzle(11, story('false'), stamp('decisive')),
    );
  });

  it('contradicts exactly one field, or none, over 200 seeds', () => {
    const fieldsSeen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const p = generatePuzzle(seed, story('false'), stamp('decisive'));
      expect(p.outcome).toBe('contradiction');
      expect(Object.keys(p.file)).toHaveLength(4);
      const contradicted = p.contradiction;
      expect(contradicted).not.toBeNull();
      if (contradicted === null) continue;
      fieldsSeen.add(contradicted);
      // The contradicting value is one of the pools' contradicting entries.
      const value = p.file[contradicted];
      if (contradicted === 'taken') expect(OLD_TIMES).toContain(value ?? '');
      if (contradicted === 'device') expect(value).toBe('brak – plik wygenerowany');
      if (contradicted === 'software') expect(EDITED_PHOTO).toContain(value ?? '');
      if (contradicted === 'place') {
        expect(OTHER_TOWNS).toContain(value ?? '');
        expect(p.file.place).not.toBe(p.claim.place);
      } else {
        expect(p.file.place).toBe(p.claim.place);
      }
      expect(answerChoice(p)).toBe(contradicted);
    }
    expect([...fieldsSeen].sort()).toEqual(['device', 'place', 'software', 'taken']);

    for (let seed = 0; seed < 200; seed++) {
      const p = generatePuzzle(seed, story('true'), stamp('decisive'));
      expect(p.outcome).toBe('consistent');
      expect(p.contradiction).toBeNull();
      expect(p.file.place).toBe(p.claim.place);
      expect(FILE_TIMES).toContain(p.file.taken ?? '');
      expect(p.file.software).toBe(t.software.photo.clean);
      expect(answerChoice(p)).toBe('matches');
    }
  });

  it('never brands a real file a fake: only its time or place contradicts', () => {
    expect(REAL_FILE_FIELDS).toEqual(['taken', 'place']);
    for (const [truth, relevance] of [
      ['true', 'misleading'],
      ['misleading', 'decisive'],
    ] as const) {
      const fieldsSeen = new Set<string>();
      for (let seed = 0; seed < 200; seed++) {
        const p = generatePuzzle(seed, story(truth), stamp(relevance));
        expect(p.outcome).toBe('contradiction');
        fieldsSeen.add(p.contradiction ?? 'none');
        expect(p.file.device).not.toBe('brak – plik wygenerowany');
        expect(p.file.software).toBe(t.software.photo.clean);
      }
      expect([...fieldsSeen].sort()).toEqual(['place', 'taken']);
    }
  });

  it('shows the field the technique gives away, whatever the seed', () => {
    expect(TECHNIQUE_FIELD).toEqual({
      'stare-zdjecie-nowy-podpis': 'taken',
      'zdjecie-w-zlym-czasie': 'taken',
      'obraz-wygenerowany-ai': 'device',
      'deepfake-wideo': 'software',
    });
    for (let seed = 0; seed < 50; seed++) {
      const old = generatePuzzle(
        seed,
        story('misleading', 'photo', 'stare-zdjecie-nowy-podpis'),
        stamp('decisive'),
      );
      expect(old.contradiction).toBe('taken');
      expect(OLD_TIMES).toContain(old.file.taken ?? '');
      const generated = generatePuzzle(
        seed,
        story('false', 'photo', 'obraz-wygenerowany-ai'),
        stamp('decisive'),
      );
      expect(generated.contradiction).toBe('device');
      expect(generated.file.device).toBe('brak – plik wygenerowany');
      // A deepfake video went through a video editor (S7-59).
      const deepfake = generatePuzzle(
        seed,
        story('false', 'recording', 'deepfake-wideo'),
        stamp('decisive'),
      );
      expect(deepfake.contradiction).toBe('software');
      expect(EDITED_RECORDING).toContain(deepfake.file.software ?? '');
    }
    // A technique field needs no draw: the RNG is untouched.
    const rng = createRng(5);
    expect(contradictionField({ truth: 'false', technique: 'obraz-wygenerowany-ai' }, rng)).toBe(
      'device',
    );
    expect(rng.next()).toBe(createRng(5).next());
  });

  it('maps only techniques that exist (ids or aliases)', () => {
    const known = new Set(TECHNIQUES.flatMap((card) => [card.id, ...card.aliases]));
    for (const technique of Object.keys(TECHNIQUE_FIELD)) {
      expect({ technique, known: known.has(technique) }).toEqual({ technique, known: true });
    }
  });

  it('gives every authored Metadane stamp the puzzle its text describes (S7-57)', () => {
    const authored = STORIES.flatMap((s) =>
      s.stamps.filter((x) => x.station === 'metadata').map((x) => ({ story: s, stamp: x })),
    );
    expect(authored.length).toBeGreaterThan(0);
    for (const { story: s, stamp: x } of authored) {
      for (let seed = 0; seed < 20; seed++) {
        const p = generatePuzzle(seed, s, x);
        if (x.relevance === 'irrelevant') {
          expect({ id: x.id, outcome: p.outcome }).toEqual({ id: x.id, outcome: 'stripped' });
        }
        if (s.truth !== 'false') {
          expect({ id: x.id, device: p.file.device }).not.toEqual({
            id: x.id,
            device: 'brak – plik wygenerowany',
          });
        }
      }
    }
    const field = (id: string) => {
      const found = authored.find(({ stamp: x }) => x.id === id);
      if (!found) throw new Error(`${id} missing`);
      return generatePuzzle(1, found.story, found.stamp).contradiction;
    };
    expect(field('l5-zdjecie-sprzed-lat-metadata')).toBe('taken');
    expect(field('l5-burmistrz-na-jachcie-metadata')).toBe('device');
    // S7-59: the new Metadane-pinned stories.
    expect(field('l5-film-z-montazu-metadata')).toBe('software');
    expect(field('l5-drzemka-na-sesji-metadata')).toBe('taken');
    const reader = authored.find(({ stamp: x }) => x.id === 'l5-zdjecie-czytelnika-metadata');
    if (!reader) throw new Error('l5-zdjecie-czytelnika-metadata missing');
    for (let seed = 0; seed < 20; seed++) {
      expect(generatePuzzle(seed, reader.story, reader.stamp).outcome).toBe('consistent');
    }
  });

  it('strips every field for an irrelevant stamp', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = generatePuzzle(seed, story('false'), stamp('irrelevant'));
      expect(p.outcome).toBe('stripped');
      expect(p.file).toEqual({ taken: null, device: null, software: null, place: null });
      expect(p.contradiction).toBeNull();
      expect(answerChoice(p)).toBe('noData');
    }
  });

  it('describes the media by story type', () => {
    expect(generatePuzzle(1, story('true', 'photo'), stamp('decisive')).mediaKind).toBe('photo');
    const recording = generatePuzzle(1, story('true', 'recording'), stamp('decisive'));
    expect(recording.mediaKind).toBe('recording');
    expect(recording.claim.device.startsWith('nagranie')).toBe(true);
    expect(recording.claim.software).toBe('bez montażu');
    const post = generatePuzzle(1, story('true', 'post'), stamp('decisive'));
    expect(post.mediaKind).toBe('screenshot');
    expect(post.claim.device.startsWith('zrzut ekranu')).toBe(true);
  });
});

describe('isRight and reasons', () => {
  it('accepts only the contradicting field, „Zgadza się” or „Brak danych”', () => {
    expect(isRight(contradiction, { kind: 'field', field: 'software' })).toBe(true);
    expect(isRight(contradiction, { kind: 'field', field: 'taken' })).toBe(false);
    expect(isRight(contradiction, { kind: 'matches' })).toBe(false);
    expect(isRight(contradiction, { kind: 'noData' })).toBe(false);
    expect(isRight(puzzle({}), { kind: 'matches' })).toBe(true);
    expect(isRight(puzzle({}), { kind: 'field', field: 'place' })).toBe(false);
    expect(isRight(stripped, { kind: 'noData' })).toBe(true);
    expect(isRight(stripped, { kind: 'matches' })).toBe(false);
  });

  it('explains the answer', () => {
    expect(reasonKey(contradiction)).toBe('software');
    expect(reasonKey(puzzle({}))).toBe('consistent');
    expect(reasonKey(stripped)).toBe('stripped');
    expect(t.reasons[reasonKey(stripped)]).toBe('Serwis usunął dane – to nic nie dowodzi.');
  });
});

describe('reduce', () => {
  it('succeeds on the right field', () => {
    const [next, effect] = reduce(initialState(contradiction), {
      type: 'pick',
      choice: 'software',
    });
    expect(next.outcome).toBe('success');
    expect(next.picked).toBe('software');
    expect(effect).toBe('right');
  });

  it('strikes a consistent field and counts one mistake', () => {
    const [next, effect] = reduce(initialState(contradiction), { type: 'pick', choice: 'taken' });
    expect(next.mistakes).toBe(1);
    expect(next.struck.taken).toBe(true);
    expect(next.outcome).toBe('playing');
    expect(effect).toBe('mistake');
  });

  it('fails after two mistakes on Normal', () => {
    const state = initialState(contradiction);
    expect(state.maxMistakes).toBe(METADATA_MAX_MISTAKES);
    const [once] = reduce(state, { type: 'pick', choice: 'taken' });
    const [twice, effect] = reduce(once, { type: 'pick', choice: 'matches' });
    expect(twice.mistakes).toBe(2);
    expect(twice.outcome).toBe('failure');
    expect(effect).toBe('failed');
  });

  it('fails after one mistake on Ekspert', () => {
    const [next, effect] = reduce(initialState(contradiction, 'expert'), {
      type: 'pick',
      choice: 'device',
    });
    expect(next.outcome).toBe('failure');
    expect(effect).toBe('failed');
  });

  it('counts „Zgadza się” on stripped data as a mistake and „Brak danych” as right', () => {
    const [wrong, effect] = reduce(initialState(stripped), { type: 'pick', choice: 'matches' });
    expect(wrong.mistakes).toBe(1);
    expect(wrong.struck.matches).toBe(true);
    expect(effect).toBe('mistake');
    const [right, rightEffect] = reduce(wrong, { type: 'pick', choice: 'noData' });
    expect(right.outcome).toBe('success');
    expect(rightEffect).toBe('right');
  });

  it('counts a struck choice only once', () => {
    const [once] = reduce(initialState(contradiction), { type: 'pick', choice: 'taken' });
    const [again, effect] = reduce(once, { type: 'pick', choice: 'taken' });
    expect(again.mistakes).toBe(1);
    expect(effect).toBe('blocked');
  });

  it('moves over the 2×2 grid and the foot row and confirms the cursor', () => {
    const start = initialState(stripped);
    expect(start.cursor).toBe(0);
    expect(reduce(start, { type: 'move', dRow: -1, dCol: 0 })).toEqual([start, null]);
    expect(reduce(start, { type: 'move', dRow: 0, dCol: -1 })).toEqual([start, null]);
    const [right, effect] = reduce(start, { type: 'move', dRow: 0, dCol: 1 });
    expect(right.cursor).toBe(1);
    expect(effect).toBe('move');
    const atNoData = run(start, [
      { type: 'move', dRow: 1, dCol: 0 },
      { type: 'move', dRow: 1, dCol: 0 },
      { type: 'move', dRow: 1, dCol: 0 },
      { type: 'move', dRow: 0, dCol: 1 },
    ]);
    expect(CHOICES[atNoData.cursor]).toBe('noData');
    expect(reduce(atNoData, { type: 'confirm' })[0].outcome).toBe('success');
    const atMatches = run(atNoData, [{ type: 'move', dRow: 0, dCol: -1 }]);
    expect(CHOICES[atMatches.cursor]).toBe('matches');
    expect(reduce(atMatches, { type: 'confirm' })[0].mistakes).toBe(1);
  });

  it('ignores input after the round ends', () => {
    const [done] = reduce(initialState(puzzle({})), { type: 'pick', choice: 'matches' });
    expect(reduce(done, { type: 'pick', choice: 'taken' })).toEqual([done, null]);
  });
});
