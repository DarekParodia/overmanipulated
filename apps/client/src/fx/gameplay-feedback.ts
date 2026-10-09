// Feedback driven by game state rather than single events: the station work loop (kept in step
// with station phases), the deadline ticker, the last-30-seconds sting and the level-end
// stingers. Also mounts the hit-stop and loop outputs of the feedback bus.
import { ENDLESS_LEVEL_ID, LEVEL_LAST_SECONDS_MS } from '@redakcja/shared';
import { useGame } from '../net/game-store.ts';
import { renderState } from '../scene/render-state.ts';
import { useApp } from '../store/app.ts';
import { startLoopSound, stopSound } from './audio/audio-manager.ts';
import { createLoopManager } from './audio/loops.ts';
import { loops } from './cues.ts';
import { tickIntervalMs, urgentTimeLeft } from './deadline-ticker.ts';
import { emitCue, feedback } from './feedback.ts';
import { hitStop } from './time-scale.ts';

/** A larger jump between snapshots is a resume or reconnect, not the clock running down. */
const MAX_TIMER_STEP_MS = 2000;
/** A loop younger than this survives a snapshot that does not show its station working yet. */
const LOOP_GRACE_MS = 400;

/** True when the running timer just crossed into the last seconds of the level. */
export function crossedLastSeconds(previousMs: number, currentMs: number): boolean {
  return (
    previousMs > LEVEL_LAST_SECONDS_MS &&
    currentMs <= LEVEL_LAST_SECONDS_MS &&
    currentMs > 0 &&
    previousMs - currentMs <= MAX_TIMER_STEP_MS
  );
}

export function startGameplayFeedback(): () => void {
  const loopManager = createLoopManager({ start: startLoopSound, stop: stopSound });
  const disconnect = feedback.connect({
    hitStop,
    startLoop: (key, loop) => loopManager.start(key, loops[loop], performance.now()),
    stopLoop: (key) => loopManager.stop(key),
  });

  // Level time between snapshots is extrapolated so the ticker keeps an even rhythm.
  let elapsedAtSnapshot = useGame.getState().elapsedMs;
  let snapshotAt = performance.now();
  let tickTimer: ReturnType<typeof setTimeout> | null = null;

  const urgentLeft = (): number | null => {
    const game = useGame.getState();
    if (game.levelEnd || useApp.getState().screen !== 'game') {
      return null;
    }
    return urgentTimeLeft(game.folders, elapsedAtSnapshot + (performance.now() - snapshotAt));
  };

  const tick = () => {
    tickTimer = null;
    const left = urgentLeft();
    if (left === null) {
      return;
    }
    emitCue('folder.deadlineTick');
    tickTimer = setTimeout(tick, tickIntervalMs(left));
  };

  const stopAll = () => {
    loopManager.stop();
    if (tickTimer !== null) {
      clearTimeout(tickTimer);
      tickTimer = null;
    }
  };

  const unsubscribeGame = useGame.subscribe((state, previous) => {
    const now = performance.now();
    if (state.elapsedMs !== previous.elapsedMs) {
      elapsedAtSnapshot = state.elapsedMs;
      snapshotAt = now;
    }

    if (state.levelEnd && !previous.levelEnd) {
      stopAll();
      const endless = useApp.getState().room?.levelId === ENDLESS_LEVEL_ID;
      emitCue(endless ? 'endless.over' : state.levelEnd.won ? 'level.win' : 'level.lose', {
        ...(renderState.local ? { position: renderState.local } : {}),
      });
      return;
    }
    if (
      !state.levelEnd &&
      useApp.getState().room?.levelId !== ENDLESS_LEVEL_ID &&
      crossedLastSeconds(previous.timeLeftMs, state.timeLeftMs)
    ) {
      emitCue('level.lastSeconds');
    }

    // Keep work loops in step with station phases (a lost event never leaves a loop running).
    for (const [key, startedAt] of loopManager.active()) {
      const station = state.stations.find((s) => s.id === key);
      if (now - startedAt > LOOP_GRACE_MS && station?.phase !== 'working') {
        loopManager.stop(key);
      }
    }

    if (tickTimer === null) {
      const left = urgentLeft();
      if (left !== null) {
        tickTimer = setTimeout(tick, tickIntervalMs(left));
      }
    }
  });

  const unsubscribeApp = useApp.subscribe((state, previous) => {
    if (state.screen !== previous.screen && state.screen !== 'game') {
      stopAll();
    }
  });

  return () => {
    unsubscribeGame();
    unsubscribeApp();
    stopAll();
    disconnect();
  };
}
