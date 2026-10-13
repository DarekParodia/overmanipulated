// Stenogram minigame (S7-53). The clip quoted in the folder („Cytat w teczce”) next to the full
// record of what was said („Pełny zapis”, four numbered lines in a 2×2 grid). Find the line the
// clip comes from, or answer „Nie ma w zapisie”; once the line is found, the words the clip left
// out are underlined and the player judges the cut: „Sens ten sam” or „Sens zmieniony”. Rules
// and puzzle generation are pure, in transcript.logic.ts. A failure shows the right answer
// unless the difficulty hides it (Ekspert).
import { useEffect, useRef, useState } from 'react';
import type { CueId } from '../../fx/cues.ts';
import { emitCue } from '../../fx/feedback.ts';
import { useNavIntent } from '../../input/ui-nav.ts';
import { useSettings } from '../../store/settings.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Icon, type IconName } from '../../ui/icons/Icon.tsx';
import { KeyHints, Mistakes, OutcomeBanner, TaskLine } from '../kit.tsx';
import styles from './Transcript.module.css';
import {
  type Action,
  answerTarget,
  cutWords,
  type Effect,
  generatePuzzle,
  initialState,
  JUDGEMENTS,
  type Judgement,
  reduce,
} from './transcript.logic.ts';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.transcript;

/** How long the result stays visible before it goes out (ms); a failure shows the reason longer. */
const RESULT_HOLD_MS = { success: 1000, failure: 1400 } as const;

const EFFECT_CUES: Record<Effect, CueId> = {
  move: 'ui.hover',
  found: 'transcript.find',
  right: 'transcript.right',
  mistake: 'transcript.miss',
  failed: 'transcript.miss',
  blocked: 'ui.back',
};

const NUDGE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px) rotate(-0.4deg)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-2px)' },
  { transform: 'translateX(0)' },
];

const JUDGEMENT_ICON: Record<Judgement, IconName> = { same: 'check', changed: 'cross' };

export function Transcript({
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
  const recordRef = useRef<HTMLElement>(null);
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
      recordRef.current?.animate?.(NUDGE, { duration: 260, easing: 'ease-out' });
    }
  };

  useNavIntent((intent) => {
    if (intent === 'up') dispatch({ type: 'move', dRow: -1, dCol: 0 });
    else if (intent === 'down') dispatch({ type: 'move', dRow: 1, dCol: 0 });
    else if (intent === 'left') dispatch({ type: 'move', dRow: 0, dCol: -1 });
    else if (intent === 'right') dispatch({ type: 'move', dRow: 0, dCol: 1 });
    else if (intent === 'confirm') dispatch({ type: 'confirm' });
    else if (intent === 'alt') dispatch({ type: 'notInTranscript' });
  });

  const { outcome, puzzle, phase } = state;
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
  const judging = phase === 'judge';
  const answer = answerTarget(state);
  const revealed = outcome === 'failure' && revealOnFail;
  const shown = outcome === 'success' || revealed;
  // The clip's line shows its cut once found, or after a failure that reveals it.
  const markedLine = judging || (revealed && puzzle.answerLine !== null) ? puzzle.answerLine : null;

  /** Shared button wiring: cursor, struck mark, the reveal and focus kept off the button. */
  const buttonProps = (target: string, focused: boolean, struck: boolean, onClick: () => void) => ({
    'data-testid': `transcript-${target}`,
    'data-focused': showCursor && focused,
    'data-struck': struck,
    'data-revealed': revealed && target === answer,
    // Keep DOM focus off the buttons so Space/Enter only act through nav intents.
    onMouseDown: (event: { preventDefault(): void }) => event.preventDefault(),
    onClick,
  });

  return (
    <div
      className={styles.root}
      data-testid="transcript"
      data-answer={answer}
      data-variant={puzzle.variant}
      data-phase={phase}
    >
      <TaskLine
        aside={
          <Mistakes used={state.mistakes} max={state.maxMistakes} testId="transcript-mistakes" />
        }
      >
        {typeset(judging ? t.judgeTask : t.task)}
      </TaskLine>

      <div className={styles.body}>
        <section className={styles.clip} aria-label={t.clipTitle}>
          <p className={styles.title}>
            <Icon name="folder" size={18} />
            {t.clipTitle}
          </p>
          <blockquote className={styles.quote} data-testid="transcript-clip">
            {typeset(`„${puzzle.clip}”`)}
          </blockquote>
        </section>

        <section className={styles.record} aria-label={t.recordTitle} ref={recordRef}>
          <p className={styles.title}>
            <Icon name="transcript" size={18} />
            {t.recordTitle}
            <span className={styles.setting}>{typeset(puzzle.setting)}</span>
            {markedLine !== null && (
              <span className={styles.legend} data-testid="transcript-legend">
                {typeset(t.cutLegend)}
              </span>
            )}
          </p>
          <div className={styles.grid}>
            {puzzle.lines.map((line, i) => {
              const found = markedLine === i;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: the record's lines are fixed for the round.
                  key={i}
                  type="button"
                  className={styles.line}
                  aria-label={t.line(i + 1, line)}
                  data-found={found}
                  disabled={!playing || judging}
                  {...buttonProps(
                    `line-${i}`,
                    !judging && state.cursor === i,
                    state.struckLines[i] ?? false,
                    () => dispatch({ type: 'pickLine', index: i }),
                  )}
                >
                  <span className={styles.number} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className={styles.text}>
                    {found
                      ? cutWords(line, puzzle.clip).map((segment, k) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: words of a fixed line.
                          <span key={k} className={segment.cut ? styles.cut : undefined}>
                            {k > 0 ? ' ' : ''}
                            {typeset(segment.text)}
                          </span>
                        ))
                      : typeset(line)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className={styles.foot} data-phase={phase}>
          {!playing ? (
            <OutcomeBanner
              success={outcome === 'success'}
              title={outcome === 'success' ? t.right : t.wrong}
              testId="transcript-verdict"
            >
              {shown && <p>{typeset(t.reasons[puzzle.variant])}</p>}
            </OutcomeBanner>
          ) : judging ? (
            JUDGEMENTS.map((judgement, i) => (
              <button
                key={judgement}
                type="button"
                className={styles.answer}
                {...buttonProps(judgement, state.cursor === i, state.judgeStruck[judgement], () =>
                  dispatch({ type: 'judge', changed: judgement === 'changed' }),
                )}
              >
                <Icon name={JUDGEMENT_ICON[judgement]} size={22} />
                {t[judgement]}
              </button>
            ))
          ) : (
            <button
              type="button"
              className={styles.answer}
              {...buttonProps(
                'absent',
                state.cursor === puzzle.lines.length,
                state.absentStruck,
                () => dispatch({ type: 'notInTranscript' }),
              )}
            >
              <Icon name="question" size={22} />
              {t.notInRecord}
            </button>
          )}
        </div>
      </div>

      {playing && <KeyHints hints={judging ? t.judgeKeys : t.keys} device={device} />}
    </div>
  );
}
