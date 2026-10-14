// Session routing for modes, spectators and kicks (S7-84): per-team snapshots, events and level
// ends; the spectator-only messages never reach the player's stores; a kick lands on the menu.
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  type LevelEndMessage,
  type MatchStatsMessage,
  PROTOCOL_VERSION,
  type RoomStateMessage,
  type SnapshotMessage,
  type SpectatorEventMessage,
  TICK_MS,
} from '@redakcja/shared';
import { feedback } from '../fx/feedback.ts';
import { selfKind, selfTeam, useApp } from '../store/app.ts';
import { resetClientIdCache } from '../store/client-id.ts';
import { useProgress } from '../store/progress.ts';
import { pl } from '../strings/pl.ts';
import { onGameEvent } from './game-events.ts';
import { useGame } from './game-store.ts';
import { joinRoom, leaveRoom, receiveForTest, runtime } from './session.ts';
import { spectateViews, useSpectate } from './spectate-store.ts';

const SCOREBOARD = [
  { team: 0, score: 120, credibility: 40, resolved: 3, expired: 1, connected: 2 },
  { team: 1, score: 90, credibility: 55, resolved: 2, expired: 0, connected: 1 },
];

function snapshot(tick: number, fields: Partial<SnapshotMessage> = {}): SnapshotMessage {
  return {
    type: 'snapshot',
    tick,
    players: [{ id: 'p2', x: 4, y: 5, facing: 0, moving: false, lastInputSeq: 0 }],
    elapsedMs: tick * TICK_MS,
    timeLeftMs: 400_000,
    score: 90,
    credibility: 55,
    folders: [],
    stations: [],
    desks: [],
    nextFolder: null,
    conveyorFull: false,
    crew: [],
    paused: false,
    ...fields,
  };
}

/** A versus room: Ala (p1, host) in Kurier, Bartek (p2) in Głos, Widz (s1) watching. */
function room(fields: Partial<RoomStateMessage> = {}): RoomStateMessage {
  return {
    type: 'roomState',
    roomCode: 'KLMN',
    hostId: 'p1',
    phase: 'playing',
    levelId: 'l1-burza',
    difficulty: 'normal',
    run: null,
    players: [
      {
        id: 'p1',
        nickname: 'Ala',
        colorIndex: 0,
        connected: true,
        role: null,
        ready: true,
        team: 0,
        accessory: 'none',
      },
      {
        id: 'p2',
        nickname: 'Bartek',
        colorIndex: 0,
        connected: true,
        role: null,
        ready: true,
        team: 1,
        accessory: 'scarf',
      },
    ],
    briefing: null,
    blunderVotes: [],
    mode: 'versus',
    visibility: 'private',
    name: null,
    spectatorsAllowed: true,
    spectators: [{ id: 's1', nickname: 'Widz', connected: true }],
    ...fields,
  };
}

function levelEnd(fields: Partial<LevelEndMessage> = {}): LevelEndMessage {
  return {
    type: 'levelEnd',
    levelId: 'l1-burza',
    difficulty: 'normal',
    won: true,
    stars: 3,
    score: 120,
    credibility: 40,
    results: [],
    lossReason: null,
    starThresholds: { two: 100, three: 110 },
    maxScore: 150,
    ...fields,
  };
}

const SPECTATOR_EVENT: SpectatorEventMessage = {
  type: 'spectatorEvent',
  tick: 40,
  team: 1,
  event: {
    kind: 'verdictMasked',
    playerId: 'p2',
    folderId: 'f3',
    spawnKey: 's2',
    closedBy: 'verdict',
  },
};

const MATCH_STATS: MatchStatsMessage = {
  type: 'matchStats',
  tick: 40,
  players: [
    {
      playerId: 'p2',
      team: 1,
      verdicts: 2,
      correct: 1,
      wrong: 1,
      stamps: 4,
      minigameFails: 0,
      abilities: 1,
    },
  ],
  teams: SCOREBOARD,
};

