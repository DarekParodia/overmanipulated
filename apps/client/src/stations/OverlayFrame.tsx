// The panel that station minigames and the desk sheet sit on: one white cartoon panel with a
// header (icon, name, a chunky time bar when timed, big round close button). Desktop: the
// right half of the screen, the newsroom stays visible on the left. Phones: full width.
import type { ReactNode } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import { KeyCap } from './kit.tsx';
import styles from './OverlayFrame.module.css';

export type OverlayFrameProps = {
  title: string;
  icon: IconName;
  /** Accessible name of the close (✗) button. */
  closeLabel: string;
  /** Key cap for the keyboard/gamepad back key, shown next to the close button. */
  backKey?: string;
  onClose(): void;
  /** Time bar: share of the time left (1 → 0) and an accessible text. */
  time?: { left: number; label: string; testId?: string } | undefined;
  /** Keyboard/gamepad focus is on the close button. */
  closeFocused?: boolean;
  testId?: string;
  children: ReactNode;
};

/** Share of time left below which the bar turns orange, then red. */
const TIME_WARN = 0.5;
const TIME_URGENT = 0.25;

export function OverlayFrame({
  title,
  icon,
  closeLabel,
  backKey,
  onClose,
  time,
  closeFocused = false,
  testId,
  children,
}: OverlayFrameProps) {
  return (
    <section
      className={`panel ${styles.frame}`}
      aria-label={title}
      data-testid={testId}
      // Taps on the panel must never reach the touch joystick or the scene behind it.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className={styles.header}>
        <span className={styles.badge}>
          <Icon name={icon} size={28} />
        </span>
        <h2 className={styles.title}>{title}</h2>
        {time ? <TimeBar {...time} /> : <span className={styles.spacer} />}
        {backKey && (
          <span className={styles.backKey} aria-hidden="true">
            <KeyCap>{backKey}</KeyCap>
          </span>
        )}
        <button
          type="button"
          className={`${styles.close} ${closeFocused ? styles.closeFocused : ''}`}
          aria-label={closeLabel}
          title={closeLabel}
          data-testid="overlay-close"
          onClick={() => {
            emitCue('ui.back');
            onClose();
          }}
        >
          <Icon name="reject" size={28} />
        </button>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

function TimeBar({ left, label, testId }: { left: number; label: string; testId?: string }) {
  const share = Math.max(0, Math.min(1, left));
  const level = share <= TIME_URGENT ? 'urgent' : share <= TIME_WARN ? 'warn' : 'ok';
  return (
    <div
      className={`${styles.time} ${styles[level] ?? ''}`}
      role="timer"
      aria-label={label}
      data-testid={testId}
      data-level={level}
    >
      <span className={styles.clock} aria-hidden="true">
        <Icon name="clock" size={22} />
      </span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ transform: `scaleX(${share})` }} />
      </span>
    </div>
  );
}
