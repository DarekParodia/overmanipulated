// Client-side mirror of the sim's deadline-extension rule (packages/shared/src/sim/desk.ts
// `canExtendDeadline`), used only to decide whether to show the desk's "+20 s" button. The server
// re-checks every `extendDeadline` command, so a stale answer here only hides or shows a button.
import { DEADLINE_EXTENSION_MS, type Role } from '@redakcja/shared';

export type CrewEntry = { id: string; role: Role | null };

/**
 * Whether `playerId` may extend a deadline right now: the level's one extension is unused and the
 * player is the managing editor, or nobody took that role and at most three play.
 */
export function mayExtendDeadline(
  crew: readonly CrewEntry[],
  playerId: string | null,
  extensionUsed: boolean,
): boolean {
  if (extensionUsed || playerId === null) {
    return false;
  }
  const me = crew.find((member) => member.id === playerId);
  if (!me) {
    return false;
  }
  if (me.role === 'managingEditor') {
    return true;
  }
  return !crew.some((member) => member.role === 'managingEditor') && crew.length <= 3;
}

/** Whole seconds added by one extension (for the button label). */
export const DEADLINE_EXTENSION_S = Math.round(DEADLINE_EXTENSION_MS / 1000);