/** Enters the room as `playerId`: a welcome, then a roomState. */
function enter(playerId: string, state: RoomStateMessage = room()): void {
  receiveForTest({
    type: 'welcome',
    playerId,
    roomCode: state.roomCode,
    reconnectToken: 'token-0123456789abcdef',
  });
  receiveForTest(state);
}

/** Records every cue and every gameplay event the player's listeners would get. */
function listen() {
  const cues: string[] = [];
  const events: string[] = [];
  const stopCues = feedback.onCue((id) => cues.push(id));
  const stopEvents = onGameEvent((event) => events.push(event.kind));
  return {
    cues,
    events,
    stop() {
      stopCues();
      stopEvents();
    },
  };
}

beforeEach(() => {
  leaveRoom();
  useGame.getState().reset();
  useSpectate.getState().reset();
  useApp.setState({ error: null, lastJoinCode: null });
  useProgress.setState({ best: {} });
});

describe('member kind and team (S7-84)', () => {
  it('derives the kind from the spectator list and the team from the player list', () => {
    const state = room();
    expect(selfKind(state, 's1')).toBe('spectator');
    expect(selfKind(state, 'p2')).toBe('player');
    expect(selfKind(null, 's1')).toBe('player');
    expect(selfTeam(state, 'p2')).toBe(1);
    expect(selfTeam(state, 'p1')).toBe(0);
    expect(selfTeam(state, 's1')).toBe(0);
  });
});

describe('spectator routing (S7-84)', () => {
  it("leaves useGame untouched for a spectator's team-1 snapshot and fills the team-1 view", () => {
    enter('s1');
    const before = useGame.getState();
    receiveForTest(snapshot(40, { team: 1, scoreboard: SCOREBOARD }));
    expect(useGame.getState()).toBe(before);
    expect(useGame.getState()).toMatchObject({ tick: 0, score: 0, scoreboard: null });
    expect(runtime.buffer.latest()).toBeNull();
    expect(spectateViews[1]?.store.getState()).toMatchObject({ tick: 40, score: 90 });
    expect(spectateViews[1]?.buffer.latest()?.tick).toBe(40);
    expect(spectateViews[0]?.store.getState().tick).toBe(0);
    expect(useSpectate.getState().teams).toEqual([1]);
  });

  it('puts a co-op snapshot without a team into view 0', () => {
    enter('s1', room({ mode: 'coop', players: room().players.slice(0, 1) }));
    receiveForTest(snapshot(12));
    expect(spectateViews[0]?.store.getState().tick).toBe(12);
    expect(useSpectate.getState().teams).toEqual([0]);
    expect(useGame.getState().tick).toBe(0);
  });

  it('goes lobby → read-only briefing → spectate screen, and back to the lobby', () => {
    enter('s1', room({ phase: 'lobby' }));
    expect(useApp.getState().screen).toBe('lobby');
    receiveForTest(room({ phase: 'briefing', briefing: { endsInMs: 8000, skippedBy: [] } }));
    expect(useApp.getState().screen).toBe('briefing');
    receiveForTest(room({ phase: 'playing' }));
    expect(useApp.getState().screen).toBe('spectate');
    receiveForTest(room({ phase: 'results' }));
    expect(useApp.getState().screen).toBe('spectate');
    receiveForTest(room({ phase: 'lobby' }));
    expect(useApp.getState().screen).toBe('lobby');
  });

  it('joins a match under way straight onto the spectate screen with fresh views', () => {
    useSpectate.getState().applySnapshot(snapshot(5, { team: 0 }), 0);
    enter('s1', room({ phase: 'playing' }));
    expect(useApp.getState().screen).toBe('spectate');
    expect(useSpectate.getState().teams).toEqual([]);
    expect(spectateViews[0]?.store.getState().tick).toBe(0);
  });

  it("keeps a spectator's level ends per team and records no progress", () => {
    enter('s1');
    receiveForTest(levelEnd({ team: 1, won: false, stars: 0 }));
    receiveForTest(levelEnd({ team: 0 }));
    expect(useSpectate.getState().levelEnds.map((end) => end?.team)).toEqual([0, 1]);
    expect(spectateViews[1]?.store.getState().levelEnd?.won).toBe(false);
    expect(useGame.getState().levelEnd).toBeNull();
    expect(useProgress.getState().best).toEqual({});
  });

  it('takes the 1 Hz match stats into the spectate store', () => {
    enter('s1');
    receiveForTest(MATCH_STATS);
    expect(useSpectate.getState().matchStats).toBe(MATCH_STATS);
  });

  it('ignores player-topic events while watching', () => {
    enter('s1');
    const heard = listen();
    receiveForTest({
      type: 'event',
      tick: 40,
      team: 1,
      event: { kind: 'folderPickedUp', folderId: 'f1', playerId: 'p2' },
    });
    heard.stop();
    expect(heard.events).toEqual([]);
    expect(heard.cues).toEqual([]);
  });
});

