import { describe, expect, test } from 'bun:test';
import { type FolderReason, folderReasonSchema } from '@redakcja/shared';
import { type CardWhyInput, cardWhy } from './card-why.ts';

function card(reason: FolderReason, patch: Partial<CardWhyInput> = {}): CardWhyInput {
  return {
    reason,
    scoreDelta: 0,
    bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    requiredStamps: 1,
    citedProofs: 0,
    hintStations: [],
    count: 1,
    tally: { correct: 0, wrongJustification: 0, wrong: 0, expired: 0, unfinished: 0 },
    ...patch,
  };
}

describe('Kolegium reason line', () => {
  test('names the reason and the base points without the bonuses', () => {
    expect(cardWhy(card('correctNormal', { scoreDelta: 10 }))).toBe('Trafny werdykt: +10 pkt');
    expect(
      cardWhy(
        card('correctImportant', {
          scoreDelta: 25,
          bonuses: { speed: 5, multiStamp: 0, bossCall: 0 },
        }),
      ),
    ).toBe('Ważna teczka, trafny werdykt: +20 pkt · tempo +5');
    expect(
      cardWhy(
        card('correctWithContext', {
          scoreDelta: 50,
          bonuses: { speed: 5, multiStamp: 10, bossCall: 15 },
        }),
      ),
    ).toBe('Kontekst w punkt: +20 pkt · tempo +5 · dowody +10 · szef +15');
    expect(cardWhy(card('correctionFiled', { scoreDelta: 15 }))).toBe(
      'Sprostowanie opublikowane: +15 pkt i odzyskana wiarygodność',
    );
  });

  test('explains every mistake, an expiry and an unfinished folder', () => {
    expect(cardWhy(card('weakProof', { scoreDelta: 5 }))).toBe(
      'Werdykt dobry, ale wskazany dowód nic nie rozstrzygał: połowa punktów',
    );
    expect(cardWhy(card('publishedFake', { scoreDelta: -20 }))).toBe(
      'Fałszywka trafiła do druku: najwyższa kara',
    );
    expect(cardWhy(card('rejectedTrue'))).toBe('Odrzuciliście prawdziwą wiadomość');
    expect(cardWhy(card('contextOnTrue'))).toBe('Prawdziwa wiadomość nie potrzebowała kontekstu');
    expect(cardWhy(card('publishedWithoutContext'))).toBe(
      'Ta wiadomość wymagała kontekstu, a poszła bez niego',
    );
    expect(cardWhy(card('rejectedContextStory'))).toBe('Wystarczyło opublikować z kontekstem');
    expect(cardWhy(card('expired', { scoreDelta: -5 }))).toBe('Termin minął: kara za spóźnienie');
    expect(cardWhy(card('expiredUnpenalized'))).toBe(
      'Termin minął bez kary: niepilna, niepotwierdzalna teczka',
    );
    expect(cardWhy(card('unfinished'))).toBe('Teczka została na koniec wydania: 0 pkt');
  });

  test('counts the proofs of a folder short of them, or names the hint cited alone', () => {
    expect(
      cardWhy(card('incompleteProof', { scoreDelta: 10, requiredStamps: 2, citedProofs: 1 })),
    ).toBe('Za mało dowodów (1 z 2): połowa punktów');
    expect(cardWhy(card('incompleteProof', { scoreDelta: 5, hintStations: ['aiScanner'] }))).toBe(
      'Skaner AI to tylko wskazówka: połowa punktów',
    );
    expect(cardWhy(card('incompleteProof', { scoreDelta: 5 }))).toBe(
      'Werdykt dobry, ale za mało dowodów: połowa punktów',
    );
  });

  test('lists a grouped story per outcome, with the summed bonuses', () => {
    expect(
      cardWhy(
        card('correctNormal', {
          scoreDelta: 0,
          count: 4,
          tally: { correct: 2, wrongJustification: 0, wrong: 1, expired: 0, unfinished: 1 },
          bonuses: { speed: 10, multiStamp: 0, bossCall: 0 },
        }),
      ),
    ).toBe('Dobrze ×2 · Błędny werdykt ×1 · Nie zdążyliście ×1 · tempo +10');
  });

  test('has a line for every reason', () => {
    for (const reason of folderReasonSchema.options) {
      expect(cardWhy(card(reason)).length).toBeGreaterThan(0);
    }
  });
});
