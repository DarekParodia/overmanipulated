// Stage 3 room phases: the briefing between lobby and playing (S3-03) and the blunder-of-the-day
// vote on the results screen (S3-02).
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  type FolderResult,
  type LobbyAction,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  step,
} from '@redakcja/shared';
import { createFakeHub, type FakeConnection } from '../__fixtures__/fake-transport.ts';
import { createRoomRegistry, type RoomRegistry } from './registry.ts';

const BRIEFING_MS = 10_000;

function result(folderId: string, storyId: string): FolderResult {
  return {
    folderId,
    storyId,
    outcome: 'correct',
    verdict: 'publish',
    scoreDelta: 100,
    credibilityDelta: 5,
    missedStampIds: [],
  };
}

const RESULTS = [result('f1', 's1'), result('f2', 's2'), result('f3', 's3')];

type StoredVote = { id: number; levelId: string; storyId: string };

let time = 0;
let fake: ReturnType<typeof createFakeHub>;
let registry: RoomRegistry;
let endNextTick = false;
let stored: StoredVote[] = [];
let failWrites = false;

beforeEach(() => {
  time = 0;
  endNextTick = false;
  stored = [];
  failWrites = false;
  let nextRowId = 1;
  fake = createFakeHub();
  registry = createRoomRegistry({
    hub: fake.hub,
    now: () => time,
    briefingMs: BRIEFING_MS,
    recordBlunderVote: ({ levelId, storyId, previousId }) => {
      if (failWrites) {
        throw new Error('disk full');
      }
      stored = stored.filter((v) => v.id !== previousId);
      const id = nextRowId++;
      stored.push({ id, levelId, storyId });
      return id;
    },
    step: (state, inputs, commands, ctx) => {
      const out = step(state, inputs, commands, ctx);
      if (!endNextTick) {
        return out;
      }
      endNextTick = false;
      return {
        ...out,
        state: { ...out.state, results: RESULTS, ended: { won: true, stars: 2 } },
      };
    },
  });
});

function join(nickname: string, roomCode?: string, reconnectToken?: string): FakeConnection {
  const connection = fake.connect();
  registry.handleMessage(connection, {
    type: 'join',
    protocolVersion: PROTOCOL_VERSION,
    nickname,
    ...(roomCode === undefined ? {} : { roomCode }),
    ...(reconnectToken === undefined ? {} : { reconnectToken }),
  });
  return connection;
}

function welcomeOf(connection: FakeConnection) {
  const welcome = connection.last('welcome');
  if (!welcome) {
    throw new Error('no welcome received');
  }
  return welcome;
}

function lobby(connection: FakeConnection, action: LobbyAction): void {
  registry.handleMessage(connection, { type: 'lobby', action });
}

function skip(connection: FakeConnection): void {
  lobby(connection, { kind: 'skipBriefing' });
}

function vote(connection: FakeConnection, storyId: string): void {
  lobby(connection, { kind: 'voteBlunder', storyId });
}

function phaseOf(connection: FakeConnection) {
  return registry.inspect(welcomeOf(connection).roomCode)?.phase;
}

function idOf(connection: FakeConnection): string {
  return welcomeOf(connection).playerId;
}

/** Three players, guests ready, host pressed start: the room is in the briefing. */
function briefingRoom() {
  const host = join('Ala');
  const code = welcomeOf(host).roomCode;
  const b = join('Bartek', code);
  const c = join('Celina', code);
  lobby(b, { kind: 'setReady', ready: true });
  lobby(c, { kind: 'setReady', ready: true });
  lobby(host, { kind: 'start' });
  return { host, b, c, code };
}

/** Skips the briefing for everyone, then ends the level on the next tick. */
function toResults(...players: FakeConnection[]): void {
  for (const player of players) {
    skip(player);
  }
  endNextTick = true;
  registry.tick();
}

function gameStartedCount(connection: FakeConnection): number {
  return connection.all('event').filter((e) => e.event.kind === 'gameStarted').length;
}

