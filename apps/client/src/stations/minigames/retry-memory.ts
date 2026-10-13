// Kartoteka retry memory (S7-14). The sim keeps a folder's Kartoteka card after a failure or a
// cancel (S7-13, `MINIGAME_STABLE_SEED_STATIONS`), so the same minigame seed means the same card.
// This store remembers, per seed, the fields the local player circled and, after a cancel, the
// clock that was left, so a retry shows the card as the player left it and putting the card down
// buys no fresh clock. A failure keeps the circles but restarts the clock in full: the lockout
// is its cost. Per client and not persisted, like every minigame limit: a teammate who retries
// gets the same card without the circles, and a reload forgets them. Reset when a level starts
// (`gameStarted`, net/session.ts).
import { MINIGAME_TIME_LIMIT_MS } from '@redakcja/shared';
import { create } from 'zustand';

/** A card reopened after a cancel never starts with less than this on its clock (ms). */
export const KARTOTEKA_RESUME_MIN_MS = 5000;

export type RetryEntry = {
  /** Minigame seed of the card (the store key). */
  seed: number;
  /** Circled fields by field index; the minigame restores only the warning signs. */
  circled: readonly boolean[];
  /** Clock left when the card was put down unfinished; null starts the next round in full. */
  remainingMs: number | null;
};

const EMPTY_ENTRY = { circled: [], remainingMs: null } as const;

/** The entry after the player changed the circles on the card. */
export function withCircled(
  entry: RetryEntry | undefined,
  seed: number,
  circled: readonly boolean[],
): RetryEntry {
  return { ...EMPTY_ENTRY, ...entry, seed, circled: [...circled] };
}

/** The entry after a cancel with `remainingMs` on the clock. */
export function afterCancel(
  entry: RetryEntry | undefined,
  seed: number,
  remainingMs: number,
): RetryEntry {
  return { ...EMPTY_ENTRY, ...entry, seed, remainingMs: Math.max(0, Math.round(remainingMs)) };
}

/** The entry after a failure: the circles stay, the next round gets the full clock. */
export function afterFailure(entry: RetryEntry | undefined, seed: number): RetryEntry {
  return { ...EMPTY_ENTRY, ...entry, seed, remainingMs: null };
}

/** Clock left on a round that started with `clockMs` after `elapsedMs`. */
export function remainingAfter(clockMs: number, elapsedMs: number): number {
  return Math.max(0, clockMs - elapsedMs);
}

/**
 * The clock a round of this card starts with: the full `limitMs` unless the card was put down
 * unfinished, then the time that was left, but at least KARTOTEKA_RESUME_MIN_MS.
 */
export function roundClockMs(
  entry: RetryEntry | undefined,
  limitMs: number = MINIGAME_TIME_LIMIT_MS,
): number {
  if (!entry || entry.remainingMs === null) {
    return limitMs;
  }
  return Math.min(limitMs, Math.max(KARTOTEKA_RESUME_MIN_MS, entry.remainingMs));
}

type RetryMemoryStore = {
  entries: Readonly<Record<number, RetryEntry>>;
  rememberCircled(seed: number, circled: readonly boolean[]): void;
  rememberCancel(seed: number, remainingMs: number): void;
  rememberFailure(seed: number): void;
  /** The card was filed: nothing comes back. */
  forget(seed: number): void;
  reset(): void;
};

export const useRetryMemory = create<RetryMemoryStore>((set) => ({
  entries: {},
  rememberCircled(seed, circled) {
    set((s) => ({
      entries: { ...s.entries, [seed]: withCircled(s.entries[seed], seed, circled) },
    }));
  },
  rememberCancel(seed, remainingMs) {
    set((s) => ({
      entries: { ...s.entries, [seed]: afterCancel(s.entries[seed], seed, remainingMs) },
    }));
  },
  rememberFailure(seed) {
    set((s) => ({ entries: { ...s.entries, [seed]: afterFailure(s.entries[seed], seed) } }));
  },
  forget(seed) {
    set((s) => {
      if (!(seed in s.entries)) {
        return s;
      }
      const { [seed]: _filed, ...rest } = s.entries;
      return { entries: rest };
    });
  },
  reset() {
    set({ entries: {} });
  },
}));

/** What the local player left on the card with this seed, if anything. */
export function recallCard(seed: number): RetryEntry | undefined {
  return useRetryMemory.getState().entries[seed];
}
