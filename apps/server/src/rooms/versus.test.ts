// Versus rules on the server (S7-80): mode and team switches, the start and join gates, two
// newsrooms in lockstep on one seed, the scoreboard, the match end (credibility, score, draw,
// forfeit, endless 600 s), per-team levelEnd with rival results paired by spawn key, and the
// minimum solve time.
import { beforeEach, describe, expect, it } from 'bun:test';
import { getLevel, getStory } from '@redakcja/content';
import {
  CREDIBILITY_START,
  DEFAULT_DIFFICULTY,
  DEFAULT_FEATURE_FLAGS,
  drawMinigameSeed,
  ENDLESS_LEVEL_ID,
  type Folder,
  type GameState,
  type LevelEndMessage,
  parseLayout,
  RECONNECT_GRACE_MS,
  type RoomMode,
  TICK_MS,
} from '@redakcja/shared';
import type { FakeConnection } from '../__fixtures__/fake-transport.ts';
import { createRoomHarness } from '../__fixtures__/room-helpers.ts';
import { versusLevelOutcome } from './registry.ts';

let room: ReturnType<typeof createRoomHarness>;

beforeEach(() => {
  room = createRoomHarness({ random: () => 0.25 });
});

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) {
    throw new Error(`${what} missing`);
  }
  return value;
}

function view(code: string) {
  return must(room.registry.inspect(code), `room ${code}`);
}

function teamsOf(code: string): [string, number, number][] {
  return view(code).players.map((p) => [p.nickname, p.team, p.colorIndex]);
}

/** A 1v1 match (Ala in Kurier, Bartek in Głos), playing. */
function playing1v1() {
  const match = room.versusRoom(['Ala', 'Bartek']);
  room.startPastBriefing(match.host);
  const [host, rival] = match.connections;
  return {
    ...match,
    host: must(host, 'host'),
    rival: must(rival, 'rival'),
    hostId: must(match.ids[0], 'host id'),
    rivalId: must(match.ids[1], 'rival id'),
  };
}

function levelEnds(connection: FakeConnection): LevelEndMessage[] {
  return connection.all('levelEnd');
}

/** Sets a team's state after its next step (the real step still runs first). */
function patchTeam(code: string, team: number, patch: (state: GameState) => Partial<GameState>) {
  room.forceStep(code, team, (result) => ({
    ...result,
    state: { ...result.state, ...patch(result.state) },
  }));
}

