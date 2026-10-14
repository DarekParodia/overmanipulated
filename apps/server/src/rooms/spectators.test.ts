// Spectators on the server (S7-81): the Widownia toggle and its gates, the cap, joining in any
// phase with a sync, the 10 Hz snapshots and 1 Hz stats on the spectator topic, spectators kept
// out of every player gate, a spectator host, switching between playing and watching, and the
// versus embargo on verdicts.
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_FEATURE_FLAGS,
  type FolderResult,
  type GameEvent,
  type GameState,
  MAX_SPECTATORS,
  type ServerMessage,
  type TeamIndex,
  TICK_MS,
} from '@redakcja/shared';
import type { FakeConnection } from '../__fixtures__/fake-transport.ts';
import { createRoomHarness } from '../__fixtures__/room-helpers.ts';

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

function codeOf(connection: FakeConnection): string {
  return room.welcomeOf(connection).roomCode;
}

/** A co-op host with the Widownia open. */
function openRoom() {
  const host = room.join('Ala');
  const code = codeOf(host);
  room.lobby(host, { kind: 'setSpectatorsAllowed', allowed: true });
  return { host, code };
}

/** A 1v1 versus lobby (Ala in Kurier, Bartek in Głos) with the Widownia open. */
function versusLobby() {
  const match = room.versusRoom(['Ala', 'Bartek']);
  room.lobby(match.host, { kind: 'setSpectatorsAllowed', allowed: true });
  return { ...match, rival: must(match.connections[1], 'Bartek') };
}

/** The co-op level ends (lost on credibility) at the next step. */
function endCoop(code: string): void {
  room.forceStep(code, 0, (r) => ({
    ...r,
    state: {
      ...r.state,
      credibility: 0,
      ended: { won: false, stars: 0, lossReason: 'credibility' },
    },
  }));
}

function spectate(code: string, nickname = 'Widz'): FakeConnection {
  return room.join(nickname, { code, as: 'spectator' });
}

function specTopic(code: string): ServerMessage[] {
  return room.onTopic(`room:${code}:spec`);
}

function ofType<T extends ServerMessage['type']>(
  messages: ServerMessage[],
  type: T,
): Extract<ServerMessage, { type: T }>[] {
  return messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
}

