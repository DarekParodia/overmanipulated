// Role marks for press passes and the duty roster, in the same cartoon style as Icon.tsx
// (24×24 grid, 2.5 px round strokes, optional `--icon-fill` tint). Each role shows the accessory
// its character is known by: loupe over a print (photo editor), reading glasses (archivist),
// notebook and pencil (reporter), tie (managing editor). An empty pass marks "no role".
import type { Role } from '@redakcja/shared';
import { ICON_STROKE, type IconPart, IconPaths } from './Icon.tsx';

export type RoleIconName = Role | 'none';

const paths: Record<RoleIconName, readonly IconPart[]> = {
  photoEditor: [
    { d: 'M3.5 4.5h11v9h-11Z', fill: 'tint' },
    { d: 'M3.5 11l3-3 2.5 2.5' },
    { d: 'M11 14a4 4 0 1 0 8 0a4 4 0 1 0-8 0Z', fill: 'tint' },
    { d: 'M18 17l3 3' },
  ],
  archivist: [
    {
      d: 'M3.5 13.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0ZM13.5 13.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0Z',
      fill: 'tint',
    },
    { d: 'M10.5 13c1-.9 2-.9 3 0M3.5 13L2.5 9.5M20.5 13l1-3.5' },
  ],
  reporter: [
    { d: 'M6 3.5h10v17H6Z', fill: 'tint' },
    { d: 'M4 7.5h3M4 12h3M4 16.5h3M9.5 8h3.5M9.5 11.5h3.5' },
    { d: 'M18.5 3.5h2v13l-1 2.5-1-2.5Z', fill: 'tint' },
  ],
  managingEditor: [
    { d: 'M10 4h4l-.8 3.5h-2.4Z', fill: 'tint' },
    { d: 'M10.8 7.5L9 16.5l3 4 3-4-1.8-9Z', fill: 'tint' },
    { d: 'M6.5 3l3.5 1M17.5 3L14 4' },
  ],
  none: [{ d: 'M5 3.5h14v17H5Z', fill: 'tint' }, { d: 'M9 12h6' }],
};

export type RoleIconProps = {
  role: RoleIconName;
  size?: number;
  className?: string;
};

/** Decorative: always sits next to the role's visible name. */
export function RoleIcon({ role, size = 24, className }: RoleIconProps) {
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
      <IconPaths parts={paths[role]} />
    </svg>
  );
}
