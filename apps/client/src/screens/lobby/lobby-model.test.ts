import { describe, expect, it } from 'bun:test';
import type { LobbyPlayer, LobbySpectator, RoomMode } from '@redakcja/shared';
import {
  canJoinTeam,
  canWatch,
  emptyTeam,
  hasFreeSeat,
  memberOptions,
  nameToSend,
  roomTitle,
  startGate,
  teamPlayers,
  teamsOf,
  unevenTeams,
} from './lobby-model.ts';

function player(id: string, team: 0 | 1, extra: Partial<LobbyPlayer> = {}): LobbyPlayer {
  return {
    id,
    nickname: id,
    colorIndex: 0,
    connected: true,
    role: null,
    ready: true,
    team,
    accessory: 'none',
    ...extra,
  };
}

function spectator(id: string): LobbySpectator {
  return { id, nickname: id, connected: true };
}

function room(
  players: LobbyPlayer[],
  mode: RoomMode = 'versus',
  extra: { spectators?: LobbySpectator[]; spectatorsAllowed?: boolean; name?: string | null } = {},
) {
  return {
    hostId: 'Ala',
    mode,
    name: extra.name ?? null,
    players,
    spectators: extra.spectators ?? [],
    spectatorsAllowed: extra.spectatorsAllowed ?? false,
  };
}

const four = (team: 0 | 1, prefix: string) =>
  [1, 2, 3, 4].map((n) => player(`${prefix}${n}`, team));

describe('newsroom columns', () => {
  it('has one newsroom in Razem and two in Na punkty', () => {
    expect(teamsOf('coop')).toEqual([0]);
    expect(teamsOf('versus')).toEqual([0, 1]);
  });

  it('splits the players by newsroom in join order', () => {
    const players = [player('Ala', 0), player('Bartek', 1), player('Celina', 0)];
    expect(teamPlayers(players, 0).map((p) => p.id)).toEqual(['Ala', 'Celina']);
    expect(teamPlayers(players, 1).map((p) => p.id)).toEqual(['Bartek']);
  });

  it('notes uneven newsrooms only in Na punkty', () => {
    const three = [player('Ala', 0), player('Bartek', 1), player('Celina', 0)];
    expect(unevenTeams(room(three))).toBe(true);
    expect(unevenTeams(room(three.slice(0, 2)))).toBe(false);
    expect(unevenTeams(room(three, 'coop'))).toBe(false);
  });

  it('offers „Przejdź tutaj” only to a player of the other newsroom with a seat free', () => {
    const players = [player('Ala', 0), player('Bartek', 1)];
    expect(canJoinTeam(room(players), 'Ala', 1)).toBe(true);
    expect(canJoinTeam(room(players), 'Ala', 0)).toBe(false);
    expect(canJoinTeam(room(players, 'coop'), 'Ala', 1)).toBe(false);
    expect(canJoinTeam(room(players), 'Widz', 1)).toBe(false);
    expect(canJoinTeam(room([player('Ala', 0), ...four(1, 'g')]), 'Ala', 1)).toBe(false);
  });
});

describe('seats and the Widownia', () => {
  it('has a free seat below 4 players in Razem and 8 in Na punkty', () => {
    expect(hasFreeSeat(room(four(0, 'k'), 'coop'))).toBe(false);
    expect(hasFreeSeat(room(four(0, 'k').slice(0, 3), 'coop'))).toBe(true);
    expect(hasFreeSeat(room([...four(0, 'k'), ...four(1, 'g')]))).toBe(false);
    expect(hasFreeSeat(room([...four(0, 'k'), player('g1', 1)]))).toBe(true);
  });

  it('lets a guest watch only with the feature on and an open Widownia with a seat', () => {
    const players = [player('Ala', 0), player('Bartek', 1)];
    expect(canWatch(room(players, 'versus', { spectatorsAllowed: true }), 'Bartek', true)).toBe(
      true,
    );
    expect(canWatch(room(players), 'Bartek', true)).toBe(false);
    expect(canWatch(room(players, 'versus', { spectatorsAllowed: true }), 'Bartek', false)).toBe(
      false,
    );
    const full = Array.from({ length: 8 }, (_, i) => spectator(`s${i}`));
    expect(
      canWatch(
        room(players, 'versus', { spectatorsAllowed: true, spectators: full }),
        'Bartek',
        true,
      ),
    ).toBe(false);
  });

  it('lets the host watch from a closed Widownia, but not a spectator move there again', () => {
    const players = [player('Ala', 0), player('Bartek', 1)];
    expect(canWatch(room(players), 'Ala', true)).toBe(true);
    expect(canWatch(room(players, 'versus', { spectators: [spectator('Ola')] }), 'Ola', true)).toBe(
      false,
    );
  });
});