describe('joining the Widownia', () => {
  it('opens and closes only for the host, and is closed in a new room', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    const guest = room.join('Bartek', { code });
    expect(host.last('roomState')?.spectatorsAllowed).toBe(false);
    expect(spectate(code).last('error')?.code).toBe('spectatorsOff');

    room.lobby(guest, { kind: 'setSpectatorsAllowed', allowed: true });
    expect(guest.last('error')?.code).toBe('notHost');
    room.lobby(host, { kind: 'setSpectatorsAllowed', allowed: true });
    expect(host.last('roomState')?.spectatorsAllowed).toBe(true);
    const watcher = spectate(code);
    expect(watcher.last('error')).toBeUndefined();
    expect(watcher.last('roomState')?.spectators).toEqual([
      { id: room.welcomeOf(watcher).playerId, nickname: 'Widz', connected: true },
    ]);

    // Closing it turns new spectators away and keeps the ones already watching.
    room.lobby(host, { kind: 'setSpectatorsAllowed', allowed: false });
    expect(spectate(code, 'Drugi').last('error')?.code).toBe('spectatorsOff');
    expect(view(code).spectators.map((s) => s.nickname)).toEqual(['Widz']);
  });

  it('caps the Widownia at 8 with spectatorsFull', () => {
    const { code } = openRoom();
    for (let i = 0; i < MAX_SPECTATORS; i++) {
      expect(spectate(code, `Widz ${i + 1}`).last('error')).toBeUndefined();
    }
    expect(spectate(code, 'Widz 9').last('error')).toEqual({
      type: 'error',
      code: 'spectatorsFull',
    });
    expect(view(code).spectators).toHaveLength(8);
    expect(view(code).players).toHaveLength(1);
  });

  it('answers featureDisabled while the spectators flag is off', () => {
    let spectators = true;
    const flagged = createRoomHarness({
      settings: () => ({
        maxRooms: 10,
        features: { ...DEFAULT_FEATURE_FLAGS, spectators },
        defaultDifficulty: DEFAULT_DIFFICULTY,
      }),
    });
    const host = flagged.join('Ala');
    const code = flagged.welcomeOf(host).roomCode;
    flagged.lobby(host, { kind: 'setSpectatorsAllowed', allowed: true });
    spectators = false;
    const disabled: ServerMessage = {
      type: 'error',
      code: 'featureDisabled',
      detail: 'spectators are not available',
    };
    expect(flagged.join('Widz', { code, as: 'spectator' }).last('error')).toEqual(disabled);
    expect(flagged.join('Pani', { as: 'spectator' }).last('error')).toEqual(disabled);
    flagged.lobby(host, { kind: 'setSpectatorsAllowed', allowed: false });
    flagged.lobby(host, { kind: 'setSpectatorsAllowed', allowed: true });
    expect(host.last('error')).toEqual(disabled);
    flagged.lobby(host, { kind: 'setSpectator', spectator: true });
    expect(host.last('error')).toEqual(disabled);
    expect(flagged.registry.inspect(code)?.spectators).toEqual([]);
    expect(flagged.registry.roomCount).toBe(1);
  });

  it('announces a spectator in the roomState only, never as a playerJoined event', () => {
    const { host, code } = openRoom();
    const guest = room.join('Bartek', { code });
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.startPastBriefing(host);
    room.ticks(2);
    const teamEvents = room.onTopic(`room:${code}:t0`).filter((m) => m.type === 'event').length;
    const watcher = spectate(code);
    expect(room.onTopic(`room:${code}:t0`).filter((m) => m.type === 'event')).toHaveLength(
      teamEvents,
    );
    expect(host.last('roomState')?.spectators.map((s) => s.id)).toEqual([
      room.welcomeOf(watcher).playerId,
    ]);
    expect(host.last('roomState')?.players).toHaveLength(2);
  });

  it('syncs a spectator who arrives mid-match with both newsrooms and the counters', () => {
    const match = versusLobby();
    room.startPastBriefing(match.host);
    room.ticks(5);
    const watcher = spectate(match.code);
    expect(watcher.received.map((m) => m.type)).toEqual([
      'welcome',
      'roomState',
      'snapshot',
      'snapshot',
      'matchStats',
    ]);
    const [first, second] = watcher.all('snapshot');
    expect([first?.team, first?.tick, second?.team, second?.tick]).toEqual([0, 5, 1, 5]);
    expect(first?.scoreboard?.map((s) => s.team)).toEqual([0, 1]);
    expect(watcher.last('matchStats')).toMatchObject({
      tick: 5,
      players: [
        { playerId: match.ids[0], team: 0, verdicts: 0 },
        { playerId: match.ids[1], team: 1, verdicts: 0 },
      ],
      teams: [
        { team: 0, connected: 1 },
        { team: 1, connected: 1 },
      ],
    });
    expect(view(match.code).topics[room.welcomeOf(watcher).playerId]).toEqual([
      `room:${match.code}`,
      `room:${match.code}:spec`,
    ]);
  });

  it('syncs a spectator at the results with each newsroom’s level end', () => {
    const match = versusLobby();
    room.startPastBriefing(match.host);
    room.forceStep(match.code, 1, (r) => ({ ...r, state: { ...r.state, credibility: 0 } }));
    room.ticks(1);
    expect(view(match.code).phase).toBe('results');
    const watcher = spectate(match.code);
    expect(watcher.received.map((m) => m.type)).toEqual([
      'welcome',
      'roomState',
      'snapshot',
      'snapshot',
      'matchStats',
      'levelEnd',
      'levelEnd',
    ]);
    expect(watcher.all('levelEnd').map((m) => [m.team, m.won, m.versus?.winnerTeam])).toEqual([
      [0, true, 0],
      [1, false, 0],
    ]);
  });

  it('resyncs a reconnecting spectator', () => {
    const { host, code } = openRoom();
    const watcher = spectate(code);
    room.startPastBriefing(host);
    room.ticks(3);
    room.registry.handleDisconnect(watcher, false);
    const back = room.join('Widz', { token: room.welcomeOf(watcher).reconnectToken });
    expect(back.received.map((m) => m.type)).toEqual([
      'welcome',
      'roomState',
      'snapshot',
      'matchStats',
    ]);
    expect(back.last('snapshot')).toMatchObject({ tick: 3, team: 0 });
  });
});

