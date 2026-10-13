// Typed REST client for /api, generated from the server's Hono routes (no hand-written URLs).
import type { AppType } from '@redakcja/server/app';
import {
  type Difficulty,
  type LeaderboardResponse,
  leaderboardResponseSchema,
  type PublicConfig,
  publicConfigSchema,
} from '@redakcja/shared';
import { hc } from 'hono/client';
import { leaderboardQuery } from '../endless/endless-model.ts';

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
