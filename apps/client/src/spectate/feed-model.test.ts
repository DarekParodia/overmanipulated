import { describe, expect, it } from 'bun:test';
import type { FolderResult, SpectatorEventMessage } from '@redakcja/shared';
import {
  type FeedItem,
  feedItemFor,
  feedTone,
  pendingAfter,
  pushFeed,
  SPECTATOR_FEED_MAX,
} from './feed-model.ts';

function message(team: number, event: SpectatorEventMessage['event']): SpectatorEventMessage {
  return { type: 'spectatorEvent', tick: 40, team, event };
}

const RESULT = {
  folderId: 'f3',
  spawnKey: 's2',
  storyId: 'l0-zalany-rynek',
  outcome: 'correct',
  reason: 'correctImportant',
  verdict: 'reject' as const,
  scoreDelta: 25,
  credibilityDelta: 5,
  justifyingStampIds: [],
  requiredStamps: 1,
  bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
  missedStampIds: [],
} satisfies FolderResult;

const MASKED = {
  kind: 'verdictMasked',
  playerId: 'p2',
  folderId: 'f3',
  spawnKey: 's2',
  closedBy: 'verdict',
} as const;

/** Every key and value of a row, flattened, to prove what a masked row cannot say. */
function words(item: FeedItem | null): string {
  return JSON.stringify(item);
}

describe('feedItemFor', () => {
  it('turns a co-op verdict into a full row: correct, wrong and a published fake', () => {
    const correct = feedItemFor(
      message(0, { kind: 'verdictResult', ...RESULT, playerId: 'p1' }),
      1,
    );
    expect(correct).toEqual({
      id: 1,
      team: 0,
      kind: 'verdict',
      playerId: 'p1',
      folderId: 'f3',
      spawnKey: 's2',
      tone: 'correct',
      points: 25,
    });
    const wrong = feedItemFor(
      message(0, {
        kind: 'verdictResult',
        ...RESULT,
        outcome: 'wrong',
        reason: 'rejectedTrue',
        scoreDelta: -10,
        playerId: 'p1',
      }),
      2,
    );
    expect(wrong).toMatchObject({ kind: 'verdict', tone: 'wrong', points: -10 });
    const blunder = feedItemFor(
      message(0, {
        kind: 'verdictResult',
        ...RESULT,
        outcome: 'wrong',
        reason: 'publishedFake',
        verdict: 'publish',
        scoreDelta: -20,
        playerId: 'p1',
      }),
      3,
    );
    expect(blunder).toMatchObject({ kind: 'verdict', tone: 'blunder', points: -20 });
  });

  it('shows an expired folder, a level event start and a beaten raid; not an event end', () => {
    expect(
      feedItemFor(
        message(0, {
          kind: 'folderExpired',
          folderId: 'f9',
          spawnKey: 's7',
          storyId: 'l0-zalany-rynek',
          stamps: [],
        }),
        4,
      ),
    ).toEqual({ id: 4, team: 0, kind: 'expired', folderId: 'f9', points: null });
    expect(
      feedItemFor(
        message(1, {
          kind: 'levelEvent',
          event: 'botRaid',
          phase: 'start',
          folderIds: ['f4', 'f5'],
        }),
        5,
      ),
    ).toEqual({ id: 5, team: 1, kind: 'event', event: 'botRaid' });
    expect(
      feedItemFor(
        message(1, { kind: 'levelEvent', event: 'botRaid', phase: 'end', folderIds: [] }),
        6,
      ),
    ).toBeNull();
    expect(
      feedItemFor(
        message(1, { kind: 'raidResolved', raidId: 'r1', byFolderId: 'f4', folderIds: ['f4'] }),
        7,
      ),
    ).toEqual({ id: 7, team: 1, kind: 'raid' });
  });

  it('shows an ability once it lands and a rescued folder', () => {
    const started = message(0, {
      kind: 'ability',
      playerId: 'p1',
      ability: 'fieldCall',
      stage: 'started',
    });
    expect(feedItemFor(started, 8)).toBeNull();
    const done = message(0, {
      kind: 'ability',
      playerId: 'p1',
      ability: 'extendDeadline',
      stage: 'done',
    });
    expect(feedItemFor(done, 9)).toEqual({
      id: 9,
      team: 0,
      kind: 'ability',
      playerId: 'p1',
      ability: 'extendDeadline',
    });
    const rescued = message(0, {
      kind: 'folderRescued',
      playerId: 'p3',
      folderId: 'f2',
      addedMs: 20_000,
      folderIds: ['f2'],
    });
    expect(feedItemFor(rescued, 10)).toEqual({ id: 10, team: 0, kind: 'rescue', playerId: 'p3' });
  });

  it('ignores stamps, pick-ups and roster changes', () => {
    const stamp = message(0, {
      kind: 'stampApplied',
      stationId: 'st1',
      playerId: 'p1',
      folderId: 'f3',
      stampId: 'zdjecie-2019',
      via: 'minigame',
    });
    expect(feedItemFor(stamp, 11)).toBeNull();
    expect(
      feedItemFor(message(0, { kind: 'folderPickedUp', folderId: 'f3', playerId: 'p1' }), 12),
    ).toBeNull();
    expect(feedItemFor(message(0, { kind: 'playerJoined', playerId: 'p4' }), 13)).toBeNull();
  });

  it('gives a masked verdict no verdict, outcome, reason or points', () => {
    const item = feedItemFor(message(1, MASKED), 14);
    expect(item).toEqual({
      id: 14,
      team: 1,
      kind: 'masked',
      playerId: 'p2',
      folderId: 'f3',
      spawnKey: 's2',
      closedBy: 'verdict',
    });
    for (const secret of ['points', 'tone', 'outcome', 'reason', 'correct', 'reject', '25']) {
      expect(words(item)).not.toContain(secret);
    }
  });
});

