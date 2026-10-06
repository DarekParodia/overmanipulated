// Archive minigame logic (S2-05), kept pure so it can be unit tested without a DOM.
// The puzzle is a drawer of dated index cards (oldest on the left); the searched topic appears
// on several cards and only the earliest mention counts, like finding the first archived copy
// of a photo or quote. The scroll model is a 1D position in card units with momentum and a
// snap to the nearest card once the drawer slows down.
import { ARCHIVE_CARD_COUNT, ARCHIVE_TOPIC_MENTIONS, createRng } from '@redakcja/shared';

export type ArchiveCard = {
  /** Calendar date of the edition (UTC components). */
  date: { year: number; month: number; day: number };
  /** Edition number printed on the card. */
  edition: number;
  /** Index into the topic list passed to `createArchivePuzzle`. */
  topic: number;
};

export type ArchivePuzzle = {
  cards: ArchiveCard[];
  /** The topic the player is looking for. */
  topic: number;
  /** The earliest card with `topic`: the only right answer. */
  targetIndex: number;
  /** Card under the reading frame when the drawer opens (the newest one). */
  startIndex: number;
};

const DAY_MS = 86_400_000;
const FIRST_YEAR = 2012;
const YEAR_SPAN = 12;
const MIN_GAP_DAYS = 5;
const MAX_GAP_DAYS = 60;
const FIRST_EDITION = 600;
const EDITION_SPAN = 3000;

/**
 * Builds the drawer for one round. Same seed and topic count → same puzzle. Needs at least
 * three topics (the searched one plus distractors that never repeat back to back).
 */
export function createArchivePuzzle(
  seed: number,
  topicCount: number,
  cardCount = ARCHIVE_CARD_COUNT,
  mentions = ARCHIVE_TOPIC_MENTIONS,
): ArchivePuzzle {
  if (topicCount < 3) {
    throw new Error('archive puzzle needs at least three topics');
  }
  if (cardCount < mentions + 4) {
    throw new Error('archive drawer too small for the mentions');
  }
  const rng = createRng(seed);
  const topic = rng.int(topicCount);
  // The first mention sits in the older half, never at the very edge, so the player has to
  // scroll past the later mentions and keep looking.
  const targetIndex = 2 + rng.int(Math.max(1, Math.floor(cardCount / 2) - 2));
  const startIndex = cardCount - 1;

  const later: number[] = [];
  for (let i = targetIndex + 2; i < cardCount; i++) {
    later.push(i);
  }
  // Fisher–Yates on the candidates for the later mentions.
  for (let i = later.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [later[i], later[j]] = [later[j] as number, later[i] as number];
  }
  // Mentions never touch, so neighbouring cards always show different topics.
  const mentionsAt = new Set([targetIndex]);
  for (const i of later) {
    if (mentionsAt.size >= mentions) break;
    if (!mentionsAt.has(i - 1) && !mentionsAt.has(i + 1)) mentionsAt.add(i);
  }
  if (mentionsAt.size < mentions) {
    throw new Error('archive drawer has no room for the later mentions');
  }

  let dayNumber = Math.floor(
    Date.UTC(FIRST_YEAR + rng.int(YEAR_SPAN), rng.int(12), 1 + rng.int(28)) / DAY_MS,
  );
  let edition = FIRST_EDITION + rng.int(EDITION_SPAN);
  const cards: ArchiveCard[] = [];
  let previousTopic = -1;
  for (let i = 0; i < cardCount; i++) {
    let cardTopic = topic;
    if (!mentionsAt.has(i)) {
      do {
        cardTopic = rng.int(topicCount);
      } while (cardTopic === topic || cardTopic === previousTopic);
    }
    const date = new Date(dayNumber * DAY_MS);
    cards.push({
      date: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
      edition,
      topic: cardTopic,
    });
    previousTopic = cardTopic;
    const gap = MIN_GAP_DAYS + rng.int(MAX_GAP_DAYS - MIN_GAP_DAYS + 1);
    dayNumber += gap;
    edition += gap;
  }
  return { cards, topic, targetIndex, startIndex };
}

export type StopOutcome = 'found' | 'wrong' | 'repeat';

/** What pulling card `index` means, given the cards already pulled by mistake. */
export function evaluateStop(
  puzzle: ArchivePuzzle,
  index: number,
  rejected: ReadonlySet<number>,
): StopOutcome {
  if (index === puzzle.targetIndex) {
    return 'found';
  }
  return rejected.has(index) ? 'repeat' : 'wrong';
}

