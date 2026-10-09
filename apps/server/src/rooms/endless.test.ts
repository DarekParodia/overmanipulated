// Endless mode (S4-11) through the registry: select, briefing, play, results, leaderboard row.
import { beforeEach, describe, expect, it } from 'bun:test';
import { ENDLESS, ENDLESS_LEVEL_ID, PROTOCOL_VERSION, step } from '@redakcja/shared';
import { createFakeHub, type FakeConnection } from '../__fixtures__/fake-transport.ts';
import { createRoomRegistry, type RoomRegistry } from './registry.ts';

const BRIEFING_MS = 10_000;

type Stored = { roomCode: string; players: string[]; score: number; survivedS: number };

let time = 0;
let fake: ReturnType<typeof createFakeHub>;
let registry: RoomRegistry;
let stored: Stored[] = [];
/** Overrides applied to the game state before the next real simulation step. */
let patch: { credibility?: number; elapsedMs?: number; score?: number } | null = null;
let seeds: number[] = [];
let failWrites = false;

beforeEach(() => {
  time = 0;
  stored = [];
  patch = null;
  failWrites = false;
  seeds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  fake = createFakeHub();
  registry = createRoomRegistry({
    hub: fake.hub,
    now: () => time,
    briefingMs: BRIEFING_MS,
    random: () => seeds.shift() ?? 0.9,
    recordLeaderboardEntry: (entry) => {
      if (failWrites) {
        throw new Error('disk full');
      }
      stored.push(entry);
    },
    step: (state, inputs, commands, ctx) => {
      const input = patch ? { ...state, ...patch } : state;
      patch = null;
      return step(input, inputs, commands, ctx);
    },
  });
});

function join(nickname: string, roomCode?: string): FakeConnection {
  const connection = fake.connect();
  registry.handleMessage(connection, {
    type: 'join',
    protocolVersion: PROTOCOL_VERSION,
    nickname,
    ...(roomCode === undefined ? {} : { roomCode }),
  });
  return connection;
}

const codeOf = (c: FakeConnection) => c.last('welcome')?.roomCode ?? '';
const phaseOf = (c: FakeConnection) => registry.inspect(codeOf(c))?.phase;

function selectEndless(host: FakeConnection): void {
  registry.handleMessage(host, {
    type: 'lobby',
    action: { kind: 'selectLevel', levelId: ENDLESS_LEVEL_ID },
  });
}

function startPlaying(host: FakeConnection): void {
  registry.handleMessage(host, { type: 'lobby', action: { kind: 'start' } });
  expect(phaseOf(host)).toBe('briefing');
  registry.handleMessage(host, { type: 'lobby', action: { kind: 'skipBriefing' } });
}

describe('endless mode in a room', () => {
  it('lets the host pick endless and runs lobby, briefing, playing', () => {
    const host = join('Ala');
    selectEndless(host);
    expect(host.last('error')).toBeUndefined();
    expect(host.last('roomState')?.levelId).toBe(ENDLESS_LEVEL_ID);
    startPlaying(host);
    expect(phaseOf(host)).toBe('playing');
    const state = registry.inspect(codeOf(host));
    expect(state?.levelId).toBe(ENDLESS_LEVEL_ID);
    // All six stations exist in the running game.
    const kinds = Object.values(state?.game.stations ?? {}).map((s) => s.kind);
    expect(new Set(kinds).size).toBe(6);
    registry.tick();
    expect(host.last('snapshot')?.stations).toHaveLength(6);
    expect(host.last('snapshot')?.timeLeftMs).toBeGreaterThan(ENDLESS.durationS * 900);
  });

  it('refuses endless from a guest', () => {
    const host = join('Ala');
    const guest = join('Bartek', codeOf(host));
    selectEndless(guest);
    expect(guest.last('error')).toMatchObject({ code: 'notHost' });
    expect(registry.inspect(codeOf(host))?.levelId).not.toBe(ENDLESS_LEVEL_ID);
  });

  it('keeps playing past any time limit while credibility is above 0', () => {
    const host = join('Ala');
    selectEndless(host);
    startPlaying(host);
    patch = { elapsedMs: ENDLESS.durationS * 1000 * 3, score: 500 };
    registry.tick();
    expect(phaseOf(host)).toBe('playing');
    expect(host.all('levelEnd')).toHaveLength(0);
  });

  it('ends at credibility 0, reports survivedS and stores a leaderboard row', () => {
    const host = join('Ala');
    const guest = join('Bartek', codeOf(host));
    registry.handleMessage(guest, { type: 'lobby', action: { kind: 'setReady', ready: true } });
    selectEndless(host);
    registry.handleMessage(guest, { type: 'lobby', action: { kind: 'setReady', ready: true } });
    startPlaying(host);
    registry.handleMessage(guest, { type: 'lobby', action: { kind: 'skipBriefing' } });
    expect(phaseOf(host)).toBe('playing');
    patch = { elapsedMs: 754_400, credibility: 0, score: 230 };
    registry.tick();
    expect(phaseOf(host)).toBe('results');
    const end = host.last('levelEnd');
    expect(end).toMatchObject({
      levelId: ENDLESS_LEVEL_ID,
      score: 230,
      credibility: 0,
      survivedS: 754,
    });
    expect(guest.last('levelEnd')?.survivedS).toBe(754);
    expect(stored).toEqual([
      { roomCode: codeOf(host), players: ['Ala', 'Bartek'], score: 230, survivedS: 754 },
    ]);
  });

  it('gives every run its own schedule', () => {
    const host = join('Ala');
    selectEndless(host);
    startPlaying(host);
    const first = registry.inspect(codeOf(host))?.game.rng;
    patch = { credibility: 0 };
    registry.tick();
    registry.handleMessage(host, { type: 'lobby', action: { kind: 'backToLobby' } });
    registry.handleMessage(host, { type: 'lobby', action: { kind: 'start' } });
    registry.handleMessage(host, { type: 'lobby', action: { kind: 'skipBriefing' } });
    expect(phaseOf(host)).toBe('playing');
    expect(registry.inspect(codeOf(host))?.game.rng).not.toBe(first);
  });

  it('does not store campaign runs and survives a failing write', () => {
    failWrites = true;
    const host = join('Ala');
    selectEndless(host);
    startPlaying(host);
    patch = { credibility: 0 };
    registry.tick();
    expect(phaseOf(host)).toBe('results');
    expect(host.last('levelEnd')?.survivedS).toBeDefined();
    expect(stored).toEqual([]);
  });

  it('leaves campaign levelEnd without survivedS', () => {
    const host = join('Ala');
    startPlaying(host);
    patch = { credibility: 0 };
    registry.tick();
    const end = host.last('levelEnd');
    expect(end).toBeDefined();
    expect(end && 'survivedS' in end).toBe(false);
    expect(stored).toEqual([]);
  });
});
