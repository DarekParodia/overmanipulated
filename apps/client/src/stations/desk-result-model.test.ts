import { describe, expect, test } from 'bun:test';
import { type FolderReason, folderReasonSchema, type StationKind } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import {
  DESK_RESULT_MAX_LINES,
  type DeskResultInput,
  type DeskResultLine,
  type DeskResultStory,
  deskResultChips,
  deskResultLabel,
  deskResultLines,
} from './desk-result-model.ts';

/** A false story: the image search and the archive prove it, the AI scanner only hints. */
const fake: DeskResultStory = {
  correctVerdict: 'reject',
  stamps: [
    { id: 'f-image', station: 'imageSearch' },
    { id: 'f-archive', station: 'archive' },
    { id: 'f-ai', station: 'aiScanner' },
    { id: 'f-source', station: 'sourceRegistry' },
  ],
  justifyingStamps: ['f-image', 'f-archive', 'f-ai'],
};

/** A misleading story decided by the phone; the AI scanner hints. */
const misleading: DeskResultStory = {
  correctVerdict: 'publishWithContext',
  stamps: [
    { id: 'm-ai', station: 'aiScanner' },
    { id: 'm-phone', station: 'phone' },
  ],
  justifyingStamps: ['m-ai', 'm-phone'],
};

/** Level 1 has no archive. */
const L1: readonly StationKind[] = ['imageSearch', 'sourceRegistry', 'aiScanner'];

function input(reason: FolderReason, patch: Partial<DeskResultInput> = {}): DeskResultInput {
  return {
    reason,
    justifyingStampIds: ['f-image'],
    requiredStamps: 1,
    folderStampIds: ['f-image'],
    levelStations: L1,
    ...patch,
  };
}

