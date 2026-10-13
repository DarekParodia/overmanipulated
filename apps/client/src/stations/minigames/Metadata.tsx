// Metadane minigame (S7-52). The folder's description of a file („Opis w teczce”) next to the
// file's own data („Dane pliku”, four fields in a 2×2 grid): tap the field that contradicts the
// description, or answer „Zgadza się” or „Brak danych”. Rules and puzzle generation are pure, in
// metadata.logic.ts. A failure shows the right answer unless the difficulty hides it (Ekspert).
import { useEffect, useRef, useState } from 'react';
import type { CueId } from '../../fx/cues.ts';
import { emitCue } from '../../fx/feedback.ts';
import { useNavIntent } from '../../input/ui-nav.ts';
import { useSettings } from '../../store/settings.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Icon, type IconName } from '../../ui/icons/Icon.tsx';
import { KeyHints, Mistakes, OutcomeBanner, TaskLine } from '../kit.tsx';
import styles from './Metadata.module.css';
import {
  type Action,
  answerChoice,
  CHOICES,
  type Choice,
  type Effect,
  generatePuzzle,
  initialState,
  METADATA_FIELD_IDS,
  type MediaKind,
  type MetadataField,
  reasonKey,
  reduce,
} from './metadata.logic.ts';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.metadata;

/** How long the result stays visible before it goes out (ms); a failure shows the reason longer. */
const RESULT_HOLD_MS = { success: 1000, failure: 1400 } as const;

const EFFECT_CUES: Record<Effect, CueId> = {
  move: 'ui.hover',
  right: 'metadata.right',
  mistake: 'metadata.mistake',
  failed: 'metadata.mistake',
  blocked: 'ui.back',
};

const NUDGE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px) rotate(-0.4deg)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-2px)' },
  { transform: 'translateX(0)' },
];

const DEVICE_ICON: Record<MediaKind, IconName> = {
  photo: 'photo',
  recording: 'recording',
  screenshot: 'post',
};

function fieldIcon(field: MetadataField, mediaKind: MediaKind): IconName {
  switch (field) {
    case 'taken':
      return 'clock';
    case 'device':
      return DEVICE_ICON[mediaKind];
    case 'software':
      return 'settings';
    case 'place':
      return 'globe';
  }
}

/** The ✓ / ✗ a field or button shows after the round, if any. */
type Mark = 'check' | 'cross' | null;

export function Metadata({
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
  const fileRef = useRef<HTMLElement>(null);
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
      fileRef.current?.animate?.(NUDGE, { duration: 260, easing: 'ease-out' });
    }
  };

  useNavIntent((intent) => {
    if (intent === 'up') dispatch({ type: 'move', dRow: -1, dCol: 0 });
    else if (intent === 'down') dispatch({ type: 'move', dRow: 1, dCol: 0 });
    else if (intent === 'left') dispatch({ type: 'move', dRow: 0, dCol: -1 });
    else if (intent === 'right') dispatch({ type: 'move', dRow: 0, dCol: 1 });
    else if (intent === 'confirm') dispatch({ type: 'confirm' });
    else if (intent === 'alt') dispatch({ type: 'pick', choice: 'matches' });
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
  const answer = answerChoice(puzzle);
  const shown = outcome === 'success' || (outcome === 'failure' && revealOnFail);
  const stripped = puzzle.outcome === 'stripped';

  /** After the round: ✗ on the contradicting field, ✓ on every field when all match. */
  const markOf = (choice: Choice): Mark => {
    if (!shown) {
      return null;
    }
    if (choice === answer) {
      return puzzle.outcome === 'contradiction' ? 'cross' : 'check';
    }
    return puzzle.outcome === 'consistent' && choice !== 'noData' ? 'check' : null;
  };

  const choiceProps = (choice: Choice) => ({
    'data-testid': `metadata-${choice}`,
    'data-focused': showCursor && CHOICES[state.cursor] === choice,
    'data-struck': state.struck[choice],
    'data-picked': state.picked === choice,
    'data-mark': markOf(choice) ?? undefined,
    'data-revealed': outcome === 'failure' && revealOnFail && choice === answer,
    disabled: !playing,
    // Keep DOM focus off the buttons so Space/Enter only act through nav intents.
    onMouseDown: (event: { preventDefault(): void }) => event.preventDefault(),
    onClick: () => dispatch({ type: 'pick', choice }),
  });

  return (
    <div
      className={styles.root}
      data-testid="metadata"
      data-answer={answer}
      data-outcome={puzzle.outcome}
    >
      <TaskLine
        aside={
          <Mistakes used={state.mistakes} max={state.maxMistakes} testId="metadata-mistakes" />
        }
      >
        {typeset(t.task)}
      </TaskLine>

      <div className={styles.body}>
        <section className={styles.claim} aria-label={t.claimTitle}>
          <p className={styles.title}>
            <Icon name="folder" size={18} />
            {t.claimTitle}
          </p>
          <ul className={styles.chips}>
            {METADATA_FIELD_IDS.map((field) => (
              <li key={field} className={styles.chip} data-testid={`metadata-claim-${field}`}>
                <Icon name={fieldIcon(field, puzzle.mediaKind)} size={18} />
                <span>{typeset(puzzle.claim[field])}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.file} aria-label={t.fileTitle} ref={fileRef}>
          <p className={styles.title}>
            <Icon name="metadata" size={18} />
            {t.fileTitle}
            {stripped && <span className={styles.note}>{typeset(t.strippedNote)}</span>}
          </p>
          <div className={styles.grid}>
            {METADATA_FIELD_IDS.map((field) => {
              const value = puzzle.file[field];
              const mark = markOf(field);
              return (
                <button
                  key={field}
                  type="button"
                  className={styles.field}
                  aria-label={t.field(t.fields[field], value ?? t.emptyAria)}
                  {...choiceProps(field)}
                >
                  <span className={styles.label}>
                    <Icon name={fieldIcon(field, puzzle.mediaKind)} size={16} />
                    {t.fields[field]}
                  </span>
                  <span className={styles.value} data-empty={value === null}>
                    {value === null ? t.empty : typeset(value)}
                  </span>
                  {mark && (
                    <span className={styles.mark} data-kind={mark} aria-hidden="true">
                      <Icon name={mark === 'check' ? 'check' : 'cross'} size={18} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className={styles.foot}>
          {playing ? (
            <>
              <button type="button" className={styles.answer} {...choiceProps('matches')}>
                <Icon name="check" size={22} />
                {t.matches}
              </button>
              <button type="button" className={styles.answer} {...choiceProps('noData')}>
                <Icon name="question" size={22} />
                {t.noData}
              </button>
            </>
          ) : (
            <OutcomeBanner
              success={outcome === 'success'}
              title={outcome === 'success' ? t.right : t.wrong}
              testId="metadata-verdict"
            >
              {shown && <p>{typeset(t.reasons[reasonKey(puzzle)])}</p>}
            </OutcomeBanner>
          )}
        </div>
      </div>

      {playing && <KeyHints hints={t.keys} device={device} />}
    </div>
  );
}
