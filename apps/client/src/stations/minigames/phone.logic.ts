// Phone minigame (S4-01): pure puzzle generation and rules. The story names its source; the
// phone book lists that source and a few invented look-alike contacts, each with a number. The
// player dials the right one, then waits in a short queue; reporters skip the queue.
// Real-world analogue: calling the source yourself instead of trusting a forwarded message.
import type { Story } from '@redakcja/content';
import {
  createRng,
  PHONE_CONTACT_COUNT,
  PHONE_HOLD_BEAT_MS,
  PHONE_QUEUE_MAX_MS,
  PHONE_QUEUE_MIN_MS,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';

export type Contact = { name: string; number: string };

export type PhonePuzzle = {
  /** Who the player has to reach (the story's source). */
  target: string;
  contacts: Contact[];
  /** Index of the contact whose name is the target; exactly one. */
  correctIndex: number;
  /** How long the queue lasts when the player does not skip it. */
  queueMs: number;
};

type Rng = ReturnType<typeof createRng>;

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const normalize = (name: string): string => name.trim().toLowerCase();

/** Same seed and story → same phone book. */
export function generatePuzzle(seed: number, story: Pick<Story, 'source'>): PhonePuzzle {
  const rng = createRng(seed ^ 0x5eed_0401);
  const target = story.source;
  const decoys = shuffled(
    rng,
    (pl.minigames.phone.decoys as readonly string[]).filter(
      (name) => normalize(name) !== normalize(target),
    ),
  ).slice(0, PHONE_CONTACT_COUNT - 1);
  const correctIndex = rng.int(decoys.length + 1);
  const names = [...decoys];
  names.splice(correctIndex, 0, target);
  // Three-digit extensions, all different; the first digit is never 0.
  const used = new Set<number>();
  const contacts = names.map((name): Contact => {
    let n = 200 + rng.int(800);
    while (used.has(n)) {
      n = n >= 999 ? 200 : n + 1;
    }
    used.add(n);
    return { name, number: `${n}` };
  });
  const queueMs = PHONE_QUEUE_MIN_MS + rng.int(PHONE_QUEUE_MAX_MS - PHONE_QUEUE_MIN_MS + 1);
  return { target, contacts, correctIndex, queueMs };
}

// --- Rules -------------------------------------------------------------------------------

export type Phase = 'dial' | 'queue' | 'success' | 'failure';

export type PhoneState = {
  puzzle: PhonePuzzle;
  /** The reporter's bonus: no queue after the right number. */
  skipsQueue: boolean;
  cursor: number;
  phase: Phase;
  /** Index of the dialled contact (kept after the call for the result view). */
  dialled: number | null;
  queueLeftMs: number;
  /** Whole hold-music beats played so far in the queue. */
  beats: number;
};

export type Action =
  | { type: 'move'; delta: number }
  | { type: 'dial'; index: number }
  | { type: 'confirm' }
  | { type: 'tick'; dtMs: number };

/** What just happened, for feedback cues. */
export type Effect = 'move' | 'ringing' | 'hold' | 'connected' | 'wrong';

export function initialState(puzzle: PhonePuzzle, skipsQueue: boolean): PhoneState {
  return {
    puzzle,
    skipsQueue,
    cursor: 0,
    phase: 'dial',
    dialled: null,
    queueLeftMs: 0,
    beats: 0,
  };
}

function dial(state: PhoneState, index: number): [PhoneState, Effect | null] {
  if (state.phase !== 'dial' || !state.puzzle.contacts[index]) {
    return [state, null];
  }
  const base = { ...state, cursor: index, dialled: index };
  if (index !== state.puzzle.correctIndex) {
    return [{ ...base, phase: 'failure' }, 'wrong'];
  }
  if (state.skipsQueue) {
    return [{ ...base, phase: 'success' }, 'connected'];
  }
  return [{ ...base, phase: 'queue', queueLeftMs: state.puzzle.queueMs, beats: 0 }, 'ringing'];
}

function tick(state: PhoneState, dtMs: number): [PhoneState, Effect | null] {
  if (state.phase !== 'queue' || dtMs <= 0) {
    return [state, null];
  }
  const queueLeftMs = Math.max(0, state.queueLeftMs - dtMs);
  if (queueLeftMs === 0) {
    return [{ ...state, queueLeftMs, phase: 'success' }, 'connected'];
  }
  const beats = Math.floor((state.puzzle.queueMs - queueLeftMs) / PHONE_HOLD_BEAT_MS);
  return [{ ...state, queueLeftMs, beats }, beats > state.beats ? 'hold' : null];
}

export function reduce(state: PhoneState, action: Action): [PhoneState, Effect | null] {
  switch (action.type) {
    case 'move': {
      if (state.phase !== 'dial') {
        return [state, null];
      }
      const rows = state.puzzle.contacts.length;
      const cursor = (((state.cursor + action.delta) % rows) + rows) % rows;
      return [{ ...state, cursor }, 'move'];
    }
    case 'dial':
      return dial(state, action.index);
    case 'confirm':
      return dial(state, state.cursor);
    case 'tick':
      return tick(state, action.dtMs);
  }
}

/** Whole seconds shown on the queue counter (rounded up, never 0 while waiting). */
export function queueSeconds(leftMs: number): number {
  return Math.max(1, Math.ceil(leftMs / 1000));
}

/** Whether the local player's role skips the queue (the reporter's bonus). */
export function skipsQueueFor(role: string | null | undefined): boolean {
  return role === 'reporter';
}
