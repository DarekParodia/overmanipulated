// Image search minigame, „Lupa obrazu” (S2-04). The submitted photo with red rings around 2–3
// fragments, a loupe that magnifies one fragment, and reverse-image-search result cards. The player picks the result that shows every marked fragment
// (tap it, drag the loupe onto it, or arrows + confirm), then reads off where and when it was
// published. Two wrong picks fail the attempt. Puzzle rules live in imageSearch.logic.ts.
import { IMAGE_SEARCH_MAX_MISTAKES } from '@redakcja/shared';
import { memo, type PointerEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { type NavIntent, useNavIntent } from '../../input/ui-nav.ts';
import { pl } from '../../strings/pl.ts';
import { formatDate, typeset } from '../../strings/typography.ts';
import { Button } from '../../ui/Button.tsx';
import { KeyHints, Mistakes, OutcomeBanner, ResultMark, TaskLine } from '../kit.tsx';
import styles from './ImageSearch.module.css';
import {
  type Box,
  createPuzzle,
  fragmentBox,
  type GroundTone,
  initialPlay,
  isOver,
  missingFragments,
  moveCursor,
  nextFragment,
  type PlayState,
  pick,
  type ResultDate,
  resultColumns,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Scene,
  type Shape,
  type ShapeTone,
  yearFromText,
} from './imageSearch.logic.ts';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.imageSearch;

/** Pause after the failing pick so the player sees the strike before the overlay closes. */
const FAIL_REVEAL_MS = 700;
/** After a match the note stays readable this long, then the result is reported on its own. */
const SOLVE_REVEAL_MS = 2500;
/** Share of the time limit at which a solved puzzle reports at once, before the overlay times out. */
const SOLVE_DEADLINE = 0.95;
/** Pointer travel before a press on the loupe becomes a drag. */
const DRAG_THRESHOLD_PX = 8;

// Tone names come from the puzzle logic; they map onto the flat cartoon palette.
const TONE_VAR: Record<ShapeTone | GroundTone, string> = {
  ink: 'var(--outline)',
  inkSoft: 'var(--text-soft)',
  manila: 'var(--yellow)',
  cork: 'var(--sky)',
  wood: 'var(--orange-dark)',
  copyBlue: 'var(--blue)',
  ochre: 'var(--orange)',
  paperDeep: 'var(--surface-sunk)',
  manilaDark: 'var(--yellow-dark)',
};

function ShapePath({ shape, shadow = false }: { shape: Shape; shadow?: boolean }) {
  const offset = shadow ? 1.2 : 0;
  const x = shape.x + offset;
  const y = shape.y + offset;
  const left = x - shape.w / 2;
  const top = y - shape.h / 2;
  const fill = shadow ? 'var(--outline-a20)' : TONE_VAR[shape.tone];
  const stroke = shadow ? 'none' : 'var(--outline)';
  const common = { fill, stroke, strokeWidth: 0.9, strokeLinejoin: 'round' as const };
  switch (shape.kind) {
    case 'disc':
      return <circle cx={x} cy={y} r={shape.w / 2} {...common} />;
    case 'block':
    case 'pole':
      return <rect x={left} y={top} width={shape.w} height={shape.h} {...common} />;
    case 'roof':
      return (
        <polygon
          points={`${left},${top + shape.h} ${x},${top} ${left + shape.w},${top + shape.h}`}
          {...common}
        />
      );
    case 'arch': {
      const r = shape.w / 2;
      const bottom = top + shape.h;
      return (
        <path
          d={`M${left} ${bottom} V${top + r} A${r} ${r} 0 0 1 ${left + shape.w} ${top + r} V${bottom} Z`}
          {...common}
        />
      );
    }
  }
}

/** The flat scene: sky, ground, then every shape over its own hard shadow. */
const SceneArt = memo(function SceneArt({ scene }: { scene: Scene }) {
  return (
    <>
      <rect
        x={-20}
        y={-20}
        width={SCENE_WIDTH + 40}
        height={SCENE_HEIGHT + 40}
        fill="var(--surface-soft)"
      />
      <rect
        x={-20}
        y={scene.horizon}
        width={SCENE_WIDTH + 40}
        height={SCENE_HEIGHT - scene.horizon + 20}
        fill={TONE_VAR[scene.ground]}
      />
      <line
        x1={-20}
        x2={SCENE_WIDTH + 20}
        y1={scene.horizon}
        y2={scene.horizon}
        stroke="var(--outline-a50)"
        strokeWidth={0.6}
      />
      {scene.shapes.map((shape, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: shapes are a fixed list per puzzle
        <ShapePath key={`s${i}`} shape={shape} shadow />
      ))}
      {scene.shapes.map((shape, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: shapes are a fixed list per puzzle
        <ShapePath key={`f${i}`} shape={shape} />
      ))}
    </>
  );
});

function viewBox(box: Box): string {
  return `${box.x} ${box.y} ${box.w} ${box.h}`;
}

/** Red ring with the fragment number. */
function FragmentMark({
  shape,
  number,
  selected,
  dashed = false,
}: {
  shape: Shape;
  number: number;
  selected: boolean;
  dashed?: boolean;
}) {
  const box = fragmentBox(shape);
  const r = box.w / 2;
  return (
    <g className={styles.mark}>
      <ellipse
        cx={shape.x}
        cy={shape.y}
        rx={r}
        ry={r * 0.94}
        fill="none"
        stroke="var(--red)"
        strokeWidth={selected ? 2.4 : 1.4}
        strokeDasharray={dashed ? '2.5 2' : undefined}
      />
      <text x={shape.x + r * 0.72} y={shape.y - r * 0.72} className={styles.markNumber}>
        {number}
      </text>
    </g>
  );
}

/** Magnifier: a round lens over one fragment, with a handle. */
function LoupeLens({ scene, shape }: { scene: Scene; shape: Shape }) {
  const clipId = useId();
  const box = fragmentBox(shape);
  return (
    <svg viewBox="0 0 100 100" className={styles.lens} aria-hidden="true">
      <line
        x1={64}
        y1={64}
        x2={94}
        y2={94}
        stroke="var(--outline)"
        strokeWidth={14}
        strokeLinecap="round"
      />
      <line
        x1={64}
        y1={64}
        x2={94}
        y2={94}
        stroke="var(--yellow)"
        strokeWidth={8}
        strokeLinecap="round"
      />
      <defs>
        <clipPath id={clipId}>
          <circle cx={40} cy={40} r={34} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <svg x={6} y={6} width={68} height={68} viewBox={viewBox(box)} aria-hidden="true">
          <SceneArt scene={scene} />
        </svg>
      </g>
      <circle cx={40} cy={40} r={35} fill="none" stroke="var(--outline)" strokeWidth={5} />
    </svg>
  );
}

function dateText(date: ResultDate): string {
  return formatDate(new Date(date.year, date.month - 1, date.day));
}

export function ImageSearch({ seed, stamp, device, timeUsed, onDone }: MinigameProps) {
  const matchYear = yearFromText(stamp?.text);
  const puzzle = useMemo(() => createPuzzle(seed, matchYear ?? undefined), [seed, matchYear]);
  const [play, setPlay] = useState<PlayState>(initialPlay);
  const playRef = useRef(play);
  playRef.current = play;

  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const reported = useRef(false);
  const report = (success: boolean) => {
    if (!reported.current) {
      reported.current = true;
      doneRef.current(success);
    }
  };
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(() => {
    if (!play.failed) {
      return;
    }
    const timer = setTimeout(() => reportRef.current(false), FAIL_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [play.failed]);
  useEffect(() => {
    if (!play.solved) {
      return;
    }
    const timer = setTimeout(() => reportRef.current(true), SOLVE_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [play.solved]);
  useEffect(() => {
    // A solved puzzle must never run into the overlay's time limit while the note is read.
    if (play.solved && timeUsed >= SOLVE_DEADLINE) {
      reportRef.current(true);
    }
  }, [play.solved, timeUsed]);

  const choose = (index: number) => {
    const { state, outcome } = pick(playRef.current, puzzle, index);
    if (outcome === 'ignored') {
      return;
    }
    playRef.current = state;
    setPlay(state);
    // The failing pick gets no cue of its own: the overlay plays the failure cue.
    if (outcome !== 'fail') {
      emitCue(outcome === 'match' ? 'imageSearch.match' : 'imageSearch.miss');
    }
  };

  const cycleFragment = () => {
    if (isOver(playRef.current)) {
      return;
    }
    const state = nextFragment(playRef.current, puzzle);
    playRef.current = state;
    setPlay(state);
    emitCue('imageSearch.fragment');
  };

  const finish = () => {
    if (playRef.current.solved) {
      report(true);
    }
  };

  useNavIntent((intent: NavIntent) => {
    const state = playRef.current;
    if (state.solved) {
      if (intent === 'confirm') {
        emitCue('ui.click');
        finish();
      }
      return;
    }
    if (state.failed) {
      return;
    }
    if (intent === 'alt') {
      cycleFragment();
    } else if (intent === 'confirm') {
      choose(state.cursor);
    } else if (intent !== 'back') {
      const cursor = moveCursor(state.cursor, intent, puzzle.results.length);
      if (cursor !== state.cursor) {
        const next = { ...state, cursor };
        playRef.current = next;
        setPlay(next);
        emitCue('ui.hover');
      }
    }
  });

  // Dragging the loupe onto a printout picks it; a short press without travel cycles fragments.
  // The ghost lens follows the pointer through a ref; React re-renders only when the drag starts,
  // ends or moves onto another printout.
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ghostAt = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<number | null>(null);
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
    setOver(null);
  };
  const resultAt = (x: number, y: number): number | null => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-result]');
    return element ? Number(element.dataset.result) : null;
  };
  const onLoupeDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (isOver(playRef.current)) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onLoupeMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current) {
      return;
    }
    if (
      !current.moved &&
      Math.hypot(event.clientX - current.x, event.clientY - current.y) > DRAG_THRESHOLD_PX
    ) {
      current.moved = true;
    }
    if (current.moved) {
      ghostAt.current = { x: event.clientX, y: event.clientY };
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      }
      setDragging(true);
      setOver(resultAt(event.clientX, event.clientY));
    }
  };
  const onLoupeUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    endDrag();
    if (!current) {
      return;
    }
    if (current.moved) {
      const index = resultAt(event.clientX, event.clientY);
      if (index !== null) {
        choose(index);
      }
    } else {
      cycleFragment();
    }
  };
  const onLoupeCancel = endDrag;

  const fragmentCount = puzzle.fragments.length;
  // Only a stamp that dates an earlier copy turns the match into an "earlier publication"; for
  // others (e.g. "no earlier copies found") the match is just the checked photo itself.
  const earlierCopy = !stamp || matchYear !== null;
  const selectedShape = puzzle.photo.shapes[puzzle.fragments[play.fragment] ?? 0];
  const match = puzzle.results[puzzle.answer];
  const showCursor = device !== 'touch';
  const columns = resultColumns(puzzle.results.length);

  return (
    <section
      className={styles.root}
      data-testid="image-search"
      data-state={play.solved ? 'solved' : play.failed ? 'failed' : 'playing'}
      aria-label={pl.vocab.stations.imageSearch}
    >
      <TaskLine aside={<Mistakes used={play.mistakes} max={IMAGE_SEARCH_MAX_MISTAKES} />}>
        {typeset(t.task)}
      </TaskLine>

      <div className={`${styles.table} ${isOver(play) ? styles.over : ''}`} data-columns={columns}>
        {play.solved && match ? (
          <OutcomeBanner
            success
            title={earlierCopy ? t.found : t.checked}
            testId="image-search-found"
            action={
              <Button variant="primary" onClick={finish} data-testid="image-search-done">
                {t.done}
              </Button>
            }
          >
            {earlierCopy && (
              <p className={styles.foundSource}>{t.published(match.site, dateText(match.date))}</p>
            )}
            <p>{typeset(stamp?.text ?? t.foundFallback)}</p>
          </OutcomeBanner>
        ) : play.failed ? (
          <OutcomeBanner success={false} title={pl.minigames.common.failure} />
        ) : (
          <figure className={styles.submitted}>
            <svg
              className={styles.photo}
              viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
              role="img"
              aria-label={t.submitted}
            >
              <SceneArt scene={puzzle.photo} />
              {puzzle.fragments.map((shapeIndex, position) => {
                const shape = puzzle.photo.shapes[shapeIndex];
                return shape ? (
                  <FragmentMark
                    key={shapeIndex}
                    shape={shape}
                    number={position + 1}
                    selected={position === play.fragment}
                  />
                ) : null;
              })}
            </svg>
            {selectedShape && (
              <button
                type="button"
                className={styles.loupe}
                data-testid="image-search-loupe"
                aria-label={t.nextFragment}
                onPointerDown={onLoupeDown}
                onPointerMove={onLoupeMove}
                onPointerUp={onLoupeUp}
                onPointerCancel={onLoupeCancel}
                onClick={(event) => {
                  // Pointer presses are handled above; this covers keyboard and assistive clicks.
                  if (event.detail === 0) {
                    cycleFragment();
                  }
                }}
              >
                <LoupeLens scene={puzzle.photo} shape={selectedShape} />
                <span className={styles.loupeLabel}>
                  {t.fragment(play.fragment + 1, fragmentCount)}
                </span>
              </button>
            )}
          </figure>
        )}

        <ol
          className={styles.results}
          style={{ ['--columns' as string]: columns }}
          aria-label={t.results}
        >
          {puzzle.results.map((result, index) => {
            const ruledOut = play.ruledOut.includes(index);
            const missing = ruledOut ? missingFragments(puzzle, index) : [];
            const isFound = play.solved && index === puzzle.answer;
            const classes = [
              styles.result,
              showCursor && index === play.cursor && !isOver(play) ? styles.cursor : '',
              ruledOut ? styles.ruledOut : '',
              isFound ? styles.found : '',
              dragging && over === index ? styles.dropTarget : '',
            ];
            return (
              <li key={result.site} className={styles.slot}>
                <button
                  type="button"
                  className={classes.join(' ')}
                  data-result={index}
                  data-testid={`image-search-result-${index}`}
                  aria-label={`${t.result(index + 1)}: ${t.published(result.site, dateText(result.date))}`}
                  aria-disabled={ruledOut || isOver(play)}
                  onClick={() => choose(index)}
                >
                  <svg
                    className={styles.thumb}
                    viewBox={viewBox(result.crop)}
                    preserveAspectRatio="xMidYMid slice"
                    aria-hidden="true"
                  >
                    <SceneArt scene={result.scene} />
                    {missing.map((position) => {
                      const shape = puzzle.photo.shapes[puzzle.fragments[position] ?? 0];
                      return shape ? (
                        <FragmentMark
                          key={position}
                          shape={shape}
                          number={position + 1}
                          selected={false}
                          dashed
                        />
                      ) : null;
                    })}
                  </svg>
                  <span className={styles.caption}>{result.date.year}</span>
                  {(ruledOut || isFound) && (
                    <span className={styles.badge}>
                      <ResultMark success={isFound} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {!isOver(play) && <KeyHints hints={t.keys} device={device} />}

      {dragging && selectedShape && (
        <div
          ref={ghostRef}
          className={styles.ghost}
          style={{ transform: `translate(${ghostAt.current.x}px, ${ghostAt.current.y}px)` }}
          aria-hidden="true"
        >
          <LoupeLens scene={puzzle.photo} shape={selectedShape} />
        </div>
      )}
    </section>
  );
}