describe('briefing', () => {
  it('start opens the briefing with a countdown instead of the level', () => {
    const { host, b } = briefingRoom();
    expect(phaseOf(host)).toBe('briefing');
    expect(b.last('roomState')).toMatchObject({
      phase: 'briefing',
      briefing: { endsInMs: BRIEFING_MS, skippedBy: [] },
    });
    expect(gameStartedCount(b)).toBe(0);
    // Readiness was used up by the start.
    expect(b.last('roomState')?.players.every((p) => !p.ready)).toBe(true);
    // No simulation (and no snapshots) during the briefing.
    registry.tick();
    expect(host.all('snapshot')).toHaveLength(0);
  });

  it('starts the level by itself when the time runs out', () => {
    const { host, b, code } = briefingRoom();
    time += BRIEFING_MS - 1;
    registry.tick();
    expect(phaseOf(host)).toBe('briefing');
    time += 1;
    registry.tick();
    expect(phaseOf(host)).toBe('playing');
    expect(b.last('roomState')).toMatchObject({ phase: 'playing', briefing: null });
    expect(gameStartedCount(b)).toBe(1);
    expect(Object.keys(registry.inspect(code)?.game.players ?? {})).toHaveLength(3);
    registry.tick();
    expect(host.last('snapshot')?.tick).toBe(1);
  });

  it('starts as soon as every connected player skipped', () => {
    const { host, b, c } = briefingRoom();
    skip(b);
    skip(b);
    time += 2000;
    skip(host);
    const state = c.last('roomState');
    expect(state?.phase).toBe('briefing');
    expect(state?.briefing).toEqual({
      endsInMs: BRIEFING_MS - 2000,
      skippedBy: [idOf(b), idOf(host)],
    });
    skip(c);
    expect(phaseOf(host)).toBe('playing');
    expect(gameStartedCount(c)).toBe(1);
  });

  it('does not wait for a player who disconnects, but still lets them back in', () => {
    const { host, b, c, code } = briefingRoom();
    skip(host);
    skip(b);
    registry.handleDisconnect(c, false);
    expect(phaseOf(host)).toBe('playing');
    expect(registry.inspect(code)?.game.players[idOf(c)]).toBeDefined();
    const back = join('Celina', undefined, welcomeOf(c).reconnectToken);
    expect(back.last('roomState')?.phase).toBe('playing');
  });

  it('starts when the last player who had not skipped leaves', () => {
    const { host, b, c, code } = briefingRoom();
    skip(host);
    skip(c);
    registry.handleDisconnect(b, true);
    expect(phaseOf(host)).toBe('playing');
    expect(Object.keys(registry.inspect(code)?.game.players ?? {})).toHaveLength(2);
  });

  it('forgets the skip of a player who left', () => {
    const { host, b, c } = briefingRoom();
    skip(b);
    registry.handleDisconnect(b, true);
    expect(host.last('roomState')?.briefing?.skippedBy).toEqual([]);
    skip(host);
    expect(phaseOf(host)).toBe('briefing');
    skip(c);
    expect(phaseOf(host)).toBe('playing');
  });

  it('a reconnecting player who had not skipped holds the start again', () => {
    const { host, b, c } = briefingRoom();
    registry.handleDisconnect(c, false);
    const back = join('Celina', undefined, welcomeOf(c).reconnectToken);
    time += 3000;
    expect(back.last('roomState')?.briefing?.endsInMs).toBe(BRIEFING_MS);
    skip(host);
    skip(b);
    expect(phaseOf(host)).toBe('briefing');
    skip(back);
    expect(phaseOf(host)).toBe('playing');
  });

  it('a player joining during the briefing must skip too and plays the level', () => {
    const { host, b, c, code } = briefingRoom();
    const d = join('Dawid', code);
    expect(d.last('roomState')?.phase).toBe('briefing');
    for (const player of [host, b, c]) {
      skip(player);
    }
    expect(phaseOf(host)).toBe('briefing');
    skip(d);
    expect(registry.inspect(code)?.game.players[idOf(d)]).toBeDefined();
  });

  it('runs the timer even when everyone is disconnected', () => {
    const { host, b, c } = briefingRoom();
    for (const player of [host, b, c]) {
      registry.handleDisconnect(player, false);
    }
    expect(phaseOf(host)).toBe('briefing');
    time += BRIEFING_MS;
    registry.tick();
    expect(phaseOf(host)).toBe('playing');
    // The empty room still closes after the reconnect grace.
    time += RECONNECT_GRACE_MS;
    registry.tick();
    expect(registry.roomCount).toBe(0);
  });

  it('ignores start, roles, readiness, inputs and commands during the briefing', () => {
    const { host, b, code } = briefingRoom();
    lobby(host, { kind: 'start' });
    lobby(b, { kind: 'setRole', role: 'archivist' });
    lobby(b, { kind: 'setReady', ready: true });
    registry.handleMessage(b, {
      type: 'input',
      seq: 0,
      move: { x: 1, y: 0 },
      actions: { interact: false, work: false },
    });
    const room = registry.inspect(code);
    expect(room?.briefing?.endsAt).toBe(BRIEFING_MS);
    expect(room?.players[1]).toMatchObject({ role: null, ready: false, queued: 0 });
    expect(host.all('roomState').filter((s) => s.phase === 'briefing')).toHaveLength(1);
  });

  it('ignores skipBriefing outside of the briefing', () => {
    const host = join('Ala');
    const before = host.all('roomState').length;
    skip(host);
    expect(host.all('roomState')).toHaveLength(before);
    expect(phaseOf(host)).toBe('lobby');
  });

  it('a replay from results goes through the briefing again', () => {
    const { host, b, c } = briefingRoom();
    toResults(host, b, c);
    expect(phaseOf(host)).toBe('results');
    lobby(b, { kind: 'setReady', ready: true });
    lobby(c, { kind: 'setReady', ready: true });
    lobby(host, { kind: 'start' });
    expect(b.last('roomState')).toMatchObject({
      phase: 'briefing',
      briefing: { endsInMs: BRIEFING_MS, skippedBy: [] },
    });
    for (const player of [host, b, c]) {
      skip(player);
    }
    expect(phaseOf(host)).toBe('playing');
    expect(gameStartedCount(b)).toBe(2);
  });
});

