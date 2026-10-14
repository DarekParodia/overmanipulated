// Typed REST client for /api, generated from the server's Hono routes (no hand-written URLs).
import type { AppType } from '@redakcja/server/app';
import {
  type Difficulty,
  type LeaderboardResponse,
  leaderboardResponseSchema,
  type PublicConfig,
  publicConfigSchema,
  type RoomListResponse,
  roomListResponseSchema,
} from '@redakcja/shared';
import { hc } from 'hono/client';
import { leaderboardQuery } from '../endless/endless-model.ts';
import { RoomListError, type RoomListFilters, roomListSearch } from '../rooms/room-list-model.ts';

export const api = hc<AppType>(globalThis.location?.origin ?? 'http://localhost').api;

export type HealthStatus = 'ok' | 'degraded' | 'unreachable';

/**
 * Endless leaderboard (S4-11): `scope=global`, or `scope=room&room=CODE`, for one difficulty
 * (S7-26). Validated against the shared schema; throws on network, HTTP or shape errors so the
 * caller can show its error state.
 */
export async function fetchLeaderboard(
  scope: 'global' | 'room',
  roomCode: string | null,
  difficulty: Difficulty,
  limit: number,
  signal?: AbortSignal,
): Promise<LeaderboardResponse> {
  const query = leaderboardQuery(scope, roomCode, difficulty, limit);
  const res = await fetch(`/api/leaderboard?${query}`, signal ? { signal } : {});
  if (!res.ok) {
    throw new Error(`leaderboard: HTTP ${res.status}`);
  }
  return leaderboardResponseSchema.parse(await res.json());
}

/**
 * Public rooms for the room browser (S7-88, `GET /api/rooms`), validated against the shared
 * schema. Throws a `RoomListError` saying why: `offline` (no answer), `busy` (429),
 * `unavailable` (404: the browser is switched off) or `failed`; an abort rethrows as is.
 */
export async function fetchRooms(
  filters: RoomListFilters,
  signal?: AbortSignal,
): Promise<RoomListResponse> {
  const query = roomListSearch(filters);
  let res: Response;
  try {
    res = await fetch(`/api/rooms${query ? `?${query}` : ''}`, signal ? { signal } : {});
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    // No answer at all: the device or the server is offline.
    throw new RoomListError('offline');
  }
  if (res.status === 429) {
    throw new RoomListError('busy');
  }
  if (res.status === 404) {
    throw new RoomListError('unavailable');
  }
  if (!res.ok) {
    throw new RoomListError('failed');
  }
  const parsed = roomListResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    throw new RoomListError('failed');
  }
  return parsed.data;
}

/** Asks the server for /api/health; never throws. */
export async function fetchHealth(): Promise<{ status: HealthStatus; rooms: number }> {
  try {
    const res = await api.health.$get();
    const body = await res.json();
    return { status: body.status, rooms: body.rooms };
  } catch {
    return { status: 'unreachable', rooms: 0 };
  }
}

/**
 * The server's public config for this host (`GET /api/config`), validated against the shared
 * schema. Never throws: a network, HTTP or shape error gives null, so the caller keeps what it
 * has (the embedded config or the safe defaults). `fetchImpl` replaces `fetch` in tests.
 */
export async function fetchPublicConfig(fetchImpl?: typeof fetch): Promise<PublicConfig | null> {
  try {
    const res = await api.config.$get(undefined, fetchImpl ? { fetch: fetchImpl } : undefined);
    if (!res.ok) {
      return null;
    }
    const parsed = publicConfigSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
