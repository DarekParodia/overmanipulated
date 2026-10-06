// Source registry minigame („Kartoteka źródeł”, S2-06). A card describes the account or website
// behind the story; the player marks the warning signs (or none, if the source checks out) and
// puts the card back. Rules and puzzle
// generation are pure, in sourceRegistry.logic.ts.
import { SOURCE_REGISTRY_MAX_MISTAKES } from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import type { CueId } from '../../fx/cues.ts';
import { emitCue } from '../../fx/feedback.ts';
import { useNavIntent } from '../../input/ui-nav.ts';
import { useSettings } from '../../store/settings.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { KeyHints, Mistakes, OutcomeBanner, TaskLine } from '../kit.tsx';
import styles from './SourceRegistry.module.css';
import {
  type Action,
  type Effect,
  generateCard,
  initialState,
  reduce,
} from './sourceRegistry.logic.ts';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.sourceRegistry;

/** How long the filed card stays visible before the result goes out (ms). */
const RESULT_HOLD_MS = { success: 900, failure: 1100 } as const;

const EFFECT_CUES: Record<Effect, CueId> = {
  move: 'ui.hover',
  circle: 'sourceRegistry.circle',
  uncircle: 'sourceRegistry.uncircle',
  mistake: 'sourceRegistry.mistake',
  missing: 'sourceRegistry.mistake',
  failed: 'sourceRegistry.mistake',
  blocked: 'ui.back',
  filed: 'sourceRegistry.file',
};

const NUDGE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px) rotate(-0.4deg)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-2px)' },
  { transform: 'translateX(0)' },
];

export function SourceRegistry({ seed, story, stamp, device, onDone }: MinigameProps) {
  // The puzzle is fixed for the lifetime of this round (the overlay remounts per round), so
  // rendering and rules both read `state.card`.
  const [state, setState] = useState(() => initialState(generateCard(seed, story, stamp)));
  const { card } = state;
  const stateRef = useRef(state);
  const cardRef = useRef<HTMLDivElement>(null);
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
    if ((effect === 'mistake' || effect === 'missing' || effect === 'failed') && !reducedMotion) {
      cardRef.current?.animate?.(NUDGE, { duration: 260, easing: 'ease-out' });
    }
  };

  useNavIntent((intent) => {
    if (intent === 'up') dispatch({ type: 'move', delta: -1 });
    else if (intent === 'down') dispatch({ type: 'move', delta: 1 });
    else if (intent === 'confirm') dispatch({ type: 'confirm' });
    else if (intent === 'alt') dispatch({ type: 'file' });
  });

  const { outcome } = state;
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
  const circledCount = state.circled.filter(Boolean).length;
  const fileIndex = card.fields.length;
  const anyMissed = card.fields.some((field, i) => field.flagged && !state.circled[i]);

  return (
    <div className={styles.root} data-testid="source-registry">
      <TaskLine
        aside={
          <Mistakes
            used={state.mistakes}
            max={SOURCE_REGISTRY_MAX_MISTAKES}
            testId="source-mistakes"
          />
        }
      >
        {typeset(t.task)}
      </TaskLine>

      <div className={styles.card} ref={cardRef} data-outcome={outcome}>
        <span className={styles.kind}>{t.kinds[card.kind]}</span>
        <ol
          className={styles.fields}
          style={{
            ['--rows2' as string]: Math.ceil(card.fields.length / 2),
            ['--rows3' as string]: Math.ceil(card.fields.length / 3),
          }}
        >
          {card.fields.map((field, i) => {
            const circled = state.circled[i] ?? false;
            const struck = state.struck[i] ?? false;
            const missed = outcome === 'failure' && field.flagged && !circled;
            return (
              <li key={field.slot}>
                <button
                  type="button"
                  className={styles.field}
                  data-testid={`source-field-${i}`}
                  data-focused={showCursor && state.cursor === i}
                  data-circled={circled}
                  data-struck={struck}
                  data-missed={missed}
                  aria-pressed={circled}
                  disabled={!playing}
                  // Keep DOM focus off the rows so Space/Enter only act through nav intents.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => dispatch({ type: 'toggle', index: i })}
                >
                  <span className={styles.fieldLabel}>{field.label}</span>
                  <span className={styles.fieldValue}>{typeset(field.value)}</span>
                  {(circled || missed) && (
                    <span className={styles.flag} aria-hidden="true">
                      !
                    </span>
                  )}
                  {struck && <span className={styles.ok}>{t.notThis}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {playing ? (
        <div className={styles.foot}>
          <span className={styles.count} role="status">
            {state.missing ? t.missing : t.marked(circledCount)}
          </span>
          {/* Plain button: the dispatch plays the file/blocked cue, so no extra click sound. */}
          <button
            type="button"
            className={styles.file}
            data-testid="source-file"
            data-focused={showCursor && state.cursor === fileIndex}
            onClick={() => dispatch({ type: 'file' })}
          >
            {t.file}
          </button>
        </div>
      ) : (
        <div className={styles.result}>
          <OutcomeBanner
            success={outcome === 'success'}
            title={outcome === 'success' ? t.filed : t.failed}
            testId="source-verdict"
          >
            {outcome === 'success' ? (
              <p>{typeset(stamp?.text ?? (circledCount ? t.flagged : t.clean))}</p>
            ) : (
              anyMissed && <p>{t.revealed}</p>
            )}
          </OutcomeBanner>
        </div>
      )}

      {playing && <KeyHints hints={t.keys} device={device} />}
    </div>
  );
}
