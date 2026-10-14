import { describe, expect, it } from 'bun:test';
import type { Desk, Folder, LobbyPlayer, Station } from '@redakcja/shared';
import {
  focusForTeam,
  followCard,
  followOrder,
  stampStations,
  stepFollow,
} from './follow-model.ts';

function player(id: string, team: number): LobbyPlayer {
  return {
    id,
    nickname: id,
    colorIndex: 0,
    connected: true,
    role: null,
    ready: true,
    team,
    accessory: 'none',
  };
}

// Join order mixes the newsrooms; following walks Kurier first, then Głos.
const ROSTER = [player('a', 0), player('b', 1), player('c', 0), player('d', 1)];

function folder(id: string, location: Folder['location'], stamps: string[] = []): Folder {
  return {
    id,
    spawnKey: 's1',
    storyId: 'l0-zalany-rynek',
    location,
    stamps,
    spawnedAtMs: 0,
    deadlineMs: 60_000,
    warned: false,
  };
}

function station(overrides: Partial<Station>): Station {
  return {
    id: 'st1',
    kind: 'archive',
    operatorId: null,
    phase: 'idle',
    progressMs: 0,
    durationMs: 4000,
    minigameSeed: 1,
    lockoutMs: 0,
    outageMs: 0,
    ...overrides,
  };
}

const NO_DESKS: Desk[] = [];

describe('followOrder and stepFollow', () => {
  it('walks Kurier’s players, then Głos’s, and wraps round both ways', () => {
    const order = followOrder(ROSTER, [0, 1]);
    expect(order.map((entry) => entry.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(stepFollow(order, null, 1)).toBe('a');
    expect(stepFollow(order, null, -1)).toBe('d');
    expect(stepFollow(order, 'c', 1)).toBe('b');
    expect(stepFollow(order, 'd', 1)).toBe('a');
    expect(stepFollow(order, 'a', -1)).toBe('d');
    // A player who left: start over.
    expect(stepFollow(order, 'zz', 1)).toBe('a');
    expect(stepFollow([], null, 1)).toBeNull();
  });

  it('co-op follows its one newsroom', () => {
    expect(followOrder([player('a', 0), player('c', 0)], [0]).map((entry) => entry.id)).toEqual([
      'a',
      'c',
    ]);
  });
});

describe('focusForTeam', () => {
  it('shows the followed player’s newsroom when it is off screen', () => {
    expect(focusForTeam('single', [0, 1], 'split', 1)).toBe(1);
    expect(focusForTeam('single', [0, 1], 'split', 0)).toBe('split');
    expect(focusForTeam('side', [0, 1], 'split', 1)).toBe('split');
    expect(focusForTeam('side', [0, 1], 0, 1)).toBe(1);
    expect(focusForTeam('side', [0, 1], 1, 1)).toBe(1);
  });
});

describe('followCard', () => {
  it('says what the player does, with the folder they handle', () => {
    const carried = folder('f1', { kind: 'carried', playerId: 'a' });
    expect(followCard({ folders: [carried], stations: [], desks: NO_DESKS }, 'a')).toEqual({
      activity: { kind: 'carrying' },
      folder: carried,
    });
    const onStation = folder('f2', { kind: 'fixture', fixtureId: 'st1' });
    const working = station({ operatorId: 'a', phase: 'working', progressMs: 2400 });
    expect(followCard({ folders: [onStation], stations: [working], desks: NO_DESKS }, 'a')).toEqual(
      {
        activity: { kind: 'working', station: 'archive', percent: 60 },
        folder: onStation,
      },
    );
    const minigame = station({ operatorId: 'a', phase: 'minigame' });
    expect(
      followCard({ folders: [onStation], stations: [minigame], desks: NO_DESKS }, 'a').activity,
    ).toEqual({ kind: 'minigame', station: 'archive' });
    const locked = station({ operatorId: 'a', phase: 'lockout', lockoutMs: 1400 });
    expect(
      followCard({ folders: [onStation], stations: [locked], desks: NO_DESKS }, 'a').activity,
    ).toEqual({ kind: 'lockout', station: 'archive', seconds: 2 });
    const onDesk = folder('f3', { kind: 'fixture', fixtureId: 'desk1' });
    expect(
      followCard(
        { folders: [onDesk], stations: [], desks: [{ id: 'desk1', operatorId: 'a' }] },
        'a',
      ),
    ).toEqual({ activity: { kind: 'desk' }, folder: onDesk });
    expect(followCard({ folders: [carried], stations: [], desks: NO_DESKS }, 'c')).toEqual({
      activity: { kind: 'idle' },
      folder: null,
    });
  });
});

describe('stampStations', () => {
  it('turns stamps into their stations only, in order, skipping unknown ones', () => {
    const story = [
      { id: 'odbitka', station: 'imageSearch' as const },
      { id: 'wpis', station: 'archive' as const },
    ];
    expect(stampStations(['wpis', 'nieznany', 'odbitka'], story)).toEqual([
      'archive',
      'imageSearch',
    ]);
  });
});
