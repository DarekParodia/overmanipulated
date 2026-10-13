// Guidance during play: the purple "what next" hint bubble at the bottom centre, replaced by the
// first-game tutorial card while the tutorial runs. Neither blocks input: the game keeps
// running underneath and only the skip button takes pointer events.
import { useGame } from '../net/game-store.ts';
import { isCoarsePointer } from '../scene/quality.ts';
import { useApp } from '../store/app.ts';
import { useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import styles from './Guidance.module.css';
import { BUSY_KINDS, type NextStepKind } from './next-step.ts';
import { useEffectiveHints, useGuidance } from './store.ts';
import { Tutorial } from './Tutorial.tsx';
import { useTutorial } from './tutorial-store.ts';
import { useGuidanceDriver } from './use-guidance-driver.ts';

const HINT_ICONS: Record<NextStepKind, IconName> = {
  pickup: 'article',
  pickupHere: 'article',
  toStation: 'article',
  dropHere: 'article',
  work: 'clock',
  working: 'clock',
  minigame: 'photo',
  lockout: 'hourglass',
  toDesk: 'publish',
  openDesk: 'publish',
  verdict: 'publish',
  wait: 'clock',
};

export function Guidance() {
  useGuidanceDriver();
  const ended = useGame((s) => s.levelEnd !== null);
  const tutorialStep = useTutorial((s) => s.step);
  const device = useApp((s) => s.inputDevice);
  const leftHanded = useSettings((s) => s.leftHanded);
  const touch = device === 'touch' || isCoarsePointer();
  if (ended) {
    return null;
  }
  return (
    <div
      className={`${styles.dock} ${touch ? styles.touch : ''} ${leftHanded ? styles.leftHanded : ''}`}
    >
      {tutorialStep !== null ? <Tutorial step={tutorialStep} /> : <HintBubble />}
    </div>
  );
}

function HintBubble() {
  // Off with the setting, and on Ekspert whatever the setting says (S7-24).
  const enabled = useEffectiveHints();
  const step = useGuidance((s) => s.step);
  if (!enabled || !step || BUSY_KINDS.has(step.kind)) {
    return null;
  }
  // The wait hint counts down to the next folder (S7-09): it pops in once, not every second,
  // and screen readers get the static line instead of an announcement per second.
  const ticking = step.kind === 'wait';
  return (
    <p
      className={styles.bubble}
      role="status"
      title={pl.guidance.bubbleLabel}
      data-testid="guidance-hint"
      data-kind={step.kind}
    >
      <span className={styles.bubbleIcon}>
        <Icon name={HINT_ICONS[step.kind]} size={28} />
      </span>
      {/* Keyed so each new hint pops in. */}
      <span
        key={ticking ? step.kind : step.text}
        className={styles.bubbleText}
        aria-hidden={ticking || undefined}
      >
        {typeset(step.text)}
      </span>
      {ticking && <span className="visually-hidden">{pl.guidance.hint.wait}</span>}
    </p>
  );
}