describe('spectatorEvent stays with the spectate store (S7-84)', () => {
  for (const member of ['s1', 'p2']) {
    it(`never reaches the player stores (${member === 's1' ? 'spectator' : 'player'})`, () => {
      enter(member);
      const game = useGame.getState();
      const heard = listen();
      receiveForTest(SPECTATOR_EVENT);
      receiveForTest({
        ...SPECTATOR_EVENT,
        tick: 41,
        event: { kind: 'folderPickedUp', folderId: 'f4', playerId: 'p2' },
      });
      heard.stop();
      expect(heard.events).toEqual([]);
      expect(heard.cues).toEqual([]);
      expect(useGame.getState()).toBe(game);
      expect(useSpectate.getState().events.map((m) => m.event.kind)).toEqual([
        'verdictMasked',
        'folderPickedUp',
      ]);
    });
  }
});

describe('player routing per team (S7-84)', () => {
  it("applies only the own team's snapshots, with the versus scoreboard", () => {
    enter('p2');
    receiveForTest(snapshot(40, { team: 0, score: 120 }));
    expect(useGame.getState().tick).toBe(0);
    receiveForTest(snapshot(41, { team: 1, scoreboard: SCOREBOARD }));
    expect(useGame.getState()).toMatchObject({ tick: 41, score: 90 });
    expect(useGame.getState().scoreboard).toEqual(SCOREBOARD);
    const kept = useGame.getState().scoreboard;
    // The same standings keep the same array, so the rival chip does not re-render.
    receiveForTest(snapshot(42, { team: 1, scoreboard: SCOREBOARD.map((t) => ({ ...t })) }));
    expect(useGame.getState().scoreboard).toBe(kept);
    expect(useSpectate.getState().teams).toEqual([]);
  });

  it("drops the rival team's events and level end", () => {
    enter('p2');
    const heard = listen();
    receiveForTest({
      type: 'event',
      tick: 40,
      team: 0,
      event: { kind: 'folderPickedUp', folderId: 'f1', playerId: 'p1' },
    });
    receiveForTest(levelEnd({ team: 0 }));
    heard.stop();
    expect(heard.events).toEqual([]);
    expect(useGame.getState().levelEnd).toBeNull();
  });

  it('records no progress for a versus level end, but does for co-op', () => {
    enter('p2');
    const versus = {
      winnerTeam: 1,
      reason: 'score' as const,
      teams: SCOREBOARD,
      rivalResults: [],
    };
    receiveForTest(levelEnd({ team: 1, versus }));
    expect(useGame.getState().levelEnd?.versus?.winnerTeam).toBe(1);
    expect(useProgress.getState().best).toEqual({});

    enter('p1', room({ mode: 'coop', players: room().players.slice(0, 1), spectators: [] }));
    receiveForTest(levelEnd());
    expect(useProgress.getState().best).toEqual({ normal: { 'l1-burza': 3 } });
  });
});

