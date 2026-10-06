// Fixed-rate game loop. Runs only while at least one room exists. Uses an accumulator so the
// simulation keeps 20 Hz on average even when timers fire late.
import { TICK_MS } from '@redakcja/shared';
import type { RoomRegistry } from './rooms/registry.ts';

/** Never run more than this many catch-up ticks at once (e.g. after the process was paused). */
const MAX_TICKS_PER_WAKE = 5;

export function createGameLoop(
  registry: RoomRegistry,
  now: () => number = () => performance.now(),
) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let last = 0;
  let accumulator = 0;

  function wake(): void {
    const time = now();
    accumulator += time - last;
    last = time;
    let ticks = 0;
    while (accumulator >= TICK_MS && ticks < MAX_TICKS_PER_WAKE) {
      registry.tick();
      accumulator -= TICK_MS;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_WAKE) {
      accumulator = 0;
    }
    if (registry.roomCount === 0) {
      stop();
    }
  }

  function start(): void {
    if (timer !== null) {
      return;
    }
    last = now();
    accumulator = 0;
    timer = setInterval(wake, TICK_MS / 2);
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    /** Runs any ticks that are due now. Called by the timer; exposed for tests. */
    pump: wake,
    get running() {
      return timer !== null;
    },
  };
}