describe('desk result lines', () => {
  test('a correct verdict names the stations of the cited proof', () => {
    expect(deskResultLines(input('correctImportant'), fake)).toEqual([
      { kind: 'proof', stations: ['imageSearch'] },
    ]);
    expect(deskResultLines(input('correctNormal'), fake)).toEqual([
      { kind: 'proof', stations: ['imageSearch'] },
    ]);
  });

  test('the AI scanner is never listed as proof, even on a correct verdict', () => {
    const lines = deskResultLines(
      input('correctWithContext', {
        justifyingStampIds: ['m-ai', 'm-phone'],
        folderStampIds: ['m-ai', 'm-phone'],
        levelStations: ['phone', 'aiScanner'],
      }),
      misleading,
    );
    expect(lines).toEqual([{ kind: 'proof', stations: ['phone'] }]);
  });

  test('a filed correction needs no line', () => {
    expect(deskResultLines(input('correctionFiled'), fake)).toEqual([]);
  });

  test('a weak proof names the deciding stations of this level', () => {
    const cited = { justifyingStampIds: ['f-source'], folderStampIds: ['f-source'] };
    expect(deskResultLines(input('weakProof', cited), fake)).toEqual([
      { kind: 'weakProof' },
      { kind: 'decidedBy', stations: ['imageSearch'] },
    ]);
    // Without the level's stations every deciding station is named; never the hint-only one.
    expect(deskResultLines(input('weakProof', { ...cited, levelStations: [] }), fake)).toEqual([
      { kind: 'weakProof' },
      { kind: 'decidedBy', stations: ['imageSearch', 'archive'] },
    ]);
  });

  test('citing only the AI scanner says it is only a hint', () => {
    const lines = deskResultLines(
      input('incompleteProof', { justifyingStampIds: ['f-ai'], folderStampIds: ['f-ai'] }),
      fake,
    );
    expect(lines).toEqual([
      { kind: 'hintOnly', stations: ['aiScanner'] },
      { kind: 'decidedBy', stations: ['imageSearch'] },
    ]);
    expect(lines.map(deskResultLabel)).toEqual(['Skaner AI to tylko wskazówka', 'Rozstrzyga:']);
  });

  test('too few proofs counts the cited proofs against the required ones', () => {
    const two = { requiredStamps: 2, levelStations: [] };
    expect(
      deskResultLines(
        input('incompleteProof', {
          ...two,
          justifyingStampIds: ['f-image'],
          folderStampIds: ['f-image', 'f-archive'],
        }),
        fake,
      ),
    ).toEqual([
      { kind: 'tooFewProofs', have: 1, need: 2 },
      { kind: 'decidedBy', stations: ['imageSearch', 'archive'] },
    ]);
    // A hint next to a real proof is still one proof, not "only a hint".
    const withHint = deskResultLines(
      input('incompleteProof', {
        ...two,
        justifyingStampIds: ['f-ai', 'f-image'],
        folderStampIds: ['f-ai', 'f-image'],
      }),
      fake,
    );
    expect(withHint[0]).toEqual({ kind: 'tooFewProofs', have: 1, need: 2 });
    expect(withHint[0] && deskResultLabel(withHint[0])).toBe('Dowody: 1 z 2');
  });

  test('a wrong verdict shows the right one and the proof the folder carried', () => {
    const lines = deskResultLines(
      input('publishedFake', { folderStampIds: ['f-source', 'f-image'] }),
      fake,
    );
    expect(lines).toEqual([
      { kind: 'correctVerdict', verdict: 'reject' },
      { kind: 'proofInFolder', stations: ['imageSearch'] },
    ]);
  });

  test('a wrong verdict without deciding proof names the stations nobody asked', () => {
    // The AI scanner's stamp is in the folder, but it is no proof.
    const lines = deskResultLines(
      input('publishedFake', {
        justifyingStampIds: ['f-source'],
        folderStampIds: ['f-ai', 'f-source'],
      }),
      fake,
    );
    expect(lines).toEqual([
      { kind: 'correctVerdict', verdict: 'reject' },
      { kind: 'notChecked', stations: ['imageSearch'] },
    ]);
  });

  test('rejecting a misleading story shows the context verdict', () => {
    const lines = deskResultLines(
      input('rejectedContextStory', {
        justifyingStampIds: ['m-ai'],
        folderStampIds: ['m-ai'],
        levelStations: ['phone', 'aiScanner'],
      }),
      misleading,
    );
    expect(lines).toEqual([
      { kind: 'correctVerdict', verdict: 'publishWithContext' },
      { kind: 'notChecked', stations: ['phone'] },
    ]);
    expect(pl.outcome.title.rejectedContextStory).toBe('Wystarczył kontekst');
  });

  test('every reason gets its lines', () => {
    const kinds = (reason: FolderReason) =>
      deskResultLines(
        input(reason, {
          justifyingStampIds: reason === 'incompleteProof' ? ['f-ai'] : ['f-image'],
          folderStampIds: reason === 'incompleteProof' ? ['f-ai'] : [],
        }),
        fake,
      ).map((line) => line.kind);
    const expected: Record<FolderReason, DeskResultLine['kind'][]> = {
      correctNormal: ['proof'],
      correctImportant: ['proof'],
      correctWithContext: ['proof'],
      correctionFiled: [],
      weakProof: ['weakProof', 'decidedBy'],
      incompleteProof: ['hintOnly', 'decidedBy'],
      publishedFake: ['correctVerdict', 'notChecked'],
      rejectedTrue: ['correctVerdict', 'notChecked'],
      contextOnTrue: ['correctVerdict', 'notChecked'],
      publishedWithoutContext: ['correctVerdict', 'notChecked'],
      rejectedContextStory: ['correctVerdict', 'notChecked'],
      expired: ['correctVerdict', 'notChecked'],
      expiredUnpenalized: ['correctVerdict', 'notChecked'],
      unfinished: ['correctVerdict', 'notChecked'],
    };
    for (const reason of folderReasonSchema.options) {
      expect({ reason, kinds: kinds(reason) }).toEqual({ reason, kinds: expected[reason] });
    }
  });

  test('an unknown story has no lines', () => {
    expect(deskResultLines(input('publishedFake'), undefined)).toEqual([]);
  });

  test('at most two lines of at most 8 words, three station chips each', () => {
    const wide: DeskResultStory = {
      correctVerdict: 'publishWithContext',
      stamps: [
        { id: 'w-image', station: 'imageSearch' },
        { id: 'w-archive', station: 'archive' },
        { id: 'w-source', station: 'sourceRegistry' },
        { id: 'w-phone', station: 'phone' },
        { id: 'w-data', station: 'dataLibrary' },
      ],
      justifyingStamps: ['w-image', 'w-archive', 'w-source', 'w-phone', 'w-data'],
    };
    const all = ['w-image', 'w-archive', 'w-source', 'w-phone', 'w-data'];
    const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
    for (const reason of folderReasonSchema.options) {
      for (const folderStampIds of [[], all]) {
        const lines = deskResultLines(
          input(reason, {
            justifyingStampIds: all.slice(0, 3),
            requiredStamps: 3,
            folderStampIds,
            levelStations: [],
          }),
          wide,
        );
        expect(lines.length).toBeLessThanOrEqual(DESK_RESULT_MAX_LINES);
        for (const line of lines) {
          const chips = deskResultChips(line);
          expect(chips.length).toBeLessThanOrEqual(3);
          const stamp = line.kind === 'correctVerdict' ? pl.stamps[line.verdict] : '';
          const total =
            words(deskResultLabel(line)) +
            chips.reduce((n, s) => n + words(pl.guidance.stationShort[s]), 0) +
            words(stamp);
          expect(total).toBeLessThanOrEqual(8);
        }
      }
    }
  });
});
