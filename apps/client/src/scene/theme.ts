// Per-level theming of the newsroom set (S5-01): wall colour, accent stripe, window view and wall
// decor, chosen from the level id with this small table (no content schema involved). Pure data,
// colours are palette tokens only. Decor must stay quiet next to stations, so each theme is a
// few accents, not a different room.
import { ENDLESS_LEVEL_ID } from '@redakcja/shared';
import { colors } from '../ui/tokens.ts';

/** What the windows show. */
export type WindowView = 'day' | 'storm' | 'night' | 'dusk';

/** Wall decor pieces, drawn into the decor atlas (Decor.tsx). */
export type PosterId =
  | 'welcome'
  | 'storm'
  | 'voteRed'
  | 'voteBlue'
  | 'school'
  | 'book'
  | 'cross'
  | 'heart'
  | 'live'
  | 'glitch'
  | 'yes'
  | 'no'
  | 'alarm'
  | 'news';

export type Theme = {
  id: string;
  /** Wall body and its light top edge. */
  wall: string;
  wallCap: string;
  /** Stripe along the walls, the rug trim and the banner colour. */
  accent: string;
  accentDark: string;
  view: WindowView;
  /** Posters hung in the free back-wall slots, in order; windows alternate with them. */
  posters: readonly PosterId[];
  /** A string of pennants along the back wall (school) or none. */
  pennants: readonly string[];
  /** Hanging a rain streak layer over the windows. */
  rain: boolean;
};

const NO_PENNANTS: readonly string[] = [];

export const THEMES = {
  training: {
    id: 'training',
    wall: colors.wall,
    wallCap: colors.wallTop,
    accent: colors.yellow,
    accentDark: colors.yellowDark,
    view: 'day',
    posters: ['welcome', 'news'],
    pennants: NO_PENNANTS,
    rain: false,
  },
  storm: {
    id: 'storm',
    wall: colors.wall,
    wallCap: colors.wallTop,
    accent: colors.blue,
    accentDark: colors.blueDark,
    view: 'storm',
    posters: ['storm', 'news'],
    pennants: NO_PENNANTS,
    rain: true,
  },
  campaign: {
    id: 'campaign',
    wall: colors.wall,
    wallCap: colors.wallTop,
    accent: colors.purple,
    accentDark: colors.blueDark,
    view: 'day',
    posters: ['voteRed', 'voteBlue', 'voteRed', 'voteBlue'],
    pennants: NO_PENNANTS,
    rain: false,
  },
  school: {
    id: 'school',
    wall: colors.wall,
    wallCap: colors.wallTop,
    accent: colors.orange,
    accentDark: colors.orangeDark,
    view: 'day',
    posters: ['school', 'book'],
    pennants: [colors.orange, colors.yellow, colors.blue, colors.red, colors.green],
    rain: false,
  },
  clinic: {
    id: 'clinic',
    wall: colors.wall,
    wallCap: colors.wallTop,
    accent: colors.green,
    accentDark: colors.greenDark,
    view: 'day',
    posters: ['cross', 'heart', 'cross'],
    pennants: NO_PENNANTS,
    rain: false,
  },
  studio: {
    id: 'studio',
    wall: colors.textSoft,
    wallCap: colors.textFaint,
    accent: colors.purple,
    accentDark: colors.outline,
    view: 'night',
    posters: ['live', 'glitch', 'live'],
    pennants: NO_PENNANTS,
    rain: false,
  },
  referendum: {
    id: 'referendum',
    wall: colors.wall,
    wallCap: colors.wallTop,
    accent: colors.red,
    accentDark: colors.redDark,
    view: 'dusk',
    posters: ['yes', 'no', 'alarm', 'yes', 'no'],
    pennants: NO_PENNANTS,
    rain: false,
  },
  endless: {
    id: 'endless',
    wall: colors.wall,
    wallCap: colors.wallTop,
    accent: colors.blue,
    accentDark: colors.blueDark,
    view: 'day',
    posters: ['news', 'live', 'news'],
    pennants: [colors.yellow, colors.blue, colors.purple, colors.green],
    rain: false,
  },
} as const satisfies Record<string, Theme>;

const BY_LEVEL: Readonly<Record<string, Theme>> = {
  'l0-greybox': THEMES.training,
  'l1-burza': THEMES.storm,
  'l2-wybory': THEMES.campaign,
  'l3-afera': THEMES.school,
  'l4-zdrowie': THEMES.clinic,
  'l5-deepfake': THEMES.studio,
  'l6-atak': THEMES.referendum,
  [ENDLESS_LEVEL_ID]: THEMES.endless,
};

/** The set theme for a level id; unknown ids (tests, tools) get the neutral training look. */
export function themeForLevel(levelId: string): Theme {
  return BY_LEVEL[levelId] ?? THEMES.training;
}
