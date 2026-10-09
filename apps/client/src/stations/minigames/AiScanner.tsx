// AI scanner minigame („Skaner AI”, S4-02). A gauge shows how likely the material is machine
// made, with a shaded error margin ("78 % ± 15 %"). The player reads it and answers „Raczej
// prawdziwe”, „Nie wiem” or „Raczej AI”: a margin that still covers 50 % means „Nie wiem” is the
// right answer. Reading and rules are pure, in aiScanner.logic.ts.
import { AI_SCANNER_THRESHOLD } from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import type { CueId } from '../../fx/cues.ts';
import { emitCue } from '../../fx/feedback.ts';
import { useNavIntent } from '../../input/ui-nav.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Icon, type IconName } from '../../ui/icons/Icon.tsx';
import { KeyHints, OutcomeBanner, TaskLine } from '../kit.tsx';
import styles from './AiScanner.module.css';
import {
  ANSWERS,
  classify,
  correctAnswer,
  generateReading,
  initialState,
  readingRange,
  reduce,
  type ScannerAction,
  type ScannerAnswer,
  type ScannerEffect,
} from './aiScanner.logic.ts';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.aiScanner;

/** How long the verdict stays visible before the result goes out (ms). */
const RESULT_HOLD_MS = { success: 900, failure: 1400 } as const;
/** The needle starts moving this long after the round opens (ms). */
const SCAN_DELAY_MS = 120;

const ANSWER_ICON: Record<ScannerAnswer, IconName> = {
  real: 'check',
  unsure: 'question',
  ai: 'aiScanner',
};

const EFFECT_CUES: Record<ScannerEffect, CueId> = {
  move: 'ui.hover',
  success: 'aiScanner.answer',
  failure: 'aiScanner.wrong',
};

export function AiScanner({ seed, story, device, onDone }: MinigameProps) {
  const [state, setState] = useState(() => initialState(generateReading(seed, story)));
  const [scanned, setScanned] = useState(false);
  const stateRef = useRef(state);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const { reading, outcome } = state;

  const dispatch = (action: ScannerAction) => {
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
    if (intent === 'left') dispatch({ type: 'move', delta: -1 });
    else if (intent === 'right') dispatch({ type: 'move', delta: 1 });
    else if (intent === 'confirm') dispatch({ type: 'confirm' });
  });

  // The needle swings from the middle to the reading (instant with reduced motion: tokens).
  useEffect(() => {
    const timer = setTimeout(() => {
      setScanned(true);
      emitCue('aiScanner.scan');
    }, SCAN_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

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
  const { low, high } = readingRange(reading);
  const kind = classify(reading);
  const shown = scanned ? reading.percent : AI_SCANNER_THRESHOLD;
  const rangeLow = scanned ? low : AI_SCANNER_THRESHOLD;
  const rangeHigh = scanned ? high : AI_SCANNER_THRESHOLD;

  return (
    <div className={styles.root} data-testid="ai-scanner">
      <TaskLine>{typeset(t.task)}</TaskLine>

      <div className={styles.gauge}>
        <p
          className={styles.readout}
          role="img"
          aria-label={t.readingLabel(reading.percent, reading.margin)}
          data-testid="scanner-reading"
        >
          {t.reading(reading.percent, reading.margin)}
        </p>

        <div className={styles.scale}>
          <div className={styles.track}>
            <span className={styles.half} data-side="real" />
            <span className={styles.half} data-side="ai" />
            <span
              className={styles.range}
              style={{ left: `${rangeLow}%`, width: `${rangeHigh - rangeLow}%` }}
              data-testid="scanner-range"
            />
            <span className={styles.threshold} aria-hidden="true">
              <span className={styles.thresholdLabel}>{AI_SCANNER_THRESHOLD}%</span>
            </span>
            <span className={styles.needle} style={{ left: `${shown}%` }} aria-hidden="true" />
          </div>
          <div className={styles.ends} aria-hidden="true">
            <span>
              <Icon name="check" size={18} /> {t.human}
            </span>
            <span>
              {t.machine} <Icon name="aiScanner" size={18} />
            </span>
          </div>
        </div>
      </div>

      {playing ? (
        <div className={styles.answers}>
          {ANSWERS.map((answer, i) => (
            <button
              key={answer}
              type="button"
              className={styles.answer}
              tabIndex={-1}
              data-testid={`scanner-answer-${answer}`}
              data-answer={answer}
              data-focused={showCursor && state.cursor === i}
              // Keep DOM focus off the buttons so Space/Enter only act through nav intents.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => dispatch({ type: 'pick', answer })}
            >
              <span className={styles.answerIcon}>
                <Icon name={ANSWER_ICON[answer]} size={26} />
              </span>
              <span>{typeset(t.answers[answer])}</span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <OutcomeBanner
            success={outcome === 'success'}
            title={outcome === 'success' ? t.success : t.failure}
            testId="scanner-verdict"
          >
            <p>
              {typeset(
                outcome === 'success'
                  ? t.done[kind]
                  : `${t.failed[kind]} · ${t.answers[correctAnswer(reading)]}`,
              )}
            </p>
          </OutcomeBanner>
        </div>
      )}

      {playing && <KeyHints hints={t.keys} device={device} />}
    </div>
  );
}
