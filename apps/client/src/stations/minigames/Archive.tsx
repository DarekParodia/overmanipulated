// Archive minigame (S2-05): a drawer of dated index cards. The player scrolls the drawer with
// momentum and pulls the card under the reading frame; only the earliest card with the searched
// topic is right (the "first appearance" check an archivist does with dated editions or web
// archive snapshots). Two wrong cards close the drawer. Pure rules live in archive.logic.ts.
import { ARCHIVE_MAX_MISTAKES, MINIGAME_TIME_LIMIT_MS } from '@redakcja/shared';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { PAD, radialDeadzone } from '../../input/gamepad.ts';
import { firstGamepad } from '../../input/gamepad-access.ts';
import { type NavIntent, useNavIntent } from '../../input/ui-nav.ts';
import { useSettings } from '../../store/settings.ts';
import { pl } from '../../strings/pl.ts';
import { formatDate, typeset } from '../../strings/typography.ts';
import { Button } from '../../ui/Button.tsx';
import { Stamp } from '../../ui/Stamp.tsx';
import styles from './Archive.module.css';
import {
  type ArchiveCard,
  centeredIndex,
  createArchivePuzzle,
  evaluateStop,
  isCoasting,
  nudge,
  releaseVelocity,
  SCROLL,
  type ScrollState,
  seek,
  stepScroll,
  stop,
} from './archive.logic.ts';
import type { MinigameProps } from './types.ts';

const t = pl.minigames.archive;

/** How long the "found" / "drawer closed" moment shows before reporting the result. */
const FOUND_HOLD_MS = 1100;
const FAILED_HOLD_MS = 900;
/** The result is reported at least this long before the time limit runs out. */
const REPORT_MARGIN_MS = 250;
/** A pointer that moves less than this and lifts quickly is a tap, not a drag. */
const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 400;
/** Held gamepad direction starts accelerating after this delay. */
const PAD_HOLD_DELAY_MS = 250;
const STICK_THRESHOLD = 0.6;
/** Urgency starts showing when this share of the time limit is used. */
const URGENT_FROM = 0.65;
const CARD_GAP_PX = 10;

type Phase = 'browsing' | 'found' | 'failed';

type Drag = {
  pointerId: number;
  x0: number;
  pos0: number;
  t0: number;
  moved: boolean;
  wasCoasting: boolean;
  /** The drawer was easing to a tapped card when the finger came down. */
  wasSeeking: boolean;
  /** Card under the finger at touch-down (pointer capture retargets later events). */
  cardIndex: number | null;
  samples: { t: number; pos: number }[];
};

function cardDate(card: ArchiveCard): string {
  return formatDate(new Date(card.date.year, card.date.month - 1, card.date.day));
}

function cardIndexAt(target: EventTarget | null): number | null {
  const card = target instanceof Element ? target.closest('[data-index]') : null;
  const index = card ? Number(card.getAttribute('data-index')) : Number.NaN;
  return Number.isInteger(index) ? index : null;
}