describe('kicked (S7-84)', () => {
  it('returns to the menu with pl.errors.kicked and drops the room', () => {
    enter('p2');
    receiveForTest(snapshot(41, { team: 1 }));
    receiveForTest({ type: 'error', code: 'kicked' });
    const app = useApp.getState();
    expect(app.screen).toBe('mainMenu');
    expect(app.error).toBe('kicked');
    expect(app.error && pl.errors[app.error]).toBe('Gospodarz usunął cię z pokoju.');
    expect(app).toMatchObject({ room: null, playerId: null, connection: 'idle' });
  });

  it('sends a spectator back to the menu the same way, with the watched views cleared', () => {
    enter('s1');
    receiveForTest(snapshot(40, { team: 1 }));
    receiveForTest({ type: 'error', code: 'kicked' });
    expect(useApp.getState()).toMatchObject({ screen: 'mainMenu', error: 'kicked' });
    expect(useSpectate.getState().teams).toEqual([]);
  });

  it('shows the kick cooldown of a refused join on the menu', () => {
    receiveForTest({ type: 'error', code: 'kickCooldown' });
    expect(useApp.getState()).toMatchObject({ error: 'kickCooldown', connection: 'idle' });
    expect(pl.errors.kickCooldown).toBe('Gospodarz niedawno cię usunął. Wróć później.');
  });
});

describe('joinRoom (S7-84)', () => {
  type Sent = Record<string, unknown>;
  const sent: Sent[] = [];
  const saved = {
    window: Reflect.get(globalThis, 'window'),
    WebSocket: Reflect.get(globalThis, 'WebSocket'),
    localStorage: Reflect.get(globalThis, 'localStorage'),
  };

  /** Opens at once and keeps what the session sends. */
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    private listeners = new Map<string, (event: unknown) => void>();
    constructor(readonly url: string) {
      queueMicrotask(() => this.listeners.get('open')?.({}));
    }
    addEventListener(type: string, listener: (event: unknown) => void) {
      this.listeners.set(type, listener);
    }
    send(data: string) {
      sent.push(JSON.parse(data) as Sent);
    }
    close() {
      this.readyState = 3;
    }
  }

  beforeEach(() => {
    sent.length = 0;
    const items = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', {
      value: { location: { protocol: 'http:', host: 'localhost:5173' } },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'WebSocket', { value: FakeSocket, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
        removeItem: (key: string) => items.delete(key),
      },
      configurable: true,
    });
    resetClientIdCache();
  });

  afterEach(() => {
    leaveRoom();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        Reflect.deleteProperty(globalThis, key);
      } else {
        Object.defineProperty(globalThis, key, { value, configurable: true });
      }
    }
    resetClientIdCache();
  });

  it('joins as a spectator with the client id and remembers the code', async () => {
    joinRoom('Widz', 'KLMN', 'spectator');
    await Promise.resolve();
    const join = sent.find((m) => m.type === 'join');
    expect(join).toMatchObject({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      nickname: 'Widz',
      roomCode: 'KLMN',
      as: 'spectator',
    });
    expect(String(join?.clientId)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(useApp.getState().lastJoinCode).toBe('KLMN');
  });

  it('joins as a player without `as`, with the same client id, and forgets the code on create', async () => {
    joinRoom('Ala', 'KLMN');
    await Promise.resolve();
    joinRoom('Ala');
    await Promise.resolve();
    const joins = sent.filter((m) => m.type === 'join');
    expect(joins).toHaveLength(2);
    expect(joins.map((m) => 'as' in m)).toEqual([false, false]);
    expect(joins[0]?.clientId).toBe(joins[1]?.clientId);
    expect(useApp.getState().lastJoinCode).toBeNull();
  });
});
