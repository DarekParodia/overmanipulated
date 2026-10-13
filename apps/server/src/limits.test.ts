// Abuse limits (S6-04): message flood, per-address room creation, room cap.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  BRIEFING_DURATION_MS,
  encodeMessage,
  PROTOCOL_VERSION,
  parseServerMessage,
  type ServerMessage,
} from '@redakcja/shared';
import { createFakeHub } from './__fixtures__/fake-transport.ts';
import { createRoomRegistry } from './rooms/registry.ts';
import { type RunningServer, startServer } from './server.ts';

describe('room cap', () => {
  it('refuses new rooms past the cap but still lets players join existing ones', () => {
    const fake = createFakeHub();
    const limited = createRoomRegistry({ hub: fake.hub, maxRooms: 2 });
    const create = () => {
      const connection = fake.connect();
      limited.handleMessage(connection, {
        type: 'join',
        protocolVersion: PROTOCOL_VERSION,
        nickname: 'Ala',
      });
      return connection;
    };
    const first = create();
    create();
    const refused = create();
    expect(refused.last('error')).toMatchObject({ code: 'roomFull' });
    expect(limited.roomCount).toBe(2);

    const guest = fake.connect();
    limited.handleMessage(guest, {
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      nickname: 'Bartek',
      roomCode: first.last('welcome')?.roomCode,
    });
    expect(guest.last('welcome')).toBeDefined();
  });
});

describe('socket limits', () => {
  let running: RunningServer;

  beforeAll(() => {
    running = startServer({
      PORT: 0,
      DATABASE_PATH: ':memory:',
      DEV_LATENCY_MS: 0,
      BRIEFING_MS: BRIEFING_DURATION_MS,
    });
  });

  afterAll(async () => {
    await running.stop();
  });

  async function open(headers?: Record<string, string>): Promise<WebSocket> {
    // Bun's WebSocket accepts request headers; the DOM typings do not know about them.
    const socket = new WebSocket(`ws://localhost:${running.server.port}/ws`, {
      headers,
    } as unknown as string[]);
    await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
    return socket;
  }

  it('closes a socket that floods messages', async () => {
    const socket = await open();
    const closed = new Promise<number>((resolve) =>
      socket.addEventListener('close', (event) => resolve(event.code), { once: true }),
    );
    for (let i = 0; i < 400; i++) {
      socket.send(encodeMessage({ type: 'heartbeat', clientTime: i }));
    }
    expect(await closed).toBe(1008);
  });

  it('limits room creation per client address, not globally', async () => {
    const attempt = async (address: string) => {
      const socket = await open({ 'x-forwarded-for': address });
      const reply = new Promise<ServerMessage>((resolve) =>
        socket.addEventListener('message', (event) => {
          const parsed = parseServerMessage(String(event.data));
          if (parsed.ok && (parsed.message.type === 'welcome' || parsed.message.type === 'error')) {
            resolve(parsed.message);
          }
        }),
      );
      socket.send(
        encodeMessage({ type: 'join', protocolVersion: PROTOCOL_VERSION, nickname: 'Ala' }),
      );
      const message = await reply;
      socket.close(1000);
      return message.type;
    };
    const results: string[] = [];
    for (let i = 0; i < 21; i++) {
      results.push(await attempt('203.0.113.7'));
    }
    expect(results.slice(0, 20).every((type) => type === 'welcome')).toBe(true);
    expect(results[20]).toBe('error');
    expect(await attempt('203.0.113.8')).toBe('welcome');
  });
});
