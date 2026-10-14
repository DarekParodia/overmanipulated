// Lobby and level lifecycle: ready gate, ready resets, roles, difficulty and the dealt run,
// results phase and replay.
import { beforeEach, describe, expect, it } from 'bun:test';
import { prepareLevelRun, runSummary } from '@redakcja/content';
import {
  BRIEFING_DURATION_MS,
  type FolderResult,
  type LevelOutcome,
  type LobbyAction,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_MS,
  type SimTuning,
  simTuning,
  step,
} from '@redakcja/shared';
import { createFakeHub, type FakeConnection } from '../__fixtures__/fake-transport.ts';
import { createRoomRegistry, type RoomRegistry } from './registry.ts';

const RESULT: FolderResult = {
  folderId: 'f1',
  spawnKey: 's0',
  storyId: 's1',
  outcome: 'correct',
  reason: 'correctImportant',
  verdict: 'publish',
  scoreDelta: 100,
  credibilityDelta: 5,
  justifyingStampIds: ['s1-image'],
  requiredStamps: 1,
  bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
  missedStampIds: [],
};

const WON: LevelOutcome = { won: true, stars: 2, lossReason: null };

let time = 0;
let fake: ReturnType<typeof createFakeHub>;
let registry: RoomRegistry;
/** When set, the injected step ends the level on the next tick. */
let endNextTick = false;
/** How the injected step ends the level. */
let endOutcome: LevelOutcome = WON;
/** The tuning the registry handed to the last simulation step. */
let lastTuning: SimTuning | null = null;

/** The injected step: the real one, ending the level on demand. */
const testStep: typeof step = (state, inputs, commands, ctx) => {
  lastTuning = ctx.tuning;
  const result = step(state, inputs, commands, ctx);
  if (!endNextTick) {
    return result;
  }
  endNextTick = false;
  return {
    ...result,
    state: {
      ...result.state,
      score: 340,
      credibility: 72,
      results: [RESULT],
      ended: endOutcome,
    },
  };
};

