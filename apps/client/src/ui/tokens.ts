// Design tokens for three.js and canvas code. Mirrors tokens.css — keep both in sync.

export const palette = {
  paper: '#efe8d8',
  paperShade: '#e2d8c2',
  paperDeep: '#d6caae',
  manila: '#d9b77a',
  manilaDark: '#b8954f',
  ink: '#1f1c18',
  inkSoft: '#4a443c',
  inkFaint: '#8a8173',
  cork: '#a97c50',
  corkDark: '#7d5a37',
  wood: '#8b6a4a',
  editorialRed: '#b3261e',
  copyBlue: '#2c4a7a',
  ochre: '#c98a1b',
  /** Scene-only shades derived from the paper palette. */
  floor: '#cdbf9f',
  wall: '#e6dcc6',
  wallTop: '#f3ecdd',
  furniture: '#9c7a55',
  furnitureTop: '#b79572',
} as const;

export const playerColors = ['#d9822b', '#4f9fd1', '#2e8b6e', '#b26b9a'] as const;

export function playerColor(index: number): string {
  return playerColors[index % playerColors.length] ?? palette.ink;
}

/** CSS custom property name for a player's colour, for DOM UI. */
export function playerColorVar(index: number): string {
  return `var(--player-${index % playerColors.length})`;
}
