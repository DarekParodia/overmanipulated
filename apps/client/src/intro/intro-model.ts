// The intro's timeline (S7-99), pure: how long each scene lasts, when it moves on, how its line
// splits into subtitle chunks and whether the lobby should play it on its own. The player
// (S7-101) feeds it clock readings; nothing here reads the time, the DOM or storage.
//
// A scene with a voice clip ends INTRO_GAP_MS after the clip ends; INTRO_END_GRACE_MS past the
// clip's length is the safety net if its end never fires. Without a voice (muted, not loaded,
// audio still locked) the scene lasts its fallback time: INTRO_WORD_MS per word, clamped.
import type { ScreenId } from '../store/app.ts';
import { levelNumber } from '../store/progress.ts';

/** Reading time per word when there is no voice. */
export const INTRO_WORD_MS = 400;
export const INTRO_MIN_SCENE_MS = 2500;
export const INTRO_MAX_SCENE_MS = 12000;
/** Pause between a clip's end and the next scene. */
export const INTRO_GAP_MS = 450;
/** A voiced scene's length past its clip, in case the clip's end event is lost. */
export const INTRO_END_GRACE_MS = 1500;
/**
 * The subtitle bar's measure: at 640×360 it holds at least this many characters per line of
 * body text (17 px Nunito ≈ 9 px per character, 470 px of a ≥ 560 px bar), and at most this
 * many lines. Every subtitle chunk must wrap within it (intro-script.test.ts).
 */
export const INTRO_SUBTITLE_LINE_CHARS = 52;
export const INTRO_SUBTITLE_MAX_LINES = 2;

