// The sheet that station minigames and the desk folder sit on: a sheet of paper pushed in from
// the right edge on desktop (the newsroom stays visible and alive on the left), a full-width
// sheet on phones. No backdrop, no blur: the scene is never dimmed.
import type { ReactNode } from 'react';
import { Button } from '../ui/Button.tsx';
import styles from './OverlayFrame.module.css';

export type OverlayFrameProps = {
  /** Small caps line above the title (station name, "Stół redakcyjny"). */
  kicker: string;
  /** Typed form number on the right of the kicker. */
  formNo?: string;
  /** Close/back button label. */
  closeLabel: string;
  /** Hint for the keyboard/gamepad back key, shown next to the close button. */
  closeHint?: string;
  onClose(): void;
  /** Extra header content (timer). */
  aside?: ReactNode;
  tone?: 'paper' | 'manila';
  testId?: string;
  children: ReactNode;
};

export function OverlayFrame({
  kicker,
  formNo,
  closeLabel,
  closeHint,
  onClose,
  aside,
  tone = 'paper',
  testId,
  children,
}: OverlayFrameProps) {
  return (
    <section
      className={`${styles.frame} ${styles[tone]}`}
      aria-label={kicker}
      data-testid={testId}
      // Taps on the sheet must never reach the touch joystick or the scene behind it.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className={styles.header}>
        <p className={styles.kicker}>
          <span className="label">{kicker}</span>
          {formNo && <span className={styles.formNo}>{formNo}</span>}
        </p>
        {aside}
        <span className={styles.close}>
          {closeHint && <span className={styles.hint}>{closeHint}</span>}
          <Button back onClick={onClose} data-testid="overlay-close">
            {closeLabel}
          </Button>
        </span>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
