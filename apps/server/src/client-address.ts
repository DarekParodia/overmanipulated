// Client address for the per-address abuse limits (S7-02). In production Caddy works the player's
// address out of the trusted TLS proxy's X-Forwarded-For (Caddyfile `trusted_proxies`) and sends
// it as X-Real-IP, overwriting any value from the browser; the game server is never exposed
// directly. X-Forwarded-For itself is not read: its entries are whatever the browser claims.
import { getConnInfo } from '@hono/bun';
import type { Context } from 'hono';

/** Limiter key when neither the header nor the socket gives an address. */
export const UNKNOWN_CLIENT_ADDRESS = 'unknown';

/** X-Real-IP, else the socket's own address (dev, tests), else {@link UNKNOWN_CLIENT_ADDRESS}. */
export function clientAddress(c: Context): string {
  return c.req.header('x-real-ip')?.trim() || socketAddress(c) || UNKNOWN_CLIENT_ADDRESS;
}

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // No Bun server behind the request (`app.request()` in tests).
    return undefined;
  }
}
