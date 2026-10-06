// End-to-end over real sockets: Bun.serve + Hono + registry + loop.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  type ClientMessage,
  encodeMessage,
  PROTOCOL_VERSION,
  parseServerMessage,
  type ServerMessage,
} from '@redakcja/shared';
import { type RunningServer, startServer } from './server.ts';

let running: RunningServer;
let base: string;

beforeAll(() => {
  running = startServer({ PORT: 0, DATABASE_PATH: ':memory:', DEV_LATENCY_MS: 0 });
  base = `localhost:${running.server.port}`;
});

afterAll(async () => {
  await running.stop();
});

type Client = {
  socket: WebSocket;
  messages: ServerMessage[];
  send(message: ClientMessage): void;
  waitFor<T extends ServerMessage['type']>(
    type: T,
    predicate?: (m: Extract<ServerMessage, { type: T }>) => boolean,
  ): Promise<Extract<ServerMessage, { type: T }>>;
};

async function connect(): Promise<Client> {
  const socket = new WebSocket(`ws://${base}/ws`);
  const messages: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  socket.addEventListener('message', (event) => {
    const parsed = parseServerMessage(String(event.data));
    if (parsed.ok) {
      messages.push(parsed.message);
      for (const wake of waiters.splice(0)) {
        wake();
      }
    }
  });
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  const client: Client = {
    socket,
    messages,
    send: (message) => socket.send(encodeMessage(message)),
    async waitFor(type, predicate = () => true) {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const found = messages.find(
          (m): m is Extract<ServerMessage, { type: typeof type }> =>
            m.type === type && predicate(m as Extract<ServerMessage, { type: typeof type }>),
        );
        if (found) {
          return found;
        }
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 50);
        });
      }
      throw new Error(`Timed out waiting for ${type}`);
    },
  };
  return client;
}

describe('game server over WebSocket', () => {
  it('serves health over HTTP', async () => {
    const res = await fetch(`http://${base}/api/health`);
    expect(res.status).toBe(200);
  });

  it('two players join, start and see each other move', async () => {
    const host = await connect();
    host.send({ type: 'join', protocolVersion: PROTOCOL_VERSION, nickname: 'Ala' });
    const hostWelcome = await host.waitFor('welcome');

    const guest = await connect();
    guest.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      nickname: 'Bartek',
      roomCode: hostWelcome.roomCode,
    });
    await guest.waitFor('welcome');
    await host.waitFor('roomState', (m) => m.players.length === 2);

    host.send({ type: 'lobby', action: { kind: 'start' } });
    await guest.waitFor('roomState', (m) => m.phase === 'playing');
    const first = await guest.waitFor('snapshot');
    const startX = first.players.find((p) => p.id === hostWelcome.playerId)?.x ?? 0;

    for (let seq = 0; seq < 5; seq++) {
      host.send({
        type: 'input',
        seq,
        move: { x: 1, y: 0 },
        actions: { interact: false, work: false },
      });
    }
    const moved = await guest.waitFor('snapshot', (m) =>
      m.players.some((p) => p.id === hostWelcome.playerId && p.lastInputSeq === 4),
    );
    expect(moved.players.find((p) => p.id === hostWelcome.playerId)?.x).toBeGreaterThan(startX);

    host.socket.close(1000);
    guest.socket.close(1000);
  });

  it('answers invalid messages with an error instead of dropping the socket', async () => {
    const client = await connect();
    client.socket.send('{"type":"cheat"}');
    const error = await client.waitFor('error');
    expect(error.code).toBe('invalidMessage');
    client.send({ type: 'heartbeat', clientTime: 7 });
    expect((await client.waitFor('heartbeatAck')).clientTime).toBe(7);
    client.socket.close(1000);
  });
});
