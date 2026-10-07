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
import { useGuidance } from './store.ts';
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
  lockout: 'clock',
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
  const enabled = useGuidance((s) => s.hintsEnabled);
  const step = useGuidance((s) => s.step);
  if (!enabled || !step || BUSY_KINDS.has(step.kind)) {
    return null;
  }
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
      <span key={step.text} className={styles.bubbleText}>
        {typeset(step.text)}
      </span>
    </p>
  );
}
