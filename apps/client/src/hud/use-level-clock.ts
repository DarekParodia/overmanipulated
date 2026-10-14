// Level time for the HUD, ticking smoothly between 20 Hz snapshots: the last authoritative
// time is extrapolated with the local clock, capped so a stalled connection freezes the
// countdowns instead of running them ahead of the server. One shared ticker serves every HUD
// component, so the level timer and the folder countdowns always agree; each game store (GameView)
// has its own.
import { useSyncExternalStore } from 'react';
import { type GameStoreApi, useGame } from '../net/game-store.ts';

/** How far past the last snapshot the clock may run on its own. */
const MAX_EXTRAPOLATION_MS = 250;
const REFRESH_MS = 100;

export type LevelClock = { elapsedMs: number; timeLeftMs: number };

type Clock = { subscribe(listener: () => void): () => void; getSnapshot(): LevelClock };

/** One shared ticker per game store (the player's, or another GameView's, S7-85). */
function createClock(store: GameStoreApi): Clock {
  let anchor = { elapsedMs: 0, timeLeftMs: 0, at: 0 };
  let shown: LevelClock = { elapsedMs: 0, timeLeftMs: 0 };
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;

  function update(): void {
    const game = store.getState();
    const now = performance.now();
    if (game.elapsedMs !== anchor.elapsedMs || game.timeLeftMs !== anchor.timeLeftMs) {
      anchor = { elapsedMs: game.elapsedMs, timeLeftMs: game.timeLeftMs, at: now };
    }
    // A paused level (solo menu, S7-10) stands still: no running ahead of the frozen server time.
    const ahead =
      game.levelEnd || game.paused
        ? 0
        : Math.min(MAX_EXTRAPOLATION_MS, Math.max(0, now - anchor.at));
    let elapsedMs = anchor.elapsedMs + ahead;
    let timeLeftMs = Math.max(0, anchor.timeLeftMs - ahead);
    // A late snapshot must not make the countdowns tick backwards; a real reset (new level) is
    // a jump far larger than the extrapolation window and goes through.
    const behind = shown.elapsedMs - elapsedMs;
    if (behind > 0 && behind <= MAX_EXTRAPOLATION_MS) {
      elapsedMs = shown.elapsedMs;
      timeLeftMs = Math.min(timeLeftMs, shown.timeLeftMs);
    }
    if (elapsedMs !== shown.elapsedMs || timeLeftMs !== shown.timeLeftMs) {
      shown = { elapsedMs, timeLeftMs };
      for (const listener of listeners) {
        listener();
      }
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!stop) {
        const handle = window.setInterval(update, REFRESH_MS);
        const unsubscribe = store.subscribe(update);
        stop = () => {
          window.clearInterval(handle);
          unsubscribe();
        };
        update();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stop) {
          stop();
          stop = null;
        }
      };
    },
    getSnapshot: () => shown,
  };
}

const clocks = new WeakMap<GameStoreApi, Clock>();

function clockFor(store: GameStoreApi): Clock {
  let clock = clocks.get(store);
  if (!clock) {
    clock = createClock(store);
    clocks.set(store, clock);
  }
  return clock;
}

/** Level time of a game store (the player's by default; scene files pass their view's). */
export function useLevelClock(store: GameStoreApi = useGame): LevelClock {
  const clock = clockFor(store);
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot);
}
