// „Jak grać” (S7-96): whether the dialog is open and what it opens on. Tiny and always loaded, so
// the main menu, the lobby, the settings and later the briefing chips and the in-game menu can
// open the dialog; the dialog itself is a lazy chunk (`HowToPlayHost`). The tab order and the
// tab stepping are pure and tested.
import type { StationKind } from '@redakcja/shared';
import { create } from 'zustand';

export const HOW_TO_TABS = ['intro', 'stations', 'controls'] as const;
export type HowToTab = (typeof HOW_TO_TABS)[number];

/** The next tab in `direction` (+1 / -1), wrapping around: a pad's Y walks them in a circle. */
export function nextHowToTab(tab: HowToTab, direction: 1 | -1 = 1): HowToTab {
  const index = HOW_TO_TABS.indexOf(tab);
  const count = HOW_TO_TABS.length;
  return HOW_TO_TABS[(index + direction + count) % count] ?? tab;
}

export type HowToOptions = {
  /** The station the stations tab opens on (its help card); null opens the grid. */
  station?: StationKind | null;
  /** False in a match: the practice round („Wypróbuj”, S7-97) needs the player out of play. */
  practiceAllowed?: boolean;
  /** The lobby's first-time intro (S7-102): the tab bar is hidden, the intro plays alone. */
  autoplay?: boolean;
};

type HowToStore = {
  open: boolean;
  tab: HowToTab;
  station: StationKind | null;
  practiceAllowed: boolean;
  autoplay: boolean;
  show(tab?: HowToTab, options?: HowToOptions): void;
  /** Switches the tab of the open dialog (Segmented tabs, a pad's Y). */
  setTab(tab: HowToTab): void;
  /** Opens a station's card on the stations tab, or back to the grid with null. */
  setStation(station: StationKind | null): void;
  hide(): void;
};

export const useHowTo = create<HowToStore>((set) => ({
  open: false,
  tab: 'intro',
  station: null,
  practiceAllowed: true,
  autoplay: false,
  show(tab = 'intro', options = {}) {
    set({
      open: true,
      tab,
      station: options.station ?? null,
      practiceAllowed: options.practiceAllowed ?? true,
      autoplay: options.autoplay ?? false,
    });
  },
  setTab(tab) {
    set({ tab, station: null, autoplay: false });
  },
  setStation(station) {
    set({ station });
  },
  hide() {
    set({ open: false, autoplay: false });
  },
}));
