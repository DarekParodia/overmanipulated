import { describe, expect, test } from 'bun:test';
import { folderOutcomeSchema, folderReasonSchema } from '@redakcja/shared';
import { pl } from './pl.ts';

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe('one outcome vocabulary', () => {
  test('every reason and outcome has a title of at most 8 words', () => {
    for (const reason of folderReasonSchema.options) {
      expect(words(pl.outcome.title[reason])).toBeGreaterThan(0);
      expect(words(pl.outcome.title[reason])).toBeLessThanOrEqual(8);
    }
    for (const outcome of folderOutcomeSchema.options) {
      expect(words(pl.outcome.group[outcome])).toBeLessThanOrEqual(8);
    }
  });

  test('a wrong verdict is titled by what happened', () => {
    expect(pl.outcome.title.publishedFake).toBe('Fałszywka w druku!');
    expect(pl.outcome.title.rejectedTrue).toBe('To była prawda!');
    expect(pl.outcome.title.rejectedContextStory).toBe('Wystarczył kontekst');
    expect(pl.outcome.title.unfinished).toBe('Nie zdążyliście');
  });

  test('no „Zabrakło” list is left anywhere in the strings', async () => {
    const source = await Bun.file(new URL('./pl.ts', import.meta.url)).text();
    expect(source).not.toContain('Zabrakło');
  });
});
