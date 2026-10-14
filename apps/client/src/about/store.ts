// „O grze” (S7-103): whether the dialog is open and on which tab. Tiny and always loaded, so the
// main-menu footer can open it; the dialog itself is a lazy chunk (`AboutHost`, extras route).
import { create } from 'zustand';

/** Gra (authors, licence, privacy, version) · Zasoby (CREDITS.md) · Biblioteki. */
export const ABOUT_TABS = ['game', 'credits', 'libraries'] as const;
export type AboutTab = (typeof ABOUT_TABS)[number];

/** The next tab in `direction` (+1 / -1), wrapping around: a pad's Y walks them in a circle. */
export function nextAboutTab(tab: AboutTab, direction: 1 | -1 = 1): AboutTab {
  const index = ABOUT_TABS.indexOf(tab);
  const count = ABOUT_TABS.length;
  return ABOUT_TABS[(index + direction + count) % count] ?? tab;
}

type AboutStore = {
  open: boolean;
  tab: AboutTab;
  show(tab?: AboutTab): void;
  setTab(tab: AboutTab): void;
  hide(): void;
};

export const useAbout = create<AboutStore>((set) => ({
  open: false,
  tab: 'game',
  show(tab = 'game') {
    set({ open: true, tab });
  },
  setTab(tab) {
    set({ tab });
  },
  hide() {
    set({ open: false });
  },
}));
