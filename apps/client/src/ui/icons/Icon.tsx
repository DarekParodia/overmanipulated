// Our own cartoon icon set (agents/design-rules.md §6): 24×24 grid, simple bold shapes, 2.5 px
// strokes in currentColor with round caps and joins. Parts marked `fill: 'solid'` are filled
// with currentColor (small dots, knobs); `fill: 'tint'` parts take the optional flat fill from
// the `--icon-fill` custom property (transparent unless the parent sets a palette token), e.g.
// `style={{ '--icon-fill': 'var(--yellow)' }}`.
import type { CSSProperties } from 'react';

export type IconPart = { d: string; fill?: 'solid' | 'tint' };

const icons = {
  // --- Story types -------------------------------------------------------------------------
  photo: [
    {
      d: 'M3 8.5A2 2 0 0 1 5 6.5h2.5L9 4h6l1.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
      fill: 'tint',
    },
    { d: 'M8.5 13a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0Z' },
  ],
  quote: [
    { d: 'M4 14.5C4 10.5 5.5 8 8.5 6.5M14 14.5C14 10.5 15.5 8 18.5 6.5' },
    {
      d: 'M4 14.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0ZM14 14.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0Z',
      fill: 'solid',
    },
  ],
  post: [
    {
      d: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 4v-4h-1A1.5 1.5 0 0 1 4 14.5Z',
      fill: 'tint',
    },
    { d: 'M8 8.5h8M8 12h5' },
  ],
  recording: [
    { d: 'M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0Z', fill: 'tint' },
    { d: 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7' },
  ],
  statistic: [
    { d: 'M5.5 20.5V14H9v6.5ZM10.25 20.5V9h3.5v11.5ZM15 20.5V4.5h3.5v16Z', fill: 'tint' },
    { d: 'M3.5 20.5h17' },
  ],
  article: [
    { d: 'M6 3.5h8.5l4 4v13H6Z', fill: 'tint' },
    { d: 'M14.5 3.5v4h4M9 11h6.5M9 14.5h6.5M9 18h4' },
  ],
  // --- Verdicts (each also differs in shape, never colour alone) ---------------------------
  publish: [{ d: 'M4.5 12.5l5 5L19.5 7' }],
  reject: [{ d: 'M6 6l12 12M18 6L6 18' }],
  publishWithContext: [{ d: 'M3.5 12.5l4 4L14 8M16.5 12h4M16.5 16h4M18 8h2.5' }],
  // --- Stations and fixtures (named after StationKind, plus conveyor and desk) -------------
  imageSearch: [
    { d: 'M4 10a6 6 0 1 0 12 0a6 6 0 1 0-12 0Z', fill: 'tint' },
    { d: 'M14.5 14.5L20 20M7.5 11.5l1.8-2 1.5 1.5 1.2-1 1.5 1.8' },
  ],
  archive: [
    { d: 'M5 3.5h14v17H5Z', fill: 'tint' },
    { d: 'M5 9.25h14M5 14.75h14M10.5 6.5h3M10.5 12h3M10.5 17.75h3' },
  ],
  sourceRegistry: [
    { d: 'M5.5 10.5V6.5H11v4M12.5 10.5V4h6v6.5', fill: 'tint' },
    { d: 'M3.5 10.5h17v10h-17Z', fill: 'tint' },
    { d: 'M10 15h4' },
  ],
  phone: [
    {
      d: 'M5 4h3l1.5 4-2 1.5a11 11 0 0 0 7 7l1.5-2 4 1.5v3A1.5 1.5 0 0 1 18.5 20.5 15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4Z',
      fill: 'tint',
    },
  ],
  aiScanner: [
    { d: 'M7 7h10v10H7Z', fill: 'tint' },
    { d: 'M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5' },
  ],
  dataLibrary: [
    {
      d: 'M5 6c0-1.4 3.1-2.5 7-2.5s7 1.1 7 2.5v12c0 1.4-3.1 2.5-7 2.5S5 19.4 5 18Z',
      fill: 'tint',
    },
    { d: 'M5 6c0 1.4 3.1 2.5 7 2.5S19 7.4 19 6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5' },
  ],
  conveyor: [
    { d: 'M7.5 13.5V7.5h7v6', fill: 'tint' },
    { d: 'M5.5 13.5h13a2.5 2.5 0 0 1 0 5h-13a2.5 2.5 0 0 1 0-5Z', fill: 'tint' },
    { d: 'M17 6h3.5M19 4l2 2-2 2' },
  ],
  desk: [{ d: 'M8 10V6h8v4', fill: 'tint' }, { d: 'M2.5 10h19M5 10v10M19 10v10M5 15h14' }],
  // --- Game objects and states -------------------------------------------------------------
  folder: [
    {
      d: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5Z',
      fill: 'tint',
    },
  ],
  stamp: [
    { d: 'M9.5 5a2.5 2.5 0 0 1 5 0c0 2-1 3.5-1 6h-3c0-2.5-1-4-1-6Z', fill: 'tint' },
    { d: 'M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3H5Z', fill: 'tint' },
    { d: 'M5 20h14' },
  ],
  hand: [
    {
      d: 'M7 12V6.5a1.5 1.5 0 0 1 3 0V11M10 10.5V5a1.5 1.5 0 0 1 3 0v5.5M13 10.5V6a1.5 1.5 0 0 1 3 0v5M16 11V9.5a1.5 1.5 0 0 1 3 0V14c0 4-2.7 6.5-6.5 6.5-3 0-5.1-1.6-6.3-4.1L4.6 13.4a1.5 1.5 0 0 1 2.6-1.4L8 13.5',
    },
  ],
  ping: [
    { d: 'M12 4v8.5M6.5 7a7 7 0 0 0 0 10M17.5 7a7 7 0 0 1 0 10' },
    { d: 'M10.4 17.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0Z', fill: 'solid' },
  ],
  clock: [
    { d: 'M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0Z', fill: 'tint' },
    { d: 'M12 7.5V12l3 2' },
  ],
  hourglass: [
    {
      d: 'M6.5 3.5h11M6.5 20.5h11M8 3.5v2.5c0 2.5 4 4 4 6s-4 3.5-4 6v2.5M16 3.5v2.5c0 2.5-4 4-4 6s4 3.5 4 6v2.5',
    },
    { d: 'M9.5 20.5c0-1.4 1.2-2.4 2.5-3 1.3.6 2.5 1.6 2.5 3Z', fill: 'solid' },
  ],
  /** A folder that ran out of time: the hourglass with its sand run through. */
  expired: [
    {
      d: 'M6.5 3.5h11M6.5 20.5h11M8 3.5v2.5c0 2.5 4 4 4 6s-4 3.5-4 6v2.5M16 3.5v2.5c0 2.5-4 4-4 6s4 3.5 4 6v2.5',
    },
    { d: 'M8.5 20.5c0-2 1.6-3.6 3.5-4.2 1.9.6 3.5 2.2 3.5 4.2Z', fill: 'solid' },
  ],
  flag: [{ d: 'M5.5 4.5h12l-2.5 4 2.5 4h-12', fill: 'tint' }, { d: 'M5.5 21V3.5' }],
  star: [
    {
      d: 'M12 3.5L14.5 9.4L20.8 9.9L16 14.1L17.5 20.3L12 17L6.5 20.3L8 14.1L3.2 9.9L9.5 9.4Z',
      fill: 'tint',
    },
  ],
  heart: [
    {
      d: 'M12 20.5C6 16.5 3.5 13.2 3.5 9.6 3.5 6.9 5.6 4.8 8.2 4.8c1.6 0 3 .8 3.8 2.1.8-1.3 2.2-2.1 3.8-2.1 2.6 0 4.7 2.1 4.7 4.8 0 3.6-2.5 6.9-8.5 10.9Z',
      fill: 'tint',
    },
  ],
  check: [{ d: 'M4.5 12.5l5 5L19.5 7' }],
  cross: [{ d: 'M6 6l12 12M18 6L6 18' }],
  lightbulb: [
    { d: 'M9 16.5c0-2-3-3.5-3-7.5a6 6 0 0 1 12 0c0 4-3 5.5-3 7.5Z', fill: 'tint' },
    { d: 'M9.5 19.5h5M10.5 22h3' },
  ],
  user: [
    { d: 'M8.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0Z', fill: 'tint' },
    { d: 'M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5Z', fill: 'tint' },
  ],
  crown: [{ d: 'M4.5 18.5L3.5 8l5 4.5L12 5.5l3.5 7 5-4.5-1 10.5Z', fill: 'tint' }],
  // --- Interface ---------------------------------------------------------------------------
  arrow: [{ d: 'M4 12h15M13.5 6.5L19 12l-5.5 5.5' }],
  play: [{ d: 'M7.5 4.5v15l12-7.5Z', fill: 'tint' }],
  close: [{ d: 'M7 7l10 10M17 7L7 17' }],
  fullscreen: [{ d: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5' }],
  settings: [
    { d: 'M4 7h16M4 17h16' },
    {
      d: 'M6.5 7a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0ZM12.5 17a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0Z',
      fill: 'solid',
    },
  ],
  leave: [
    { d: 'M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14' },
    { d: 'M10.5 12H20M16.5 8.5L20 12l-3.5 3.5' },
  ],
  copy: [
    {
      d: 'M10 8.5h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8.5 19v-9A1.5 1.5 0 0 1 10 8.5Z',
      fill: 'tint',
    },
    { d: 'M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5' },
  ],
  sound: [
    { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4Z', fill: 'tint' },
    { d: 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11' },
  ],
  soundOff: [
    { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4Z', fill: 'tint' },
    { d: 'M15.5 9.5l5 5M20.5 9.5l-5 5' },
  ],
  music: [
    { d: 'M9 17.5V5.5l10-2v12' },
    {
      d: 'M4 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0ZM14 15.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0Z',
      fill: 'solid',
    },
  ],
} satisfies Record<string, readonly IconPart[]>;

export type IconName = keyof typeof icons;

const parts: Record<IconName, readonly IconPart[]> = icons;

const TINT: CSSProperties = { fill: 'var(--icon-fill, none)' };

/** Stroke width of the set on its 24 px grid. */
export const ICON_STROKE = 2.5;

export type IconProps = {
  name: IconName;
  size?: number;
  /** Accessible label; omit for decorative icons next to visible text. */
  label?: string;
  style?: CSSProperties;
  className?: string;
};

export function Icon({ name, size = 24, label, style, className }: IconProps) {
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
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
      className={className}
    >
      <IconPaths parts={parts[name]} />
    </svg>
  );
}

/** The `<path>` elements of an icon's parts; shared with RoleIcon. */
export function IconPaths({ parts: items }: { parts: readonly IconPart[] }) {
  return items.map((part) => (
    <path
      key={part.d}
      d={part.d}
      fill={part.fill === 'solid' ? 'currentColor' : undefined}
      // A CSS custom property only resolves in style, not in the presentation attribute.
      style={part.fill === 'tint' ? TINT : undefined}
    />
  ));
}

export const iconNames = Object.keys(icons) as IconName[];

/** The icon's parts (24×24 viewBox) for canvas drawing, e.g. folder covers and scene signs. */
export function iconParts(name: IconName): readonly IconPart[] {
  return parts[name];
}

/** All of the icon's path data joined into one path, for a plain stroke on a canvas. */
export function iconPath(name: IconName): string {
  return parts[name].map((part) => part.d).join(' ');
}
