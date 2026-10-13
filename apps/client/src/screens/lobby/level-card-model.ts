// What the lobby's level card says about the run ahead (S7-25). A bag level's folder count
// depends only on its slot times, which the difficulty packs tighter, never on the run seed, so
// the lobby can name the exact count the briefing will deal before the run exists.
import { type BagTiming, bagSlotTimes, type Level } from '@redakcja/content';
import type { Difficulty } from '@redakcja/shared';

/**
 * Folders the level card shows: the dealt run's (`roomState.run.folders`) when there is one,
 * else the slots a bag level deals on `difficulty` (its pool fills every slot, `checkBag`), else the authored schedule's length.
 */
export function levelCardFolders(
  level: Pick<Level, 'schedule'> & { bag?: BagTiming | undefined },
  difficulty: Difficulty,
  runFolders: number | null,
): number {
  if (runFolders !== null) {
    return runFolders;
  }
  return level.bag ? bagSlotTimes(level.bag, difficulty).length : level.schedule.length;
}
