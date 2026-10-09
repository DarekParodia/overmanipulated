// Phone minigame („Telefon”, S4-01). The story's source is named at the top; the player dials
// the matching entry of the phone book, then waits in a short queue with hold music (reporters
// skip the queue). Rules and puzzle generation are pure, in phone.logic.ts.
import { PHONE_HOLD_BEAT_MS } from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import type { CueId } from '../../fx/cues.ts';
import { emitCue } from '../../fx/feedback.ts';
import { useNavIntent } from '../../input/ui-nav.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import { KeyHints, OutcomeBanner, TaskLine } from '../kit.tsx';
import styles from './Phone.module.css';
import {
  type Action,
  type Effect,
  generatePuzzle,
  initialState,
  queueSeconds,
  reduce,
} from './phone.logic.ts';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.phone;

/** How long the finished call stays visible before the result goes out (ms). */
const RESULT_HOLD_MS = { success: 900, failure: 1100 } as const;
/** How often the queue countdown advances. */
const TICK_MS = 100;

const EFFECT_CUES: Record<Effect, CueId> = {
  move: 'ui.hover',
  ringing: 'phone.ring',
  hold: 'phone.hold',
  connected: 'phone.connect',
  wrong: 'phone.wrong',
};

export function Phone({ seed, story, stamp, device, skipsQueue = false, onDone }: MinigameProps) {
  const [state, setState] = useState(() => initialState(generatePuzzle(seed, story), skipsQueue));
  const stateRef = useRef(state);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const { puzzle, phase } = state;

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
  };

  useNavIntent((intent) => {
    // Two columns on wide cards (column-major): left/right jump half the book.
    const half = Math.ceil(puzzle.contacts.length / 2);
    if (intent === 'up') dispatch({ type: 'move', delta: -1 });
    else if (intent === 'down') dispatch({ type: 'move', delta: 1 });
    else if (intent === 'left') dispatch({ type: 'move', delta: -half });
    else if (intent === 'right') dispatch({ type: 'move', delta: half });
    else if (intent === 'confirm') dispatch({ type: 'confirm' });
  });

  // The queue clock.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispatch only touches refs and setState
  useEffect(() => {
    if (phase !== 'queue') {
      return;
    }
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      dispatch({ type: 'tick', dtMs: now - last });
      last = now;
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'success' && phase !== 'failure') {
      return;
    }
    const timer = setTimeout(() => onDoneRef.current(phase === 'success'), RESULT_HOLD_MS[phase]);
    return () => clearTimeout(timer);
  }, [phase]);

  const dialling = phase === 'dial';
  const showCursor = device !== 'touch' && dialling;
  const finished = phase === 'success' || phase === 'failure';
  const queueShare = puzzle.queueMs > 0 ? 1 - state.queueLeftMs / puzzle.queueMs : 1;

  return (
    <div className={styles.root} data-testid="phone" data-phase={phase}>
      <TaskLine>{typeset(t.task)}</TaskLine>

      <p className={styles.target} data-testid="phone-target">
        <Icon name="phone" size={26} />
        <span>{typeset(puzzle.target)}</span>
      </p>

      {(dialling || phase === 'failure') && (
        <ol className={styles.book}>
          {puzzle.contacts.map((contact, i) => (
            <li key={contact.number}>
              <button
                type="button"
                className={styles.contact}
                data-testid={`phone-contact-${i}`}
                data-focused={showCursor && state.cursor === i}
                data-wrong={phase === 'failure' && state.dialled === i}
                disabled={!dialling}
                // Keep DOM focus off the rows so Space/Enter only act through nav intents.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => dispatch({ type: 'dial', index: i })}
              >
                <span className={styles.name}>{typeset(contact.name)}</span>
                <span className={styles.number}>{contact.number}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {phase === 'queue' && (
        <div className={styles.queue} role="status" data-testid="phone-queue">
          <span className={styles.handset} aria-hidden="true">
            <Icon name="phone" size={44} />
          </span>
          <div className={styles.queueText}>
            <p className={styles.queueTitle}>{t.onHold}</p>
            <span
              className={styles.bars}
              aria-hidden="true"
              // Restarts the bounce on every beat of the hold music.
              key={state.beats}
              data-beat={state.beats % 2}
              style={{ ['--beat' as string]: `${PHONE_HOLD_BEAT_MS}ms` }}
            >
              <i />
              <i />
              <i />
            </span>
            <span className={styles.track}>
              <span className={styles.fill} style={{ width: `${Math.round(queueShare * 100)}%` }} />
            </span>
          </div>
          <span className={styles.count} data-testid="phone-queue-left">
            {t.seconds(queueSeconds(state.queueLeftMs))}
          </span>
        </div>
      )}

      {finished && (
        <OutcomeBanner
          success={phase === 'success'}
          title={phase === 'success' ? t.connected : t.wrong}
          testId="phone-verdict"
        >
          {phase === 'success' ? stamp && <p>{typeset(stamp.text)}</p> : <p>{t.wrongBody}</p>}
        </OutcomeBanner>
      )}

      {dialling && state.skipsQueue && (
        <p className={styles.skipped} data-testid="phone-skipped">
          {t.skipped}
        </p>
      )}

      {dialling && <KeyHints hints={t.keys} device={device} />}
    </div>
  );
}
