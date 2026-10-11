import { describe, expect, it } from 'bun:test';
import { STORIES, TECHNIQUES } from '@redakcja/content';
import {
  cardViews,
  gridStep,
  levelNumberOfStory,
  parseMet,
  resolveTechniqueId,
  unlockedCount,
  withMeetings,
} from './model.ts';

const cards = [
  { id: 'a', aliases: ['a-two', 'a-three'] },
  { id: 'b', aliases: [] },
  { id: 'none', aliases: [] },
];

describe('resolveTechniqueId', () => {
  it('matches a card id or an alias and rejects unknown ids', () => {
    expect(resolveTechniqueId(cards, 'a')).toBe('a');
    expect(resolveTechniqueId(cards, 'a-three')).toBe('a');
    expect(resolveTechniqueId(cards, 'none')).toBe('none');
    expect(resolveTechniqueId(cards, 'nope')).toBeNull();
  });

  it('covers every technique id used by the real stories', () => {
    for (const story of STORIES) {
      expect(resolveTechniqueId(TECHNIQUES, story.technique)).not.toBeNull();
    }
  });
});

describe('parseMet', () => {
  it('reads a stored collection', () => {
    expect(parseMet('{"a":["s1","s2"]}')).toEqual({ a: ['s1', 's2'] });
  });

  it('drops malformed data instead of throwing', () => {
    expect(parseMet(null)).toEqual({});
    expect(parseMet('not json')).toEqual({});
    expect(parseMet('[1,2]')).toEqual({});
    expect(parseMet('{"a":"s1","b":[1,"x","x"],"c":[]}')).toEqual({ b: ['x'] });
  });
});

describe('withMeetings', () => {
  it('unlocks a card on its first meeting and maps aliases to the card', () => {
    const result = withMeetings({}, cards, [
      { storyId: 's1', techniqueId: 'a-two' },
      { storyId: 's2', techniqueId: 'a' },
      { storyId: 's3', techniqueId: 'b' },
    ]);
    expect(result.unlocked).toEqual(['a', 'b']);
    expect(result.met).toEqual({ a: ['s1', 's2'], b: ['s3'] });
  });

  it('reports a card as new only once and keeps the same object when nothing changes', () => {
    const first = withMeetings({}, cards, [{ storyId: 's1', techniqueId: 'a' }]);
    const again = withMeetings(first.met, cards, [{ storyId: 's1', techniqueId: 'a-two' }]);
    expect(again.unlocked).toEqual([]);
    expect(again.met).toBe(first.met);
    const more = withMeetings(first.met, cards, [{ storyId: 's9', techniqueId: 'a' }]);
    expect(more.unlocked).toEqual([]);
    expect(more.met.a).toEqual(['s1', 's9']);
  });

  it('ignores techniques without a card and never mutates the input', () => {
    const met = { b: ['s3'] };
    const result = withMeetings(met, cards, [{ storyId: 's4', techniqueId: 'unknown' }]);
    expect(result.met).toBe(met);
    withMeetings(met, cards, [{ storyId: 's5', techniqueId: 'a' }]);
    expect(met).toEqual({ b: ['s3'] });
  });
});

describe('cardViews', () => {
  it('keeps content order and marks collected cards', () => {
    const views = cardViews(cards, { b: ['s3'] });
    expect(views.map((v) => [v.technique.id, v.unlocked])).toEqual([
      ['a', false],
      ['b', true],
      ['none', false],
    ]);
    expect(views[1]?.stories).toEqual(['s3']);
    expect(unlockedCount(views)).toBe(1);
  });
});

describe('levelNumberOfStory', () => {
  it('reads the level number from a story id', () => {
    expect(levelNumberOfStory('l3-afera')).toBe(3);
    expect(levelNumberOfStory('l0-x')).toBe(0);
    expect(levelNumberOfStory('weird')).toBeNull();
  });
});

describe('gridStep', () => {
  it('moves by one and by a row, clamped to the list', () => {
    expect(gridStep(0, 'right', 3, 8)).toBe(1);
    expect(gridStep(0, 'left', 3, 8)).toBe(0);
    expect(gridStep(1, 'down', 3, 8)).toBe(4);
    expect(gridStep(4, 'up', 3, 8)).toBe(1);
    expect(gridStep(1, 'up', 3, 8)).toBe(1);
    expect(gridStep(7, 'right', 3, 8)).toBe(7);
  });

  it('lands on the last card when the row below is shorter', () => {
    expect(gridStep(4, 'down', 3, 8)).toBe(7);
    expect(gridStep(7, 'down', 3, 8)).toBe(7);
  });

  it('ignores other intents and empty lists', () => {
    expect(gridStep(2, 'confirm', 3, 8)).toBe(2);
    expect(gridStep(0, 'down', 3, 0)).toBe(0);
  });
});
