import { parseServerMessage, type ServerMessage } from '@redakcja/shared';
import type { Connection, Hub } from '../rooms/connection.ts';

export type FakeConnection = Connection & {
  received: ServerMessage[];
  closed: { code: number; reason: string } | null;
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined;
  all<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[];
};

export function createFakeHub() {
  const subscriptions = new Map<string, Set<FakeConnection>>();
  let nextId = 1;

  const hub: Hub = {
    publish(topic, data) {
      for (const connection of subscriptions.get(topic) ?? []) {
        connection.send(data);
      }
    },
  };

  function connect(): FakeConnection {
    const connection: FakeConnection = {
      id: `c${nextId++}`,
      received: [],
      closed: null,
      send(data) {
        const parsed = parseServerMessage(data);
        if (!parsed.ok) {
          throw new Error(`Server sent an invalid message: ${parsed.error}`);
        }
        connection.received.push(parsed.message);
      },
      subscribe(topic) {
        const set = subscriptions.get(topic) ?? new Set();
        set.add(connection);
        subscriptions.set(topic, set);
      },
      unsubscribe(topic) {
        subscriptions.get(topic)?.delete(connection);
      },
      close(code, reason) {
        connection.closed = { code, reason };
      },
      last(type) {
        return connection.all(type).at(-1);
      },
      all<T extends ServerMessage['type']>(type: T) {
        return connection.received.filter(
          (m): m is Extract<ServerMessage, { type: T }> => m.type === type,
        );
      },
    };
    return connection;
  }

  return { hub, connect };
}
