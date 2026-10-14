import { beforeEach, describe, expect, it } from 'bun:test';
import type { RoomStateMessage } from '@redakcja/shared';
import { newsroomPlayers, useApp } from './app.ts';

const ROOM: RoomStateMessage = {
  type: 'roomState',
  roomCode: 'KLMN',
  hostId: 'p1',
  phase: 'briefing',
  levelId: 'l1-burza',
  players: [],
  briefing: { endsInMs: 8000, skippedBy: [] },
  blunderVotes: [],
  difficulty: 'hard',
  run: { folders: 15, maxScore: 375, stars: { two: 205, three: 320 } },
  mode: 'coop',
  visibility: 'private',
  name: null,
  spectatorsAllowed: false,
  spectators: [],
};

beforeEach(() => {
  useApp.setState({ room: null, difficulty: 'normal', run: null });
});

describe('app store: room difficulty and run (S7-23)', () => {
  it('starts on Normal with no run', () => {
    expect(useApp.getState().difficulty).toBe('normal');
    expect(useApp.getState().run).toBeNull();
  });

  it("keeps the room's difficulty and its dealt run from roomState", () => {
    useApp.getState().setRoom(ROOM);
    const state = useApp.getState();
    expect(state.room).toBe(ROOM);
    expect(state.difficulty).toBe('hard');
    expect(state.run).toEqual({ folders: 15, maxScore: 375, stars: { two: 205, three: 320 } });
  });

  it('drops the run back in the lobby but keeps the difficulty', () => {
    useApp.getState().setRoom(ROOM);
    useApp.getState().setRoom({ ...ROOM, phase: 'lobby', briefing: null, run: null });
    expect(useApp.getState().run).toBeNull();
    expect(useApp.getState().difficulty).toBe('hard');
  });

  it('remembers the last difficulty after leaving the room', () => {
    useApp.getState().setRoom({ ...ROOM, difficulty: 'expert' });
    useApp.getState().clearRoom();
    const state = useApp.getState();
    expect(state.room).toBeNull();
    expect(state.run).toBeNull();
    expect(state.difficulty).toBe('expert');
  });
});

describe('newsroom players (S7-89)', () => {
  const player = (id: string, team: 0 | 1) => ({
    id,
    nickname: id,
    colorIndex: 0,
    connected: true,
    role: null,
    ready: true,
    team,
  });
  const players = [player('p1', 0), player('p2', 1), player('p3', 0)];

  it('keeps every player in co-op and only the given team in versus', () => {
    expect(newsroomPlayers({ ...ROOM, players }, 1).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    const versus = { ...ROOM, mode: 'versus' as const, players };
    expect(newsroomPlayers(versus, 1).map((p) => p.id)).toEqual(['p2']);
    expect(newsroomPlayers(versus, 0).map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(newsroomPlayers(null, 0)).toEqual([]);
  });
});
