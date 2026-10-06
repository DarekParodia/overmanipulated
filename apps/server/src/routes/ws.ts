// WebSocket endpoint for live gameplay. Parses every message with the shared Zod schemas and
// hands it to the room registry. Optional artificial latency for netcode testing in dev.
import { upgradeWebSocket } from '@hono/bun';
import { MAX_CLIENT_MESSAGE_BYTES, parseClientMessage } from '@redakcja/shared';
import type { ServerWebSocket } from 'bun';
import { log } from '../log.ts';
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

export function createWsHandler(deps: WsDeps) {
  const { registry, devLatencyMs } = deps;
  return upgradeWebSocket(() => {
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