describe('blunder votes', () => {
  it('records one vote per player, replacing a changed vote', () => {
    const { host, b, c } = briefingRoom();
    toResults(host, b, c);
    vote(b, 's2');
    vote(c, 's2');
    vote(b, 's3');
    expect(host.last('roomState')?.blunderVotes).toEqual([
      { playerId: idOf(b), storyId: 's3' },
      { playerId: idOf(c), storyId: 's2' },
    ]);
    expect(stored.map((v) => [v.levelId, v.storyId])).toEqual([
      ['l0-greybox', 's2'],
      ['l0-greybox', 's3'],
    ]);
  });

  it('does not store the same vote twice', () => {
    const { host, b, c } = briefingRoom();
    toResults(host, b, c);
    vote(b, 's1');
    const before = host.all('roomState').length;
    vote(b, 's1');
    expect(host.all('roomState')).toHaveLength(before);
    expect(stored).toHaveLength(1);
  });

  it('rejects stories that were not part of the run', () => {
    const { host, b, c } = briefingRoom();
    toResults(host, b, c);
    vote(b, 'not-a-story');
    expect(b.last('error')?.code).toBe('invalidMessage');
    expect(host.last('roomState')?.blunderVotes).toEqual([]);
    expect(stored).toHaveLength(0);
  });

  it('is ignored outside of the results screen', () => {
    const { host, b, c } = briefingRoom();
    vote(b, 's1');
    for (const player of [host, b, c]) {
      skip(player);
    }
    expect(phaseOf(host)).toBe('playing');
    vote(b, 's1');
    expect(registry.inspect(welcomeOf(host).roomCode)?.blunderVotes).toEqual([]);
    expect(stored).toHaveLength(0);
    expect(b.last('error')).toBeUndefined();
  });

  it('clears the room list when leaving results; stored votes stay', () => {
    const { host, b, c } = briefingRoom();
    toResults(host, b, c);
    vote(b, 's1');
    lobby(host, { kind: 'backToLobby' });
    expect(host.last('roomState')?.blunderVotes).toEqual([]);

    lobby(b, { kind: 'setReady', ready: true });
    lobby(c, { kind: 'setReady', ready: true });
    lobby(host, { kind: 'start' });
    toResults(host, b, c);
    vote(c, 's1');
    lobby(b, { kind: 'setReady', ready: true });
    lobby(c, { kind: 'setReady', ready: true });
    lobby(host, { kind: 'start' });
    expect(host.last('roomState')?.blunderVotes).toEqual([]);
    expect(stored.map((v) => v.storyId)).toEqual(['s1', 's1']);
  });

  it('a new run counts as a new vote, not a replacement', () => {
    const { host, b, c } = briefingRoom();
    toResults(host, b, c);
    vote(b, 's1');
    lobby(host, { kind: 'backToLobby' });
    lobby(b, { kind: 'setReady', ready: true });
    lobby(c, { kind: 'setReady', ready: true });
    lobby(host, { kind: 'start' });
    toResults(host, b, c);
    vote(b, 's2');
    expect(stored.map((v) => v.storyId)).toEqual(['s1', 's2']);
  });

  it('drops the vote of a player who leaves from the room list', () => {
    const { host, b, c } = briefingRoom();
    toResults(host, b, c);
    vote(b, 's1');
    vote(c, 's2');
    registry.handleDisconnect(b, true);
    expect(host.last('roomState')?.blunderVotes).toEqual([{ playerId: idOf(c), storyId: 's2' }]);
    expect(stored).toHaveLength(2);
  });

  it('keeps the vote in the room when storing it fails', () => {
    const { host, b, c } = briefingRoom();
    toResults(host, b, c);
    failWrites = true;
    vote(b, 's1');
    expect(host.last('roomState')?.blunderVotes).toEqual([{ playerId: idOf(b), storyId: 's1' }]);
    expect(b.last('error')).toBeUndefined();
  });
});
