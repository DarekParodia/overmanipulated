// Mapa minigame (S7-55). The folder's photo shows two landmarks and its caption chip names a
// district; the town map next to it is a 4×3 grid of districts, each with its own two landmark
// glyphs. Tap the district whose two landmarks both stand in the photo, or „Nie ma na mapie” when
// no district has both. Rules and puzzle generation are pure, in geolocation.logic.ts. A failure
// shows the right answer unless the difficulty hides it (Ekspert).
import { memo, useEffect, useRef, useState } from 'react';
import type { CueId } from '../../fx/cues.ts';
import { emitCue } from '../../fx/feedback.ts';
import { useNavIntent } from '../../input/ui-nav.ts';
import { useSettings } from '../../store/settings.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import { KeyHints, Mistakes, OutcomeBanner, TaskLine } from '../kit.tsx';
import styles from './Geolocation.module.css';
import {
  type Action,
  answerIndex,
  type Effect,
  type GeoPuzzle,
  generatePuzzle,
  initialState,
  NOT_HERE,
  PHOTO_GROUND_Y,
  PHOTO_SIZE,
  reduce,
  type Scenery,
} from './geolocation.logic.ts';
import { GLYPH_SIZE, LandmarkGlyph, LandmarkShape } from './landmarks.tsx';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.geolocation;

/** How long the result stays visible before it goes out (ms); a failure shows the reason longer. */
const RESULT_HOLD_MS = { success: 1000, failure: 1400 } as const;

const EFFECT_CUES: Record<Effect, CueId> = {
  move: 'ui.hover',
  found: 'geolocation.found',
  miss: 'geolocation.miss',
  failed: 'geolocation.miss',
  blocked: 'ui.back',
};

const NUDGE: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px) rotate(-0.4deg)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-2px)' },
  { transform: 'translateX(0)' },
];

/** The photo's landmarks: scale of the 24-unit glyph and the left edge of each (photo units). */
const PHOTO_LANDMARK = { scale: 2.8, left: [10, 83] } as const;

/** A background house (wall, roof, door) or tree (trunk, crown), standing on the ground line. */
function SceneryShape({ prop }: { prop: Scenery }) {
  const left = prop.x - prop.w / 2;
  const top = PHOTO_GROUND_Y - prop.h;
  if (prop.kind === 'house') {
    const roof = prop.h * 0.4;
    return (
      <g stroke="var(--outline-a50)" strokeWidth={0.8} strokeLinejoin="round">
        <rect
          x={left}
          y={top + roof}
          width={prop.w}
          height={prop.h - roof}
          fill="var(--surface-soft)"
        />
        <polygon
          points={`${left - 1.5},${top + roof} ${prop.x},${top} ${left + prop.w + 1.5},${top + roof}`}
          fill="var(--orange)"
        />
      </g>
    );
  }
  const trunk = prop.h * 0.35;
  return (
    <g stroke="var(--outline-a50)" strokeWidth={0.8}>
      <rect
        x={prop.x - 1.2}
        y={PHOTO_GROUND_Y - trunk}
        width={2.4}
        height={trunk}
        fill="var(--orange-dark)"
      />
      <ellipse
        cx={prop.x}
        cy={top + (prop.h - trunk) / 2}
        rx={prop.w / 2}
        ry={(prop.h - trunk) / 2 + 1}
        fill="var(--green)"
      />
    </g>
  );
}

/** The folder's photo: sky, ground, seeded scenery and the two landmarks large. */
const PhotoArt = memo(function PhotoArt({ puzzle }: { puzzle: GeoPuzzle }) {
  const { width, height } = PHOTO_SIZE;
  const top = PHOTO_GROUND_Y - (GLYPH_SIZE - 2) * PHOTO_LANDMARK.scale;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.photoArt} aria-hidden="true">
      <rect width={width} height={height} fill="var(--sky)" />
      <rect y={PHOTO_GROUND_Y} width={width} height={height - PHOTO_GROUND_Y} fill="var(--green)" />
      <line
        x1={0}
        x2={width}
        y1={PHOTO_GROUND_Y}
        y2={PHOTO_GROUND_Y}
        stroke="var(--outline-a50)"
        strokeWidth={0.8}
      />
      {puzzle.scenery.map((prop) => (
        <SceneryShape key={`${prop.kind}-${prop.x}`} prop={prop} />
      ))}
      {puzzle.photo.map((landmark, i) => (
        <g
          key={landmark}
          transform={`translate(${PHOTO_LANDMARK.left[i] ?? 0} ${top}) scale(${PHOTO_LANDMARK.scale})`}
        >
          <LandmarkShape landmark={landmark} />
        </g>
      ))}
    </svg>
  );
});

/** The pin that drops onto the found (or revealed) district. */
function Pin() {
  return (
    <svg viewBox="0 0 24 24" className={styles.pin} aria-hidden="true" focusable="false">
      <rect x={11} y={10} width={2} height={12} rx={1} fill="var(--outline)" />
      <circle cx={12} cy={8} r={6} fill="var(--red)" stroke="var(--outline)" strokeWidth={2} />
      <circle cx={10} cy={6.5} r={1.6} fill="var(--surface)" />
    </svg>
  );
}

