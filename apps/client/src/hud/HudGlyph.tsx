// HUD-only glyphs the shared icon set doesn't have yet (star, shield, priority flag, where a
// folder is, the touch actions). Same grid and style as ui/icons/Icon.tsx: 24×24, rounded caps
// and joins, a navy stroke, optional flat fill. Candidates to move into Icon.tsx.
import type { CSSProperties } from 'react';

export type GlyphName =
  | 'star'
  | 'shield'
  | 'shieldCracked'
  | 'flag'
  | 'hand'
  | 'magnifier'
  | 'desk'
  | 'work';

/** Fillable outline (drawn first, takes `fill`) and inner details (stroke only). */
const glyphs: Record<GlyphName, { shape: string; detail?: string }> = {
  star: {
    shape:
      'M12 2.8 L14.7 8.6 L21 9.3 L16.3 13.6 L17.6 19.9 L12 16.7 L6.4 19.9 L7.7 13.6 L3 9.3 L9.3 8.6 Z',
  },
  shield: {
    shape:
      'M12 2.8 L19.8 5.6 L19.6 11.6 C19.4 16.3 16.4 19.6 12 21.2 C7.6 19.6 4.6 16.3 4.4 11.6 L4.2 5.6 Z',
    detail: 'M8.4 11.9 L11 14.5 L15.8 9.4',
  },
  shieldCracked: {
    shape:
      'M12 2.8 L19.8 5.6 L19.6 11.6 C19.4 16.3 16.4 19.6 12 21.2 C7.6 19.6 4.6 16.3 4.4 11.6 L4.2 5.6 Z',
    detail: 'M12.6 3.2 L10.4 8.4 L13.6 11 L10.8 15.2 L12.2 20.6',
  },
  flag: {
    shape: 'M6 3.6 L18.8 7.6 L6 11.8 Z',
    detail: 'M6 3.6 L6 21',
  },
  hand: {
    shape:
      'M7.6 12.2 L7.6 6.2 C7.6 4.6 9.8 4.6 9.8 6.2 L9.8 4.8 C9.8 3.2 12 3.2 12 4.8 L12 5.4 C12 3.8 14.2 3.8 14.2 5.4 L14.2 6.8 C14.2 5.2 16.4 5.2 16.4 6.8 L16.4 14 C16.4 18.2 14.2 20.6 11.2 20.6 C8.6 20.6 7.2 19.4 5.8 17 L3.9 13.6 C3.2 12.4 4.7 11.1 5.8 12.1 Z',
    detail: 'M9.8 6.2 L9.8 11 M12 5.4 L12 11 M14.2 6.8 L14.2 11.2',
  },
  magnifier: {
    shape:
      'M10.2 3.6 C14 3.6 16.8 6.4 16.8 10.2 C16.8 14 14 16.8 10.2 16.8 C6.4 16.8 3.6 14 3.6 10.2 C3.6 6.4 6.4 3.6 10.2 3.6 Z',
    detail: 'M15.2 15.2 L20.6 20.6',
  },
  desk: {
    shape: 'M3.4 9.6 L20.6 9.6 L20.6 12.8 L3.4 12.8 Z',
    detail:
      'M5.4 12.8 L5.4 20.4 M18.6 12.8 L18.6 20.4 M8.8 9.6 L8.8 6.4 L15.2 6.4 L15.2 9.6 M10.2 4 L13.8 4',
  },
  work: {
    shape: 'M4.4 15.4 L12.6 7.2 L16.8 11.4 L8.6 19.6 L4.4 19.6 Z',
    detail: 'M14.4 5.4 L16.6 3.2 L20.8 7.4 L18.6 9.6 M12.6 7.2 L14.4 5.4 M16.8 11.4 L18.6 9.6',
  },
};

export type GlyphProps = {
  name: GlyphName;
  size?: number;
  /** Flat fill for the outline shape, a token like `var(--yellow)`; none by default. */
  fill?: string;
  /** Accessible label; omit for glyphs next to visible text. */
  label?: string;
  className?: string | undefined;
  style?: CSSProperties;
};

export function HudGlyph({ name, size = 24, fill, label, className, style }: GlyphProps) {
  const glyph = glyphs[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={style}
    >
      <path d={glyph.shape} fill={fill ?? 'none'} />
      {glyph.detail && <path d={glyph.detail} />}
    </svg>
  );
}
