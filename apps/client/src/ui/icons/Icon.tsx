// Custom ink-stroke icon set (agents/design-rules.md §6). Strokes are deliberately slightly
// irregular hand-drawn paths, not geometric primitives, so the set doesn't read as stock icons.
import type { CSSProperties } from 'react';

export type IconName =
  | 'photo'
  | 'quote'
  | 'post'
  | 'recording'
  | 'statistic'
  | 'article'
  | 'publish'
  | 'reject'
  | 'publishWithContext'
  | 'fullscreen'
  | 'settings'
  | 'leave'
  | 'copy'
  | 'ping';

const paths: Record<IconName, string> = {
  // Folder types
  photo:
    'M3.2 7.1 L20.6 6.8 L20.9 18.2 L3.4 18.5 Z M8.1 6.9 L9.4 4.6 L14.7 4.5 L15.9 6.8 M12.1 9.2 C14.4 9.1 15.6 10.9 15.5 12.6 C15.4 14.6 13.8 15.8 12 15.7 C10 15.6 8.7 14.2 8.8 12.4 C8.9 10.6 10.2 9.3 12.1 9.2 Z',
  quote:
    'M4.3 15.9 C4.1 12.2 5.2 9.1 8.6 7.4 M4.6 12.1 C6.3 11.6 8.3 12.4 8.2 14.3 C8.1 16 6.4 16.9 5 16.2 M13.1 15.8 C12.9 12.1 14 9 17.4 7.3 M13.4 12 C15.1 11.5 17.1 12.3 17 14.2 C16.9 15.9 15.2 16.8 13.8 16.1',
  post: 'M4.1 4.4 L19.8 4.2 L20 15.6 L11.4 15.8 L7.2 19.6 L7.4 15.9 L4.3 15.9 Z M7.3 8.3 L16.6 8.1 M7.4 11.6 L13.9 11.5',
  recording:
    'M9.4 4.2 C11.6 4.1 12.6 5.3 12.6 7.2 L12.7 11.3 C12.7 13.1 11.6 14.2 9.6 14.3 C7.6 14.3 6.6 13.1 6.6 11.4 L6.5 7.3 C6.5 5.4 7.4 4.3 9.4 4.2 Z M4.2 10.9 C4.3 14.8 6.5 16.9 9.7 16.9 C12.9 16.9 15.1 14.7 15.1 10.8 M9.7 17 L9.8 20.1 M17.6 8.1 C18.9 9.4 18.9 12.2 17.7 13.6 M19.8 6.2 C22 8.5 22 13.3 19.9 15.6',
  statistic:
    'M3.9 19.8 L20.4 19.6 M5.6 19.5 L5.7 13.4 L8.6 13.3 L8.7 19.5 M10.6 19.5 L10.5 8.2 L13.6 8.1 L13.7 19.4 M15.6 19.5 L15.7 4.9 L18.7 4.8 L18.8 19.4',
  article:
    'M5.1 3.7 L18.9 3.9 L18.7 20.2 L4.9 20 Z M7.6 7.2 L16.4 7.1 M7.7 10.4 L16.3 10.5 M7.6 13.5 L16.5 13.4 M7.7 16.6 L12.8 16.6',
  // Verdicts (each also differs in shape, never colour alone)
  publish: 'M4.6 12.6 L9.6 17.4 L19.7 6.4',
  reject: 'M5.3 5.1 L18.8 18.9 M18.6 5.4 L5.5 18.7',
  publishWithContext:
    'M4.4 12.7 L8.3 16.6 L13.6 9.1 M15.3 13.2 L20.1 13.1 M15.2 16.8 L20.2 16.7 M15.4 9.5 L20 9.4',
  // Interface
  fullscreen:
    'M4.2 9.1 L4.3 4.4 L9 4.3 M15.1 4.3 L19.7 4.4 L19.6 9.2 M19.8 14.9 L19.7 19.6 L15 19.7 M9.1 19.6 L4.4 19.7 L4.3 14.8',
  settings:
    'M4.1 6.6 L19.9 6.4 M4.2 12.1 L19.8 12 M4.1 17.6 L19.9 17.5 M8.6 4.4 L8.7 8.8 M15.2 9.8 L15.3 14.2 M10.4 15.4 L10.5 19.7',
  leave:
    'M13.7 4.3 L5.2 4.4 L5.1 19.6 L13.8 19.7 M10.1 12.1 L20.2 11.9 M16.6 8.2 L20.3 12 L16.7 15.8',
  copy: 'M8.4 8.3 L19.8 8.2 L19.9 20 L8.5 20.1 Z M5.3 15.8 L4.2 15.8 L4.1 4.1 L15.6 4 L15.7 5.2',
  ping: 'M12.1 3.9 L12.2 14.1 M12.2 18.3 L12.2 19.9 M5.6 8.2 C4.6 10.5 4.7 13.3 5.8 15.4 M18.5 8.1 C19.6 10.4 19.5 13.2 18.4 15.3',
};

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
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export const iconNames = Object.keys(paths) as IconName[];