/** Words a listener hears: whitespace-separated tokens with a letter or digit. */
export function introWordCount(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** How long a scene lasts without a voice: reading time, clamped to the scene limits. */
export function fallbackMs(text: string): number {
  return Math.min(
    INTRO_MAX_SCENE_MS,
    Math.max(INTRO_MIN_SCENE_MS, introWordCount(text) * INTRO_WORD_MS),
  );
}

/** A scene's length: its clip plus the grace time, or the fallback time without a clip. */
export function sceneDurationMs(text: string, clipMs: number | null): number {
  return clipMs === null ? fallbackMs(text) : clipMs + INTRO_END_GRACE_MS;
}

/**
 * Every scene's length for the player (S7-101): the scene whose clip is playing (`voiced`) lasts
 * its clip plus the grace time, every other one its fallback reading time.
 */
export function sceneDurations(
  lines: readonly string[],
  voiced: number | null,
  clipMs: number | null,
): number[] {
  return lines.map((line, index) =>
    index === voiced ? sceneDurationMs(line, clipMs) : fallbackMs(line),
  );
}

export type IntroState = {
  /** The scene on stage. */
  index: number;
  /** When the scene started (clock of the caller). */
  startedAt: number;
  /** When its clip ended, shifted by any pause since; null while it plays or without a voice. */
  endedAt: number | null;
  /** When the intro was paused; null while it runs. */
  pausedAt: number | null;
  /** Time spent paused in this scene. */
  pausedTotal: number;
  /** Finished or skipped; the player closes. */
  done: boolean;
};

export type IntroAction =
  | { type: 'start'; now: number }
  | { type: 'clipEnded'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'next'; now: number }
  | { type: 'prev'; now: number }
  /** Plays the current scene again from its start (the voice was just unlocked, S7-101). */
  | { type: 'restart'; now: number }
  | { type: 'togglePause'; now: number }
  | { type: 'skip' };

/** The first scene, starting at `now`. */
export function startIntro(now: number): IntroState {
  return sceneAt(0, now);
}

function sceneAt(index: number, now: number): IntroState {
  return { index, startedAt: now, endedAt: null, pausedAt: null, pausedTotal: 0, done: false };
}

function advance(state: IntroState, now: number, sceneCount: number): IntroState {
  if (state.index + 1 >= sceneCount) {
    return { ...state, pausedAt: null, done: true };
  }
  return sceneAt(state.index + 1, now);
}

/** Time the current scene has been on stage, pauses excluded. */
export function sceneElapsedMs(state: IntroState, now: number): number {
  const until = state.pausedAt ?? now;
  return Math.max(0, until - state.startedAt - state.pausedTotal);
}

/**
 * The intro timeline. `durations` are the scenes' lengths (`sceneDurationMs`) in order. A
 * scene moves on `INTRO_GAP_MS` after its clip ends or once its duration has run, pauses
 * excluded. Next and Back restart the target scene and clear a pause, as Restart does for the
 * current one; Skip finishes at once.
 */
export function introReducer(
  state: IntroState,
  action: IntroAction,
  durations: readonly number[],
): IntroState {
  if (action.type === 'start') {
    return durations.length === 0
      ? { ...startIntro(action.now), done: true }
      : startIntro(action.now);
  }
  if (state.done) {
    return state;
  }
  switch (action.type) {
    case 'skip':
      return { ...state, pausedAt: null, done: true };
    case 'next':
      return advance(state, action.now, durations.length);
    case 'prev':
      return sceneAt(Math.max(0, state.index - 1), action.now);
    case 'restart':
      return sceneAt(state.index, action.now);
    case 'togglePause': {
      if (state.pausedAt === null) {
        return { ...state, pausedAt: action.now };
      }
      const paused = Math.max(0, action.now - state.pausedAt);
      // The gap after a clip counts running time only: a clip that ended before the pause
      // moves by the whole pause, one that ended during it counts from the resume.
      const endedAt =
        state.endedAt === null
          ? null
          : state.endedAt + Math.max(0, action.now - Math.max(state.pausedAt, state.endedAt));
      return {
        ...state,
        pausedAt: null,
        pausedTotal: state.pausedTotal + paused,
        endedAt,
      };
    }
    case 'clipEnded':
      return state.endedAt === null ? { ...state, endedAt: action.now } : state;
    case 'tick': {
      if (state.pausedAt !== null) {
        return state;
      }
      const duration = durations[state.index] ?? 0;
      const clipDone = state.endedAt !== null && action.now - state.endedAt >= INTRO_GAP_MS;
      if (clipDone || sceneElapsedMs(state, action.now) >= duration) {
        return advance(state, action.now, durations.length);
      }
      return state;
    }
  }
}

export type SubtitleChunk = { text: string; atMs: number };

/**
 * Splits a line into one chunk per sentence, each shown from `atMs` into the scene. A chunk's
 * share of `durationMs` is its share of the line's characters, counting the space after it.
 * A non-breaking space after a full stop (an abbreviation, „ul.\u00a0Długa”) never splits.
 */
export function subtitleChunks(text: string, durationMs: number): SubtitleChunk[] {
  const parts = text.trim().split(/(?<=[.!?…])[^\S\u00a0\u202f]+/);
  const weights = parts.map((part, index) => part.length + (index < parts.length - 1 ? 1 : 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let before = 0;
  return parts.map((part, index) => {
    const atMs = total === 0 ? 0 : Math.round((before / total) * durationMs);
    before += weights[index] ?? 0;
    return { text: part, atMs };
  });
}

/**
 * The chunk index on screen `elapsedMs` into a scene: chunks are timed over the clip while it
 * plays (so the subtitles follow the voice), else over the fallback reading time.
 */
export function subtitleIndexAt(text: string, clipMs: number | null, elapsedMs: number): number {
  return chunkIndexAt(subtitleChunks(text, clipMs ?? fallbackMs(text)), elapsedMs);
}

/** Index of the chunk on screen `elapsedMs` into the scene. */
export function chunkIndexAt(chunks: readonly SubtitleChunk[], elapsedMs: number): number {
  let index = 0;
  chunks.forEach((chunk, i) => {
    if (chunk.atMs <= elapsedMs) {
      index = i;
    }
  });
  return index;
}

export type AutoplayInput = {
  screen: ScreenId;
  levelId: string;
  /** This browser has finished or skipped the intro before (`intro-store.ts`). */
  seen: boolean;
  spectator: boolean;
  /** The intro (or the dialog holding it) is already open. */
  open: boolean;
};

/** The lobby plays the intro once per browser, on the training level, for players only. */
export function shouldAutoplayIntro(input: AutoplayInput): boolean {
  return (
    input.screen === 'lobby' &&
    levelNumber(input.levelId) === 0 &&
    !input.seen &&
    !input.spectator &&
    !input.open
  );
}
