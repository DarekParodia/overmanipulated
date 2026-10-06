// Typed REST client for /api, generated from the server's Hono routes (no hand-written URLs).
import type { AppType } from '@redakcja/server/app';
import { hc } from 'hono/client';

export const api = hc<AppType>(globalThis.location?.origin ?? 'http://localhost').api;

export type HealthStatus = 'ok' | 'degraded' | 'unreachable';

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
