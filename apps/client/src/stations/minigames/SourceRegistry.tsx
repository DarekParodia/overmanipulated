// Source registry minigame („Kartoteka źródeł”, S2-06). An index card pulled from the drawer
// describes the account or website behind the story; the player circles the warning signs in
// red pencil (or none, if the source checks out) and files the card back. Rules and puzzle
// generation are pure, in sourceRegistry.logic.ts.
import { SOURCE_REGISTRY_MAX_MISTAKES } from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import type { CueId } from '../../fx/cues.ts';
import { emitCue } from '../../fx/feedback.ts';
import { useNavIntent } from '../../input/ui-nav.ts';
import { useSettings } from '../../store/settings.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Stamp } from '../../ui/Stamp.tsx';
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
/** Share of the time limit after which the card shows urgency. */
const URGENT_FROM = 0.7;

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

export function SourceRegistry({ seed, story, stamp, device, timeUsed, onDone }: MinigameProps) {
  // The puzzle is fixed for the lifetime of this round (the overlay remounts per round), so
  // rendering and rules both read `state.card`.
  const [state, setState] = useState(() => initialState(generateCard(seed, story, stamp)));
  const { card } = state;
  const stateRef = useRef(state);
  const cardRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const noFlash = useSettings((s) => s.noFlash);

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
  const urgent = playing && timeUsed >= URGENT_FROM;
  const circledCount = state.circled.filter(Boolean).length;
  const fileIndex = card.fields.length;

  return (
    <div
      className={styles.drawer}
      data-testid="source-registry"
      data-urgent={urgent}
      data-calm={noFlash || reducedMotion}
    >
      <div className={styles.drawerFront}>
        <span className={styles.labelHolder}>{t.drawer}</span>
        <span className={styles.timeStrip} aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.max(0, 1 - timeUsed)})` }} />
        </span>
      </div>

      <div className={styles.card} ref={cardRef} data-outcome={outcome}>
        <header className={styles.cardHead}>
          <span className={styles.kind}>{t.kinds[card.kind]}</span>
          <span className={styles.cardNo}>{t.cardNo(card.number)}</span>
          <span className={styles.task}>{typeset(t.task)}</span>
        </header>

        <ol
          className={styles.fields}
          style={{ ['--rows' as string]: Math.ceil(card.fields.length / 2) }}
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
                  <span className={styles.fieldValue}>
                    {typeset(field.value)}
                    {(circled || missed) && (
                      <svg
                        className={styles.pencilRing}
                        viewBox="0 0 100 40"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          pathLength={1}
                          d="M14 5 C 45 -1, 94 1, 97 18 C 100 35, 55 40, 22 37 C 2 35, -1 22, 4 13 C 8 6, 20 3, 30 3"
                        />
                      </svg>
                    )}
                  </span>
                  <span className={styles.margin} aria-hidden={!struck && !circled && !missed}>
                    {circled || missed ? '!' : struck ? t.notThis : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <footer className={styles.cardFoot}>
          <span className={styles.tally} data-testid="source-mistakes" data-count={state.mistakes}>
            {t.mistakes}
            {Array.from({ length: SOURCE_REGISTRY_MAX_MISTAKES }, (_, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-size tally
                key={i}
                className={styles.tallyMark}
                data-used={i < state.mistakes}
                role="img"
                aria-label={i < state.mistakes ? t.mistakeUsed : t.mistakeFree}
              />
            ))}
          </span>
          <span className={styles.count} role="status">
            {outcome === 'failure'
              ? t.revealed
              : state.missing
                ? t.missing
                : t.marked(circledCount)}
          </span>
          <button
            type="button"
            className={styles.file}
            data-testid="source-file"
            data-focused={showCursor && state.cursor === fileIndex}
            disabled={!playing}
            onClick={() => dispatch({ type: 'file' })}
          >
            {t.file}
          </button>
        </footer>

        {!playing && (
          <div className={styles.verdict} data-testid="source-verdict">
            <Stamp
              text={outcome === 'success' ? t.filed : t.failed}
              subtext={outcome === 'success' ? (circledCount ? t.flagged : t.clean) : t.drawer}
              tone={outcome === 'success' ? 'blue' : 'red'}
              shape="double"
              seed={card.number}
              slam={!reducedMotion}
              size={200}
            />
            {outcome === 'success' && stamp && (
              <p className={styles.stampText}>{typeset(stamp.text)}</p>
            )}
          </div>
        )}
      </div>

      <p className={styles.hint}>{t.hints[device]}</p>
    </div>
  );
}
