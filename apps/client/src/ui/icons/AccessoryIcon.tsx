// Accessory glyphs (S7-104, glossary: Dodatek) in the icon set's style (design-rules §6): 24×24,
// 2.5 px rounded navy strokes, `tint` parts filled from `--icon-fill` (the player's colour where
// the glyph stands for a player). The profile and the lobby card show them (S7-105).
import type { Accessory } from '@redakcja/shared';
import { ICON_STROKE, type IconPart, IconPaths } from './Icon.tsx';

const paths: Record<Accessory, readonly IconPart[]> = {
  none: [{ d: 'M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0Z' }, { d: 'M6 6l12 12' }],
  scarf: [
    { d: 'M3.5 7.5c5.5 3.5 11.5 3.5 17 0V11c-5.5 3.5-11.5 3.5-17 0Z', fill: 'tint' },
    { d: 'M13 13.5l1 6.5h3.5l-1.5-7.2Z', fill: 'tint' },
    { d: 'M14.5 20v1.5M17 20v1.5' },
  ],
  bowTie: [
    { d: 'M10.5 12L3.5 7.5v9ZM13.5 12l7-4.5v9Z', fill: 'tint' },
    { d: 'M10.5 10h3v4h-3Z', fill: 'solid' },
  ],
  pressBadge: [
    { d: 'M9 6.5L12 3l3 3.5' },
    { d: 'M4 6.5h16v13H4Z', fill: 'tint' },
    { d: 'M7 10h4v5H7Z' },
    { d: 'M13.5 10.5H17M13.5 13.5H17M7 17h10' },
  ],
};

export const ACCESSORY_ICON_NAMES = Object.keys(paths) as Accessory[];

/** Decorative: always sits next to the accessory's visible name or a labelled preview. */
export function AccessoryIcon({
  accessory,
  size = 24,
  className,
}: {
  accessory: Accessory;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <IconPaths parts={paths[accessory]} />
    </svg>
  );
}
