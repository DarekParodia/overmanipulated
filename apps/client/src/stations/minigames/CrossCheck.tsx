// Inne media minigame (S7-54). The folder's claim („W teczce”) above five coverage cards from
// other outlets (3 + 2): each shows the outlet, its kind badge, its stance („pisze to samo” or
// „zaprzecza”) and its source line. A copy of someone else's post looks exactly like a
// confirmation; only the badge and the source line give it away. The player answers
// „Potwierdzają”, „Zaprzeczają” or „Za mało źródeł”; one wrong answer fails. After the round the
// copies get a „kopia” stamp and every card that does not count fades, unless the difficulty
// hides the answer (Ekspert). Rules and puzzle generation are pure, in crossCheck.logic.ts.
import { useEffect, useRef, useState } from 'react';
import type { CueId } from '../../fx/cues.ts';
import { emitCue } from '../../fx/feedback.ts';
import { useNavIntent } from '../../input/ui-nav.ts';
import { useSettings } from '../../store/settings.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Icon, type IconName } from '../../ui/icons/Icon.tsx';
import { KeyHints, Mistakes, OutcomeBanner, TaskLine } from '../kit.tsx';
import styles from './CrossCheck.module.css';
import {
  type Action,
  ANSWERS,
  type Conclusion,
  type CoverageCard,
  type Effect,
  generatePuzzle,
  initialState,
  isIndependent,
  type OutletKind,
  reduce,
  sourceLine,
} from './crossCheck.logic.ts';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.crossCheck;

/** How long the result stays visible before it goes out (ms); a failure shows the reason longer. */
const RESULT_HOLD_MS = { success: 1000, failure: 1400 } as const;

const EFFECT_CUES: Record<Effect, CueId> = {
  move: 'ui.hover',
  right: 'crossCheck.right',
  mistake: 'crossCheck.wrong',
  failed: 'crossCheck.wrong',
  blocked: 'ui.back',
};

const NUDGE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px) rotate(-0.4deg)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-2px)' },
  { transform: 'translateX(0)' },
];

const KIND_ICON: Record<OutletKind, IconName> = {
  agency: 'globe',
  newsroom: 'article',
  satire: 'blunder',
  anonymous: 'user',
  junk: 'bot',
};

const ANSWER_ICON: Record<Conclusion, IconName> = {
  confirmed: 'check',
  denied: 'cross',
  unconfirmed: 'question',
};

/** What a card shows after the round: it counts, it is a copy, or it fades (satire, anonymous). */
type Reveal = 'counts' | 'copy' | 'fade';

function revealOf(card: CoverageCard): Reveal {
  if (isIndependent(card)) {
    return 'counts';
  }
  return card.stance === 'echoes' ? 'copy' : 'fade';
}

export function CrossCheck({
  seed,
  story,
  stamp,
  device,
  difficulty,
  revealOnFail,
  onDone,
}: MinigameProps) {
  // The puzzle is fixed for the lifetime of this round (the overlay remounts per round).
  const [state, setState] = useState(() =>
    initialState(generatePuzzle(seed, story, stamp), difficulty),
  );
  const stateRef = useRef(state);
  const answersRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reducedMotion = useSettings((s) => s.reducedMotion);

  const dispatch = (action: Action) => {
    const [next, effect] = reduce(stateRef.current, action);
    if (next === stateRef.current) {
      return;
    }
    stateRef.current = next;
    setState(next);
    if (effect) {
      emitCue(EFFECT_CUES[effect]);
    }
    if ((effect === 'mistake' || effect === 'failed') && !reducedMotion) {
      answersRef.current?.animate?.(NUDGE, { duration: 260, easing: 'ease-out' });
    }
  };

  useNavIntent((intent) => {
    if (intent === 'left' || intent === 'up') dispatch({ type: 'move', delta: -1 });
    else if (intent === 'right' || intent === 'down') dispatch({ type: 'move', delta: 1 });
    else if (intent === 'confirm') dispatch({ type: 'confirm' });
  });

  const { outcome, puzzle } = state;
  useEffect(() => {
    if (outcome === 'playing') {
      return;
    }
    const timer = setTimeout(
      () => onDoneRef.current(outcome === 'success'),
      RESULT_HOLD_MS[outcome],
    );
    return () => clearTimeout(timer);
  }, [outcome]);

  const playing = outcome === 'playing';
  const showCursor = device !== 'touch' && playing;
  const shown = outcome === 'success' || (outcome === 'failure' && revealOnFail);

  return (
    <div className={styles.root} data-testid="cross-check" data-answer={puzzle.conclusion}>
      <TaskLine
        aside={
          <Mistakes used={state.mistakes} max={state.maxMistakes} testId="cross-check-mistakes" />
        }
      >
        {typeset(t.task)}
      </TaskLine>

      <div className={styles.board}>
        <p className={styles.claim} data-testid="cross-check-claim">
          <span className={styles.claimTitle}>
            <Icon name="folder" size={18} />
            {t.claimTitle}
          </span>
          <span className={styles.claimText}>{typeset(puzzle.claim)}</span>
        </p>

        <ul className={styles.cards} aria-label={t.cardsTitle}>
          {puzzle.cards.map((card) => {
            const reveal = shown ? revealOf(card) : undefined;
            const kind = t.kinds[card.kind];
            const stance = t.stances[card.stance];
            const source = sourceLine(card);
            return (
              <li
                key={card.outlet}
                className={styles.card}
                data-testid="cross-check-card"
                data-kind={card.kind}
                data-reveal={reveal}
                aria-label={t.card(card.outlet, kind, stance, source)}
              >
                <p className={styles.outlet}>{typeset(card.outlet)}</p>
                <p className={styles.meta}>
                  <span className={styles.badge} data-kind={card.kind}>
                    <Icon name={KIND_ICON[card.kind]} size={16} />
                    {kind}
                  </span>
                  <span
                    className={styles.stance}
                    data-stance={card.stance === 'denies' ? 'denies' : 'same'}
                  >
                    <Icon name={card.stance === 'denies' ? 'cross' : 'check'} size={16} />
                    <span className={styles.stanceWord}>{stance}</span>
                  </span>
                </p>
                <p className={styles.source} data-copied={card.via !== null}>
                  {card.via !== null && <Icon name="copy" size={16} />}
                  {typeset(source)}
                </p>
                {reveal === 'copy' && (
                  <span className={styles.copy} aria-hidden="true">
                    {t.copy}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.foot} ref={answersRef}>
        {playing ? (
          ANSWERS.map((answer, i) => (
            <button
              key={answer}
              type="button"
              className={styles.answer}
              data-testid={`cross-check-${answer}`}
              data-focused={showCursor && state.cursor === i}
              data-struck={state.struck[answer]}
              // Keep DOM focus off the buttons so Space/Enter only act through nav intents.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => dispatch({ type: 'pick', answer })}
            >
              <Icon name={ANSWER_ICON[answer]} size={22} />
              {t.answers[answer]}
            </button>
          ))
        ) : (
          <OutcomeBanner
            success={outcome === 'success'}
            title={outcome === 'success' ? t.right : t.wrong}
            testId="cross-check-verdict"
          >
            {shown && <p>{typeset(t.reasons[puzzle.conclusion])}</p>}
          </OutcomeBanner>
        )}
      </div>

      {playing && <KeyHints hints={t.keys} device={device} />}
    </div>
  );
}
