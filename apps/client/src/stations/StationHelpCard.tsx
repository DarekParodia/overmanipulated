// Station help card (S7-94): how one station works, for the device in use. A purple (help)
// header with the station's icon and name, the question it answers, 2–3 numbered steps, a small
// drawing of the controls that "press" in turn (still under reduced motion), what its stamp
// proves, a note that the folder's deadline keeps running, and one yellow „Rozumiem”.
// 'inPlay' is shown over a station in a match (S7-95); 'full' adds the real-world line and is
// used only in „Jak grać” (S7-96), where an extra action („Wypróbuj”) can take the yellow.
import type { StationKind } from '@redakcja/shared';
import type { ReactNode } from 'react';
import { NamedControl } from '../guidance/ControlsArt.tsx';
import type { InputDevice } from '../store/app.ts';
import { type KeyHint, pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { STATION_ICON } from './kit.tsx';
import styles from './StationHelpCard.module.css';

export type StationHelpVariant = 'inPlay' | 'full';

/** At most this many key hints are drawn; the steps say the rest. */
const MAX_DRAWN_HINTS = 3;

/** Key hints of the station's minigame, when it has strings yet (new stations bring their own). */
const MINIGAME_HINTS: Partial<
  Record<StationKind, { keys: Record<InputDevice, readonly KeyHint[]> }>
> = pl.minigames;

/** The hints drawn on the card for one station and device (empty: draw the station icon). */
export function drawnHints(kind: StationKind, device: InputDevice): readonly KeyHint[] {
  return (MINIGAME_HINTS[kind]?.keys[device] ?? []).slice(0, MAX_DRAWN_HINTS);
}

export type StationHelpCardProps = {
  kind: StationKind;
  device: InputDevice;
  variant?: StationHelpVariant;
  /** „Rozumiem”: close the card. */
  onClose(): void;
  /** An extra action before „Rozumiem”; it becomes the yellow one and „Rozumiem” turns white. */
  action?: ReactNode;
  /**
   * Keyboard/gamepad (S7-95): „Rozumiem” takes the focus when the card opens and shows the focus
   * ring, so Enter / A reads as pressing it.
   */
  focusGot?: boolean;
};

export function StationHelpCard({
  kind,
  device,
  variant = 'inPlay',
  onClose,
  action,
  focusGot = false,
}: StationHelpCardProps) {
  const help = pl.stationHelp.kinds[kind];
  const name = pl.vocab.stations[kind];
  return (
    <section
      className={`${styles.card} ${variant === 'full' ? styles.full : ''}`}
      aria-label={`${pl.stationHelp.title} ${name}`}
      data-testid="station-help-card"
      data-kind={kind}
      data-variant={variant}
      data-device={device}
    >
      <header className={styles.header}>
        <span className={styles.badge}>
          <Icon name={STATION_ICON[kind]} size={28} />
        </span>
        <span className={styles.headings}>
          <span className={styles.eyebrow}>
            <Icon name="question" size={18} />
            {pl.stationHelp.title}
          </span>
          <h3 className={styles.name}>{name}</h3>
        </span>
      </header>
      <div className={styles.body}>
        <p className={styles.purpose}>{typeset(help.purpose)}</p>
        <div className={styles.how}>
          <ol className={styles.steps} aria-label={pl.stationHelp.stepsLabel}>
            {help.steps[device].map((step, index) => (
              <li key={step} className={styles.step}>
                <span className={styles.number} aria-hidden="true">
                  {index + 1}
                </span>
                <span>{typeset(step)}</span>
              </li>
            ))}
          </ol>
          <ControlsDrawing kind={kind} device={device} />
        </div>
        <p className={styles.proof}>
          <Icon name="stamp" size={22} />
          <span>
            <strong>{pl.stationHelp.proofLabel}</strong> {typeset(help.proves)}
          </span>
        </p>
        {variant === 'full' && (
          <p className={styles.realWorld} data-testid="station-help-real-world">
            <Icon name="lightbulb" size={22} label={pl.stationHelp.realWorldLabel} />
            <span>{typeset(help.realWorld)}</span>
          </p>
        )}
      </div>
      <footer className={styles.footer}>
        <p className={styles.note}>
          <Icon name="clock" size={20} />
          {pl.stationHelp.deadlineRuns}
        </p>
        <div className={styles.actions}>
          {action}
          <Button
            variant={action ? 'secondary' : 'primary'}
            icon={<Icon name="check" />}
            onClick={onClose}
            autoFocus={focusGot}
            data-focused={focusGot || undefined}
            data-testid="station-help-got"
          >
            {pl.stationHelp.got}
          </Button>
        </div>
      </footer>
    </section>
  );
}

/** The station's main controls on this device, pressed one after another. */
function ControlsDrawing({ kind, device }: { kind: StationKind; device: InputDevice }) {
  const hints = drawnHints(kind, device);
  return (
    <div className={styles.drawing} aria-hidden="true" data-testid="station-help-drawing">
      {hints.length === 0 ? (
        <span className={`${styles.press} ${styles.icon}`}>
          <Icon name={STATION_ICON[kind]} size={44} />
        </span>
      ) : (
        hints.map((hint) => (
          <span key={`${hint.keys.join('+')}:${hint.label}`} className={styles.control}>
            <span className={styles.press}>
              {hint.keys.map((key) => (
                <NamedControl key={key} name={key} device={device} />
              ))}
            </span>
            <span className={styles.label}>{hint.label}</span>
          </span>
        ))
      )}
    </div>
  );
}
