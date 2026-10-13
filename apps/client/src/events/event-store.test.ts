import { beforeEach, describe, expect, it } from 'bun:test';
import { useEvents } from './event-store.ts';

const stationName = () => 'Kartoteka';

describe('event store — station lockout totals', () => {
  beforeEach(() => useEvents.getState().reset());

  it('keeps the lockout each failed minigame announced, per station', () => {
    const { handle } = useEvents.getState();
    handle(
      {
        kind: 'minigameFailed',
        stationId: 'sourceRegistry-0',
        playerId: 'p1',
        folderId: 'f1',
        lockoutMs: 6000,
      },
      stationName,
    );
    handle(
      {
        kind: 'minigameFailed',
        stationId: 'imageSearch-0',
        playerId: 'p2',
        folderId: 'f2',
        lockoutMs: 1500,
      },
      stationName,
    );
    expect(useEvents.getState().lockoutTotals).toEqual({
      'sourceRegistry-0': 6000,
      'imageSearch-0': 1500,
    });
    // A failure is not a level event: no banner.
    expect(useEvents.getState().banners).toEqual([]);
  });

  it('forgets them when the game screen resets', () => {
    useEvents.getState().handle(
      {
        kind: 'minigameFailed',
        stationId: 'archive-0',
        playerId: 'p1',
        folderId: 'f1',
        lockoutMs: 3000,
      },
      stationName,
    );
    useEvents.getState().reset();
    expect(useEvents.getState().lockoutTotals).toEqual({});
  });
});