describe('the spectator topic', () => {
  it('carries every 2nd snapshot of both newsrooms (10 Hz) and the stats every 20 ticks', () => {
    const match = versusLobby();
    spectate(match.code);
    room.startPastBriefing(match.host);
    room.ticks(40);
    const spec = specTopic(match.code);
    const snapshots = ofType(spec, 'snapshot');
    expect(snapshots).toHaveLength(40);
    expect(snapshots.slice(0, 4).map((s) => [s.tick, s.team])).toEqual([
      [2, 0],
      [2, 1],
      [4, 0],
      [4, 1],
    ]);
    expect(snapshots.every((s) => s.tick % 2 === 0)).toBe(true);
    // 2 ticks of 50 ms: every 100 ms per newsroom.
    expect(2 * TICK_MS).toBe(100);
    expect(ofType(spec, 'matchStats').map((m) => m.tick)).toEqual([20, 40]);
    // Players' own topics keep the full 20 Hz and never get spectator messages.
    expect(match.host.all('snapshot')).toHaveLength(40);
    expect(match.host.all('spectatorEvent')).toEqual([]);
    expect(match.host.all('matchStats')).toEqual([]);
    expect(match.rival.all('snapshot').every((s) => s.team === 1)).toBe(true);
  });

  it('sends a co-op room’s team-0 snapshots and its events as spectator events', () => {
    const { host, code } = openRoom();
    const watcher = spectate(code);
    room.startPastBriefing(host);
    room.ticks(400);
    const snapshots = watcher.all('snapshot');
    expect(snapshots).toHaveLength(200);
    expect(new Set(snapshots.map((s) => s.team))).toEqual(new Set([0]));
    expect(snapshots[0]?.scoreboard).toBeUndefined();
    expect(watcher.last('matchStats')?.teams.map((t) => t.team)).toEqual([0]);
    const events = watcher.all('spectatorEvent');
    expect(events.some((m) => m.event.kind === 'folderSpawned' && m.team === 0)).toBe(true);
    expect(watcher.all('event').map((m) => m.event.kind)).toEqual(['gameStarted']);
  });

  it('publishes nothing on the spectator topic while no spectator is connected', () => {
    const match = versusLobby();
    room.startPastBriefing(match.host);
    room.ticks(40);
    expect(specTopic(match.code)).toEqual([]);
  });
});