// --- Scroll physics -------------------------------------------------------------------------

export type ScrollState = {
  /** Position in cards: 0 = oldest card under the frame. */
  pos: number;
  /** Velocity in cards per second (positive = towards newer cards). */
  vel: number;
  /** Card being eased to after a tap or a stop, or null while free. */
  target: number | null;
};

export const SCROLL = {
  /** Exponential velocity decay per second. */
  friction: 4,
  /** Below this speed the drawer stops coasting and settles on the nearest card. */
  snapSpeed: 1.5,
  /** Exponential approach rate when settling on a card. */
  snapRate: 14,
  /** One key press or arrow tap: enough speed to coast about one card. */
  nudge: 4,
  maxSpeed: 16,
  /** Held gamepad direction: acceleration in cards per second². */
  holdAccel: 24,
  /** Mouse wheel: cards per second added per pixel of wheel delta. */
  wheelGain: 0.035,
} as const;

const SETTLE_EPSILON = 0.002;

export function clampSpeed(vel: number): number {
  return Math.max(-SCROLL.maxSpeed, Math.min(SCROLL.maxSpeed, vel));
}

/** Adds velocity in the given direction (key press, arrow tap, wheel). Cancels any snap. */
export function nudge(state: ScrollState, amount: number): ScrollState {
  const base = state.target === null ? state.vel : 0;
  return { pos: state.pos, vel: clampSpeed(base + amount), target: null };
}

/** Kills the momentum; the drawer settles on the card nearest to the frame. */
export function stop(state: ScrollState, cardCount: number): ScrollState {
  return { pos: state.pos, vel: 0, target: clampIndex(Math.round(state.pos), cardCount) };
}

/** Eases the drawer to a specific card (tap on a card). */
export function seek(state: ScrollState, index: number, cardCount: number): ScrollState {
  return { pos: state.pos, vel: 0, target: clampIndex(index, cardCount) };
}

/** True while the drawer is coasting fast enough that "confirm" should first stop it. */
export function isCoasting(state: ScrollState): boolean {
  return Math.abs(state.vel) >= SCROLL.snapSpeed;
}

export function centeredIndex(state: ScrollState, cardCount: number): number {
  return clampIndex(Math.round(state.pos), cardCount);
}

/** Advances the drawer by `dt` seconds. */
export function stepScroll(state: ScrollState, dt: number, cardCount: number): ScrollState {
  const last = cardCount - 1;
  if (state.target === null && Math.abs(state.vel) >= SCROLL.snapSpeed) {
    const decay = Math.exp(-SCROLL.friction * dt);
    // Distance covered by exponentially decaying velocity over dt.
    let pos = state.pos + (state.vel * (1 - decay)) / SCROLL.friction;
    let vel = state.vel * decay;
    if (pos <= 0 || pos >= last) {
      // The drawer's end stop: hard bump, no bounce.
      pos = Math.max(0, Math.min(last, pos));
      vel = 0;
    }
    return { pos, vel, target: null };
  }
  const target = state.target ?? clampIndex(Math.round(state.pos), cardCount);
  const pos = target + (state.pos - target) * Math.exp(-SCROLL.snapRate * dt);
  if (Math.abs(pos - target) < SETTLE_EPSILON) {
    return { pos: target, vel: 0, target: null };
  }
  return { pos, vel: 0, target };
}

export function clampIndex(index: number, cardCount: number): number {
  return Math.max(0, Math.min(cardCount - 1, index));
}

/** A finger resting longer than this before lifting releases the drawer without a fling. */
const FLING_MAX_PAUSE_MS = 80;
/** Drag samples younger than this (before the last move) set the fling speed. */
const FLING_WINDOW_MS = 120;

/**
 * Release velocity of a drag (cards per second) from its move samples (time ms, position in
 * cards) and the time the finger lifted.
 */
export function releaseVelocity(
  samples: readonly { t: number; pos: number }[],
  releasedAt: number,
): number {
  const last = samples.at(-1);
  if (!last || releasedAt - last.t > FLING_MAX_PAUSE_MS) {
    return 0;
  }
  let firstIndex = samples.findIndex((s) => last.t - s.t <= FLING_WINDOW_MS);
  if (firstIndex === samples.length - 1) {
    // Sparse move events: fall back to the sample just before the window.
    firstIndex -= 1;
  }
  const first = samples[firstIndex];
  if (!first) {
    return 0;
  }
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? clampSpeed((last.pos - first.pos) / dt) : 0;
}