describe('feedTone', () => {
  it('tells the four tones apart', () => {
    expect(feedTone('correct', 'correctNormal')).toBe('correct');
    expect(feedTone('wrongJustification', 'weakProof')).toBe('weak');
    expect(feedTone('wrong', 'contextOnTrue')).toBe('wrong');
    expect(feedTone('wrong', 'publishedFake')).toBe('blunder');
  });
});

describe('pushFeed', () => {
  it('keeps the newest rows first and at most SPECTATOR_FEED_MAX', () => {
    expect(SPECTATOR_FEED_MAX).toBe(8);
    let feed: readonly FeedItem[] = [];
    for (let id = 0; id < 10; id += 1) {
      feed = pushFeed(
        feed,
        message(0, { kind: 'raidResolved', raidId: 'r1', byFolderId: 'f1', folderIds: [] }),
        id,
      );
    }
    expect(feed.map((item) => item.id)).toEqual([9, 8, 7, 6, 5, 4, 3, 2]);
  });

  it('returns the same feed for an event it does not show', () => {
    const feed: readonly FeedItem[] = [];
    expect(pushFeed(feed, message(0, { kind: 'gameStarted' }), 0)).toBe(feed);
  });

  it('masked → revealed: the masked row gives way to the full row on top', () => {
    let feed = pushFeed([], message(1, MASKED), 0);
    feed = pushFeed(
      feed,
      message(0, { kind: 'levelEvent', event: 'viral', phase: 'start', folderIds: [] }),
      1,
    );
    expect(feed.map((item) => item.kind)).toEqual(['event', 'masked']);
    // The other newsroom's masked row for the same spawn key stays until its own reveal.
    feed = pushFeed(feed, message(0, { ...MASKED, playerId: 'p1', folderId: 'f8' }), 2);
    feed = pushFeed(
      feed,
      message(1, { kind: 'verdictRevealed', result: { ...RESULT, playerId: 'p2' } }),
      3,
    );
    expect(feed).toEqual([
      {
        id: 3,
        team: 1,
        kind: 'verdict',
        playerId: 'p2',
        folderId: 'f3',
        spawnKey: 's2',
        tone: 'correct',
        points: 25,
      },
      {
        id: 2,
        team: 0,
        kind: 'masked',
        playerId: 'p1',
        folderId: 'f8',
        spawnKey: 's2',
        closedBy: 'verdict',
      },
      { id: 1, team: 0, kind: 'event', event: 'viral' },
    ]);
    // A revealed expiry replaces its masked row with the points it cost.
    feed = pushFeed(
      feed,
      message(0, {
        kind: 'verdictRevealed',
        result: {
          ...RESULT,
          folderId: 'f8',
          outcome: 'expired',
          reason: 'expired',
          verdict: null,
          scoreDelta: -5,
          playerId: null,
        },
      }),
      4,
    );
    expect(feed.map((item) => item.kind)).toEqual(['expired', 'verdict', 'event']);
    expect(feed[0]).toEqual({ id: 4, team: 0, kind: 'expired', folderId: 'f8', points: -5 });
  });
});

describe('pendingAfter', () => {
  it('holds a masked verdict until its result is revealed', () => {
    const masked = pendingAfter([], message(1, MASKED));
    expect(masked).toEqual([{ team: 1, playerId: 'p2', folderId: 'f3' }]);
    // A masked expiry is nobody's verdict.
    expect(
      pendingAfter(
        masked,
        message(0, { ...MASKED, playerId: null, folderId: 'f4', closedBy: 'expired' }),
      ),
    ).toBe(masked);
    // Another newsroom's reveal of the same folder id leaves it.
    expect(
      pendingAfter(
        masked,
        message(0, { kind: 'verdictRevealed', result: { ...RESULT, playerId: 'p1' } }),
      ),
    ).toBe(masked);
    expect(
      pendingAfter(
        masked,
        message(1, { kind: 'verdictRevealed', result: { ...RESULT, playerId: 'p2' } }),
      ),
    ).toEqual([]);
  });
});