beforeEach(() => {
  time = 0;
  endNextTick = false;
  endOutcome = WON;
  lastTuning = null;
  fake = createFakeHub();
  registry = createRoomRegistry({ hub: fake.hub, now: () => time, step: testStep });
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

function ready(connection: FakeConnection, value = true): void {
  lobby(connection, { kind: 'setReady', ready: value });
}

/** Start as `connection`; if the room enters the briefing, let its timer run out. */
function start(connection: FakeConnection): void {
  lobby(connection, { kind: 'start' });
  if (phaseOf(connection) === 'briefing') {
    time += BRIEFING_DURATION_MS;
    registry.tick();
  }
}

function phaseOf(connection: FakeConnection) {
  return registry.inspect(welcomeOf(connection).roomCode)?.phase;
}

function readyFlags(connection: FakeConnection) {
  return registry.inspect(welcomeOf(connection).roomCode)?.players.map((p) => p.ready);
}

function threePlayerRoom() {
  const host = join('Ala');
  const code = welcomeOf(host).roomCode;
  const b = join('Bartek', code);
  const c = join('Celina', code);
  return { host, b, c, code };
}

/** Readies the guests, starts the level and ends it on the next tick. */
function playToResults(host: FakeConnection, ...guests: FakeConnection[]): void {
  for (const guest of guests) {
    ready(guest);
  }
  start(host);
  expect(phaseOf(host)).toBe('playing');
  endNextTick = true;
  registry.tick();
}

describe('ready gate', () => {
  it('refuses to start while a connected guest is not ready', () => {
    const { host, b } = threePlayerRoom();
    ready(b);
    start(host);
    expect(host.last('error')).toMatchObject({ code: 'notReady' });
    expect(host.last('error')?.detail).toContain('Celina');
    expect(phaseOf(host)).toBe('lobby');
  });

  it('starts when every guest is ready; the host is implicitly ready', () => {
    const { host, b, c } = threePlayerRoom();
    ready(b);
    ready(c);
    start(host);
    expect(host.last('error')).toBeUndefined();
    expect(phaseOf(host)).toBe('playing');
    for (const connection of [host, b, c]) {
      expect(connection.last('roomState')?.phase).toBe('playing');
      expect(connection.all('event').map((e) => e.event.kind)).toContain('gameStarted');
    }
  });

  it('lets a solo host start without anyone else', () => {
    const host = join('Ala');
    start(host);
    expect(phaseOf(host)).toBe('playing');
  });

  it('does not wait for disconnected players', () => {
    const { host, b, c } = threePlayerRoom();
    ready(b);
    registry.handleDisconnect(c, false);
    start(host);
    expect(phaseOf(host)).toBe('playing');
    // The disconnected player still holds a slot in the level and can come back into it.
    const game = registry.inspect(welcomeOf(host).roomCode)?.game;
    expect(Object.keys(game?.players ?? {})).toContain(welcomeOf(c).playerId);
  });

  it('blocks the start again when a guest takes back their ready', () => {
    const { host, b, c } = threePlayerRoom();
    ready(b);
    ready(c);
    ready(c, false);
    start(host);
    expect(host.last('error')?.code).toBe('notReady');
  });

  it('applies to the new host after a hand-over', () => {
    const { host, b, c } = threePlayerRoom();
    registry.handleDisconnect(host, true);
    expect(b.last('roomState')?.hostId).toBe(welcomeOf(b).playerId);
    start(b);
    expect(b.last('error')?.code).toBe('notReady');
    ready(c);
    start(b);
    expect(phaseOf(b)).toBe('playing');
  });
});

describe('ready resets', () => {
  it('a player joining mid-lobby starts not ready and blocks the start', () => {
    const host = join('Ala');
    const b = join('Bartek', welcomeOf(host).roomCode);
    ready(b);
    const c = join('Celina', welcomeOf(host).roomCode);
    expect(c.last('roomState')?.players.map((p) => p.ready)).toEqual([false, true, false]);
    start(host);
    expect(host.last('error')?.code).toBe('notReady');
  });

  it('clears readiness when the host selects a level', () => {
    const { host, b, c } = threePlayerRoom();
    ready(b);
    ready(c);
    lobby(host, { kind: 'selectLevel', levelId: 'l0-greybox' });
    expect(b.last('roomState')?.players.every((p) => !p.ready)).toBe(true);
  });

  it('clears readiness when a level starts', () => {
    const { host, b, c } = threePlayerRoom();
    ready(b);
    ready(c);
    start(host);
    expect(readyFlags(host)).toEqual([false, false, false]);
    expect(b.last('roomState')?.players.every((p) => !p.ready)).toBe(true);
  });

  it('ignores ready toggles while playing', () => {
    const { host, b, c } = threePlayerRoom();
    ready(b);
    ready(c);
    start(host);
    ready(b);
    expect(readyFlags(host)).toEqual([false, false, false]);
  });

  it('clears readiness when the room returns to the lobby', () => {
    const { host, b, c } = threePlayerRoom();
    playToResults(host, b, c);
    ready(b);
    expect(readyFlags(host)).toEqual([false, true, false]);
    lobby(host, { kind: 'backToLobby' });
    expect(readyFlags(host)).toEqual([false, false, false]);
  });
});

describe('level selection', () => {
  it('is host-only and rejects unknown levels', () => {
    const { host, b } = threePlayerRoom();
    lobby(b, { kind: 'selectLevel', levelId: 'l0-greybox' });
    expect(b.last('error')?.code).toBe('notHost');
    lobby(host, { kind: 'selectLevel', levelId: 'l9-nope' });
    expect(host.last('error')?.code).toBe('unknownLevel');
    expect(host.last('roomState')?.levelId).toBe('l0-greybox');
  });

  it('is ignored while playing', () => {
    const host = join('Ala');
    start(host);
    const before = host.all('roomState').length;
    lobby(host, { kind: 'selectLevel', levelId: 'l0-greybox' });
    expect(host.all('roomState')).toHaveLength(before);
    expect(phaseOf(host)).toBe('playing');
  });
});

describe('roles', () => {
  it('are non-exclusive', () => {
    const { host, b } = threePlayerRoom();
    lobby(host, { kind: 'setRole', role: 'archivist' });
    lobby(b, { kind: 'setRole', role: 'archivist' });
    expect(host.last('roomState')?.players.map((p) => p.role)).toEqual([
      'archivist',
      'archivist',
      null,
    ]);
  });

  it('cannot change while playing but can in results', () => {
    const { host, b, c, code } = threePlayerRoom();
    lobby(b, { kind: 'setRole', role: 'reporter' });
    ready(b);
    ready(c);
    start(host);
    expect(registry.inspect(code)?.game.crew[welcomeOf(b).playerId]?.role).toBe('reporter');
    lobby(b, { kind: 'setRole', role: 'photoEditor' });
    expect(registry.inspect(code)?.players[1]?.role).toBe('reporter');

    endNextTick = true;
    registry.tick();
    expect(phaseOf(host)).toBe('results');
    lobby(b, { kind: 'setRole', role: 'photoEditor' });
    expect(registry.inspect(code)?.players[1]?.role).toBe('photoEditor');
  });

  it('role and colour survive a reconnect, in the lobby and mid-level', () => {
    const { host, b, c, code } = threePlayerRoom();
    lobby(b, { kind: 'setRole', role: 'photoEditor' });
    const { reconnectToken, playerId } = welcomeOf(b);
    registry.handleDisconnect(b, false);
    const back = join('Bartek', undefined, reconnectToken);
    const me = back.last('roomState')?.players.find((p) => p.id === playerId);
    expect(me).toMatchObject({ role: 'photoEditor', colorIndex: 1, connected: true });

    ready(back);
    ready(c);
    start(host);
    registry.handleDisconnect(back, false);
    time += RECONNECT_GRACE_MS - 1;
    registry.tick();
    const again = join('Bartek', undefined, reconnectToken);
    expect(again.last('welcome')?.playerId).toBe(playerId);
    expect(registry.inspect(code)?.game.crew[playerId]?.role).toBe('photoEditor');
    const meAgain = again.last('roomState')?.players.find((p) => p.id === playerId);
    expect(meAgain).toMatchObject({ role: 'photoEditor', colorIndex: 1, connected: true });
  });

  it('a player joining mid-level enters the running level', () => {
    const host = join('Ala');
    start(host);
    const late = join('Dawid', welcomeOf(host).roomCode);
    const game = registry.inspect(welcomeOf(host).roomCode)?.game;
    expect(game?.players[welcomeOf(late).playerId]).toBeDefined();
    expect(game?.crew[welcomeOf(late).playerId]).toMatchObject({ role: null });
    expect(late.last('roomState')?.phase).toBe('playing');
  });
});

describe('results and back to lobby', () => {
  it('sends levelEnd and moves the room to results when the level ends', () => {
    const { host, b, c, code } = threePlayerRoom();
    playToResults(host, b, c);
    // l0 deals from a bag, so the thresholds and best score are the dealt run's (S7-23).
    const run = registry.inspect(code)?.run?.summary;
    if (!run?.stars) {
      throw new Error('a campaign run has star thresholds');
    }
    for (const connection of [host, b, c]) {
      expect(connection.last('levelEnd')).toEqual({
        type: 'levelEnd',
        levelId: 'l0-greybox',
        difficulty: 'normal',
        won: true,
        stars: 2,
        score: 340,
        credibility: 72,
        results: [RESULT],
        lossReason: null,
        starThresholds: run.stars,
        maxScore: run.maxScore,
      });
      expect(connection.last('roomState')?.phase).toBe('results');
    }
    // No more simulation once the level is over.
    const snapshots = host.all('snapshot').length;
    registry.tick();
    expect(host.all('snapshot')).toHaveLength(snapshots);
    expect(host.all('levelEnd')).toHaveLength(1);
  });

  it("sends why the level was lost, the level's star thresholds and its best score", () => {
    const host = join('Ala');
    // Every campaign level deals from a bag since S7-60 and S7-63, so the thresholds and best
    // score are those of the run dealt for the room's seed.
    lobby(host, { kind: 'selectLevel', levelId: 'l6-atak' });
    endOutcome = { won: false, stars: 0, lossReason: 'credibility' };
    playToResults(host);
    const run = registry.inspect(welcomeOf(host).roomCode)?.run;
    if (!run?.summary.stars) {
      throw new Error('a campaign run has star thresholds');
    }
    const dealt = prepareLevelRun('l6-atak', { seed: run.seed, difficulty: 'normal' });
    expect(dealt && runSummary(dealt)).toEqual(run.summary);
    expect(host.last('levelEnd')).toMatchObject({
      levelId: 'l6-atak',
      difficulty: 'normal',
      won: false,
      stars: 0,
      lossReason: 'credibility',
      starThresholds: run.summary.stars,
      maxScore: run.summary.maxScore,
    });
  });

  it('only the host goes back to the lobby; the finished run is dropped', () => {
    const { host, b, c, code } = threePlayerRoom();
    playToResults(host, b, c);
    lobby(b, { kind: 'backToLobby' });
    expect(b.last('error')?.code).toBe('notHost');
    expect(phaseOf(host)).toBe('results');

    lobby(host, { kind: 'backToLobby' });
    expect(b.last('roomState')?.phase).toBe('lobby');
    const game = registry.inspect(code)?.game;
    expect(game).toMatchObject({ ended: null, results: [], score: 0, tick: 0 });
    expect(Object.keys(game?.players ?? {})).toHaveLength(0);
  });

  it('ignores backToLobby outside of results', () => {
    const host = join('Ala');
    lobby(host, { kind: 'backToLobby' });
    expect(phaseOf(host)).toBe('lobby');
    start(host);
    lobby(host, { kind: 'backToLobby' });
    expect(phaseOf(host)).toBe('playing');
  });

  it('starts a second run fresh after going back to the lobby', () => {
    const { host, b, c, code } = threePlayerRoom();
    playToResults(host, b, c);
    lobby(host, { kind: 'backToLobby' });
    ready(b);
    ready(c);
    start(host);
    expect(phaseOf(host)).toBe('playing');
    const game = registry.inspect(code)?.game;
    expect(game).toMatchObject({ ended: null, results: [], tick: 0 });
    expect(Object.keys(game?.players ?? {})).toHaveLength(3);
    registry.tick();
    expect(host.last('snapshot')?.tick).toBe(1);
  });

  it('lets the host replay straight from results once everyone is ready', () => {
    const { host, b, c, code } = threePlayerRoom();
    playToResults(host, b, c);
    start(host);
    expect(host.last('error')?.code).toBe('notReady');
    expect(phaseOf(host)).toBe('results');
    ready(b);
    ready(c);
    start(host);
    expect(phaseOf(host)).toBe('playing');
    expect(registry.inspect(code)?.game.ended).toBeNull();
  });

  it('accepts new players during results, who join the next run', () => {
    const { host, b, c, code } = threePlayerRoom();
    playToResults(host, b, c);
    const d = join('Dawid', code);
    expect(welcomeOf(d).roomCode).toBe(code);
    expect(d.last('roomState')?.phase).toBe('results');
    expect(registry.inspect(code)?.game.players[welcomeOf(d).playerId]).toBeUndefined();

    lobby(host, { kind: 'backToLobby' });
    for (const guest of [b, c, d]) {
      ready(guest);
    }
    start(host);
    expect(registry.inspect(code)?.game.players[welcomeOf(d).playerId]).toBeDefined();
  });

  it('hands the host over when the host leaves during results', () => {
    const { host, b, c } = threePlayerRoom();
    playToResults(host, b, c);
    registry.handleDisconnect(host, true);
    expect(b.last('roomState')?.hostId).toBe(welcomeOf(b).playerId);
    lobby(b, { kind: 'backToLobby' });
    expect(c.last('roomState')?.phase).toBe('lobby');
  });
});

describe('difficulty and the dealt run (S7-23)', () => {
  /** Random draws in order: four for the room code, then each run seed and sim seed. */
  let draws: number[] = [];
  const seedOf = (draw: number) => Math.floor(draw * 0x7fffffff);

  beforeEach(() => {
    draws = [0.1, 0.2, 0.3, 0.4, 0.25, 0.5, 0.75, 0.6];
    registry = createRoomRegistry({
      hub: fake.hub,
      now: () => time,
      step: testStep,
      random: () => draws.shift() ?? 0.9,
    });
  });

  /** What `prepareRun` deals for this level, seed and difficulty over the bundled content. */
  function expectedRun(levelId: string, seed: number, difficulty: 'normal' | 'hard') {
    const run = prepareLevelRun(levelId, { seed, difficulty });
    if (!run) {
      throw new Error(`no level ${levelId}`);
    }
    return run;
  }

  /** Selects l1 on Trudny and opens the briefing (solo host). */
  function briefHardL1(host: FakeConnection): void {
    lobby(host, { kind: 'selectLevel', levelId: 'l1-burza' });
    lobby(host, { kind: 'setDifficulty', difficulty: 'hard' });
    lobby(host, { kind: 'start' });
    expect(phaseOf(host)).toBe('briefing');
  }

  it('starts every room on Normal with no run', () => {
    const host = join('Ala');
    expect(host.last('roomState')).toMatchObject({ difficulty: 'normal', run: null });
    expect(registry.inspect(welcomeOf(host).roomCode)).toMatchObject({
      difficulty: 'normal',
      run: null,
    });
  });

  it("lets the host set 'hard': broadcast to everyone, and every ready resets", () => {
    const { host, b, c, code } = threePlayerRoom();
    ready(b);
    ready(c);
    lobby(host, { kind: 'setDifficulty', difficulty: 'hard' });
    for (const connection of [host, b, c]) {
      expect(connection.last('roomState')).toMatchObject({ difficulty: 'hard', run: null });
    }
    expect(readyFlags(host)).toEqual([false, false, false]);
    expect(registry.inspect(code)?.difficulty).toBe('hard');
    // The difficulty stays when the host picks another level.
    lobby(host, { kind: 'selectLevel', levelId: 'l2-wybory' });
    expect(b.last('roomState')).toMatchObject({ levelId: 'l2-wybory', difficulty: 'hard' });
  });

  it('answers a guest with notHost and changes nothing', () => {
    const { host, b, c, code } = threePlayerRoom();
    ready(c);
    lobby(b, { kind: 'setDifficulty', difficulty: 'expert' });
    expect(b.last('error')?.code).toBe('notHost');
    expect(registry.inspect(code)?.difficulty).toBe('normal');
    expect(readyFlags(host)).toEqual([false, false, true]);
  });

  it('is ignored in the briefing, while playing and on the results screen', () => {
    const host = join('Ala');
    const code = welcomeOf(host).roomCode;
    const tryHard = () => {
      const before = host.all('roomState').length;
      lobby(host, { kind: 'setDifficulty', difficulty: 'hard' });
      expect(host.all('roomState')).toHaveLength(before);
      expect(registry.inspect(code)?.difficulty).toBe('normal');
    };
    lobby(host, { kind: 'start' });
    expect(phaseOf(host)).toBe('briefing');
    tryHard();
    time += BRIEFING_DURATION_MS;
    registry.tick();
    expect(phaseOf(host)).toBe('playing');
    tryHard();
    endNextTick = true;
    registry.tick();
    expect(phaseOf(host)).toBe('results');
    tryHard();
    expect(host.last('error')).toBeUndefined();
  });

  it('deals the run at the briefing: roomState.run equals runSummary(prepareRun(...))', () => {
    const host = join('Ala');
    const code = welcomeOf(host).roomCode;
    briefHardL1(host);
    const summary = runSummary(expectedRun('l1-burza', 536_870_911, 'hard'));
    expect(seedOf(0.25)).toBe(536_870_911);
    expect(registry.inspect(code)?.run).toEqual({ seed: 536_870_911, summary });
    expect(host.last('roomState')?.run).toEqual(summary);
    // Trudny deals 18 slots on l1 (the bag's timing, whatever the pool holds).
    expect(summary.folders).toBe(18);
    // The run seed stays on the server: it would spoil the folder sequence.
    expect(JSON.stringify(host.last('roomState'))).not.toContain('536870911');

    time += BRIEFING_DURATION_MS;
    registry.tick();
    expect(phaseOf(host)).toBe('playing');
    // The sim seed is its own draw, after the run seed.
    expect(registry.inspect(code)?.game.seed).toBe(seedOf(0.5));
    expect(host.last('roomState')?.run).toEqual(summary);
    registry.tick();
    expect(lastTuning).toEqual(simTuning('hard'));
    expect(lastTuning).toEqual({ workTimeFactor: 1.15, lockoutFactor: 1.5, penaltyFactor: 1.25 });
  });

  it('gives a spawned folder the bagStation of its schedule entry', () => {
    const host = join('Ala');
    briefHardL1(host);
    time += BRIEFING_DURATION_MS;
    registry.tick();
    const entry = expectedRun('l1-burza', 536_870_911, 'hard').level.schedule[0];
    expect(entry?.station).toBeDefined();
    for (let i = 0; i < 200 && (host.last('snapshot')?.folders.length ?? 0) === 0; i++) {
      registry.tick();
    }
    const [folder] = host.last('snapshot')?.folders ?? [];
    expect(folder).toMatchObject({
      spawnKey: 's0',
      storyId: entry?.storyId,
      bagStation: entry?.station,
      spawnedAtMs: (entry?.atS ?? Number.NaN) * 1000,
    });
  });

  it('ends with the difficulty and the thresholds and best score of the run', () => {
    const host = join('Ala');
    briefHardL1(host);
    const summary = runSummary(expectedRun('l1-burza', 536_870_911, 'hard'));
    time += BRIEFING_DURATION_MS;
    registry.tick();
    endOutcome = { won: false, stars: 0, lossReason: 'credibility' };
    endNextTick = true;
    registry.tick();
    expect(host.last('levelEnd')).toMatchObject({
      levelId: 'l1-burza',
      difficulty: 'hard',
      lossReason: 'credibility',
      starThresholds: summary.stars,
      maxScore: summary.maxScore,
    });
    // The results screen still shows the run that was played.
    expect(host.last('roomState')).toMatchObject({ phase: 'results', run: summary });
  });

  it('draws a new run seed for a replay and drops the run back in the lobby', () => {
    const host = join('Ala');
    const code = welcomeOf(host).roomCode;
    briefHardL1(host);
    time += BRIEFING_DURATION_MS;
    registry.tick();
    endNextTick = true;
    registry.tick();
    expect(phaseOf(host)).toBe('results');

    // Replay straight from the results screen: a new briefing deals a new run.
    lobby(host, { kind: 'start' });
    expect(phaseOf(host)).toBe('briefing');
    const replay = registry.inspect(code)?.run;
    expect(replay?.seed).toBe(seedOf(0.75));
    expect(replay?.seed).not.toBe(536_870_911);
    expect(replay?.summary).toEqual(runSummary(expectedRun('l1-burza', seedOf(0.75), 'hard')));

    time += BRIEFING_DURATION_MS;
    registry.tick();
    endNextTick = true;
    registry.tick();
    lobby(host, { kind: 'backToLobby' });
    expect(host.last('roomState')).toMatchObject({
      phase: 'lobby',
      levelId: 'l1-burza',
      difficulty: 'hard',
      run: null,
    });
    expect(registry.inspect(code)?.run).toBeNull();
  });
});
