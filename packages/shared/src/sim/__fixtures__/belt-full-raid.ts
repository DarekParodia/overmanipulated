// Belt-full raid fixture (S7-13): one greybox level that two newsrooms play with different belts
// when a botRaid starts. The greybox conveyor has 4 tiles. Folders s0 and s1 arrive before the
// raid; a newsroom that takes s0 off the belt (`takeOffBelt`) meets the raid with 3 free tiles and
// gets 3 raid folders, one that leaves it there gets 2. The raid expires before s2 and s3 can
// arrive, so from then on the folder ids of the two newsrooms differ while the spawn keys match.
import type { SimLevel } from '../content.ts';
import type { GameState } from '../state.ts';
import { TEST_LEVEL } from './greybox.ts';

export const BELT_FULL_RAID_LEVEL: SimLevel = {
  ...TEST_LEVEL,
  id: 'test-belt-full-raid',
  schedule: [
    { atS: 1, storyId: 't-true', deadlineS: 60 },
    { atS: 2, storyId: 't-false', deadlineS: 60 },
    { atS: 5, storyId: 't-misleading', deadlineS: 60 },
    { atS: 6, storyId: 't-satire', deadlineS: 60 },
  ],
  events: [{ kind: 'botRaid', atS: 3, storyId: 't-false', deadlineS: 4, count: 3 }],
};

/** Level time when the raid starts. */
export const BELT_FULL_RAID_AT_MS = 3000;

/** Moves the folder spawned as `spawnKey` from the conveyor onto table-0, as a player would. */
export function takeOffBelt(state: GameState, spawnKey: string): GameState {
  const folder = Object.values(state.folders).find((f) => f.spawnKey === spawnKey);
  if (!folder) {
    throw new Error(`no folder ${spawnKey}`);
  }
  return {
    ...state,
    folders: {
      ...state.folders,
      [folder.id]: { ...folder, location: { kind: 'fixture', fixtureId: 'table-0' } },
    },
  };
}