describe('mode and teams in the lobby', () => {
  it('deals the players into alternating teams with per-team colours and topics', () => {
    const host = room.join('Ala');
    const code = room.welcomeOf(host).roomCode;
    const guests = ['Bartek', 'Celina'].map((nickname) => room.join(nickname, { code }));
    room.lobby(must(guests[0], 'guest'), { kind: 'setMode', mode: 'versus' });
    expect(guests[0]?.last('error')?.code).toBe('notHost');
    expect(view(code).mode).toBe('coop');

    room.lobby(host, { kind: 'setMode', mode: 'versus' });
    expect(teamsOf(code)).toEqual([
      ['Ala', 0, 0],
      ['Bartek', 1, 0],
      ['Celina', 0, 1],
    ]);
    const bartek = room.welcomeOf(must(guests[0], 'guest')).playerId;
    expect(view(code).topics[bartek]).toEqual([`room:${code}`, `room:${code}:t1`]);
    expect(view(code).games).toHaveLength(2);
    expect(host.last('roomState')).toMatchObject({ mode: 'versus' });
    expect(host.last('roomState')?.players.map((p) => p.team)).toEqual([0, 1, 0]);

    room.lobby(host, { kind: 'setMode', mode: 'coop' });
    expect(teamsOf(code)).toEqual([
      ['Ala', 0, 0],
      ['Bartek', 0, 1],
      ['Celina', 0, 2],
    ]);
    expect(view(code).topics[bartek]).toEqual([`room:${code}`, `room:${code}:t0`]);
    expect(view(code).games).toHaveLength(1);
  });

  it('resets ready on a mode switch and ignores it outside the lobby', () => {
    const match = room.versusRoom(['Ala', 'Bartek']);
    expect(view(match.code).players.map((p) => p.ready)).toEqual([false, true]);
    room.lobby(match.host, { kind: 'setMode', mode: 'coop' });
    expect(view(match.code).players.map((p) => p.ready)).toEqual([false, false]);
    room.lobby(match.host, { kind: 'setMode', mode: 'versus' });
    room.lobby(must(match.connections[1], 'guest'), { kind: 'setReady', ready: true });
    room.startPastBriefing(match.host);
    room.lobby(match.host, { kind: 'setMode', mode: 'coop' });
    expect(view(match.code).mode).toBe('versus');
  });

  it('refuses co-op for more than four players with teamFull', () => {
    const match = room.versusRoom(['Ala', 'Bartek', 'Celina', 'Darek', 'Ewa']);
    room.lobby(match.host, { kind: 'setMode', mode: 'coop' });
    expect(match.host.last('error')).toEqual({
      type: 'error',
      code: 'teamFull',
      detail: '4 players at most',
    });
    expect(view(match.code).mode).toBe('versus');
  });

  it('answers featureDisabled while the versus flag is off', () => {
    const flagged = createRoomHarness({
      settings: () => ({
        maxRooms: 10,
        features: { ...DEFAULT_FEATURE_FLAGS, versus: false },
        defaultDifficulty: DEFAULT_DIFFICULTY,
      }),
    });
    const host = flagged.join('Ala');
    flagged.lobby(host, { kind: 'setMode', mode: 'versus' });
    expect(host.last('error')).toEqual({
      type: 'error',
      code: 'featureDisabled',
      detail: 'versus is not available',
    });
    expect(flagged.registry.inspect(flagged.welcomeOf(host).roomCode)?.mode).toBe('coop');
  });

  it('moves a player to the other team with a free colour, and the host moves anyone', () => {
    const match = room.versusRoom(['Ala', 'Bartek', 'Celina']);
    const [, bartek, celina] = match.connections;
    room.lobby(must(celina, 'Celina'), { kind: 'setTeam', team: 1 });
    expect(teamsOf(match.code)).toEqual([
      ['Ala', 0, 0],
      ['Bartek', 1, 0],
      ['Celina', 1, 1],
    ]);
    const celinaId = must(match.ids[2], 'Celina id');
    expect(view(match.code).topics[celinaId]).toEqual([
      `room:${match.code}`,
      `room:${match.code}:t1`,
    ]);
    room.lobby(must(bartek, 'Bartek'), { kind: 'setTeam', team: 0, playerId: celinaId });
    expect(bartek?.last('error')?.code).toBe('notHost');
    room.lobby(match.host, { kind: 'setTeam', team: 0, playerId: celinaId });
    expect(teamsOf(match.code)).toEqual([
      ['Ala', 0, 0],
      ['Bartek', 1, 0],
      ['Celina', 0, 1],
    ]);
    room.lobby(match.host, { kind: 'setTeam', team: 1, playerId: 'p99' });
    expect(match.host.last('error')?.code).toBe('invalidTarget');
  });

  it('refuses a move into a full team with teamFull', () => {
    const match = room.versusRoom(['A1', 'B1', 'A2', 'B2', 'A3', 'B3', 'A4']);
    const b1 = must(match.connections[1], 'B1');
    room.lobby(b1, { kind: 'setTeam', team: 0 });
    expect(b1.last('error')?.code).toBe('teamFull');
    expect(view(match.code).players.filter((p) => p.team === 0)).toHaveLength(4);
  });

  it('refuses the start while a team has no connected player with teamEmpty', () => {
    const match = room.versusRoom(['Ala', 'Bartek']);
    const bartek = must(match.connections[1], 'Bartek');
    room.lobby(bartek, { kind: 'setTeam', team: 0 });
    room.lobby(match.host, { kind: 'start' });
    expect(match.host.last('error')).toEqual({
      type: 'error',
      code: 'teamEmpty',
      detail: 'team 1',
    });
    expect(view(match.code).phase).toBe('lobby');
  });
});

