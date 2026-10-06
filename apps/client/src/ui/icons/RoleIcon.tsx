// Role marks for press passes and the duty roster, drawn in the same ink-stroke style as
// Icon.tsx. Each role shows the accessory its character wears in 3D (design-rules §7):
// loupe over a print (photo editor), reading glasses (archivist), spiral notebook and pencil
// (reporter), tie (managing editor). An empty pass marks "no role".
import type { Role } from '@redakcja/shared';

export type RoleIconName = Role | 'none';

const paths: Record<RoleIconName, string> = {
  photoEditor:
    'M4 4.3 L16.8 4.1 L16.9 8.6 M4 4.3 L4.2 16.4 L8.9 16.3 M4.3 13.1 L7.6 9.8 L9.6 11.8 M14.2 10.3 C16.6 10.2 18.1 11.9 18 14 C17.9 16.2 16.2 17.6 14.1 17.5 C12 17.4 10.5 15.8 10.6 13.8 C10.7 11.8 12.2 10.4 14.2 10.3 Z M16.7 16.6 L20.4 20.2',
  archivist:
    'M3.2 12.8 C3.1 10.6 4.6 9.6 6.6 9.6 C8.7 9.6 10.1 10.8 10 12.9 C9.9 15 8.5 16.1 6.5 16 C4.6 15.9 3.3 14.8 3.2 12.8 Z M14 12.9 C13.9 10.7 15.4 9.6 17.4 9.6 C19.5 9.7 20.9 10.8 20.8 12.9 C20.7 15 19.3 16.1 17.3 16 C15.3 15.9 14.1 14.9 14 12.9 Z M10.1 12.2 C11.3 11.2 12.7 11.2 13.9 12.2 M3.3 11.4 L2.1 8.3 M20.7 11.4 L21.8 8.2',
  reporter:
    'M5.2 5.1 L15.6 4.9 L15.8 20.1 L5.4 20.2 Z M3.8 7.6 L6.6 7.5 M3.8 11.1 L6.6 11 M3.9 14.6 L6.7 14.5 M3.9 18 L6.7 17.9 M8.6 9.1 L13.2 9 M8.7 12.4 L13.1 12.3 M18.6 4.6 L20.3 4.5 L20.4 17.4 L19.5 19.6 L18.6 17.5 Z',
  managingEditor:
    'M8.1 3.9 L12 6.4 L15.9 3.8 M10.4 5.4 L13.6 5.3 L13.1 7.9 L10.9 8 Z M10.9 8 L9.3 16.6 L12.1 20.3 L14.9 16.5 L13.1 7.9',
  none: 'M5.1 4.2 L18.8 4.4 L18.7 19.8 L5.2 19.6 Z M8.6 12.1 L15.4 12',
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
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[role]} />
    </svg>
  );
}
