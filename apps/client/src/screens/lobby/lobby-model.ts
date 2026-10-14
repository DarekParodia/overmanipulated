// Pure lobby rules for the room settings, the newsroom columns and the Widownia (S7-86). They
// mirror the server's (apps/server/src/rooms/registry.ts: setTeam, setSpectator, the start gate),
// so a button the server would refuse is never offered; the server still has the last word.
import {
  type LobbyPlayer,
  MAX_SPECTATORS,
  MAX_TEAM_PLAYERS,
  type RoomMode,
  type RoomStateMessage,
  type TeamIndex,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { teamName } from '../../ui/TeamBadge.tsx';

type LobbyRoom = Pick<
  RoomStateMessage,
  'hostId' | 'mode' | 'name' | 'players' | 'spectators' | 'spectatorsAllowed'
>;

/** Newsrooms of a mode: one in Razem, Kurier and Głos in Na punkty. */
export function teamsOf(mode: RoomMode): TeamIndex[] {
  return mode === 'versus' ? [0, 1] : [0];
}

/** The players of one newsroom, in join order. */
export function teamPlayers(players: readonly LobbyPlayer[], team: TeamIndex): LobbyPlayer[] {
  return players.filter((p) => p.team === team);
}

/** Whether a spectator could take a seat now (the server's `pickTeam` finds one). */
export function hasFreeSeat(room: Pick<LobbyRoom, 'mode' | 'players'>): boolean {
  return room.players.length < teamsOf(room.mode).length * MAX_TEAM_PLAYERS;
}

/** Na punkty with newsrooms of different sizes: noted, never blocking (no handicap). */
export function unevenTeams(room: Pick<LobbyRoom, 'mode' | 'players'>): boolean {
  if (room.mode !== 'versus') {
    return false;
  }
  return teamPlayers(room.players, 0).length !== teamPlayers(room.players, 1).length;
}

/** „Przejdź tutaj”: a player of the other newsroom, and the target has a free seat. */
export function canJoinTeam(
  room: Pick<LobbyRoom, 'mode' | 'players'>,
  selfId: string | null,
  team: TeamIndex,
): boolean {
  const self = room.players.find((p) => p.id === selfId);
  return (
    room.mode === 'versus' &&
    self !== undefined &&
    self.team !== team &&
    teamPlayers(room.players, team).length < MAX_TEAM_PLAYERS
  );
}

/**
 * „Na widownię”: a player may watch instead when the feature is on, the Widownia has a seat and
 * it is open (the host may always move, e.g. a teacher who only watches).
 */
export function canWatch(
  room: Pick<LobbyRoom, 'hostId' | 'players' | 'spectators' | 'spectatorsAllowed'>,
  selfId: string | null,
  spectatorsFeature: boolean,
): boolean {
  const isPlayer = room.players.some((p) => p.id === selfId);
  return (
    isPlayer &&
    spectatorsFeature &&
    (room.spectatorsAllowed || room.hostId === selfId) &&
    room.spectators.length < MAX_SPECTATORS
  );
}

/** The newsroom without a connected player, the first one if several (the server's `teamEmpty`). */
export function emptyTeam(room: Pick<LobbyRoom, 'mode' | 'players'>): TeamIndex | null {
  for (const team of teamsOf(room.mode)) {
    if (!teamPlayers(room.players, team).some((p) => p.connected)) {
      return team;
    }
  }
  return null;
}

export type StartGate = { canStart: boolean; reason: string | null };

/**
 * The host's start: every connected guest is ready and every newsroom has a connected player
 * (`notReady`, then `teamEmpty`, as the server checks them). The reason line says what blocks it,
 * or that everyone is ready.
 */
export function startGate(room: LobbyRoom, online: boolean): StartGate {
  if (!online) {
    return { canStart: false, reason: pl.lobbyRoles.startOffline };
  }
  const waitingFor = room.players
    .filter((p) => p.id !== room.hostId && p.connected && !p.ready)
    .map((p) => p.nickname);
  if (waitingFor.length > 0) {
    return { canStart: false, reason: pl.lobbyRoles.startWaiting(waitingFor) };
  }
  const empty = emptyTeam(room);
  if (empty !== null) {
    const reason =
      room.mode === 'versus'
        ? pl.lobbyRoom.startTeamEmpty(teamName(empty))
        : pl.lobbyRoom.startNoPlayers;
    return { canStart: false, reason };
  }
  return { canStart: true, reason: room.players.length > 1 ? pl.lobbyRoles.allReady : null };
}

/** The room's title: its name, or „Pokój: {host}” without one. */
export function roomTitle(room: Pick<LobbyRoom, 'hostId' | 'name' | 'players' | 'spectators'>) {
  if (room.name) {
    return room.name;
  }
  const host = [...room.players, ...room.spectators].find((m) => m.id === room.hostId);
  return pl.lobbyRoom.noName(host?.nickname ?? '');
}

/** What the name field commits: trimmed text, or null (no name) when empty. */
export function nameToSend(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** What the host's manage sheet offers for one other member (S7-87). */
export type MemberOptions = {
  nickname: string;
  /** Whether the member watches from the Widownia. */
  spectator: boolean;
  /** „Przenieś do: …”: Na punkty, a player, and the other newsroom has a free seat. */
  moveTo: TeamIndex | null;
  /** „Na widownię”: a player, the feature is on and the Widownia has a seat (closed or not). */
  toSpectators: boolean;
  /** „Do gry”: a spectator, and a seat is free. */
  toPlayers: boolean;
  /** „Przekaż gospodarza”: a connected member (the server refuses a disconnected one). */
  makeHost: boolean;
};

/**
 * The host's options for member `targetId`, mirroring the server's `setTeam`, `setSpectator`
 * and `transferHost` rules; null when `selfId` is not the host, the target is the host or is
 * gone. A kick is always offered.
 */
export function memberOptions(
  room: Pick<LobbyRoom, 'hostId' | 'mode' | 'players' | 'spectators'>,
  selfId: string | null,
  targetId: string,
  spectatorsFeature: boolean,
): MemberOptions | null {
  if (selfId === null || room.hostId !== selfId || targetId === selfId) {
    return null;
  }
  const asPlayer = room.players.find((p) => p.id === targetId);
  if (asPlayer) {
    const other: TeamIndex = asPlayer.team === 0 ? 1 : 0;
    const otherHasSeat = teamPlayers(room.players, other).length < MAX_TEAM_PLAYERS;
    return {
      nickname: asPlayer.nickname,
      spectator: false,
      moveTo: room.mode === 'versus' && otherHasSeat ? other : null,
      toSpectators: spectatorsFeature && room.spectators.length < MAX_SPECTATORS,
      toPlayers: false,
      makeHost: asPlayer.connected,
    };
  }
  const asSpectator = room.spectators.find((s) => s.id === targetId);
  if (asSpectator) {
    return {
      nickname: asSpectator.nickname,
      spectator: true,
      moveTo: null,
      toSpectators: false,
      toPlayers: hasFreeSeat(room),
      makeHost: asSpectator.connected,
    };
  }
  return null;
}
