// Level time for the HUD, ticking smoothly between 20 Hz snapshots: the last authoritative
// time is extrapolated with the local clock, capped so a stalled connection freezes the
// countdowns instead of running them ahead of the server. One shared ticker serves every HUD
// component, so the level timer and the folder countdowns always agree.
import { useSyncExternalStore } from 'react';
import { useGame } from '../net/game-store.ts';

/** How far past the last snapshot the clock may run on its own. */
const MAX_EXTRAPOLATION_MS = 250;
const REFRESH_MS = 100;

export type LevelClock = { elapsedMs: number; timeLeftMs: number };

let anchor = { elapsedMs: 0, timeLeftMs: 0, at: 0 };
let shown: LevelClock = { elapsedMs: 0, timeLeftMs: 0 };
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;

function update(): void {
  const game = useGame.getState();
  const now = performance.now();
  if (game.elapsedMs !== anchor.elapsedMs || game.timeLeftMs !== anchor.timeLeftMs) {
    anchor = { elapsedMs: game.elapsedMs, timeLeftMs: game.timeLeftMs, at: now };
  }
  const ahead = game.levelEnd ? 0 : Math.min(MAX_EXTRAPOLATION_MS, Math.max(0, now - anchor.at));
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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stop) {
    const handle = window.setInterval(update, REFRESH_MS);
    const unsubscribe = useGame.subscribe(update);
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
}

const getSnapshot = () => shown;

export function useLevelClock(): LevelClock {
  return useSyncExternalStore(subscribe, getSnapshot);
}