describe('two newsrooms of one match', () => {
  it('builds both teams from one seed, each with its own players', () => {
    const match = playing1v1();
    const state = view(match.code);
    expect(state.games).toHaveLength(2);
    expect(state.games[0]?.seed).toBe(536_870_911);
    expect(state.games[1]?.seed).toBe(536_870_911);
    expect(Object.keys(state.games[0]?.players ?? {})).toEqual([match.hostId]);
    expect(Object.keys(state.games[1]?.players ?? {})).toEqual([match.rivalId]);
    expect(state.forfeited).toEqual([false, false]);
  });

  it('spawns the same stories under the same spawn keys after 100 ticks', () => {
    const match = playing1v1();
    room.ticks(100);
    const [team0, team1] = view(match.code).games;
    const spawned = (game: GameState | undefined) =>
      Object.values(game?.folders ?? {}).map((f) => [f.spawnKey, f.storyId]);
    expect(team0?.tick).toBe(100);
    expect(team1?.tick).toBe(100);
    expect(spawned(team0).length).toBeGreaterThan(0);
    expect(spawned(team1)).toEqual(spawned(team0));
  });

  it("sends each team only its own snapshots, with both teams' scores", () => {
    const match = playing1v1();
    room.ticks(2);
    const snapshots = match.host.all('snapshot');
    expect(snapshots.map((s) => s.team)).toEqual([0, 0]);
    expect(match.rival.all('snapshot').map((s) => s.team)).toEqual([1, 1]);
    const score = { score: 0, credibility: CREDIBILITY_START, resolved: 0, expired: 0 };
    expect(snapshots[1]?.scoreboard).toEqual([
      { team: 0, ...score, connected: 1 },
      { team: 1, ...score, connected: 1 },
    ]);
    // The match clock counts down from the level's own duration (l0: 240 s).
    expect(snapshots[1]?.timeLeftMs).toBe(240_000 - 2 * TICK_MS);
    expect(snapshots[1]?.players.map((p) => p.id)).toEqual([match.hostId]);
  });

  it("moves a team's player in its own newsroom only", () => {
    const match = playing1v1();
    const before = view(match.code).games.map((g) => Object.values(g.players)[0]);
    room.registry.handleMessage(match.rival, {
      type: 'input',
      seq: 1,
      move: { x: 1, y: 0 },
      actions: { interact: false, work: false },
    });
    room.ticks(1);
    const after = view(match.code).games.map((g) => Object.values(g.players)[0]);
    expect(after[0]).toMatchObject({ x: before[0]?.x, y: before[0]?.y, lastInputSeq: -1 });
    expect(after[1]?.lastInputSeq).toBe(1);
    expect(after[1]?.x).toBeGreaterThan(must(before[1], 'rival').x);
  });
});

describe('joining a running match', () => {
  it('answers matchInProgress during the briefing and the level, and lets in at results', () => {
    const match = room.versusRoom(['Ala', 'Bartek']);
    room.lobby(match.host, { kind: 'start' });
    const early = room.join('Celina', { code: match.code });
    expect(early.last('error')?.code).toBe('matchInProgress');
    room.clock.time += 60_000;
    room.ticks(1);
    const late = room.join('Darek', { code: match.code });
    expect(late.last('error')?.code).toBe('matchInProgress');
    expect(view(match.code).players).toHaveLength(2);

    patchTeam(match.code, 1, () => ({ credibility: 0 }));
    room.ticks(1);
    expect(view(match.code).phase).toBe('results');
    const after = room.join('Ewa', { code: match.code });
    expect(after.last('welcome')).toBeDefined();
    expect(teamsOf(match.code).at(-1)).toEqual(['Ewa', 0, 1]);
  });

  it('brings a reconnecting player back into its own team', () => {
    const match = playing1v1();
    const token = room.welcomeOf(match.rival).reconnectToken;
    room.registry.handleDisconnect(match.rival, false);
    room.ticks(1);
    const back = room.join('Bartek', { token });
    expect(room.welcomeOf(back).playerId).toBe(match.rivalId);
    room.ticks(2);
    expect(back.all('snapshot').map((s) => s.team)).toEqual([1, 1]);
    expect(view(match.code).topics[match.rivalId]).toEqual([
      `room:${match.code}`,
      `room:${match.code}:t1`,
    ]);
  });
});

