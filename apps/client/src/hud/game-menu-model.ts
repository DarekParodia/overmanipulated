// In-game menu (S7-10): open state and the pure rules behind the sheet. A solo player's menu
// pauses the level on the server; with two or more people the shared level runs on.
import type { RoomPhase, RoomStateMessage } from '@redakcja/shared';
import { create } from 'zustand';

/** „Wyjdź z redakcji” needs a second press within this window (client presentation timing). */
export const LEAVE_CONFIRM_MS = 3000;

/** Connected people in the room (a teammate away on a reconnect does not count). */
export function connectedPlayers(room: RoomStateMessage | null): number {
  return room ? room.players.filter((p) => p.connected).length : 0;
}

/** The client asks for a pause while the menu is open in a solo level. */
export function wantsPause(open: boolean, phase: RoomPhase | null, connected: number): boolean {
  return open && phase === 'playing' && connected === 1;
}

/**
 * The status chip in the sheet's header: „Pauza” once the server holds the level (or while a
 * solo player's request is on its way), the orange „Gra trwa dalej” with teammates; none
 * outside play.
 */
export type MenuStatus = 'paused' | 'live' | null;

export function menuStatus(
  phase: RoomPhase | null,
  connected: number,
  paused: boolean,
): MenuStatus {
  if (phase !== 'playing') {
    return null;
  }
  return paused || connected <= 1 ? 'paused' : 'live';
}

/**
 * One press of „Wyjdź z redakcji”: the first arms it („Na pewno? Wyjdź”), a second within
 * `LEAVE_CONFIRM_MS` leaves. `armedAt` is the time of the arming press, or null.
 */
export function leavePress(
  armedAt: number | null,
  now: number,
): { leave: boolean; armedAt: number | null } {
  if (armedAt !== null && now - armedAt <= LEAVE_CONFIRM_MS) {
    return { leave: true, armedAt: null };
  }
  return { leave: false, armedAt: now };
}

type GameMenuStore = {
  open: boolean;
  setOpen(open: boolean): void;
};

export const useGameMenu = create<GameMenuStore>((set) => ({
  open: false,
  setOpen(open) {
    set({ open });
  },
}));
