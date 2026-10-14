// The public room list behind `GET /api/rooms` (S7-83): a cache of every listed room's summary,
// rebuilt at most once per `ttlMs`, and the per-request search, filters, order and limit that run
// over the cached array. Pure apart from the injected clock and builder.
import {
  foldSearch,
  type RoomListQuery,
  type RoomListResponse,
  type RoomSummary,
} from '@redakcja/shared';

/** A listed room with the search forms of its code, name and (masked) host nickname. */
export type RoomListEntry = { summary: RoomSummary; search: readonly string[] };

export function roomListEntry(summary: RoomSummary): RoomListEntry {
  const fields = [summary.code, summary.name ?? '', summary.hostNickname];
  return { summary, search: fields.map(foldSearch).filter((field) => field.length > 0) };
}

/**
 * Rooms a player can join first, then the newest; the code breaks a tie so the order never
 * depends on the map's insertion order.
 */
export function compareRoomList(a: RoomSummary, b: RoomSummary): number {
  if (a.canJoinAsPlayer !== b.canJoinAsPlayer) {
    return a.canJoinAsPlayer ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return b.createdAt - a.createdAt;
  }
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function matches(entry: RoomListEntry, query: RoomListQuery, needle: string): boolean {
  const { summary } = entry;
  return (
    (needle.length === 0 || entry.search.some((field) => field.includes(needle))) &&
    (query.mode === undefined || summary.mode === query.mode) &&
    (query.levelId === undefined || summary.levelId === query.levelId) &&
    (query.difficulty === undefined || summary.difficulty === query.difficulty) &&
    (query.status === 'any' || summary.inGame === (query.status === 'inGame'))
  );
}

/** The entries (already in list order) a query matches, capped at its limit. */
export function queryRoomList(
  entries: readonly RoomListEntry[],
  query: RoomListQuery,
): RoomListResponse {
  const needle = foldSearch(query.q ?? '');
  const found = entries.filter((entry) => matches(entry, query, needle));
  return {
    rooms: found.slice(0, query.limit).map((entry) => entry.summary),
    total: found.length,
  };
}

export type RoomListCache = {
  /** The cached entries, rebuilt first when older than the time to live. */
  entries(): readonly RoomListEntry[];
  /** How often the list was built (diagnostics and tests). */
  readonly builds: number;
};

export function createRoomListCache(options: {
  now: () => number;
  ttlMs: number;
  /** Every listed room's summary, in any order. */
  build: () => RoomSummary[];
}): RoomListCache {
  let cached: { builtAt: number; entries: RoomListEntry[] } | null = null;
  let builds = 0;
  return {
    entries() {
      const time = options.now();
      if (cached === null || time - cached.builtAt >= options.ttlMs) {
        builds += 1;
        const entries = options.build().sort(compareRoomList).map(roomListEntry);
        cached = { builtAt: time, entries };
      }
      return cached.entries;
    },
    get builds() {
      return builds;
    },
  };
}
