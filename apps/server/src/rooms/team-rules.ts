// Team, topic and seating rules of a room: which newsroom a player takes, which pub/sub topics a
// member listens on and how a versus level ends. Each rule reads or updates the room and the
// connections the registry passes in; none keeps state between calls.
import {
  createGameState,
  type LevelOutcome,
  type LobbyAction,
  MAX_TEAM_PLAYERS,
  MAX_TEAMS,
  pickColor,
  type RoomMode,
  type TeamIndex,
  takenColors,
  type VersusResult,
} from '@redakcja/shared';
import type { Room, RoomMember, TeamRun } from './room-types.ts';

/** The room's pub/sub topics (protocol v7). */
export const roomTopics = {
  /** Everyone: `roomState`, `gameStarted`. */
  room: (code: string) => `room:${code}`,
  /** One newsroom's players: its snapshots, events and `levelEnd`. */
  team: (code: string, team: TeamIndex) => `room:${code}:t${team}`,
  /** Spectators: every newsroom's snapshots (every 2nd), `levelEnd`s and spectator events. */
  spectators: (code: string) => `room:${code}:spec`,
};

/**
 * The players whose connection dropped (they may still reconnect), for `SimContext.absent`:
 * The pass-folder rule (`passFolder`) never passes a folder to them. Undefined while everyone is
 * connected.
 */
export function absentPlayerIds(
  players: Iterable<{ id: string; connection: unknown }>,
): ReadonlySet<string> | undefined {
  const absent = new Set<string>();
  for (const player of players) {
    if (player.connection === null) {
      absent.add(player.id);
    }
  }
  return absent.size > 0 ? absent : undefined;
}

/**
 * Lobby actions only a player takes; a spectator's are ignored, so spectators never hold up the
 * ready, briefing or vote gates (S7-81).
 */
export const PLAYER_ACTIONS: ReadonlySet<LobbyAction['kind']> = new Set([
  'setRole',
  'setReady',
  'skipBriefing',
  'voteBlunder',
  'setPaused',
]);

/** The room's players (of one team, when given), in join order. */
export function playersOf(room: Pick<Room, 'members'>, team?: TeamIndex): RoomMember[] {
  return [...room.members.values()].filter(
    (m) => m.kind === 'player' && (team === undefined || m.team === team),
  );
}

export function spectatorsOf(room: Room): RoomMember[] {
  return [...room.members.values()].filter((m) => m.kind === 'spectator');
}

/** Newsrooms the room's mode plays: 1 in co-op, 2 in versus. */
export function teamTotal(room: Room): number {
  return room.mode === 'versus' ? MAX_TEAMS : 1;
}

/**
 * The team a new player joins, or null when every team is full. Co-op has team 0 only; versus
 * picks the smaller team, team 0 on a tie.
 */
export function pickTeam(room: {
  mode: RoomMode;
  members: ReadonlyMap<string, Pick<RoomMember, 'kind' | 'team'>>;
}): TeamIndex | null {
  const sizes = Array.from({ length: room.mode === 'versus' ? MAX_TEAMS : 1 }, () => 0);
  for (const member of room.members.values()) {
    if (member.kind === 'player' && member.team < sizes.length) {
      sizes[member.team] = (sizes[member.team] ?? 0) + 1;
    }
  }
  let best: TeamIndex | null = null;
  let bestSize = MAX_TEAM_PLAYERS;
  for (const [team, size] of sizes.entries()) {
    if (size < bestSize) {
      best = team;
      bestSize = size;
    }
  }
  return best;
}

/**
 * A colour (and spawn point) for a player arriving in `team`: `preferred` when no player of the
 * team holds it, else the lowest free one (S7-105). `except` leaves one member out of the count
 * (the player changing their own look).
 */
export function freeColorIndex(
  room: Pick<Room, 'members'>,
  team: TeamIndex,
  preferred: number | null,
  except?: string,
): number {
  return pickColor(takenColors(playersOf(room, team), team, except ?? null), preferred);
}

/** Every topic a member listens on: the room's, plus its team's (players) or the spectators'. */
export function topicsFor(code: string, member: Pick<RoomMember, 'kind' | 'team'>): string[] {
  return [
    roomTopics.room(code),
    member.kind === 'player' ? roomTopics.team(code, member.team) : roomTopics.spectators(code),
  ];
}

/**
 * Moves a connected member's subscriptions from the topics it had (`before`) to the ones its kind
 * and team give now: for the team and kind switches of S7-80 and S7-81.
 */
export function syncTopics(
  code: string,
  member: Pick<RoomMember, 'kind' | 'team' | 'connection'>,
  before: readonly string[],
): void {
  const connection = member.connection;
  if (!connection) {
    return;
  }
  const after = topicsFor(code, member);
  for (const topic of before) {
    if (!after.includes(topic)) {
      connection.unsubscribe(topic);
    }
  }
  for (const topic of after) {
    if (!before.includes(topic)) {
      connection.subscribe(topic);
    }
  }
}

/**
 * Gives every player its team for the room's mode (co-op: team 0; versus: alternating in join
 * order, so the first joiner is in team 0, the second in team 1) and its colour within that team:
 * in join order, each player takes their preferred colour when no earlier teammate holds it,
 * else the lowest free one (S7-105). Spectators keep their team, which co-op resets to 0.
 */
export function assignTeams(room: Pick<Room, 'mode' | 'members'>): void {
  const taken = Array.from({ length: MAX_TEAMS }, () => new Set<number>());
  let index = 0;
  for (const member of room.members.values()) {
    if (member.kind !== 'player') {
      if (room.mode === 'coop') {
        member.team = 0;
      }
      continue;
    }
    const team = room.mode === 'versus' ? index % MAX_TEAMS : 0;
    index += 1;
    member.team = team;
    const used = taken[team] ?? new Set<number>();
    member.colorIndex = pickColor(used, member.preferredColor);
    used.add(member.colorIndex);
  }
}

/**
 * The versus level end of a newsroom: `won` means the match was won; no campaign stars. A loser
 * lost on credibility when its own ran out, otherwise on points; a draw has no loss reason.
 */
export function versusLevelOutcome(
  result: VersusResult,
  team: TeamIndex,
  credibility: number,
): LevelOutcome {
  const won = result.winnerTeam === team;
  if (won || result.winnerTeam === null) {
    return { won, stars: 0, lossReason: null };
  }
  return { won, stars: 0, lossReason: credibility <= 0 ? 'credibility' : 'score' };
}

/** Fresh lobby newsrooms for the room's mode, without players. */
export function freshTeams(room: Pick<Room, 'map' | 'mode'>): [TeamRun, ...TeamRun[]] {
  const run = (): TeamRun => ({ game: createGameState({ map: room.map }), forfeited: false });
  return room.mode === 'versus' ? [run(), run()] : [run()];
}
