import { describe, expect, it } from 'bun:test';
import { LEVELS, prepareLevelRun } from '@redakcja/content';
import { DIFFICULTIES, ENDLESS_LEVEL_ID } from '@redakcja/shared';
import { levelCardFolders } from './level-card-model.ts';

const BAG = { firstAtS: 3, gapS: 18, lastSpawnS: 175 };

describe('levelCardFolders', () => {
  it('shows the dealt run when there is one', () => {
    expect(levelCardFolders({ bag: BAG, schedule: [] }, 'normal', 13)).toBe(13);
  });

  it('counts the slots a bag level deals on the chosen difficulty', () => {
    // Slots every 18 s × spawnGapFactor from 3 s up to 175 s: 10 on Normal, 11 on Trudny (16.2 s).
    expect(levelCardFolders({ bag: BAG, schedule: [] }, 'normal', null)).toBe(10);
    expect(levelCardFolders({ bag: BAG, schedule: [] }, 'hard', null)).toBe(11);
  });

  it('counts an authored schedule as it is', () => {
    const schedule = [
      { atS: 0, storyId: 'a', deadlineS: 60 },
      { atS: 20, storyId: 'b', deadlineS: 60 },
    ];
    expect(levelCardFolders({ schedule }, 'expert', null)).toBe(2);
  });

  it('names the count every real run of a level deals, on every difficulty', () => {
    for (const level of LEVELS) {
      if (level.id === ENDLESS_LEVEL_ID) {
        continue;
      }
      for (const difficulty of DIFFICULTIES) {
        for (const seed of [1, 0x5eed]) {
          const run = prepareLevelRun(level.id, { seed, difficulty });
          expect(run?.level.schedule.length).toBe(levelCardFolders(level, difficulty, null));
        }
      }
    }
  });
});
