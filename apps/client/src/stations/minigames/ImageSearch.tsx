// Image search minigame, „Lupa obrazu” (S2-04). A light table: the submitted photo with red
// pencil marks around 2–3 fragments, a loupe that magnifies one fragment, and printouts of
// reverse-image-search results. The player picks the printout that shows every marked fragment
// (tap it, drag the loupe onto it, or arrows + confirm), then reads off where and when it was
// published. Two wrong picks fail the attempt. Puzzle rules live in imageSearch.logic.ts.
import { createRng } from '@redakcja/shared';
import { memo, type PointerEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { type NavIntent, useNavIntent } from '../../input/ui-nav.ts';
import type { InputDevice } from '../../store/app.ts';
import { useSettings } from '../../store/settings.ts';
import { pl } from '../../strings/pl.ts';
import { formatDate, typeset } from '../../strings/typography.ts';
import { Button } from '../../ui/Button.tsx';
import { Stamp } from '../../ui/Stamp.tsx';
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
/** Share of the time limit after which the table shows urgency. */
const URGENT_FROM = 0.7;

const TONE_VAR: Record<ShapeTone | GroundTone, string> = {
  ink: 'var(--ink)',
  inkSoft: 'var(--ink-soft)',
  manila: 'var(--manila)',
  cork: 'var(--cork)',
  wood: 'var(--wood)',
  copyBlue: 'var(--copy-blue)',
  ochre: 'var(--ochre)',
  paperDeep: 'var(--paper-deep)',
  manilaDark: 'var(--manila-dark)',
};

function ShapePath({ shape, shadow = false }: { shape: Shape; shadow?: boolean }) {
  const offset = shadow ? 1.2 : 0;
  const x = shape.x + offset;
  const y = shape.y + offset;
  const left = x - shape.w / 2;
  const top = y - shape.h / 2;
  const fill = shadow ? 'var(--ink-a20)' : TONE_VAR[shape.tone];
  const stroke = shadow ? 'none' : 'var(--ink)';
  const common = { fill, stroke, strokeWidth: 0.6, strokeLinejoin: 'round' as const };
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

/** The paper-cut scene: sky, ground, then every shape over its own hard cut shadow. */
const SceneArt = memo(function SceneArt({ scene }: { scene: Scene }) {
  return (
    <>
      <rect
        x={-20}
        y={-20}
        width={SCENE_WIDTH + 40}
        height={SCENE_HEIGHT + 40}
        fill="var(--paper-shade)"
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
        stroke="var(--ink-a40)"
        strokeWidth={0.5}
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

/** Red pencil ring with the fragment number, as drawn by the photo editor. */
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
        stroke="var(--editorial-red)"
        strokeWidth={selected ? 1.8 : 1}
        strokeDasharray={dashed ? '2.5 2' : undefined}
        transform={`rotate(-8 ${shape.x} ${shape.y})`}
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
      <line x1={64} y1={64} x2={95} y2={95} stroke="var(--wood)" strokeWidth={10} />
      <line x1={64} y1={64} x2={95} y2={95} stroke="var(--ink)" strokeWidth={1.2} />
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
      <circle cx={40} cy={40} r={35} fill="none" stroke="var(--ink)" strokeWidth={4} />
      <circle cx={40} cy={40} r={31.5} fill="none" stroke="var(--paper-a85)" strokeWidth={1} />
    </svg>
  );
}

function dateText(date: ResultDate): string {
  return formatDate(new Date(date.year, date.month - 1, date.day));
}

function promptFor(device: InputDevice): string {
  return t.prompts[device];
}

export function ImageSearch({ seed, stamp, device, timeUsed, onDone }: MinigameProps) {
  const matchYear = yearFromText(stamp?.text);
  const puzzle = useMemo(() => createPuzzle(seed, matchYear ?? undefined), [seed, matchYear]);
  const tilts = useMemo(() => {
    const rng = createRng(seed ^ 0x51ab);
    return puzzle.results.map(() => (rng.next() - 0.5) * 2.4);
  }, [seed, puzzle]);
  const [play, setPlay] = useState<PlayState>(initialPlay);
  const playRef = useRef(play);
  playRef.current = play;
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const noFlash = useSettings((s) => s.noFlash);

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
  const urgent = timeUsed >= URGENT_FROM && !isOver(play);
  const showCursor = device !== 'touch';
  const columns = resultColumns(puzzle.results.length);

  return (
    <section
      className={`${styles.root} ${urgent ? styles.urgent : ''} ${
        urgent && !noFlash && !reducedMotion ? styles.tremble : ''
      }`}
      data-testid="image-search"
      data-state={play.solved ? 'solved' : play.failed ? 'failed' : 'playing'}
      aria-label={t.kicker}
    >
      <header className={styles.header}>
        <div className={styles.title}>
          <span className={styles.kicker}>{t.kicker}</span>
          <span className={styles.task}>{typeset(t.task)}</span>
        </div>
        <div className={styles.mistakes} data-mistakes={play.mistakes}>
          <span className={styles.mistakesLabel}>{t.mistakes}</span>
          {[0, 1].map((i) => (
            <span
              key={i}
              className={`${styles.tally} ${i < play.mistakes ? styles.tallyUsed : ''}`}
            >
              {i < play.mistakes && (
                <svg viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2 2.4 L8.2 8 M8 1.8 L2.2 8.3" />
                </svg>
              )}
            </span>
          ))}
        </div>
      </header>
      <div className={styles.clock} aria-hidden="true">
        <span className={styles.clockFill} style={{ width: `${Math.round(timeUsed * 100)}%` }} />
        {urgent && <span className={styles.clockLabel}>{t.urgent}</span>}
      </div>

      <div className={styles.table}>
        {play.solved && match ? (
          <div className={styles.slip} data-testid="image-search-found">
            <span className={styles.slipKicker}>{earlierCopy ? t.found : t.checked}</span>
            {earlierCopy && (
              <span className={styles.slipSource}>
                {t.published(match.site, dateText(match.date))}
              </span>
            )}
            <p className={styles.slipText}>{typeset(stamp?.text ?? t.foundFallback)}</p>
            <Button variant="stamp" onClick={finish} data-testid="image-search-done">
              {t.done}
            </Button>
          </div>
        ) : (
          <figure className={styles.submitted}>
            <figcaption className={styles.tag}>{t.submitted}</figcaption>
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

        <div className={styles.resultsColumn}>
          <span className={styles.tag}>{t.results}</span>
          <ol className={styles.results} style={{ ['--columns' as string]: columns }}>
            {puzzle.results.map((result, index) => {
              const ruledOut = play.ruledOut.includes(index);
              const missing = ruledOut ? missingFragments(puzzle, index) : [];
              const isFound = play.solved && index === puzzle.answer;
              const classes = [
                styles.printout,
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
                    style={{ ['--tilt' as string]: `${tilts[index] ?? 0}deg` }}
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
                    <span className={styles.caption}>
                      <span className={styles.site}>{result.site}</span>
                      <span className={styles.date}>{dateText(result.date)}</span>
                    </span>
                    {ruledOut && <span className={styles.missing}>{t.missing}</span>}
                    {isFound && (
                      <span className={styles.foundStamp}>
                        <Stamp
                          text={t.stamp}
                          tone="blue"
                          seed={seed}
                          slam={!reducedMotion}
                          size={96}
                        />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <p className={styles.prompt}>{play.failed ? t.lost : promptFor(device)}</p>

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
