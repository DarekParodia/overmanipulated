// Pure ad rules (S7-73): which screens may hold an ad, the ad unit of a placement and the
// request flags for each ads mode. The side effects (script tag, adsbygoogle queue) live in
// adsense.ts; the server has already matched the request host against its ad domains, so the
// public ads block reaching the client is `enabled: false` on every other host.
import type { AdAgeTreatment, AdMode, AdPlacement, PublicAds } from '@redakcja/shared';
import type { ScreenId } from '../store/app.ts';

/** Screens that may hold an ad whenever they are shown. */
export const AD_ELIGIBLE_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['mainMenu', 'lobby']);

export type AdEligibility = {
  screen: ScreenId;
  /** The results plate is up (the HUD shows it on the game screen once the level ended). */
  levelEnded: boolean;
  /** Watching a match as a spectator; always false until spectators land (S7-91). */
  spectating: boolean;
};

/**
 * Whether ad requests may run now: the menu and the lobby, the results of a finished level and
 * the spectator view. Never during play, the briefing or the styleguide.
 */
export function adEligible({ screen, levelEnded, spectating }: AdEligibility): boolean {
  return AD_ELIGIBLE_SCREENS.has(screen) || (screen === 'game' && (levelEnded || spectating));
}

/** The AdSense ad unit of a placement, or null when ads are off or the placement has none. */
export function slotFor(ads: PublicAds, placement: AdPlacement): string | null {
  return ads.enabled ? (ads.slots[placement] ?? null) : null;
}

/** AdSense loader URL for a publisher id. */
export function loaderUrl(client: string): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
}

/**
 * Page-level flags written onto the `adsbygoogle` queue before the script tag exists, so no
 * request ever leaves without them. Both modes ask for non-personalised ads (personalised ads are
 * never offered, user decision 11); requests start unpaused and the pause guard takes over.
 */
export const AD_QUEUE_FLAGS = Object.freeze({
  requestNonPersonalizedAds: 1,
  pauseAdRequests: 0,
} as const);

/** TFAT value per audience; `unspecified` sends no age tag. */
const AGE_TREATMENT_VALUE: Record<AdAgeTreatment, string | null> = {
  child: '1',
  teen: '2',
  unspecified: null,
};

/**
 * Attributes on every `<ins class="adsbygoogle">`:
 * - `data-tag-for-age-treatment` (TFAT): `1` child, `2` teen, none for `unspecified`;
 * - limited mode also tags the request as from a user under the age of consent
 *   (`data-tag-for-under-age-of-consent="1"`, TFUA), the signal on which Google serves limited
 *   ads: no cookies, no local storage, no personalisation.
 * No `data-ad-format` or full-width flags: the units are fixed-size (see placements.ts) and no
 * Auto ads or other storage-based feature is requested.
 */
export function adRequestAttributes(
  mode: AdMode,
  ageTreatment: AdAgeTreatment,
): Record<string, string> {
  const attributes: Record<string, string> = {};
  const age = AGE_TREATMENT_VALUE[ageTreatment];
  if (age !== null) {
    attributes['data-tag-for-age-treatment'] = age;
  }
  if (mode === 'limited') {
    attributes['data-tag-for-under-age-of-consent'] = '1';
  }
  return attributes;
}
