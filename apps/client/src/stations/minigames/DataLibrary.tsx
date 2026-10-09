// Data library minigame („Biblioteka danych”, S4-03). A figure quoted in the story is compared
// with the ORIGINAL TABLE: tap the matching cell, or report „nie pasuje” when the figure was
// changed. Rules and puzzle generation are pure, in dataLibrary.logic.ts.
import { DATA_LIBRARY_MAX_MISTAKES } from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import type { CueId } from '../../fx/cues.ts';
import { emitCue } from '../../fx/feedback.ts';
import { useNavIntent } from '../../input/ui-nav.ts';
import { useSettings } from '../../store/settings.ts';
import { pl } from '../../strings/pl.ts';
import { formatNumber, typeset } from '../../strings/typography.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import { KeyHints, Mistakes, OutcomeBanner, TaskLine } from '../kit.tsx';
import styles from './DataLibrary.module.css';
import {
  type Action,
  answerCell,
  type Effect,
  generatePuzzle,
  initialState,
  reduce,
} from './dataLibrary.logic.ts';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.dataLibrary;

/** How long the result stays visible before it goes out (ms); a failure shows the reason longer. */
const RESULT_HOLD_MS = { success: 1000, failure: 1400 } as const;

const EFFECT_CUES: Record<Effect, CueId> = {
  move: 'ui.hover',
  right: 'dataLibrary.right',
  mistake: 'dataLibrary.mistake',
  failed: 'dataLibrary.mistake',
  blocked: 'ui.back',
};

const NUDGE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px) rotate(-0.4deg)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-2px)' },
  { transform: 'translateX(0)' },
];

export function DataLibrary({ seed, story, stamp, device, onDone }: MinigameProps) {
  // The puzzle is fixed for the lifetime of this round (the overlay remounts per round).
  const [state, setState] = useState(() => initialState(generatePuzzle(seed, story, stamp)));
  const stateRef = useRef(state);
  const tableRef = useRef<HTMLDivElement>(null);
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
      tableRef.current?.animate?.(NUDGE, { duration: 260, easing: 'ease-out' });
    }
  };

  useNavIntent((intent) => {
    if (intent === 'up') dispatch({ type: 'move', dRow: -1, dCol: 0 });
    else if (intent === 'down') dispatch({ type: 'move', dRow: 1, dCol: 0 });
    else if (intent === 'left') dispatch({ type: 'move', dRow: 0, dCol: -1 });
    else if (intent === 'right') dispatch({ type: 'move', dRow: 0, dCol: 1 });
    else if (intent === 'confirm') dispatch({ type: 'confirm' });
    else if (intent === 'alt') dispatch({ type: 'mismatch' });
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

  const { table, claim } = puzzle;
  const playing = outcome === 'playing';
  const showCursor = device !== 'touch' && playing;
  const rows = table.rowLabels.length;
  const answer = answerCell(puzzle);
  const columnLabels = [...table.years.map(String), t.averageColumn];
  const claimPeriod =
    claim.col === table.years.length
      ? t.average(table.years[0] ?? 0, table.years[table.years.length - 1] ?? 0)
      : String(table.years[claim.col]);
  const mismatchFocused = showCursor && state.cursor.row === rows;

  return (
    <div className={styles.root} data-testid="data-library" data-verdict={puzzle.verdict}>
      <TaskLine
        aside={
          <Mistakes
            used={state.mistakes}
            max={DATA_LIBRARY_MAX_MISTAKES}
            testId="library-mistakes"
          />
        }
      >
        {typeset(t.task)}
      </TaskLine>

      <div className={styles.body}>
        <div className={styles.claim} data-testid="library-claim">
          <span className={styles.claimTitle}>
            <Icon name="article" size={18} />
            {t.claimTitle}
          </span>
          <span className={styles.claimWhat}>
            {table.rowLabels[claim.row]}, {claimPeriod}
          </span>
          <span className={styles.claimFigure} data-testid="library-figure">
            {formatNumber(claim.value)} <span className={styles.claimUnit}>{claim.unit}</span>
          </span>
        </div>

        <div className={styles.tableWrap} ref={tableRef}>
          <table className={styles.table} aria-label={`${t.table}: ${table.title}`}>
            <caption className={styles.caption}>
              <span>{table.title}</span>
              <span className={styles.unit}>{t.unitNote(table.unit)}</span>
            </caption>
            <thead>
              <tr>
                <td />
                {columnLabels.map((label, c) => (
                  <th key={label} scope="col" data-average={c === table.years.length}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.values.map((values, r) => (
                <tr key={table.rowLabels[r]}>
                  <th scope="row">{table.rowLabels[r]}</th>
                  {values.map((value, c) => {
                    const struck = state.struck[r]?.[c] ?? false;
                    const right = outcome === 'success' && answer?.row === r && answer.col === c;
                    const revealed = outcome === 'failure' && answer?.row === r && answer.col === c;
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed grid of columns
                      <td key={c}>
                        <button
                          type="button"
                          className={styles.cell}
                          data-testid={`library-cell-${r}-${c}`}
                          data-focused={
                            showCursor && state.cursor.row === r && state.cursor.col === c
                          }
                          data-average={c === table.years.length}
                          data-struck={struck}
                          data-right={right}
                          data-revealed={revealed}
                          aria-label={t.cell(
                            table.rowLabels[r] ?? '',
                            columnLabels[c] ?? '',
                            formatNumber(value),
                          )}
                          disabled={!playing}
                          // Keep DOM focus off the cells so Space/Enter only act through nav intents.
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => dispatch({ type: 'pick', row: r, col: c })}
                        >
                          {formatNumber(value)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.foot}>
          {playing ? (
            <button
              type="button"
              className={styles.mismatch}
              data-testid="library-mismatch"
              data-focused={mismatchFocused}
              data-struck={state.mismatchStruck}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => dispatch({ type: 'mismatch' })}
            >
              <Icon name="reject" size={26} />
              {t.mismatch}
            </button>
          ) : (
            <OutcomeBanner
              success={outcome === 'success'}
              title={outcome === 'success' ? t.right : t.wrong}
              testId="library-verdict"
            >
              <p>{typeset(t.reasons[puzzle.verdict])}</p>
            </OutcomeBanner>
          )}
        </div>
      </div>

      {playing && <KeyHints hints={t.keys} device={device} />}
    </div>
  );
}
