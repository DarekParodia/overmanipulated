// „Jak grać” (S7-96): whether the dialog is open and what it opens on. Tiny and always loaded, so
// the main menu, the lobby, the settings, the briefing chips and the in-game menu (S7-97) can
// open the dialog; the dialog itself is a lazy chunk (`HowToPlayHost`). The tab order and the
// tab stepping are pure and tested. S7-97 adds the practice round („Wypróbuj”): `practice` says
// whether a station's card has turned into a round ('playing') or its outcome ('result').
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

/** The practice round of the open station card: off, a minigame running, or its outcome. */
export type PracticeState = 'off' | 'playing' | 'result';

/**
 * Practice can start only from a station card and only out of play: `practiceAllowed` is false in
 * a match (the in-game menu), where the station card shows „Ćwiczenia po wydaniu” instead.
 */
export function canPractice(state: {
  tab: HowToTab;
  station: StationKind | null;
  practiceAllowed: boolean;
}): boolean {
  return state.practiceAllowed && state.tab === 'stations' && state.station !== null;
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
  practice: PracticeState;
  show(tab?: HowToTab, options?: HowToOptions): void;
  /** Switches the tab of the open dialog (Segmented tabs, a pad's Y). */
  setTab(tab: HowToTab): void;
  /** Opens a station's card on the stations tab, or back to the grid with null. */
  setStation(station: StationKind | null): void;
  /**
   * Starts the open card's practice round, marks its outcome or leaves it (back to the card).
   * Ignored when practice is not allowed here (`canPractice`).
   */
  setPractice(practice: PracticeState): void;
  hide(): void;
};

export const useHowTo = create<HowToStore>((set, get) => ({
  open: false,
  tab: 'intro',
  station: null,
  practiceAllowed: true,
  autoplay: false,
  practice: 'off',
  show(tab = 'intro', options = {}) {
    set({
      open: true,
      tab,
      station: options.station ?? null,
      practiceAllowed: options.practiceAllowed ?? true,
      autoplay: options.autoplay ?? false,
      practice: 'off',
    });
  },
  setTab(tab) {
    set({ tab, station: null, autoplay: false, practice: 'off' });
  },
  setStation(station) {
    set({ station, practice: 'off' });
  },
  setPractice(practice) {
    if (practice === 'off' || canPractice(get())) {
      set({ practice });
    }
  },
  hide() {
    set({ open: false, autoplay: false, practice: 'off' });
  },
}));
