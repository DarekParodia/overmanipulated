import { describe, expect, it } from 'bun:test';
import {
  countStart,
  expertiseOffered,
  failureReopens,
  lockoutUntil,
  NO_STARTS,
  roundKey,
  secondChanceOffered,
  shownRound,
} from './station-round.ts';

describe('station overlay rounds', () => {
  const kartoteka = { id: 'sourceRegistry-0', phase: 'minigame', minigameSeed: 42 };

  it('keys a round by station, seed and the local start count', () => {
    expect(roundKey('sourceRegistry-0', 42, 3)).toBe('sourceRegistry-0:42:3');
  });

  it('reopens the overlay when a new start repeats the seed', () => {
    // First start: the overlay shows the round.
    const first = countStart(NO_STARTS, 'sourceRegistry-0', 42);
    expect(shownRound(kartoteka, first, null, false)).toBe('sourceRegistry-0:42:1');
    // The player fails it; the station never leaves the minigame (armed Druga szansa) and the
    // seed stays (the Kartoteka keeps its card): without a new start it stays hidden.
    expect(shownRound(kartoteka, first, 'sourceRegistry-0:42:1', false)).toBeNull();
    // The server's next minigameStarted for this player counts up and the overlay opens again.
    const second = countStart(first, 'sourceRegistry-0', 42);
    expect(second).toEqual({ count: 2, last: { stationId: 'sourceRegistry-0', seed: 42 } });
    expect(shownRound(kartoteka, second, 'sourceRegistry-0:42:1', false)).toBe(
      'sourceRegistry-0:42:2',
    );
  });

  it('waits for the snapshot when a new start brings a new seed', () => {
    const archive = { id: 'archive-0', phase: 'minigame', minigameSeed: 7 };
    const first = countStart(NO_STARTS, 'archive-0', 7);
    // Armed Druga szansa on the archive: the restart (seed 9) arrives before the snapshot that
    // still shows seed 7, so the old card does not flash up for a tick.
    const second = countStart(first, 'archive-0', 9);
    expect(shownRound(archive, second, 'archive-0:7:1', false)).toBeNull();
    expect(shownRound({ ...archive, minigameSeed: 9 }, second, 'archive-0:7:1', false)).toBe(
      'archive-0:9:2',
    );
    // A start at another station says nothing about this one.
    const elsewhere = countStart(first, 'phone-0', 3);
    expect(shownRound(archive, elsewhere, null, false)).toBe('archive-0:7:2');
  });

  it('shows a round nobody announced (a reconnect, a debug fixture)', () => {
    expect(shownRound(kartoteka, NO_STARTS, null, false)).toBe('sourceRegistry-0:42:0');
  });

  it('shows nothing outside the minigame or at a station that is down', () => {
    expect(shownRound(undefined, NO_STARTS, null, false)).toBeNull();
    expect(shownRound({ ...kartoteka, phase: 'working' }, NO_STARTS, null, false)).toBeNull();
    expect(shownRound(kartoteka, NO_STARTS, null, true)).toBeNull();
  });
});

describe('lockout plate', () => {
  it('shows for the lockout the server announced', () => {
    expect(lockoutUntil(3000, 10_000)).toBe(13_000);
  });

  it('hides at lockoutMs 0 (after Druga szansa)', () => {
    expect(lockoutUntil(0, 10_000)).toBe(0);
  });

  it('skips the local estimate only while Druga szansa is armed', () => {
    expect(failureReopens({ ability: 'secondChance', preview: { kind: 'armed' } })).toBe(true);
    expect(failureReopens({ ability: 'secondChance', preview: { kind: 'arm' } })).toBe(false);
    expect(failureReopens({ ability: 'expertise', preview: { kind: 'armed' } })).toBe(false);
    expect(failureReopens({ ability: null, preview: { kind: 'none' } })).toBe(false);
  });
});

describe('abilities offered around the overlay', () => {
  const now = { kind: 'now', stationId: 'archive-0', folderId: 'f1' } as const;

  it('offers Ekspertyza in the minigame its preview targets', () => {
    expect(expertiseOffered({ ability: 'expertise', preview: now }, 'archive-0')).toBe(true);
    expect(expertiseOffered({ ability: 'expertise', preview: now }, 'imageSearch-0')).toBe(false);
    expect(expertiseOffered({ ability: 'expertise', preview: { kind: 'arm' } }, 'archive-0')).toBe(
      false,
    );
    expect(
      expertiseOffered(
        { ability: 'expertise', preview: { kind: 'cooling', readyAtMs: 60_000 } },
        'archive-0',
      ),
    ).toBe(false);
    expect(expertiseOffered({ ability: 'secondChance', preview: now }, 'archive-0')).toBe(false);
  });

  it('offers Druga szansa on the locked station while hints are on', () => {
    const local = { ability: 'secondChance', preview: now } as const;
    expect(secondChanceOffered(local, 'archive-0', true)).toBe(true);
    // Ekspert difficulty or the hints setting off: the line is a hint, so it hides.
    expect(secondChanceOffered(local, 'archive-0', false)).toBe(false);
    expect(secondChanceOffered(local, 'imageSearch-0', true)).toBe(false);
    expect(secondChanceOffered(local, null, true)).toBe(false);
    expect(
      secondChanceOffered(
        { ability: 'secondChance', preview: { kind: 'cooling', readyAtMs: 45_000 } },
        'archive-0',
        true,
      ),
    ).toBe(false);
    expect(secondChanceOffered({ ability: 'expertise', preview: now }, 'archive-0', true)).toBe(
      false,
    );
  });
});
