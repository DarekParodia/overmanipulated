// Room browser (S7-88): the search and filters as a `GET /api/rooms` query, and the poller that
// keeps the list fresh while the dialog is open. Pure apart from what is injected (the fetch, the
// clock, the timer and the page's visibility), so the backoff and the pause are unit tested.
//
// Rate-limit friendly by design: one request every ROOM_LIST_POLL_MS while the tab is visible,
// none while it is hidden or the dialog is closed, and the interval doubles on each 429 up to
// ROOM_LIST_MAX_POLL_MS. A search or filter change asks at once, unless the server asked us to
// slow down; a return to the tab asks only once the current interval has passed.
import {
  type Difficulty,
  ROOM_SEARCH_MAX_LENGTH,
  type RoomListResponse,
  type RoomListStatus,
  type RoomMode,
  type RoomSummary,
} from '@redakcja/shared';

/** Poll interval while the dialog is open and the tab visible (client constant, README §8). */
export const ROOM_LIST_POLL_MS = 8000;
/** The longest interval the 429 backoff reaches. */
export const ROOM_LIST_MAX_POLL_MS = 60_000;
/** Quiet time after the last key in the search field before the list is asked again. */
export const ROOM_SEARCH_DEBOUNCE_MS = 300;

/** What the dialog's search field and filters hold; `any` leaves a filter out of the query. */
export type RoomListFilters = {
  q: string;
  mode: RoomMode | 'any';
  status: RoomListStatus;
  difficulty: Difficulty | 'any';
};

export const NO_ROOM_FILTERS: RoomListFilters = {
  q: '',
  mode: 'any',
  status: 'any',
  difficulty: 'any',
};

/** The query string for `GET /api/rooms` (without `?`); defaults are left out. */
export function roomListSearch(filters: RoomListFilters): string {
  const params = new URLSearchParams();
  const q = filters.q.trim().slice(0, ROOM_SEARCH_MAX_LENGTH);
  if (q) {
    params.set('q', q);
  }
  if (filters.mode !== 'any') {
    params.set('mode', filters.mode);
  }
  if (filters.status !== 'any') {
    params.set('status', filters.status);
  }
  if (filters.difficulty !== 'any') {
    params.set('difficulty', filters.difficulty);
  }
  return params.toString();
}

/** How many filters (not the search) narrow the list: the „Filtry (n)” toggle on phones. */
export function activeFilterCount(filters: RoomListFilters): number {
  return [filters.mode, filters.status, filters.difficulty].filter((value) => value !== 'any')
    .length;
}

/** Whether the search or any filter narrows the list (the „nothing matches” empty state). */
export function isFiltered(filters: RoomListFilters): boolean {
  return filters.q.trim() !== '' || activeFilterCount(filters) > 0;
}

/**
 * Why a list request failed: no network (`offline`), the per-address limit (`busy`, HTTP 429),
 * the browser switched off on the server (`unavailable`, HTTP 404), anything else (`failed`).
 */
export type RoomListProblem = 'offline' | 'busy' | 'unavailable' | 'failed';

export class RoomListError extends Error {
  constructor(readonly problem: RoomListProblem) {
    super(`room list: ${problem}`);
    this.name = 'RoomListError';
  }
}

/** The interval after a request: doubled (capped) on 429, back to the base after anything else. */
export function nextPollDelay(currentMs: number, problem: RoomListProblem | null): number {
  if (problem === 'busy') {
    return Math.min(Math.max(currentMs, ROOM_LIST_POLL_MS) * 2, ROOM_LIST_MAX_POLL_MS);
  }
  return ROOM_LIST_POLL_MS;
}

export type RoomListState = {
  /** `loading` until the first answer; `error` when no list has arrived yet and a request failed. */
  status: 'loading' | 'ready' | 'error';
  rooms: readonly RoomSummary[];
  /** Matching rooms before the server's limit. */
  total: number;
  /** Why the last request failed (a ready list is then the previous one); null after a success. */
  problem: RoomListProblem | null;
  /** The interval until the next request (grows on 429). */
  delayMs: number;
};

export const INITIAL_ROOM_LIST: RoomListState = {
  status: 'loading',
  rooms: [],
  total: 0,
  problem: null,
  delayMs: ROOM_LIST_POLL_MS,
};

export type RoomListPollerDeps<Timer> = {
  load(filters: RoomListFilters, signal: AbortSignal): Promise<RoomListResponse>;
  /** Monotonic ms. */
  now(): number;
  setTimer(run: () => void, ms: number): Timer;
  clearTimer(handle: Timer): void;
  /** `document.visibilityState === 'visible'`. */
  isVisible(): boolean;
  onChange(state: RoomListState): void;
};

