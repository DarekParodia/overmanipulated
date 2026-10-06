// Small building blocks shared by the station overlay, the minigames and the desk sheet, so all
// of them speak the same visual language (agents/design-rules.md): one instruction line, key-cap
// chips for the active device only, two big mistake marks, and a big ✓ / ✗ outcome banner.
import type { StationKind } from '@redakcja/shared';
import type { ReactNode } from 'react';
import type { InputDevice } from '../store/app.ts';
import type { KeyHint } from '../strings/pl.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import styles from './kit.module.css';

/** The icon shown next to each station's name (overlay header, desk stamps, missed list). */
export const STATION_ICON: Record<StationKind, IconName> = {
  imageSearch: 'photo',
  archive: 'clock',
  sourceRegistry: 'post',
  phone: 'recording',
  aiScanner: 'settings',
  dataLibrary: 'statistic',
};

/** One key cap: a small white chip with a thick outline, like a physical key. */
export function KeyCap({ children }: { children: ReactNode }) {
  return <kbd className={styles.keyCap}>{children}</kbd>;
}

/** Key hints for the device in use; nothing on touch (the controls are on screen). */
export function KeyHints({
  hints,
  device,
}: {
  hints: Record<InputDevice, readonly KeyHint[]>;
  device: InputDevice;
}) {
  const list = hints[device];
  if (list.length === 0) {
    return null;
  }
  return (
    <ul className={styles.keyHints} aria-hidden="true">
      {list.map((hint) => (
        <li key={hint.label}>
          {hint.keys.map((key) => (
            <KeyCap key={key}>{key}</KeyCap>
          ))}
          <span>{hint.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** The one-line task at the top of a minigame, with the mistake marks on the right. */
export function TaskLine({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className={styles.taskLine}>
      <p className={styles.task}>{children}</p>
      {aside}
    </div>
  );
}

/** Mistakes as big round marks: faint ✗ slots that turn solid red and shake when used. */
export function Mistakes({ used, max, testId }: { used: number; max: number; testId?: string }) {
  return (
    <span
      className={styles.mistakes}
      role="img"
      aria-label={pl.minigames.common.mistakes(used, max)}
      data-testid={testId}
      data-count={used}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed number of marks
          key={i}
          className={`${styles.mark} ${i < used ? styles.markUsed : ''}`}
        >
          <Icon name="reject" size={22} />
        </span>
      ))}
    </span>
  );
}

/** A round ✓ or ✗ badge that pops in (✓) or shakes (✗). */
export function ResultMark({ success, size = 'md' }: { success: boolean; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`${styles.resultMark} ${success ? styles.good : styles.bad} ${styles[size]}`}
      aria-hidden="true"
    >
      <Icon name={success ? 'publish' : 'reject'} size={size === 'lg' ? 40 : 26} />
    </span>
  );
}

/** Big outcome banner: ✓ / ✗ mark, a short title and an optional line underneath. */
export function OutcomeBanner({
  success,
  title,
  children,
  action,
  testId,
}: {
  success: boolean;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className={`${styles.banner} ${success ? styles.bannerGood : styles.bannerBad}`}
      role="status"
      data-testid={testId}
    >
      <ResultMark success={success} size="lg" />
      <div className={styles.bannerText}>
        <p className={styles.bannerTitle}>{typeset(title)}</p>
        {children && <div className={styles.bannerBody}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