describe('spectators and the player gates', () => {
  it('never blocks the ready gate or the briefing, and ignores their input', () => {
    const { host, code } = openRoom();
    const guest = room.join('Bartek', { code });
    const watcher = spectate(code);
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.lobby(host, { kind: 'start' });
    expect(view(code).phase).toBe('briefing');
    room.lobby(watcher, { kind: 'skipBriefing' });
    expect(view(code).briefing?.skippedBy).toEqual([]);
    room.lobby(host, { kind: 'skipBriefing' });
    room.lobby(guest, { kind: 'skipBriefing' });
    expect(view(code).phase).toBe('playing');

    const watcherId = room.welcomeOf(watcher).playerId;
    room.registry.handleMessage(watcher, {
      type: 'input',
      seq: 0,
      move: { x: 1, y: 0 },
      actions: { interact: true, work: true },
    });
    room.registry.handleMessage(watcher, {
      type: 'command',
      command: { kind: 'ping', ping: 'fake' },
    });
    room.lobby(watcher, { kind: 'setPaused', paused: true });
    room.ticks(2);
    expect(Object.keys(view(code).game.players)).not.toContain(watcherId);
    expect(view(code).paused).toBe(false);
    expect(view(code).stats.map((s) => s.playerId)).not.toContain(watcherId);
  });

  it('refuses the solo pause while a spectator watches', () => {
    const { host, code } = openRoom();
    spectate(code);
    room.startPastBriefing(host);
    room.lobby(host, { kind: 'setPaused', paused: true });
    expect(view(code).paused).toBe(false);
  });

  it('keeps a spectator out of the blunder vote and its role or ready flag', () => {
    const { host, code } = openRoom();
    const watcher = spectate(code);
    room.lobby(watcher, { kind: 'setReady', ready: true });
    room.lobby(watcher, { kind: 'setRole', role: 'reporter' });
    expect(watcher.last('roomState')?.players).toHaveLength(1);
    room.startPastBriefing(host);
    endCoop(code);
    room.ticks(1);
    expect(view(code).phase).toBe('results');
    // A player voting for a story outside the run gets invalidMessage; a spectator gets nothing.
    room.lobby(host, { kind: 'voteBlunder', storyId: 'nie-ma-takiej' });
    expect(host.last('error')?.code).toBe('invalidMessage');
    room.lobby(watcher, { kind: 'voteBlunder', storyId: 'nie-ma-takiej' });
    expect(watcher.last('error')).toBeUndefined();
    expect(view(code).blunderVotes).toEqual([]);
  });

  it('lets a spectator host create the room, open to spectators, and start it', () => {
    const teacher = room.join('Pani', { as: 'spectator' });
    const code = codeOf(teacher);
    expect(teacher.last('roomState')).toMatchObject({
      hostId: room.welcomeOf(teacher).playerId,
      spectatorsAllowed: true,
      players: [],
    });
    room.lobby(teacher, { kind: 'start' });
    expect(teacher.last('error')).toEqual({ type: 'error', code: 'teamEmpty', detail: 'team 0' });
    const ala = room.join('Ala', { code });
    const bartek = room.join('Bartek', { code });
    room.lobby(ala, { kind: 'setReady', ready: true });
    room.lobby(teacher, { kind: 'start' });
    expect(teacher.last('error')).toEqual({
      type: 'error',
      code: 'notReady',
      detail: 'waiting for Bartek',
    });
    room.lobby(bartek, { kind: 'setReady', ready: true });
    room.startPastBriefing(teacher);
    expect(view(code).phase).toBe('playing');
    expect(Object.keys(view(code).game.players)).toEqual([
      room.welcomeOf(ala).playerId,
      room.welcomeOf(bartek).playerId,
    ]);
    room.ticks(2);
    expect(teacher.all('snapshot').map((s) => s.tick)).toEqual([2]);
  });

  it('hands the host to a connected player before a spectator', () => {
    const { host, code } = openRoom();
    spectate(code);
    const guest = room.join('Bartek', { code });
    room.registry.handleDisconnect(host, true);
    expect(view(code).hostId).toBe(room.welcomeOf(guest).playerId);
  });
});

