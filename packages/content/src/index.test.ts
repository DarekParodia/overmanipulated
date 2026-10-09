import { describe, expect, it } from 'bun:test';
import { getLevel, storiesForLevel } from './index.ts';

describe('storiesForLevel', () => {
  it('includes the stories of level events', () => {
    const level = getLevel('l6-atak');
    if (!level) {
      throw new Error('level 6 missing');
    }
    const book = storiesForLevel(level);
    for (const event of level.events) {
      if (event.kind !== 'outage') {
        expect(book[event.storyId]).toBeDefined();
      }
    }
  });
});