describe('the match end', () => {
  it('ends the match when a team loses its credibility', () => {
    const match = playing1v1();
    patchTeam(match.code, 1, () => ({ credibility: 0, score: 300 }));
    room.ticks(1);
    const [won] = levelEnds(match.host);
    const [lost] = levelEnds(match.rival);
    expect(view(match.code).phase).toBe('results');
    expect(view(match.code).outcome).toEqual({ winnerTeam: 0, reason: 'credibility' });
    expect(won).toMatchObject({ team: 0, won: true, stars: 0, lossReason: null });
    expect(lost).toMatchObject({ team: 1, won: false, stars: 0, lossReason: 'credibility' });
    expect(won?.versus).toMatchObject({ winnerTeam: 0, reason: 'credibility' });
    expect(won?.versus?.teams.map((t) => [t.team, t.score, t.credibility])).toEqual([
      [0, 0, CREDIBILITY_START],
      [1, 300, 0],
    ]);
    expect(won?.stats?.map((s) => [s.playerId, s.team])).toEqual([
      [match.hostId, 0],
      [match.rivalId, 1],
    ]);
    expect(levelEnds(match.host)).toHaveLength(1);
  });

  it('gives the higher score the win when time is up, and equal scores a draw', () => {
    const match = playing1v1();
    patchTeam(match.code, 0, () => ({ score: 120, elapsedMs: 240_000 }));
    patchTeam(match.code, 1, () => ({ score: 90, elapsedMs: 240_000 }));
    room.ticks(1);
    expect(view(match.code).outcome).toEqual({ winnerTeam: 0, reason: 'score' });
    expect(match.rival.last('levelEnd')).toMatchObject({ won: false, lossReason: 'score' });

    const draw = createRoomHarness({ random: () => 0.25 });
    const tie = draw.versusRoom(['Ala', 'Bartek']);
    draw.startPastBriefing(tie.host);
    for (const team of [0, 1]) {
      draw.forceStep(tie.code, team, (r) => ({
        ...r,
        state: { ...r.state, score: 100, elapsedMs: 240_000 },
      }));
    }
    draw.ticks(1);
    expect(draw.registry.inspect(tie.code)?.outcome).toEqual({ winnerTeam: null, reason: 'draw' });
    for (const connection of tie.connections) {
      expect(connection.last('levelEnd')).toMatchObject({
        won: false,
        lossReason: null,
        versus: { winnerTeam: null, reason: 'draw' },
      });
    }
  });

  it('gives the match to the other team by forfeit once the grace runs out', () => {
    const match = playing1v1();
    room.registry.handleDisconnect(match.rival, false);
    room.clock.time += RECONNECT_GRACE_MS - 1;
    room.ticks(1);
    expect(view(match.code).phase).toBe('playing');
    room.clock.time += 1;
    room.ticks(1);
    expect(view(match.code).forfeited).toEqual([false, true]);
    expect(view(match.code).phase).toBe('results');
    expect(match.host.last('levelEnd')).toMatchObject({
      team: 0,
      won: true,
      versus: { winnerTeam: 0, reason: 'forfeit' },
    });
  });

  it('gives the match away at once when a team’s last player leaves on purpose', () => {
    const match = playing1v1();
    room.registry.handleDisconnect(match.host, true);
    room.ticks(1);
    expect(view(match.code).forfeited).toEqual([true, false]);
    expect(view(match.code).outcome).toEqual({ winnerTeam: 1, reason: 'forfeit' });
    expect(match.rival.last('levelEnd')).toMatchObject({ team: 1, won: true, lossReason: null });
  });

  it('ends endless versus at 600 s without a leaderboard entry', () => {
    const entries: unknown[] = [];
    const endless = createRoomHarness({
      random: () => 0.25,
      recordLeaderboardEntry: (entry) => entries.push(entry),
    });
    const match = endless.versusRoom(['Ala', 'Bartek']);
    endless.lobby(match.host, { kind: 'selectLevel', levelId: ENDLESS_LEVEL_ID });
    endless.lobby(must(match.connections[1], 'guest'), { kind: 'setReady', ready: true });
    endless.startPastBriefing(match.host);
    endless.ticks(1);
    expect(match.host.last('snapshot')?.timeLeftMs).toBe(600_000 - TICK_MS);
    for (const team of [0, 1]) {
      endless.forceStep(match.code, team, (r) => ({
        ...r,
        state: { ...r.state, elapsedMs: 599_950 },
      }));
    }
    endless.ticks(1);
    expect(endless.registry.inspect(match.code)?.phase).toBe('playing');
    expect(match.host.last('snapshot')?.timeLeftMs).toBe(50);
    endless.ticks(1);
    expect(endless.registry.inspect(match.code)?.phase).toBe('results');
    expect(match.host.last('levelEnd')).toMatchObject({
      levelId: ENDLESS_LEVEL_ID,
      survivedS: 600,
      versus: { winnerTeam: null, reason: 'draw' },
    });
    expect(entries).toEqual([]);
  });

  it('scores a blunder vote against the voter’s own newsroom', () => {
    const match = playing1v1();
    patchTeam(match.code, 1, (state) => ({
      credibility: 0,
      results: [
        {
          folderId: 'f9',
          spawnKey: 's9',
          storyId: 'l0-rival-only',
          outcome: 'wrong',
          reason: 'publishedFake',
          verdict: 'publish',
          scoreDelta: -50,
          credibilityDelta: -20,
          justifyingStampIds: [],
          requiredStamps: 1,
          bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
          missedStampIds: [],
        },
        ...state.results,
      ],
    }));
    room.ticks(1);
    room.lobby(match.host, { kind: 'voteBlunder', storyId: 'l0-rival-only' });
    expect(match.host.last('error')?.code).toBe('invalidMessage');
    room.lobby(match.rival, { kind: 'voteBlunder', storyId: 'l0-rival-only' });
    expect(view(match.code).blunderVotes).toEqual([
      { playerId: match.rivalId, storyId: 'l0-rival-only', rowId: null },
    ]);
  });
});

