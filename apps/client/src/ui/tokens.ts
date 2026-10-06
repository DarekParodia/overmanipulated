// Design tokens for three.js and canvas code. Mirrors tokens.css — keep both in sync.

/** The cartoon palette (agents/design-rules.md). */
export const colors = {
  sky: '#7cc8f5',
  skyDeep: '#4fa6dc',
  surface: '#ffffff',
  surfaceSoft: '#eef6fc',
  surfaceSunk: '#d9e9f5',
  outline: '#1e2a4a',
  textSoft: '#4d5b80',
  textFaint: '#8492b3',
  yellow: '#ffd23f',
  yellowDark: '#e8b400',
  green: '#36c46a',
  greenDark: '#1f9a4c',
  red: '#ff5a5f',
  redDark: '#d63339',
  orange: '#ff9f1c',
  orangeDark: '#e07b00',
  blue: '#3a86ff',
  blueDark: '#1f63d6',
  purple: '#9b5de5',
  /** Scene: warm wooden floor, sky-blue walls, orange-brown furniture. */
  floor: '#f6dfae',
  floorDark: '#e9c98c',
  wall: '#5fb8e6',
  wallTop: '#d4efff',
  furniture: '#c97b45',
  furnitureTop: '#eaa66b',
  folder: '#ffd76a',
  folderDark: '#e8b400',
} as const;

/**
 * Scene palette under the old "newsroom paper" names, still read by scene and canvas code.
 * Deprecated: new code uses `colors`. Values follow the cartoon palette.
 */
export const palette = {
  paper: colors.surface,
  paperShade: colors.surfaceSoft,
  paperDeep: colors.surfaceSunk,
  manila: colors.folder,
  manilaDark: colors.folderDark,
  ink: colors.outline,
  inkSoft: colors.textSoft,
  inkFaint: colors.textFaint,
  cork: colors.skyDeep,
  corkDark: colors.outline,
  wood: colors.furniture,
  editorialRed: colors.red,
  copyBlue: colors.blue,
  ochre: colors.orange,
  floor: colors.floor,
  wall: colors.wall,
  wallTop: colors.wallTop,
  furniture: colors.furniture,
  furnitureTop: colors.furnitureTop,
} as const;

export const playerColors = ['#ff8c42', '#3a86ff', '#2ec4b6', '#e86fc6'] as const;

export function playerColor(index: number): string {
  return playerColors[index % playerColors.length] ?? colors.outline;
}

/** CSS custom property name for a player's colour, for DOM UI. */
export function playerColorVar(index: number): string {
  return `var(--player-${index % playerColors.length})`;
}
