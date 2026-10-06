// First-game tutorial card: one big friendly step at a time, driven by what the player really
// does (tutorial.ts). The wording and the drawn controls follow the input device in use. The
// card never takes input except for its skip button, so the game keeps running underneath.
import { type ReactNode, useEffect } from 'react';
import { type InputDevice, useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './Guidance.module.css';
import { placementFor } from './placement.ts';
import { useGuidance } from './store.ts';
import { TUTORIAL_DONE, TUTORIAL_STEPS, type TutorialStepId } from './tutorial.ts';
import { useTutorial } from './tutorial-store.ts';

/** How long the closing "well done" card stays. */
const DONE_CARD_MS = 2600;

function stepText(id: TutorialStepId, device: InputDevice): string {
  const { tutorial, workKey } = pl.guidance;
  switch (id) {
    case 'move':
      return tutorial.move[device];
    case 'pickup':
      return tutorial.pickup[device];
    case 'work':
      return tutorial.work(workKey[device]);
    case 'minigame':
      return tutorial.minigame;
    case 'verdict':
      return tutorial.verdict;
  }
}

/** A drawn key cap, gamepad button or touch button label. */
function Key({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <span className={`${styles.key} ${wide ? styles.keyWide : ''}`}>{children}</span>;
}

function PadButton({ children }: { children: ReactNode }) {
  return <span className={styles.padButton}>{children}</span>;
}

function TouchButton({ children }: { children: ReactNode }) {
  return <span className={styles.touchButton}>{children}</span>;
}

/** The control to press, drawn the way the player sees it on their device. */
function Control({ action, device }: { action: 'interact' | 'work'; device: InputDevice }) {
  if (device === 'gamepad') {
    return <PadButton>{action === 'interact' ? 'A' : 'X'}</PadButton>;
  }
  if (device === 'touch') {
    return <TouchButton>{action === 'interact' ? pl.touch.interact : pl.touch.work}</TouchButton>;
  }
  return action === 'interact' ? <Key>E</Key> : <Key wide>Spacja</Key>;
}

function Illustration({ id, device }: { id: TutorialStepId | 'done'; device: InputDevice }) {
  switch (id) {
    case 'move':
      if (device === 'keyboard') {
        return (
          <span className={styles.wasd}>
            <Key>W</Key>
            <span className={styles.wasdRow}>
              <Key>A</Key>
              <Key>S</Key>
              <Key>D</Key>
            </span>
          </span>
        );
      }
      return (
        <span className={styles.stick}>
          <span className={styles.stickKnob} />
        </span>
      );
    case 'pickup':
      return (
        <span className={styles.pair}>
          <Icon name="article" size={40} />
          <Control action="interact" device={device} />
        </span>
      );
    case 'work':
      return (
        <span className={styles.pair}>
          <Icon name="clock" size={40} />
          <Control action="work" device={device} />
        </span>
      );
    case 'minigame':
      return (
        <span className={styles.pair}>
          <Icon name="photo" size={44} />
        </span>
      );
    case 'verdict':
      return (
        <span className={styles.verdicts}>
          <span className={`${styles.verdict} ${styles.publish}`}>
            <Icon name="publish" size={30} />
          </span>
          <span className={`${styles.verdict} ${styles.context}`}>
            <Icon name="publishWithContext" size={30} />
          </span>
          <span className={`${styles.verdict} ${styles.reject}`}>
            <Icon name="reject" size={30} />
          </span>
        </span>
      );
    case 'done':
      return (
        <span className={`${styles.verdict} ${styles.publish} ${styles.doneMark}`}>
          <Icon name="publish" size={44} />
        </span>
      );
  }
}

export function Tutorial({ step }: { step: number }) {
  const device = useApp((s) => s.inputDevice);
  const kind = useGuidance((s) => s.step?.kind);
  const skip = useTutorial((s) => s.skip);
  const close = useTutorial((s) => s.close);
  const done = step >= TUTORIAL_DONE;

  useEffect(() => {
    if (!done) {
      return;
    }
    const timer = setTimeout(close, DONE_CARD_MS);
    return () => clearTimeout(timer);
  }, [done, close]);

  const id = done ? 'done' : (TUTORIAL_STEPS[step] ?? 'move');
  const text = id === 'done' ? pl.guidance.tutorial.done : stepText(id, device);
  const total = TUTORIAL_STEPS.length;

  return (
    <section
      key={id}
      className={`${styles.card} ${styles[placementFor(kind)]}`}
      aria-label={pl.guidance.tutorial.label}
      data-testid="tutorial"
      data-step={id}
    >
      <div className={styles.art}>
        <Illustration id={id} device={device} />
      </div>
      <div className={styles.cardBody}>
        <p className={styles.cardMeta}>
          <span className={styles.badge}>{pl.guidance.tutorial.label}</span>
          {!done && (
            <span
              className={styles.dots}
              role="img"
              aria-label={pl.guidance.tutorial.step(step + 1, total)}
            >
              {TUTORIAL_STEPS.map((s, i) => (
                <span
                  key={s}
                  className={`${styles.dot} ${i < step ? styles.dotDone : ''} ${i === step ? styles.dotNow : ''}`}
                />
              ))}
            </span>
          )}
        </p>
        <p className={styles.cardTitle} role="status">
          {typeset(text)}
        </p>
        {!done && (
          <div className={styles.skip}>
            <Button variant="ghost" onClick={skip} tabIndex={-1}>
              {pl.guidance.tutorial.skip}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
