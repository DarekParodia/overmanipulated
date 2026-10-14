// Player colours in a room (S7-105): each newsroom hands out the four colours (and spawn points)
// once. A preferred colour is honoured when no teammate holds it; otherwise the lowest free one,
// with no error. The server assigns with `pickColor`; the profile greys out `takenColors`.
import { PLAYER_COLOR_COUNT } from './constants.ts';
import type { TeamIndex } from './protocol.ts';

/** `preferred` when it is free, else the lowest colour not in `taken` (0 when all are taken). */
export function pickColor(taken: ReadonlySet<number>, preferred: number | null): number {
  if (preferred !== null && preferred >= 0 && preferred < PLAYER_COLOR_COUNT) {
    if (!taken.has(preferred)) {
      return preferred;
    }
  }
  for (let color = 0; color < PLAYER_COLOR_COUNT; color++) {
    if (!taken.has(color)) {
      return color;
    }
  }
  return 0;
}

/** The colours `team`'s players other than `selfId` hold. */
export function takenColors(
  players: readonly { id: string; team: TeamIndex; colorIndex: number }[],
  team: TeamIndex,
  selfId: string | null,
): Set<number> {
  return new Set(
    players.filter((p) => p.team === team && p.id !== selfId).map((p) => p.colorIndex),
  );
}
