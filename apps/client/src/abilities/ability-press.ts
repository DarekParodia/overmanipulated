// What one press of the role ability (R / RB / the fourth touch button, S7-39) does on this
// client: send `useAbility`, or give the local "denied" feedback and send nothing. The server
// decides what the press achieves; this only keeps hopeless presses off the wire and makes
// them felt at once.
//
// It applies the first four steps of the shared preview order (cluster-b-roles §3.2): no role or
// not in the crew → denied; a running field call or an armed ability → send (the server cancels
// or disarms); cooling → denied; otherwise send. The per-ability `blocked` rules arrive with the
// shared `abilityPreview` (S7-37/S7-38), which replaces this gate when the HUD chip lands (S7-40).
import type { CrewSnapshot, Role } from '@redakcja/shared';
import { selectCrewMember, useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';

export type AbilityPress = 'send' | 'denied';

export type AbilityPressInput = {
  /** The local player's role; null without one. */
  role: Role | null;
  /** The local player's ability state from the latest snapshot. */
  member: CrewSnapshot | undefined;
  /** Level time of the latest snapshot. */
  elapsedMs: number;
};

/** Pure: whether a press is sent or denied locally. */
export function abilityPressOutcome({ role, member, elapsedMs }: AbilityPressInput): AbilityPress {
  if (!role || !member) {
    return 'denied';
  }
  if (member.fieldCall !== null || member.abilityArmed) {
    return 'send';
  }
  return elapsedMs < member.abilityReadyAtMs ? 'denied' : 'send';
}

/** The outcome for the local player, read from the room and the latest snapshot. */
export function localAbilityPress(playerId: string | null): AbilityPress {
  const role = useApp.getState().room?.players.find((p) => p.id === playerId)?.role ?? null;
  const game = useGame.getState();
  return abilityPressOutcome({
    role,
    member: selectCrewMember(game, playerId),
    elapsedMs: game.elapsedMs,
  });
}
