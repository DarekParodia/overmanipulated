// The local player profile (S7-104), `redakcja.profile.v1`: what the profile dialog shows and
// whether it is open. Tracking: `trackEvent` folds each gameplay event of the match into a tally
// (fed through `onGameEvent` by net/profile-tracking.ts), `recordLevelEnd` adds the finished
// level (net/session.ts, beside the campaign progress) and `startMatch` drops a tally left by a
// level the player walked out of. A spectator, or anyone not seated in the room, is not tracked.
import type { Accessory, GameEvent, LevelEndMessage, Look, PlayerStats } from '@redakcja/shared';
import { create } from 'zustand';
import { useApp } from './app.ts';
import {
  type Profile,
  parseProfile,
  type Seat,
  withEvent,
  withLevelEnd,
  withoutStats,
} from './profile-model.ts';
import { readStored, writeStored } from './safe-storage.ts';

export const PROFILE_KEY = 'redakcja.profile.v1';

/** The profile's look as the room gets it (join and `setLook`, S7-105). */
export function profileLook(): Look {
  const { color, accessory } = useProfile.getState().profile;
  return { color, accessory };
}

/** The local player's seat in the current room; null outside a room or as a spectator. */
export function currentSeat(): Seat | null {
  const { playerId, room } = useApp.getState();
  const me = playerId ? room?.players.find((player) => player.id === playerId) : undefined;
  return me ? { playerId: me.id, team: me.team, role: me.role } : null;
}

type ProfileStore = {
  profile: Profile;
  /** This match's counters so far (memory only); null before the first event. */
  tally: PlayerStats | null;
  open: boolean;
  show(): void;
  hide(): void;
  /** A new level starts: the tally starts from zero. */
  startMatch(): void;
  trackEvent(event: GameEvent): void;
  recordLevelEnd(end: LevelEndMessage): void;
  setColor(color: number | null): void;
  setAccessory(accessory: Accessory): void;
  /** „Wyczyść statystyki”: the counters go, the look stays. */
  clearStats(): void;
};

export const useProfile = create<ProfileStore>((set, get) => {
  function save(profile: Profile): void {
    set({ profile });
    writeStored('local', PROFILE_KEY, JSON.stringify(profile));
  }

  return {
    profile: parseProfile(readStored('local', PROFILE_KEY)),
    tally: null,
    open: false,
    show() {
      set({ open: true });
    },
    hide() {
      set({ open: false });
    },
    startMatch() {
      set({ tally: null });
    },
    trackEvent(event) {
      const tally = withEvent(get().tally, event, currentSeat());
      if (tally !== get().tally) {
        set({ tally });
      }
    },
    recordLevelEnd(end) {
      const seat = currentSeat();
      if (seat) {
        save(withLevelEnd(get().profile, end, seat, get().tally));
      }
      set({ tally: null });
    },
    setColor(color) {
      save({ ...get().profile, color });
    },
    setAccessory(accessory) {
      save({ ...get().profile, accessory });
    },
    clearStats() {
      save(withoutStats(get().profile));
    },
  };
});