describe('start gate', () => {
  it('waits for ready guests first, then for an empty newsroom', () => {
    const waiting = room([player('Ala', 0), player('Bartek', 1, { ready: false })]);
    expect(startGate(waiting, true)).toEqual({
      canStart: false,
      reason: 'Czekamy na: Bartek.',
    });
    const lonely = room([player('Ala', 0), player('Celina', 0)]);
    expect(startGate(lonely, true)).toEqual({ canStart: false, reason: 'Głos: brak graczy.' });
    expect(emptyTeam(lonely)).toBe(1);
  });

  it('counts a disconnected player as missing from the newsroom', () => {
    const away = room([player('Ala', 0), player('Bartek', 1, { connected: false })]);
    expect(emptyTeam(away)).toBe(1);
    expect(startGate(away, true).canStart).toBe(false);
  });

  it('needs somebody at a desk in Razem when the host only watches', () => {
    const watching = room([], 'coop', { spectators: [spectator('Ala')] });
    expect(startGate(watching, true)).toEqual({
      canStart: false,
      reason: 'Nikt nie siedzi przy biurku.',
    });
  });

  it('starts when everyone is ready, saying so with guests', () => {
    expect(startGate(room([player('Ala', 0), player('Bartek', 1)]), true)).toEqual({
      canStart: true,
      reason: 'Wszyscy gotowi!',
    });
    expect(startGate(room([player('Ala', 0)], 'coop'), true)).toEqual({
      canStart: true,
      reason: null,
    });
    expect(startGate(room([player('Ala', 0)], 'coop'), false)).toEqual({
      canStart: false,
      reason: 'Brak połączenia z serwerem.',
    });
  });
});

describe('room name', () => {
  it('shows the name, or the host when there is none', () => {
    expect(roomTitle(room([player('Ala', 0)], 'coop', { name: '3B – piątek' }))).toBe(
      '3B – piątek',
    );
    expect(roomTitle(room([player('Ala', 0)], 'coop'))).toBe('Pokój: Ala');
    expect(roomTitle(room([], 'coop', { spectators: [spectator('Ala')] }))).toBe('Pokój: Ala');
  });

  it('sends trimmed text, and null for an empty field', () => {
    expect(nameToSend('  3B piątek ')).toBe('3B piątek');
    expect(nameToSend('   ')).toBeNull();
  });
});

describe('memberOptions', () => {
  it('offers nothing to a guest, for the host itself or for someone gone', () => {
    const r = room([player('Ala', 0), player('Bartek', 1)]);
    expect(memberOptions(r, 'Bartek', 'Ala', true)).toBeNull();
    expect(memberOptions(r, 'Ala', 'Ala', true)).toBeNull();
    expect(memberOptions(r, 'Ala', 'Zenon', true)).toBeNull();
    expect(memberOptions(r, null, 'Bartek', true)).toBeNull();
  });

  it('moves a versus player to the other newsroom while it has a seat', () => {
    const r = room([player('Ala', 0), player('Bartek', 1)]);
    expect(memberOptions(r, 'Ala', 'Bartek', true)).toEqual({
      nickname: 'Bartek',
      spectator: false,
      moveTo: 0,
      toSpectators: true,
      toPlayers: false,
      makeHost: true,
    });
    const full = room([...four(0, 'k'), player('Ala', 1), player('Bartek', 1)]);
    expect(memberOptions(full, 'Ala', 'Bartek', true)?.moveTo).toBeNull();
  });

  it('has no newsroom move in Razem', () => {
    const r = room([player('Ala', 0), player('Bartek', 0)], 'coop');
    expect(memberOptions(r, 'Ala', 'Bartek', true)?.moveTo).toBeNull();
  });

  it('sends a player to the Widownia only with the feature on and a seat free, closed or not', () => {
    const r = room([player('Ala', 0), player('Bartek', 0)], 'coop', { spectatorsAllowed: false });
    expect(memberOptions(r, 'Ala', 'Bartek', true)?.toSpectators).toBe(true);
    expect(memberOptions(r, 'Ala', 'Bartek', false)?.toSpectators).toBe(false);
    const crowd = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => spectator(`s${n}`));
    const full = room([player('Ala', 0), player('Bartek', 0)], 'coop', { spectators: crowd });
    expect(memberOptions(full, 'Ala', 'Bartek', true)?.toSpectators).toBe(false);
  });

  it('brings a spectator back to play while a seat is free', () => {
    const r = room([player('Ala', 0)], 'coop', { spectators: [spectator('Pani')] });
    expect(memberOptions(r, 'Ala', 'Pani', true)).toEqual({
      nickname: 'Pani',
      spectator: true,
      moveTo: null,
      toSpectators: false,
      toPlayers: true,
      makeHost: true,
    });
    const full = room([player('Ala', 0), ...four(0, 'k').slice(1)], 'coop', {
      spectators: [spectator('Pani')],
    });
    expect(memberOptions(full, 'Ala', 'Pani', true)?.toPlayers).toBe(false);
  });

  it('hands the host only to a connected member', () => {
    const r = room([player('Ala', 0), player('Bartek', 1, { connected: false })]);
    expect(memberOptions(r, 'Ala', 'Bartek', true)?.makeHost).toBe(false);
  });
});
