import { beforeEach, describe, expect, it } from 'bun:test';
import type { RoomStateMessage } from '@redakcja/shared';
import { useApp } from './app.ts';

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
