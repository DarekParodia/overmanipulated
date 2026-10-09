// Player identity that survives colour blindness (S5-05): each player colour also has a shape —
// circle, square, triangle, diamond — drawn in the player's colour with a navy outline. Shown
// next to nicknames, ping bubbles and vote dots wherever colour alone would identify a player.
import { playerColors, playerColorVar } from './tokens.ts';

export const playerShapes = ['circle', 'square', 'triangle', 'diamond'] as const;
export type PlayerShape = (typeof playerShapes)[number];

export function playerShape(colorIndex: number): PlayerShape {
  return playerShapes[colorIndex % playerColors.length] ?? 'circle';
}

const SHAPE_PATH: Record<PlayerShape, string> = {
  circle: 'M8 2.2a5.8 5.8 0 1 0 0 11.6a5.8 5.8 0 1 0 0-11.6Z',
  square: 'M2.8 2.8h10.4v10.4H2.8Z',
  triangle: 'M8 2.2L14 13.4H2Z',
  diamond: 'M8 1.8L14.2 8L8 14.2L1.8 8Z',
};

export function PlayerMark({
  colorIndex,
  size = 16,
}: {
  colorIndex: number;
  size?: number | string;
}) {
  const shape = playerShape(colorIndex);
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      data-shape={shape}
      style={{ flex: 'none' }}
    >
      <path
        d={SHAPE_PATH[shape]}
        fill={playerColorVar(colorIndex)}
        stroke="var(--outline)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