export function Archive({ seed, story, stamp, device, timeUsed, onDone }: MinigameProps) {
  const puzzle = useMemo(() => createArchivePuzzle(seed, t.topics.length), [seed]);
  const count = puzzle.cards.length;
  const noFlash = useSettings((s) => s.noFlash);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  const [phase, setPhase] = useState<Phase>('browsing');
  const [centered, setCentered] = useState(puzzle.startIndex);
  const [rejected, setRejected] = useState<ReadonlySet<number>>(() => new Set());

  const scroll = useRef<ScrollState>({ pos: puzzle.startIndex, vel: 0, target: null });
  const drag = useRef<Drag | null>(null);
  const pitch = useRef(120);
  const drawerWidth = useRef(0);
  const cardWidth = useRef(110);
  const drawerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>('browsing');
  const rejectedRef = useRef(rejected);
  const pending = useRef<{ timer: number; success: boolean } | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const timeUsedRef = useRef(timeUsed);
  timeUsedRef.current = timeUsed;

  const report = () => {
    const p = pending.current;
    if (p) {
      pending.current = null;
      window.clearTimeout(p.timer);
      onDoneRef.current(p.success);
    }
  };

  // Phase leaves 'browsing' exactly once, so this schedules exactly one report. The hold never
  // runs past the time limit: a find in the last second still counts.
  const finish = (success: boolean, hold: number) => {
    phaseRef.current = success ? 'found' : 'failed';
    setPhase(phaseRef.current);
    const left = (1 - timeUsedRef.current) * MINIGAME_TIME_LIMIT_MS - REPORT_MARGIN_MS;
    const delay = Math.max(0, Math.min(hold, left));
    pending.current = { timer: window.setTimeout(report, delay), success };
  };

  // Unmounting during the hold (overlay closed) reports at once instead of dropping the result.
  // biome-ignore lint/correctness/useExhaustiveDependencies: report reads refs only
  useEffect(() => report, []);

  const pull = () => {
    if (phaseRef.current !== 'browsing') {
      return;
    }
    const s = scroll.current;
    if (isCoasting(s)) {
      scroll.current = stop(s, count);
      emitCue('archive.stop');
      return;
    }
    const index = s.target ?? centeredIndex(s, count);
    const outcome = evaluateStop(puzzle, index, rejectedRef.current);
    if (outcome === 'repeat') {
      emitCue('ui.back');
      return;
    }
    scroll.current = seek(s, index, count);
    if (outcome === 'found') {
      emitCue('archive.found');
      finish(true, FOUND_HOLD_MS);
      return;
    }
    const next = new Set(rejectedRef.current).add(index);
    rejectedRef.current = next;
    setRejected(next);
    emitCue('archive.miss');
    if (next.size >= ARCHIVE_MAX_MISTAKES) {
      finish(false, FAILED_HOLD_MS);
    }
  };

  const push = (direction: -1 | 1) => {
    if (phaseRef.current !== 'browsing') {
      return;
    }
    scroll.current = nudge(scroll.current, direction * SCROLL.nudge);
  };

  useNavIntent((intent: NavIntent) => {
    if (intent === 'left') push(-1);
    else if (intent === 'right') push(1);
    else if (intent === 'confirm') pull();
  });

  // Card size follows the drawer: about three cards visible, never smaller than a touch target.
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) {
      return;
    }
    const measure = () => {
      const width = drawer.clientWidth;
      const card = Math.max(92, Math.min(150, Math.round(width / 3.3)));
      drawerWidth.current = width;
      cardWidth.current = card;
      pitch.current = card + CARD_GAP_PX;
      drawer.style.setProperty('--archive-card-width', `${card}px`);
      drawer.style.setProperty('--archive-card-gap', `${CARD_GAP_PX}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(drawer);
    return () => observer.disconnect();
  }, []);

  // Mouse wheel (and trackpad swipes) push the drawer; native listener so it can be cancelled.
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (phaseRef.current !== 'browsing' || drag.current) {
        return;
      }
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const pixels = event.deltaMode === 0 ? delta : delta * 40;
      const capped = Math.max(-120, Math.min(120, pixels));
      scroll.current = nudge(scroll.current, capped * SCROLL.wheelGain);
    };
    drawer.addEventListener('wheel', onWheel, { passive: false });
    return () => drawer.removeEventListener('wheel', onWheel);
  }, []);

  // Animation loop: physics, held gamepad direction, and the track transform (no React render
  // per frame; React only hears about the card under the frame changing).
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastIndex = centeredIndex(scroll.current, count);
    let lastPos = Number.NaN;
    let holdSince: number | null = null;
    let holdDirection = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const pad = phaseRef.current === 'browsing' ? firstGamepad() : null;
      let direction = 0;
      if (pad) {
        const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
        const left = pad.buttons[PAD.dpadLeft]?.pressed || stick.x < -STICK_THRESHOLD;
        const right = pad.buttons[PAD.dpadRight]?.pressed || stick.x > STICK_THRESHOLD;
        direction = (right ? 1 : 0) - (left ? 1 : 0);
      }
      if (direction !== holdDirection) {
        holdDirection = direction;
        holdSince = direction === 0 ? null : now;
      }
      if (!drag.current) {
        if (holdSince !== null && now - holdSince > PAD_HOLD_DELAY_MS) {
          scroll.current = nudge(scroll.current, holdDirection * SCROLL.holdAccel * dt);
        }
        scroll.current = stepScroll(scroll.current, dt, count);
      }
      const { pos } = scroll.current;
      const track = trackRef.current;
      if (track && pos !== lastPos) {
        lastPos = pos;
        const offset = drawerWidth.current / 2 - cardWidth.current / 2 - pos * pitch.current;
        track.style.transform = `translate3d(${offset.toFixed(1)}px, 0, 0)`;
      }
      const index = centeredIndex(scroll.current, count);
      if (index !== lastIndex) {
        lastIndex = index;
        setCentered(index);
        emitCue('archive.tick');
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [count]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== 'browsing' || drag.current || !event.isPrimary || event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const s = scroll.current;
    drag.current = {
      pointerId: event.pointerId,
      x0: event.clientX,
      pos0: s.pos,
      t0: performance.now(),
      moved: false,
      wasCoasting: isCoasting(s),
      wasSeeking: s.target !== null,
      cardIndex: cardIndexAt(event.target),
      samples: [{ t: performance.now(), pos: s.pos }],
    };
    // A finger on the drawer holds it still.
    scroll.current = { pos: s.pos, vel: 0, target: null };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - d.x0;
    if (Math.abs(dx) > TAP_SLOP_PX) {
      d.moved = true;
    }
    if (!d.moved) {
      return;
    }
    const pos = Math.max(0, Math.min(count - 1, d.pos0 - dx / pitch.current));
    scroll.current = { pos, vel: 0, target: null };
    d.samples.push({ t: performance.now(), pos });
    if (d.samples.length > 12) {
      d.samples.shift();
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) {
      return;
    }
    drag.current = null;
    const s = scroll.current;
    if (!d.moved) {
      if (cancelled || performance.now() - d.t0 > TAP_MAX_MS) {
        return;
      }
      if (d.wasCoasting) {
        scroll.current = stop(s, count);
        emitCue('archive.stop');
        return;
      }
      const index = d.cardIndex;
      if (index === null) {
        return;
      }
      // A tap while the drawer is still easing only redirects it; pulling needs it at rest.
      if (index === centeredIndex(s, count) && !d.wasSeeking) {
        pull();
      } else {
        scroll.current = seek(s, index, count);
      }
      return;
    }
    scroll.current = {
      pos: s.pos,
      vel: cancelled ? 0 : releaseVelocity(d.samples, performance.now()),
      target: null,
    };
  };

  const urgent = timeUsed >= URGENT_FROM;
  const hint = typeset(t.hints[device]);
  const target = puzzle.cards[puzzle.targetIndex];

  return (
    <div
      className={styles.root}
      data-urgent={urgent}
      data-pulse={urgent && !noFlash && !reducedMotion}
      data-testid="archive-minigame"
    >
      <div className={styles.slip}>
        <p className={styles.kicker}>
          {t.kicker} · {t.folderLabel}: {typeset(story.headline)}
        </p>
        <p className={styles.clue}>
          <span className={styles.clueLabel}>{t.clueLabel}</span>{' '}
          <span className={styles.topic} data-testid="archive-topic">
            „{t.topics[puzzle.topic]}”
          </span>
        </p>
        <p className={styles.rule}>{typeset(t.clueRule)}</p>
        <div className={styles.deadline} aria-hidden="true">
          <span style={{ width: `${Math.round(timeUsed * 100)}%` }} />
        </div>
      </div>

      <div className={styles.mistakes} role="img" aria-label={`${t.mistakes}: ${rejected.size}`}>
        <span className={styles.mistakesLabel}>{t.mistakes}</span>
        {Array.from({ length: ARCHIVE_MAX_MISTAKES }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed number of tally boxes
          <span key={i} className={styles.tally} data-marked={i < rejected.size}>
            {i < rejected.size && (
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M3 4 L17 16 M16 3 L4 17" />
              </svg>
            )}
          </span>
        ))}
      </div>

      <div
        ref={drawerRef}
        className={styles.drawer}
        data-testid="archive-drawer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onLostPointerCapture={(e) => endDrag(e, true)}
      >
        <div ref={trackRef} className={styles.track}>
          {puzzle.cards.map((card, index) => {
            const isFound = phase === 'found' && index === puzzle.targetIndex;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: the drawer never reorders
                key={index}
                // A card is rejected once; the wobble plays when the class first appears.
                className={`${styles.card} ${rejected.has(index) ? styles.wobble : ''} ${isFound ? styles.found : ''}`}
                data-index={index}
                data-centered={index === centered}
                data-rejected={rejected.has(index)}
                data-testid={`archive-card-${index}`}
                aria-current={index === centered}
              >
                <span className={styles.tab}>{card.date.year}</span>
                <span className={styles.edition}>{pl.masthead.edition(card.edition)}</span>
                <span className={styles.date}>{cardDate(card)}</span>
                <span className={styles.label}>{t.topics[card.topic]}</span>
                {rejected.has(index) && (
                  <span className={styles.reject}>
                    <Stamp
                      text={t.wrong}
                      seed={seed * 31 + index}
                      size={112}
                      slam={!reducedMotion}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className={styles.frame} aria-hidden="true" />
      </div>

      <div className={styles.controls}>
        <Button onClick={() => push(-1)} disabled={phase !== 'browsing'}>
          <span aria-hidden="true">‹</span> {t.earlier}
        </Button>
        <Button
          variant="stamp"
          onClick={pull}
          disabled={phase !== 'browsing'}
          data-testid="archive-pull"
        >
          {t.pull}
        </Button>
        <Button onClick={() => push(1)} disabled={phase !== 'browsing'}>
          {t.later} <span aria-hidden="true">›</span>
        </Button>
      </div>

      {phase === 'browsing' && <p className={styles.hint}>{hint}</p>}
      {phase === 'found' && target && (
        <div className={styles.result} data-testid="archive-found">
          <Stamp
            text={t.found}
            tone="blue"
            shape="double"
            seed={seed}
            size={150}
            slam={!reducedMotion}
          />
          <div>
            <p className={styles.resultTitle}>{t.firstMention(cardDate(target))}</p>
            <p className={styles.resultText}>
              <span className={styles.resultLabel}>{t.toFolder}</span>{' '}
              {typeset(stamp?.text ?? t.foundFallback)}
            </p>
          </div>
        </div>
      )}
      {phase === 'failed' && (
        <div className={styles.result} data-testid="archive-failed">
          <p className={styles.resultTitle}>{t.failed}</p>
        </div>
      )}
    </div>
  );
}
