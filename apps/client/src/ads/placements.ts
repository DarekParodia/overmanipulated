// Where and how big each ad is (S7-73). UI layout constants, not balance numbers. The viewport
// gates keep every ad at least AD_MIN_GAP_PX away from the game's controls; none of them matches
// a phone (PHONE_QUERY is max-height 500px or max-width 760px), so phones never show ads.
import type { AdPlacement } from '@redakcja/shared';

/** AdSense guidance for game pages: ads at least 150 px from the game and its controls. */
export const AD_MIN_GAP_PX = 150;

/** Without a load or error event by then, the loader counts as blocked (ad blocker, offline). */
export const ADS_LOAD_TIMEOUT_MS = 8000;

export type AdPlacementLayout = {
  /** Media query the viewport must match for the ad to render. */
  query: string;
  /** Fixed unit size in CSS px (no responsive format, so no layout shift). */
  size: { width: number; height: number };
};

export const AD_PLACEMENTS: Record<AdPlacement, AdPlacementLayout> = {
  /** Left rail beside the menu card. */
  menu: {
    query: '(min-width: 1180px) and (min-height: 680px)',
    size: { width: 160, height: 600 },
  },
  /** Banner under the lobby footer. */
  lobby: {
    query: '(min-width: 800px) and (min-height: 600px)',
    size: { width: 728, height: 90 },
  },
  /**
   * Side rail beside the 68rem results panel, anchored bottom-right; 900 px tall keeps it 150 px
   * below the HUD's menu button (S7-74).
   */
  results: {
    query: '(min-width: 1780px) and (min-height: 900px)',
    size: { width: 160, height: 600 },
  },
  /**
   * Spectate screen (S7-91): a medium rectangle at the bottom of the side stats sheet and under
   * the figures of the spectator results, a full --space-ad-gap below anything interactive;
   * 900 px tall leaves room for that gap under the sheet's header and the tables.
   */
  spectator: {
    query: '(min-width: 1280px) and (min-height: 900px)',
    size: { width: 300, height: 250 },
  },
};
