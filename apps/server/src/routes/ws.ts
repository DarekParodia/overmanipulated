// WebSocket endpoint for live gameplay. Parses every message with the shared Zod schemas and
// hands it to the room registry. Optional artificial latency for netcode testing in dev.
import { getConnInfo, upgradeWebSocket } from '@hono/bun';
import { MAX_CLIENT_MESSAGE_BYTES, parseClientMessage } from '@redakcja/shared';
import type { ServerWebSocket } from 'bun';
import type { Context } from 'hono';
import {
  CLOSE_RATE_LIMITED,
  JOINS_PER_MINUTE_PER_IP,
  ROOMS_PER_MINUTE_PER_IP,
  WS_MESSAGE_BURST,
  WS_MESSAGES_PER_SECOND,
} from '../limits.ts';
import { log } from '../log.ts';
import { createRateLimiter } from '../rate-limit.ts';
import { CLOSE_NORMAL, type Connection } from '../rooms/connection.ts';
import type { RoomRegistry } from '../rooms/registry.ts';

export type WsDeps = { registry: RoomRegistry; devLatencyMs: number };

export function delayed(latencyMs: number, fn: () => void): void {
  if (latencyMs > 0) {
    setTimeout(fn, latencyMs);
  } else {
    fn();
  }
}

/**
 * Client address. Behind Caddy the proxy sets X-Forwarded-For (the game server is never exposed
 * directly); otherwise the socket's own address is used.
 */
function clientAddress(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || getConnInfo(c).remote.address || 'unknown';
}

export function createWsHandler(deps: WsDeps) {
  const { registry, devLatencyMs } = deps;
  const messages = createRateLimiter({
    capacity: WS_MESSAGE_BURST,
    refillPerSecond: WS_MESSAGES_PER_SECOND,
  });
  const joins = createRateLimiter({
    capacity: JOINS_PER_MINUTE_PER_IP,
    refillPerSecond: JOINS_PER_MINUTE_PER_IP / 60,
  });
  const newRooms = createRateLimiter({
    capacity: ROOMS_PER_MINUTE_PER_IP,
    refillPerSecond: ROOMS_PER_MINUTE_PER_IP / 60,
  });
  setInterval(() => {
    for (const limiter of [messages, joins, newRooms]) {
      limiter.prune();
    }
  }, 60_000).unref();

  return upgradeWebSocket((c) => {
    const address = clientAddress(c);
    let connection: Connection | null = null;
    return {
      onOpen(_event, ws) {
        const raw = ws.raw as ServerWebSocket<unknown>;
        connection = {
          id: crypto.randomUUID(),
          send: (data) => delayed(devLatencyMs, () => ws.send(data)),
          subscribe: (topic) => raw.subscribe(topic),
          unsubscribe: (topic) => raw.unsubscribe(topic),
          close: (code, reason) => ws.close(code, reason),
        };
      },
      onMessage(event, _ws) {
        const current = connection;
        if (!current) {
          return;
        }
        if (!messages.take(current.id)) {
          log.warn('socket over its message budget, closing', { connection: current.id });
          current.close(CLOSE_RATE_LIMITED, 'rate limited');
          return;
        }
        if (typeof event.data !== 'string' || event.data.length > MAX_CLIENT_MESSAGE_BYTES) {
          registry.sendError(current, 'invalidMessage', 'expected a text message within limits');
          return;
        }
        const parsed = parseClientMessage(event.data);
        if (!parsed.ok) {
          log.warn('invalid client message', { connection: current.id, error: parsed.error });
          registry.sendError(current, 'invalidMessage');
          return;
        }
        if (parsed.message.type === 'join') {
          const createsRoom = parsed.message.roomCode === undefined;
          if (!joins.take(address) || (createsRoom && !newRooms.take(address))) {
            log.warn('join rate limited', { address });
            registry.sendError(current, 'invalidMessage', 'too many requests, try again soon');
            return;
          }
        }
        delayed(devLatencyMs, () => registry.handleMessage(current, parsed.message));
      },
      onClose(event) {
        const current = connection;
        if (current) {
          registry.handleDisconnect(current, event.code === CLOSE_NORMAL);
        }
        connection = null;
      },
    };
  });
}