describe('switching between playing and watching', () => {
  it('moves a player to the Widownia and back with its topics and a fresh colour', () => {
    const { host, code } = openRoom();
    const guest = room.join('Bartek', { code });
    const guestId = room.welcomeOf(guest).playerId;
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.lobby(guest, { kind: 'setSpectator', spectator: true });
    expect(view(code).spectators.map((s) => s.id)).toEqual([guestId]);
    expect(view(code).topics[guestId]).toEqual([`room:${code}`, `room:${code}:spec`]);
    room.lobby(guest, { kind: 'setSpectator', spectator: false });
    expect(view(code).players.map((p) => [p.id, p.colorIndex, p.ready])).toEqual([
      [room.welcomeOf(host).playerId, 0, false],
      [guestId, 1, false],
    ]);
    expect(view(code).topics[guestId]).toEqual([`room:${code}`, `room:${code}:t0`]);
  });

  it('lets only the host move someone else, and a guest only into an open Widownia', () => {
    const host = room.join('Ala');
    const code = codeOf(host);
    const guest = room.join('Bartek', { code });
    const guestId = room.welcomeOf(guest).playerId;
    const hostId = room.welcomeOf(host).playerId;
    room.lobby(guest, { kind: 'setSpectator', spectator: true });
    expect(guest.last('error')?.code).toBe('spectatorsOff');
    room.lobby(guest, { kind: 'setSpectator', spectator: true, playerId: hostId });
    expect(guest.last('error')?.code).toBe('notHost');
    // The host moves anyone, itself included (a teacher who will only watch).
    room.lobby(host, { kind: 'setSpectator', spectator: true });
    expect(view(code).spectators.map((s) => s.id)).toEqual([hostId]);
    room.lobby(host, { kind: 'setSpectator', spectator: true, playerId: 'p99' });
    expect(host.last('error')?.code).toBe('invalidTarget');
    room.lobby(host, { kind: 'setSpectator', spectator: true, playerId: guestId });
    expect(view(code).players).toEqual([]);
  });

  it('answers teamFull when no newsroom has a free seat', () => {
    const { host, code } = openRoom();
    for (const nickname of ['B', 'C', 'D']) {
      room.join(nickname, { code });
    }
    const watcher = spectate(code);
    room.lobby(watcher, { kind: 'setSpectator', spectator: false });
    expect(watcher.last('error')).toEqual({ type: 'error', code: 'teamFull' });
    expect(view(code).players).toHaveLength(4);
    room.lobby(host, { kind: 'setSpectator', spectator: true });
    room.lobby(watcher, { kind: 'setSpectator', spectator: false });
    expect(view(code).spectators.map((s) => s.nickname)).toEqual(['Ala']);
  });

  it('returns a versus player to the team it left when that team has a seat', () => {
    const match = versusLobby();
    room.lobby(match.rival, { kind: 'setSpectator', spectator: true });
    expect(view(match.code).spectators.map((s) => s.team)).toEqual([1]);
    room.lobby(match.rival, { kind: 'setSpectator', spectator: false });
    expect(view(match.code).players.map((p) => [p.nickname, p.team])).toEqual([
      ['Ala', 0],
      ['Bartek', 1],
    ]);
  });

  it('only switches in the lobby or the results', () => {
    const { host, code } = openRoom();
    const guest = room.join('Bartek', { code });
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.startPastBriefing(host);
    room.lobby(guest, { kind: 'setSpectator', spectator: true });
    expect(view(code).spectators).toEqual([]);
  });

  it('syncs a player who starts watching at the results', () => {
    const { host, code } = openRoom();
    const guest = room.join('Bartek', { code });
    room.lobby(guest, { kind: 'setReady', ready: true });
    room.startPastBriefing(host);
    endCoop(code);
    room.ticks(1);
    const before = guest.received.length;
    room.lobby(guest, { kind: 'setSpectator', spectator: true });
    expect(guest.received.slice(before).map((m) => m.type)).toEqual([
      'roomState',
      'snapshot',
      'matchStats',
      'levelEnd',
    ]);
  });
});

/** A verdict result as the desk would score it (a wrong publish). */
function wrongVerdict(folderId: string, spawnKey: string, storyId: string): FolderResult {
  return {
    folderId,
    spawnKey,
    storyId,
    outcome: 'wrong',
    reason: 'publishedFake',
    verdict: 'publish',
    scoreDelta: -40,
    credibilityDelta: -15,
    justifyingStampIds: [],
    requiredStamps: 1,
    bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
  };
}

