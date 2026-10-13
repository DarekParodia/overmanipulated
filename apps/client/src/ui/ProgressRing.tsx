// A round progress ring with an icon or a number in the middle (S7-40): the station work prompt
// and the role ability chip and button share it. Tones map to token colours: work and ready are
// green, cooling a navy fill on the sunk track, armed blue, a running call orange.
import type { ReactNode } from 'react';
import styles from './ProgressRing.module.css';

export type RingTone = 'work' | 'ready' | 'cooling' | 'armed' | 'call';

/** Radius and circumference of the ring on its 64×64 grid. */
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

const TONE_CLASS: Record<RingTone, string | undefined> = {
  work: undefined,
  ready: undefined,
  cooling: styles.cooling,
  armed: styles.armed,
  call: styles.call,
};

export function ProgressRing({
  progress,
  tone,
  className,
  label,
  children,
}: {
  /** 0..1, clamped. */
  progress: number;
  tone: RingTone;
  /** Size and placement from the caller (the default is 4.5 rem). */
  className?: string | undefined;
  /** Makes the ring a progressbar with this accessible name; omit when the parent names it. */
  label?: string;
  children?: ReactNode;
}) {
  const value = Math.min(1, Math.max(0, progress));
  const classes = [
    styles.ring,
    TONE_CLASS[tone],
    value >= 1 ? styles.full : value <= 0 ? styles.empty : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const a11y = label
    ? {
        role: 'progressbar',
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(value * 100),
      }
    : {};
  return (
    <span className={classes} data-tone={tone} {...a11y}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className={styles.track} cx={32} cy={32} r={RING_R} />
        <circle
          className={styles.fill}
          cx={32}
          cy={32}
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - value)}
        />
      </svg>
      <span className={styles.content}>{children}</span>
    </span>
  );
}