export function Geolocation({
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
  const mapRef = useRef<HTMLElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
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
    if ((effect === 'miss' || effect === 'failed') && !reducedMotion) {
      mapRef.current?.animate?.(NUDGE, { duration: 260, easing: 'ease-out' });
    }
  };

  useNavIntent((intent) => {
    if (intent === 'up') dispatch({ type: 'move', dRow: -1, dCol: 0 });
    else if (intent === 'down') dispatch({ type: 'move', dRow: 1, dCol: 0 });
    else if (intent === 'left') dispatch({ type: 'move', dRow: 0, dCol: -1 });
    else if (intent === 'right') dispatch({ type: 'move', dRow: 0, dCol: 1 });
    else if (intent === 'confirm') dispatch({ type: 'confirm' });
    else if (intent === 'alt') dispatch({ type: 'notHere' });
  });

  const { outcome, puzzle } = state;
  useEffect(() => {
    if (outcome === 'playing') {
      return;
    }
    // On short phones the banner sits under the map: bring it into view.
    bannerRef.current?.scrollIntoView?.({ block: 'nearest' });
    const timer = setTimeout(
      () => onDoneRef.current(outcome === 'success'),
      RESULT_HOLD_MS[outcome],
    );
    return () => clearTimeout(timer);
  }, [outcome]);

  const playing = outcome === 'playing';
  const showCursor = device !== 'touch' && playing;
  const answer = answerIndex(puzzle);
  const shown = outcome === 'success' || (outcome === 'failure' && revealOnFail);
  const claimed = puzzle.tiles[puzzle.claimed]?.district ?? '';
  const actual = puzzle.answer === null ? '' : (puzzle.tiles[puzzle.answer]?.district ?? '');
  const [first, second] = puzzle.photo;

  const choiceProps = (index: number) => ({
    'data-focused': showCursor && state.cursor === index,
    'data-struck': state.struck[index],
    'data-picked': state.picked === index,
    'data-found': outcome === 'success' && index === answer,
    'data-revealed': outcome === 'failure' && revealOnFail && index === answer,
    disabled: !playing,
    // Keep DOM focus off the buttons so Space/Enter only act through nav intents.
    onMouseDown: (event: { preventDefault(): void }) => event.preventDefault(),
    onClick: () => dispatch({ type: 'pick', index }),
  });

  return (
    <div
      className={styles.root}
      data-testid="geolocation"
      data-answer={answer}
      data-outcome={puzzle.outcome}
    >
      <TaskLine
        aside={
          <Mistakes used={state.mistakes} max={state.maxMistakes} testId="geolocation-mistakes" />
        }
      >
        {typeset(t.task)}
      </TaskLine>

      <div className={styles.body}>
        <div className={styles.side}>
          <figure
            className={styles.photo}
            aria-label={t.photoLabel(t.landmarks[first], t.landmarks[second])}
            data-testid="geolocation-photo"
          >
            <PhotoArt puzzle={puzzle} />
            <figcaption className={styles.caption} data-testid="geolocation-caption">
              <Icon name="post" size={16} />
              {typeset(t.caption(claimed))}
            </figcaption>
          </figure>
          <button
            type="button"
            className={styles.notHere}
            data-testid="geolocation-not-here"
            {...choiceProps(NOT_HERE)}
          >
            <Icon name="question" size={22} />
            <span>{typeset(t.notHere)}</span>
          </button>
        </div>

        <section className={styles.map} aria-label={pl.vocab.stations.geolocation} ref={mapRef}>
          {puzzle.tiles.map((tile, i) => {
            const [a, b] = tile.landmarks;
            return (
              <button
                key={tile.district}
                type="button"
                className={styles.tile}
                aria-label={t.tileLabel(tile.district, t.landmarks[a], t.landmarks[b])}
                data-testid={`geolocation-tile-${i}`}
                {...choiceProps(i)}
              >
                <span className={styles.district}>{tile.district}</span>
                <span className={styles.glyphs}>
                  <LandmarkGlyph landmark={a} className={styles.glyph} />
                  <LandmarkGlyph landmark={b} className={styles.glyph} />
                </span>
                {shown && i === answer && <Pin />}
              </button>
            );
          })}
        </section>

        {!playing && (
          <div className={styles.foot} ref={bannerRef}>
            <OutcomeBanner
              success={outcome === 'success'}
              title={outcome === 'success' ? t.right : t.wrong}
              testId="geolocation-verdict"
            >
              {shown && <p>{typeset(t.reasons[puzzle.outcome](claimed, actual))}</p>}
            </OutcomeBanner>
          </div>
        )}
      </div>

      {playing && <KeyHints hints={t.keys} device={device} className={styles.hints} />}
    </div>
  );
}