export type RoomListPoller = {
  /** Starts polling with these filters (the dialog opened). */
  start(filters: RoomListFilters): void;
  /** Stops polling and aborts a request in flight (the dialog closed). */
  stop(): void;
  /** New search or filters: asks at once, or when the backoff allows. */
  setFilters(filters: RoomListFilters): void;
  /** The page's visibility changed: pause while hidden, resume when visible. */
  visibilityChanged(): void;
  /** „Spróbuj jeszcze raz”: asks at once, even during a backoff. */
  retry(): void;
  state(): RoomListState;
};

function problemOf(error: unknown): RoomListProblem {
  return error instanceof RoomListError ? error.problem : 'failed';
}

function sameFilters(a: RoomListFilters, b: RoomListFilters): boolean {
  return (
    a.q === b.q && a.mode === b.mode && a.status === b.status && a.difficulty === b.difficulty
  );
}

export function createRoomListPoller<Timer>(deps: RoomListPollerDeps<Timer>): RoomListPoller {
  let state = INITIAL_ROOM_LIST;
  let filters = NO_ROOM_FILTERS;
  let running = false;
  let timer: { handle: Timer } | null = null;
  let inFlight: AbortController | null = null;
  /** `now()` when the last request started; null before the first. */
  let lastStartedAt: number | null = null;

  function set(next: Partial<RoomListState>): void {
    state = { ...state, ...next };
    deps.onChange(state);
  }

  function cancelTimer(): void {
    if (timer) {
      deps.clearTimer(timer.handle);
      timer = null;
    }
  }

  function schedule(ms: number): void {
    cancelTimer();
    if (!running || !deps.isVisible()) {
      return;
    }
    timer = { handle: deps.setTimer(request, ms) };
  }

  /** Waits out what is left of the current interval since the last request started. */
  function remainingMs(): number {
    return lastStartedAt === null
      ? 0
      : Math.max(0, lastStartedAt + state.delayMs - deps.now());
  }

  function request(): void {
    timer = null;
    if (!running || !deps.isVisible()) {
      return;
    }
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    lastStartedAt = deps.now();
    deps.load(filters, controller.signal).then(
      (response) => {
        if (inFlight !== controller) {
          return;
        }
        inFlight = null;
        set({
          status: 'ready',
          rooms: response.rooms,
          total: response.total,
          problem: null,
          delayMs: nextPollDelay(state.delayMs, null),
        });
        schedule(state.delayMs);
      },
      (error: unknown) => {
        if (inFlight !== controller) {
          return;
        }
        inFlight = null;
        const problem = problemOf(error);
        set({
          status: state.status === 'ready' ? 'ready' : 'error',
          problem,
          delayMs: nextPollDelay(state.delayMs, problem),
        });
        schedule(state.delayMs);
      },
    );
  }

  return {
    start(next) {
      filters = next;
      running = true;
      request();
    },
    stop() {
      running = false;
      cancelTimer();
      inFlight?.abort();
      inFlight = null;
    },
    setFilters(next) {
      if (sameFilters(next, filters)) {
        return;
      }
      filters = next;
      if (!running) {
        return;
      }
      // A newer query wins over an older one still on its way.
      inFlight?.abort();
      inFlight = null;
      schedule(state.delayMs > ROOM_LIST_POLL_MS ? remainingMs() : 0);
    },
    visibilityChanged() {
      if (!running) {
        return;
      }
      if (deps.isVisible()) {
        if (!timer && !inFlight) {
          schedule(remainingMs());
        }
      } else {
        cancelTimer();
      }
    },
    retry() {
      if (!running) {
        return;
      }
      cancelTimer();
      set({ delayMs: ROOM_LIST_POLL_MS });
      request();
    },
    state: () => state,
  };
}

const MS_PER_MINUTE = 60_000;

/** Whole minutes since the room was created (0 for a clock ahead of ours). */
export function roomAgeMinutes(createdAt: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - createdAt) / MS_PER_MINUTE));
}

/**
 * The selection after a new list: kept while the room is still listed, otherwise cleared (a
 * room that closed or went private must not stay joinable from a stale row).
 */
export function keepSelection(
  selected: string | null,
  rooms: readonly RoomSummary[],
): string | null {
  return selected !== null && rooms.some((room) => room.code === selected) ? selected : null;
}