describe('a botRaid with diverging belts (l6)', () => {
  /** Team 1 takes every folder off its belt onto a table at once; team 0 leaves its belt as is. */
  function clearBelt(state: GameState): Partial<GameState> {
    const tables = ['table-0', 'table-1', 'table-2', 'table-3'];
    const used = new Set(
      Object.values(state.folders).flatMap((f) =>
        f.location.kind === 'fixture' && tables.includes(f.location.fixtureId)
          ? [f.location.fixtureId]
          : [],
      ),
    );
    const folders = { ...state.folders };
    for (const folder of Object.values(folders)) {
      if (folder.location.kind !== 'fixture' || !folder.location.fixtureId.startsWith('conveyor')) {
        continue;
      }
      const table = tables.find((t) => !used.has(t));
      if (table) {
        used.add(table);
        folders[folder.id] = { ...folder, location: { kind: 'fixture', fixtureId: table } };
      }
    }
    return { folders };
  }

  const byKey = (game: GameState | undefined) =>
    new Map(Object.values(game?.folders ?? {}).map((f) => [f.spawnKey, f] as const));

  it('keeps stories and minigame seeds by spawn key and pairs rival results by it', () => {
    const match = room.versusRoom(['Ala', 'Bartek']);
    room.lobby(match.host, { kind: 'selectLevel', levelId: 'l6-atak' });
    room.lobby(must(match.connections[1], 'guest'), { kind: 'setReady', ready: true });
    room.startPastBriefing(match.host);
    // The l6 raid starts at 60 s: 1200 ticks, with team 1 clearing its belt before each one.
    for (let i = 0; i < 1200; i++) {
      patchTeam(match.code, 1, clearBelt);
      room.ticks(1);
    }
    const [team0, team1] = view(match.code).games;
    expect(team0?.elapsedMs).toBe(60_000);
    expect(team0?.activeEvents.map((e) => e.kind)).toEqual(['botRaid']);
    const keys0 = [...byKey(team0).keys()];
    const keys1 = [...byKey(team1).keys()];
    // Team 0 met the raid with two folders on its 5-tile belt: three raid folders, not four.
    expect(keys0).toEqual(['s1', 's2', 'e0.0', 'e0.1', 'e0.2']);
    expect(keys1).toEqual(['s1', 's2', 'e0.0', 'e0.1', 'e0.2', 'e0.3']);
    for (const key of keys0) {
      const ours = must(byKey(team0).get(key), key);
      const theirs = must(byKey(team1).get(key), key);
      expect(theirs.storyId).toBe(ours.storyId);
      for (const stamp of must(getStory(ours.storyId), ours.storyId).stamps) {
        expect(drawMinigameSeed(must(team1, 'team 1'), theirs, stamp.station)).toBe(
          drawMinigameSeed(must(team0, 'team 0'), ours, stamp.station),
        );
      }
    }

    // From the next scheduled folder on, folder ids differ while spawn keys still match.
    let next0: Folder | undefined;
    let next1: Folder | undefined;
    for (let i = 0; i < 1200 && !(next0 && next1); i++) {
      room.ticks(1);
      const [g0, g1] = view(match.code).games;
      next0 = byKey(g0).get('s3');
      next1 = byKey(g1).get('s3');
    }
    expect(must(next1, 's3 of team 1').storyId).toBe(must(next0, 's3 of team 0').storyId);
    expect(next1?.id).not.toBe(next0?.id);

    patchTeam(match.code, 1, () => ({ credibility: 0 }));
    room.ticks(1);
    const end = must(match.host.last('levelEnd'), 'levelEnd');
    const rival = end.versus?.rivalResults ?? [];
    const own = new Map(end.results.map((r) => [r.spawnKey, r]));
    const paired = rival.filter((r) => own.has(r.spawnKey));
    expect(paired.map((r) => r.spawnKey)).toEqual(['s0', 's1', 's2', 'e0.0', 's3']);
    for (const result of paired) {
      expect(result.storyId).toBe(must(own.get(result.spawnKey), result.spawnKey).storyId);
    }
    const rivalEnd = must(match.connections[1], 'Bartek').last('levelEnd');
    expect(rivalEnd?.versus?.rivalResults).toEqual(end.results);
  });

  it('holds the raid back while team 0’s belt is full and keeps its spawn keys for later', () => {
    const match = room.versusRoom(['Ala', 'Bartek']);
    room.lobby(match.host, { kind: 'selectLevel', levelId: 'l6-atak' });
    room.lobby(must(match.connections[1], 'guest'), { kind: 'setReady', ready: true });
    room.startPastBriefing(match.host);
    room.ticks(1190);
    // Just before the 60 s raid, placeholder folders (far deadlines) take every free tile of
    // team 0's belt; team 1's belt stays as the schedule left it.
    const layout = must(getLevel('l6-atak'), 'l6').layout;
    const conveyors = parseLayout(layout)
      .fixtures.filter((f) => f.kind === 'conveyor')
      .map((f) => f.id);
    const jamIds: string[] = [];
    patchTeam(match.code, 0, (state) => {
      const template = must(Object.values(state.folders)[0], 'a spawned folder');
      const taken = new Set(
        Object.values(state.folders).flatMap((f) =>
          f.location.kind === 'fixture' ? [f.location.fixtureId] : [],
        ),
      );
      const folders = { ...state.folders };
      for (const [i, fixtureId] of conveyors.filter((c) => !taken.has(c)).entries()) {
        const id = `jam${i}`;
        jamIds.push(id);
        folders[id] = {
          ...template,
          id,
          spawnKey: `s${900 + i}`,
          location: { kind: 'fixture', fixtureId },
          deadlineMs: 10_000_000,
        };
      }
      return { folders };
    });
    room.ticks(20);
    const raidKeys = (game: GameState | undefined) =>
      Object.values(game?.folders ?? {})
        .map((f) => f.spawnKey)
        .filter((key) => key.startsWith('e0.'));
    const [held0, raided1] = view(match.code).games;
    expect(held0?.elapsedMs).toBe(60_500);
    expect(held0?.activeEvents).toEqual([]);
    expect(raidKeys(held0)).toEqual([]);
    expect(raidKeys(raided1)).toEqual(['e0.0', 'e0.1', 'e0.2']);

    // The belt clears: team 0's raid starts late, under the same keys, stories and seeds.
    patchTeam(match.code, 0, (state) => ({
      folders: Object.fromEntries(
        Object.entries(state.folders).filter(([id]) => !jamIds.includes(id)),
      ),
    }));
    room.ticks(2);
    const [team0, team1] = view(match.code).games;
    expect(team0?.activeEvents.map((e) => e.kind)).toEqual(['botRaid']);
    expect(raidKeys(team0)).toEqual(['e0.0', 'e0.1', 'e0.2']);
    for (const key of raidKeys(team0)) {
      const ours = must(byKey(team0).get(key), key);
      const theirs = must(byKey(team1).get(key), key);
      expect(theirs.storyId).toBe(ours.storyId);
      expect(ours.spawnedAtMs).toBeGreaterThan(theirs.spawnedAtMs);
      for (const stamp of must(getStory(ours.storyId), ours.storyId).stamps) {
        expect(drawMinigameSeed(must(team0, 'team 0'), ours, stamp.station)).toBe(
          drawMinigameSeed(must(team1, 'team 1'), theirs, stamp.station),
        );
      }
    }
  });
});

