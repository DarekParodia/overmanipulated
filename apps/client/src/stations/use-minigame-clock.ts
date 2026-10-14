// The client minigame clock (S7-95): counts a round of `timeLimitMs` down and stops while
// `paused` (the station help card is up). A resumed round (the Kartoteka after a cancel, S7-14)
// starts from `resumeMs`. Used by the station overlay and the styleguide's MinigameBench. The
// clock is client-only: the server's folder deadline keeps running while it stands still.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type MinigameClockState,
  minigameElapsed,
  minigameRemaining,
  pauseMinigameClock,
  resumeMinigameClock,
  startMinigameClock,
} from './overlay-logic.ts';

/** How often the minigame clock re-renders while it runs. */
export const MINIGAME_CLOCK_TICK_MS = 100;

export type MinigameClock = {
  /** Time the round has run, without the stops. */
  elapsedMs: number;
  /** Time left on the round (from `resumeMs` when given). */
  remainingMs: number;
  /** Share of the full limit used (0 → 1), so a resumed round shows the clock as it was left. */
  timeUsed: number;
  /** Time left right now, read outside a render (closing the overlay). */
  readRemaining(): number;
  /** Starts a fresh round now (the bench's restart). */
  restart(): void;
};

function elapsedAt(clock: MinigameClockState, now: number): number {
  return minigameElapsed(now, clock.startedAt, clock.pausedTotal, clock.pausedAt);
}

export function useMinigameClock(
  timeLimitMs: number,
  paused: boolean,
  resumeMs?: number,
): MinigameClock {
  const [clock, setClock] = useState(() => startMinigameClock(performance.now(), paused));
  const [now, setNow] = useState(clock.startedAt);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Stop or start the clock the moment `paused` changes (before paint, so no tick slips in).
  useLayoutEffect(() => {
    const at = performance.now();
    setClock((current) =>
      paused ? pauseMinigameClock(current, at) : resumeMinigameClock(current, at),
    );
    setNow(at);
  }, [paused]);

  useEffect(() => {
    if (paused) {
      return;
    }
    const timer = setInterval(() => setNow(performance.now()), MINIGAME_CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const readRemaining = useCallback(
    () => minigameRemaining(timeLimitMs, elapsedAt(clockRef.current, performance.now()), resumeMs),
    [timeLimitMs, resumeMs],
  );
  const restart = useCallback(() => {
    const at = performance.now();
    setClock(startMinigameClock(at, pausedRef.current));
    setNow(at);
  }, []);

  const elapsedMs = elapsedAt(clock, now);
  const remainingMs = minigameRemaining(timeLimitMs, elapsedMs, resumeMs);
  const timeUsed = timeLimitMs > 0 ? Math.min(1, Math.max(0, 1 - remainingMs / timeLimitMs)) : 1;
  return { elapsedMs, remainingMs, timeUsed, readRemaining, restart };
}
