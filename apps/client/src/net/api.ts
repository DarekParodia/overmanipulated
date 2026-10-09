// Typed REST client for /api, generated from the server's Hono routes (no hand-written URLs).
import type { AppType } from '@redakcja/server/app';
import { type LeaderboardResponse, leaderboardResponseSchema } from '@redakcja/shared';
import { hc } from 'hono/client';

export const api = hc<AppType>(globalThis.location?.origin ?? 'http://localhost').api;

export type HealthStatus = 'ok' | 'degraded' | 'unreachable';

/**
 * Endless leaderboard (S4-11): `scope=global`, or `scope=room&room=CODE`. Validated against the
 * shared schema; throws on network, HTTP or shape errors so the caller can show its error state.
 */
export async function fetchLeaderboard(
  scope: 'global' | 'room',
  roomCode: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<LeaderboardResponse> {
  const query = new URLSearchParams({ scope, limit: String(limit) });
  if (scope === 'room' && roomCode) {
    query.set('room', roomCode);
  }
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
