// Client state for level events: the banner stack and the announced length of each outage and
// station lockout (the snapshot only has the time left, so the countdown rings need the total
// from the event that started it: the outage start, or `minigameFailed.lockoutMs`).
// Persistent visuals (badges, signs, the phone) read the folder tags and `station.outageMs` from
// the game store directly; this store holds only what the events themselves announce.

import { EVENT_BANNER_MAX } from '@redakcja/shared';
import { create } from 'zustand';
import type { GameplayEvent } from '../net/game-events.ts';
import {
  bannerForLevelEvent,
  type EventBanner,
  pushBanner,
  raidResolvedBanner,
  type StationNamer,
} from './event-model.ts';

type EventStore = {
  banners: readonly EventBanner[];
  /** Announced duration per station fixture id (ms). */
  outageTotals: Readonly<Record<string, number>>;
  /** Lockout of the last failed minigame per station fixture id (ms; scaled by difficulty). */
  lockoutTotals: Readonly<Record<string, number>>;
  serial: number;
  /** Feeds one gameplay event; other kinds are ignored. */
  handle(event: GameplayEvent, stationName: StationNamer): void;
  dismiss(id: string): void;
  reset(): void;
};

export const useEvents = create<EventStore>((set, get) => ({
  banners: [],
  outageTotals: {},
  lockoutTotals: {},
  serial: 0,
  handle(event, stationName) {
    const serial = get().serial + 1;
    if (event.kind === 'minigameFailed') {
      const { stationId, lockoutMs } = event;
      set((s) => ({ lockoutTotals: { ...s.lockoutTotals, [stationId]: lockoutMs } }));
    } else if (event.kind === 'levelEvent') {
      if (event.event === 'outage' && event.stationId) {
        const stationId = event.stationId;
        if (event.phase === 'start' && event.durationMs) {
          const durationMs = event.durationMs;
          set((s) => ({ outageTotals: { ...s.outageTotals, [stationId]: durationMs } }));
        } else if (event.phase === 'end') {
          set((s) => {
            const { [stationId]: _gone, ...rest } = s.outageTotals;
            return { outageTotals: rest };
          });
        }
      }
      const banner = bannerForLevelEvent(event, serial, stationName);
      if (banner) {
        set((s) => ({ serial, banners: pushBanner(s.banners, banner, EVENT_BANNER_MAX) }));
      }
    } else if (event.kind === 'raidResolved') {
      set((s) => ({
        serial,
        banners: pushBanner(s.banners, raidResolvedBanner(serial), EVENT_BANNER_MAX),
      }));
    }
  },
  dismiss(id) {
    set((s) => ({ banners: s.banners.filter((b) => b.id !== id) }));
  },
  reset() {
    set({ banners: [], outageTotals: {}, lockoutTotals: {}, serial: 0 });
  },
}));