describe('the minimum solve time', () => {
  /**
   * Opens a minigame round for the host on the first spawned folder at a station that can stamp
   * it, and reports a success 200 ms later.
   */
  function answerAfter200Ms(mode: RoomMode) {
    const harness = createRoomHarness({ random: () => 0.25 });
    const match =
      mode === 'versus'
        ? harness.versusRoom(['Ala', 'Bartek'])
        : (() => {
            const host = harness.join('Ala');
            return { host, code: harness.welcomeOf(host).roomCode };
          })();
    harness.startPastBriefing(match.host);
    const hostId = harness.welcomeOf(match.host).playerId;
    let folder: Folder | undefined;
    for (let i = 0; i < 400 && !folder; i++) {
      harness.ticks(1);
      folder = Object.values(harness.registry.inspect(match.code)?.games[0]?.folders ?? {})[0];
    }
    const spawned = must(folder, 'a spawned folder');
    const game = must(harness.registry.inspect(match.code)?.games[0], 'team 0');
    const kinds = must(getStory(spawned.storyId), spawned.storyId).stamps.map((s) => s.station);
    const station = must(
      Object.values(game.stations).find((s) => kinds.includes(s.kind)),
      'a station that stamps the folder',
    );
    harness.forceStep(match.code, 0, (r) => ({
      ...r,
      state: {
        ...r.state,
        folders: {
          ...r.state.folders,
          [spawned.id]: { ...spawned, location: { kind: 'fixture', fixtureId: station.id } },
        },
        stations: {
          ...r.state.stations,
          [station.id]: { ...station, operatorId: hostId, phase: 'minigame', minigameSeed: 1 },
        },
        minigameOpenedMs: { [station.id]: r.state.elapsedMs },
      },
    }));
    harness.ticks(4);
    harness.registry.handleMessage(match.host, {
      type: 'command',
      command: { kind: 'minigameResult', stationId: station.id, success: true },
    });
    harness.ticks(1);
    return match.host
      .all('event')
      .map((m) => m.event.kind)
      .filter((kind) => kind === 'stampApplied' || kind === 'minigameFailed');
  }

  it('counts a success 200 ms after the round opened as a failure in versus', () => {
    expect(answerAfter200Ms('versus')).toEqual(['minigameFailed']);
  });

  it('counts the same success as a stamp in co-op', () => {
    expect(answerAfter200Ms('coop')).toEqual(['stampApplied']);
  });
});

describe('versusLevelOutcome', () => {
  it('gives no stars and names the loss on credibility or points', () => {
    expect(versusLevelOutcome({ winnerTeam: 1, reason: 'score' }, 1, 40)).toEqual({
      won: true,
      stars: 0,
      lossReason: null,
    });
    expect(versusLevelOutcome({ winnerTeam: 1, reason: 'score' }, 0, 40)).toEqual({
      won: false,
      stars: 0,
      lossReason: 'score',
    });
    expect(versusLevelOutcome({ winnerTeam: 1, reason: 'credibility' }, 0, 0)).toEqual({
      won: false,
      stars: 0,
      lossReason: 'credibility',
    });
    expect(versusLevelOutcome({ winnerTeam: null, reason: 'draw' }, 0, 40)).toEqual({
      won: false,
      stars: 0,
      lossReason: null,
    });
  });
});