describe('the versus embargo', () => {
  function folderOf(game: GameState | undefined, spawnKey: string) {
    return Object.values(game?.folders ?? {}).find((f) => f.spawnKey === spawnKey);
  }

  /** The team's next step closes `spawnKey` with a verdict by `playerId` (and extra events). */
  function closeWithVerdict(
    code: string,
    team: TeamIndex,
    spawnKey: string,
    playerId: string,
    extra: (state: GameState) => GameEvent[] = () => [],
  ): FolderResult {
    const folder = must(folderOf(view(code).games[team], spawnKey), `${spawnKey} of ${team}`);
    const result = wrongVerdict(folder.id, spawnKey, folder.storyId);
    room.forceStep(code, team, (r) => {
      const { [folder.id]: _closed, ...folders } = r.state.folders;
      return {
        state: { ...r.state, folders, results: [...r.state.results, result] },
        events: [
          ...r.events,
          { ...result, kind: 'verdictResult', playerId, verdict: 'publish' },
          ...extra(r.state),
        ],
      };
    });
    room.ticks(1);
    return result;
  }

  /** Plays a watched 1v1 until both newsrooms hold `spawnKey`. */
  function watchedMatchWith(spawnKey: string) {
    const match = versusLobby();
    const watcher = spectate(match.code);
    room.startPastBriefing(match.host);
    for (let i = 0; i < 2000; i++) {
      const [g0, g1] = view(match.code).games;
      if (folderOf(g0, spawnKey) && folderOf(g1, spawnKey)) {
        break;
      }
      room.ticks(1);
    }
    return {
      ...match,
      watcher,
      hostId: must(match.ids[0], 'Ala'),
      rivalId: must(match.ids[1], 'B'),
    };
  }

  /** Every spectator message that mentions the folder (id or spawn key) of `team`. */
  function aboutFolder(code: string, team: TeamIndex, result: FolderResult) {
    return ofType(specTopic(code), 'spectatorEvent').filter((m) => {
      const json = JSON.stringify(m.event);
      return (
        m.team === team &&
        (json.includes(`"${result.folderId}"`) || json.includes(`"${result.spawnKey}"`))
      );
    });
  }

  it('masks team 0’s verdict on s2 until team 1 closes s2, then reveals both', () => {
    const match = watchedMatchWith('s2');
    const ours = closeWithVerdict(match.code, 0, 's2', match.hostId);
    room.ticks(30);

    // The players' own topic has the whole result at once.
    expect(match.host.all('event').some((m) => m.event.kind === 'verdictResult')).toBe(true);
    // The Widownia gets who closed which folder, never the verdict, outcome, reason or points.
    const shown = aboutFolder(match.code, 0, ours).filter((m) => m.event.kind !== 'folderSpawned');
    expect(shown.map((m) => m.event)).toEqual([
      {
        kind: 'verdictMasked',
        playerId: match.hostId,
        folderId: ours.folderId,
        spawnKey: 's2',
        closedBy: 'verdict',
      },
    ]);
    for (const message of specTopic(match.code)) {
      if (message.type === 'spectatorEvent') {
        expect(message.event.kind).not.toBe('verdictResult');
        expect(message.event.kind).not.toBe('verdictRevealed');
      }
      expect(message.type).not.toBe('levelEnd');
      // No field of a result rides along anywhere (snapshots and stats included).
      const json = JSON.stringify(message);
      for (const field of ['"verdict":', '"outcome":', '"reason":', '"scoreDelta":']) {
        expect(json).not.toContain(field);
      }
    }
    expect(match.watcher.last('matchStats')?.players[0]).toMatchObject({
      playerId: match.hostId,
      verdicts: 0,
      wrong: 0,
    });
    expect(view(match.code).stats[0]).toMatchObject({ verdicts: 1, wrong: 1 });

    const before = specTopic(match.code).length;
    const theirs = closeWithVerdict(match.code, 1, 's2', match.rivalId);
    const after = ofType(specTopic(match.code).slice(before), 'spectatorEvent').filter(
      (m) => m.event.kind === 'verdictMasked' || m.event.kind === 'verdictRevealed',
    );
    expect(after.map((m) => [m.team, m.event.kind])).toEqual([
      [1, 'verdictMasked'],
      [0, 'verdictRevealed'],
      [1, 'verdictRevealed'],
    ]);
    expect(after[1]?.event).toEqual({
      kind: 'verdictRevealed',
      result: { ...ours, playerId: match.hostId },
    });
    expect(after[2]?.event).toEqual({
      kind: 'verdictRevealed',
      result: { ...theirs, playerId: match.rivalId },
    });
    room.ticks(20);
    expect(match.watcher.last('matchStats')?.players.map((p) => [p.verdicts, p.wrong])).toEqual([
      [1, 1],
      [1, 1],
    ]);
    expect(view(match.code).embargo.held).toEqual([]);
  });

  it('reveals every held result before the level ends', () => {
    const match = watchedMatchWith('s2');
    const ours = closeWithVerdict(match.code, 0, 's2', match.hostId);
    room.forceStep(match.code, 1, (r) => ({ ...r, state: { ...r.state, credibility: 0 } }));
    const before = specTopic(match.code).length;
    room.ticks(1);
    const tail = specTopic(match.code)
      .slice(before)
      .filter((m) => m.type === 'levelEnd' || m.type === 'spectatorEvent')
      .map((m) => (m.type === 'spectatorEvent' ? m.event.kind : m.type));
    expect(tail.slice(-3)).toEqual(['verdictRevealed', 'levelEnd', 'levelEnd']);
    const revealed = ofType(specTopic(match.code), 'spectatorEvent').find(
      (m) => m.event.kind === 'verdictRevealed',
    );
    expect(revealed?.event).toEqual({
      kind: 'verdictRevealed',
      result: { ...ours, playerId: match.hostId },
    });
  });

  it('closes a resolved botRaid wave’s other spawn keys, so one verdict per team reveals both', () => {
    const match = watchedMatchWith('s1');
    // Each newsroom gets the same two-folder wave e7.0 and e7.1 (far deadlines).
    const addWave = (team: TeamIndex) => {
      room.forceStep(match.code, team, (r) => {
        const template = must(Object.values(r.state.folders)[0], 'a spawned folder');
        const folders = { ...r.state.folders };
        for (const wave of [0, 1]) {
          const id = `raid${team}${wave}`;
          folders[id] = { ...template, id, spawnKey: `e7.${wave}`, deadlineMs: 10_000_000 };
        }
        return { ...r, state: { ...r.state, folders } };
      });
    };
    addWave(0);
    addWave(1);
    room.ticks(1);
    const resolve = (team: TeamIndex, byWave: number) => (): GameEvent[] => [
      {
        kind: 'raidResolved',
        raidId: 'r7',
        byFolderId: `raid${team}${byWave}`,
        folderIds: [`raid${team}0`, `raid${team}1`],
      },
    ];
    // Team 0 answers through the wave's first folder, team 1 through its second.
    const ours = closeWithVerdict(match.code, 0, 'e7.0', match.hostId, resolve(0, 0));
    const before = specTopic(match.code).length;
    const theirs = closeWithVerdict(match.code, 1, 'e7.1', match.rivalId, resolve(1, 1));
    const revealed = ofType(specTopic(match.code).slice(before), 'spectatorEvent').filter(
      (m) => m.event.kind === 'verdictRevealed',
    );
    expect(
      revealed.map((m) => [m.team, m.event.kind === 'verdictRevealed' && m.event.result.spawnKey]),
    ).toEqual([
      [1, 'e7.1'],
      [0, 'e7.0'],
    ]);
    expect(
      revealed.map((m) => m.event.kind === 'verdictRevealed' && m.event.result.folderId),
    ).toEqual([theirs.folderId, ours.folderId]);
  });
});
