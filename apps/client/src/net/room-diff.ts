// What changed between two room states of the same room (S7-86), for the cues the lobby and the
// game play on a `roomState`: someone started watching, the mode switched, a player changed
// newsroom, the host changed (S7-87). Pure; the first state of a room (previous null or another
// room) changes nothing.
import type { LobbySpectator, RoomStateMessage } from '@redakcja/shared';

type RoomDiffState = Pick<RoomStateMessage, 'roomCode' | 'mode' | 'players' | 'spectators'>;

function sameRoom(previous: RoomDiffState | null, next: RoomDiffState): previous is RoomDiffState {
  return previous !== null && previous.roomCode === next.roomCode;
}

/**
 * Spectators in `next` who were not watching in `previous`, in list order; the local member is
 * never announced to itself.
 */
export function joinedSpectators(
  previous: RoomDiffState | null,
  next: RoomDiffState,
  selfId: string | null,
): LobbySpectator[] {
  if (!sameRoom(previous, next)) {
    return [];
  }
  const before = new Set(previous.spectators.map((s) => s.id));
  return next.spectators.filter((s) => s.id !== selfId && !before.has(s.id));
}

/** Whether the host switched between Razem and Na punkty. */
export function modeSwitched(previous: RoomDiffState | null, next: RoomDiffState): boolean {
  return sameRoom(previous, next) && previous.mode !== next.mode;
}

/**
 * Ids of players who moved to the other newsroom (a mode switch deals everyone anew, so it is
 * not counted here: it has its own cue).
 */
export function teamSwitches(previous: RoomDiffState | null, next: RoomDiffState): string[] {
  if (!sameRoom(previous, next) || previous.mode !== next.mode) {
    return [];
  }
  const before = new Map(previous.players.map((p) => [p.id, p.team] as const));
  return next.players
    .filter((p) => before.has(p.id) && before.get(p.id) !== p.team)
    .map((p) => p.id);
}

/**
 * Whether the host role moved to another member (S7-87: a transfer, or the server handing it on
 * when the host left); the first state of a room changes nothing.
 */
export function hostChanged(
  previous: Pick<RoomStateMessage, 'roomCode' | 'hostId'> | null,
  next: Pick<RoomStateMessage, 'roomCode' | 'hostId'>,
): boolean {
  return (
    previous !== null && previous.roomCode === next.roomCode && previous.hostId !== next.hostId
  );
}
