// Spectate screen layout (S7-90), pure so every viewport can be tested without a browser.
// A versus match is watched side by side on a wide screen, one newsroom over the other on a tall
// one (a portrait tablet) and one at a time everywhere else. Phones always watch one newsroom at
// a time, with a one-tap team switch: two WebGL contexts are too heavy for them (Decision log).
// The viewer can also focus one newsroom of a split (`focus`), which unmounts the other canvas.
import type { TeamIndex } from '@redakcja/shared';

export type SpectateLayout = 'single' | 'side' | 'stacked';

/** Side by side from this width (CSS px)… */
export const SPECTATE_SIDE_MIN_WIDTH = 1000;
/** …and at least this aspect ratio (width / height). */
export const SPECTATE_SIDE_MIN_ASPECT = 1.2;
/** One over the other from this width… */
export const SPECTATE_STACKED_MIN_WIDTH = 700;
/** …and this height. */
export const SPECTATE_STACKED_MIN_HEIGHT = 900;
/** A touch screen whose short side is under this is a phone (tablets start at 600 dp). */
export const PHONE_MAX_SHORT_SIDE = 600;
/** A view narrower than this shrinks its station signs to the phone size (`data-compact`). */
export const SPECTATE_COMPACT_VIEW_WIDTH = 800;

export type Viewport = { width: number; height: number };

/** True for a phone: a coarse pointer and a short side under PHONE_MAX_SHORT_SIDE. */
export function isPhoneViewport(size: Viewport, coarsePointer: boolean): boolean {
  return coarsePointer && Math.min(size.width, size.height) < PHONE_MAX_SHORT_SIDE;
}

/** How the screen shows `teams` newsrooms; phones and one-team (co-op) matches are single. */
export function chooseSpectateLayout(size: Viewport, teams: number, phone = false): SpectateLayout {
  if (teams < 2 || phone) {
    return 'single';
  }
  const { width, height } = size;
  if (width >= SPECTATE_SIDE_MIN_WIDTH && width / Math.max(1, height) >= SPECTATE_SIDE_MIN_ASPECT) {
    return 'side';
  }
  if (width >= SPECTATE_STACKED_MIN_WIDTH && height >= SPECTATE_STACKED_MIN_HEIGHT) {
    return 'stacked';
  }
  return 'single';
}

/** Both newsrooms of a split, or the one team the viewer picked. */
export type SpectateFocus = 'split' | TeamIndex;

/** The newsrooms on screen, in team order. */
export function visibleTeams(
  layout: SpectateLayout,
  teams: readonly TeamIndex[],
  focus: SpectateFocus,
): TeamIndex[] {
  const [first] = teams;
  if (first === undefined) {
    return [];
  }
  if (teams.length < 2) {
    return [first];
  }
  if (focus !== 'split' && teams.includes(focus)) {
    return [focus];
  }
  return layout === 'single' ? [first] : [...teams];
}

/**
 * The next view for the one toggle key (Space / Enter / A): a split shows both, then each team,
 * then both again; a single layout swaps teams. One team has nothing to toggle.
 */
export function nextFocus(
  layout: SpectateLayout,
  teams: readonly TeamIndex[],
  focus: SpectateFocus,
): SpectateFocus {
  if (teams.length < 2) {
    return focus;
  }
  const shown = visibleTeams(layout, teams, focus);
  const current = shown.length === 1 ? shown[0] : undefined;
  if (current === undefined) {
    return teams[0] ?? 'split';
  }
  const next = teams[teams.indexOf(current) + 1];
  if (next !== undefined) {
    return next;
  }
  return layout === 'single' ? (teams[0] ?? 'split') : 'split';
}

/**
 * A tap on a team (its plate, or its score in the top bar): a single layout shows that team; a
 * split focuses it, and a second tap on the focused team brings both back.
 */
export function tapTeam(
  layout: SpectateLayout,
  teams: readonly TeamIndex[],
  focus: SpectateFocus,
  team: TeamIndex,
): SpectateFocus {
  if (!teams.includes(team) || teams.length < 2) {
    return focus;
  }
  if (layout !== 'single' && focus === team) {
    return 'split';
  }
  return team;
}

/** Esc / B: a focused split goes back to both newsrooms; anything else is not handled (null). */
export function backFocus(layout: SpectateLayout, focus: SpectateFocus): SpectateFocus | null {
  return layout !== 'single' && focus !== 'split' ? 'split' : null;
}

/** Keyboard: 1 / 2 show Kurier / Głos on their own. */
export const SPECTATE_TEAM_KEYS: Readonly<Record<string, TeamIndex>> = {
  Digit1: 0,
  Numpad1: 0,
  Digit2: 1,
  Numpad2: 1,
};

/** The view after a team key, or null when the key names no team of this match. */
export function teamKeyFocus(teams: readonly TeamIndex[], code: string): SpectateFocus | null {
  const team = SPECTATE_TEAM_KEYS[code];
  return team !== undefined && teams.length > 1 && teams.includes(team) ? team : null;
}
