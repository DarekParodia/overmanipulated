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
import { DEFAULT_SERVER_CONFIG } from './config.ts';
import { type RoomSettings, roomSettings } from './public-config.ts';
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

describe('registry settings from config.json (S7-68)', () => {
  it('reads maxRooms and the default difficulty at every room creation', () => {
    const fake = createFakeHub();
    let settings: RoomSettings = {
      maxRooms: 1,
      defaultDifficulty: 'hard',
      features: { roomBrowser: false, versus: true, spectators: true, intro: true },
    };
    const registry = createRoomRegistry({ hub: fake.hub, settings: () => settings });
    const create = () => {
      const connection = fake.connect();
      registry.handleMessage(connection, {
        type: 'join',
        protocolVersion: PROTOCOL_VERSION,
        nickname: 'Ala',
      });
      return connection;
    };
    expect(create().last('roomState')?.difficulty).toBe('hard');
    expect(create().last('error')).toMatchObject({ code: 'roomFull' });

    // A reload applies to the next room; the running one keeps its difficulty.
    settings = { ...settings, maxRooms: 2, defaultDifficulty: 'easy' };
    const second = create();
    expect(second.last('roomState')?.difficulty).toBe('easy');
    expect(registry.roomCount).toBe(2);
  });

  it('lets the maxRooms option win over the settings', () => {
    const fake = createFakeHub();
    const registry = createRoomRegistry({
      hub: fake.hub,
      maxRooms: 1,
      settings: () => roomSettings(DEFAULT_SERVER_CONFIG),
    });
    for (let i = 0; i < 2; i++) {
      registry.handleMessage(fake.connect(), {
        type: 'join',
        protocolVersion: PROTOCOL_VERSION,
        nickname: 'Ala',
      });
    }
    expect(registry.roomCount).toBe(1);
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

  /** Creates a room on a fresh socket and returns the reply type (`welcome` or `error`). */
  async function createRoom(headers: Record<string, string>): Promise<string> {
    const socket = await open(headers);
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
  }

  it('limits room creation per client address, not globally', async () => {
    const results: string[] = [];
    for (let i = 0; i < 21; i++) {
      results.push(await createRoom({ 'x-real-ip': '203.0.113.7' }));
    }
    expect(results.slice(0, 20).every((type) => type === 'welcome')).toBe(true);
    expect(results[20]).toBe('error');
    expect(await createRoom({ 'x-real-ip': '203.0.113.8' })).toBe('welcome');
  });

  it('ignores X-Forwarded-For: a forged value does not change the limiter key', async () => {
    // No X-Real-IP, so every socket is keyed by its own (local) address.
    const results: string[] = [];
    for (let i = 0; i < 21; i++) {
      results.push(await createRoom({ 'x-forwarded-for': `198.51.100.${i + 1}` }));
    }
    expect(results.slice(0, 20).every((type) => type === 'welcome')).toBe(true);
    expect(results[20]).toBe('error');
  });
});
