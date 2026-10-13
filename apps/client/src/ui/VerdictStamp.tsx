// Final stamp lettering (S5-03): the verdict stamps are chunky hand-lettered tags — flat colour,
// thick navy outline, white letters with a navy outline of their own, a hard pop shadow and a
// slight tilt per kind. One component for the desk result, the correction sheet and the
// Kolegium so a verdict always looks the same. Icon next to the word, never colour alone.
import type { Verdict } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { Icon, type IconName } from './icons/Icon.tsx';
import styles from './VerdictStamp.module.css';

export type StampKind = Verdict | 'correction' | 'expired';
export type StampSize = 'sm' | 'md' | 'lg';

export const STAMP_KINDS = [
  'publish',
  'reject',
  'publishWithContext',
  'correction',
  'expired',
] as const satisfies readonly StampKind[];

const ICON: Record<StampKind, IconName> = {
  publish: 'publish',
  reject: 'reject',
  publishWithContext: 'publishWithContext',
  correction: 'siren',
  expired: 'expired',
};

const ICON_SIZE: Record<StampSize, number> = { sm: 20, md: 26, lg: 34 };

export type VerdictStampProps = {
  kind: StampKind;
  size?: StampSize;
  /** Plays the slam animation on mount. */
  slam?: boolean;
  className?: string | undefined;
  'data-testid'?: string | undefined;
};

export function VerdictStamp({
  kind,
  size = 'md',
  slam = false,
  className = '',
  'data-testid': testId,
}: VerdictStampProps) {
  const label = pl.stamps[kind];
  return (
    <span
      className={`${styles.stamp} ${styles[kind]} ${styles[size]} ${slam ? styles.slam : ''} ${className}`}
      data-testid={testId}
      data-stamp={kind}
      role="img"
      aria-label={label}
    >
      <Icon name={ICON[kind]} size={ICON_SIZE[size]} />
      <span className={styles.word} aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
