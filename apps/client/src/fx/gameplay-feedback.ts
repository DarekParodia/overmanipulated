// Feedback driven by game state rather than single events: the station work loop (kept in step
// with station phases), the deadline ticker, the last-30-seconds sting, the full-belt alert, the
// solo pause, the local role ability coming off its cooldown (S7-40) and the level-end stingers
// (the match result in versus, S7-89).
// Also mounts the hit-stop and loop outputs of the feedback bus.
import {
  type CrewSnapshot,
  ENDLESS_LEVEL_ID,
  LEVEL_LAST_SECONDS_MS,
  type LevelEndMessage,
} from '@redakcja/shared';
import { type VersusResultKind, versusVerdict } from '../hud/versus-model.ts';
import { selectCrewMember, useGame } from '../net/game-store.ts';
import { renderState } from '../scene/render-state.ts';
import { useApp } from '../store/app.ts';
import { startLoopSound, stopSound } from './audio/audio-manager.ts';
import { createLoopManager } from './audio/loops.ts';
import { type CueId, loops } from './cues.ts';
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

/** True when the belt just filled up and holds a scheduled folder back (S7-09). */
export function beltJustFilled(previous: boolean, current: boolean): boolean {
  return current && !previous;
}

/** True when the server just started holding the level still for the solo menu (S7-10). */
export function justPaused(previous: boolean, current: boolean): boolean {
  return current && !previous;
}

/** One player's ability state at one snapshot's level time. */
export type AbilityClock = { member: CrewSnapshot | undefined; elapsedMs: number };

/**
 * True when the ability just came off its cooldown between two snapshots: the same cooldown was
 * running before and has run out now, with no call or armed state in the way.
 */
export function abilityJustReady(previous: AbilityClock, current: AbilityClock): boolean {
  const before = previous.member;
  const now = current.member;
  if (!before || !now || now.fieldCall !== null || now.abilityArmed) {
    return false;
  }
  return (
    before.abilityReadyAtMs === now.abilityReadyAtMs &&
    previous.elapsedMs < before.abilityReadyAtMs &&
    current.elapsedMs >= now.abilityReadyAtMs
  );
}

const VERSUS_CUE = {
  win: 'versus.win',
  lose: 'versus.lose',
  draw: 'versus.draw',
} as const satisfies Record<VersusResultKind, CueId>;

/**
 * The level-end stinger: the match result in versus (S7-89), the end of the run in endless, else
 * the level won or lost.
 */
export function levelEndCue(
  end: Pick<LevelEndMessage, 'won' | 'team' | 'versus'>,
  endless: boolean,
): CueId {
  if (end.versus) {
    return VERSUS_CUE[versusVerdict(end.versus, end.team ?? 0).result];
  }
  if (endless) {
    return 'endless.over';
  }
  return end.won ? 'level.win' : 'level.lose';
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
    if (game.levelEnd || game.paused || useApp.getState().screen !== 'game') {
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
    if (state.elapsedMs !== previous.elapsedMs || state.paused !== previous.paused) {
      elapsedAtSnapshot = state.elapsedMs;
      snapshotAt = now;
    }

    if (justPaused(previous.paused, state.paused) && useApp.getState().screen === 'game') {
      // The world stands still: the ticker and the work loops wait for the resume.
      stopAll();
      emitCue('game.paused');
      return;
    }

    if (state.levelEnd && !previous.levelEnd) {
      stopAll();
      emitCue(levelEndCue(state.levelEnd, useApp.getState().room?.levelId === ENDLESS_LEVEL_ID), {
        ...(renderState.local ? { position: renderState.local } : {}),
      });
      return;
    }
    if (
      !state.levelEnd &&
      // Endless counts up and never runs out, except an endless versus match (S7-89).
      (useApp.getState().room?.levelId !== ENDLESS_LEVEL_ID || state.scoreboard !== null) &&
      crossedLastSeconds(previous.timeLeftMs, state.timeLeftMs)
    ) {
      emitCue('level.lastSeconds');
    }
    if (
      !state.levelEnd &&
      useApp.getState().screen === 'game' &&
      beltJustFilled(previous.conveyorFull, state.conveyorFull)
    ) {
      emitCue('folder.beltFull');
    }
    const app = useApp.getState();
    const role = app.room?.players.find((p) => p.id === app.playerId)?.role ?? null;
    if (
      !state.levelEnd &&
      app.screen === 'game' &&
      role !== null &&
      abilityJustReady(
        { member: selectCrewMember(previous, app.playerId), elapsedMs: previous.elapsedMs },
        { member: selectCrewMember(state, app.playerId), elapsedMs: state.elapsedMs },
      )
    ) {
      emitCue('ability.ready');
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
