import { describe, expect, it } from 'bun:test';
import { type FolderResult, NO_BONUSES } from './entities.ts';
import { type GameEvent, spectatorEventSchema } from './protocol.ts';
import {
  closedEverywhere,
  closeSpawnKey,
  createEmbargo,
  maskForSpectators,
  openSpawnKey,
  release,
  releaseAll,
  type SpectatorEmbargo,
} from './spectator-embargo.ts';

function result(patch: Partial<FolderResult> = {}): FolderResult {
  return {
    folderId: 'f3',
    spawnKey: 's3',
    storyId: 'l2-story',
    outcome: 'correct',
    reason: 'correctImportant',
    verdict: 'reject',
    scoreDelta: 150,
    credibilityDelta: 5,
    justifyingStampIds: ['st-a'],
    requiredStamps: 1,
    bonuses: NO_BONUSES,
    missedStampIds: [],
    ...patch,
  };
}

function verdict(patch: Partial<FolderResult>, playerId: string): GameEvent {
  return { ...result(patch), kind: 'verdictResult', playerId, verdict: 'reject' };
}

function expiry(folderId: string, spawnKey: string): GameEvent {
  return { kind: 'folderExpired', folderId, spawnKey, storyId: 'l2-story', stamps: [] };
}

const RESULT_FIELDS = ['verdict', 'outcome', 'reason', 'scoreDelta', 'result'];

describe('spectator embargo', () => {
  it("holds team 0's result for s3 until team 1 closes s3, then releases it", () => {
    let embargo = openSpawnKey(openSpawnKey(createEmbargo(2), 0, 's3'), 1, 's3');

    const first = maskForSpectators(embargo, 0, verdict({ folderId: 'f3' }, 'p1'));
    embargo = first.embargo;
    expect(first.event).toEqual({
      kind: 'verdictMasked',
      playerId: 'p1',
      folderId: 'f3',
      spawnKey: 's3',
      closedBy: 'verdict',
    });
    for (const field of RESULT_FIELDS) {
      expect(Object.keys(first.event)).not.toContain(field);
    }
    expect(spectatorEventSchema.safeParse(first.event).success).toBe(true);
    expect(embargo.open.s3).toEqual([1]);
    expect(closedEverywhere(embargo, 's3')).toBe(false);

    const early = release(embargo, 's3');
    expect(early.revealed).toEqual([]);
    expect(early.embargo).toBe(embargo);

    const rival = verdict(
      { folderId: 'f5', outcome: 'wrong', reason: 'rejectedTrue', scoreDelta: -50 },
      'p5',
    );
    const second = maskForSpectators(embargo, 1, rival);
    expect(second.event).toMatchObject({ kind: 'verdictMasked', playerId: 'p5', folderId: 'f5' });
    expect(closedEverywhere(second.embargo, 's3')).toBe(true);
    expect(second.embargo.open.s3).toBeUndefined();

    const out = release(second.embargo, 's3');
    expect(out.revealed).toEqual([
      {
        team: 0,
        event: {
          kind: 'verdictRevealed',
          result: { ...result({ folderId: 'f3' }), playerId: 'p1' },
        },
      },
      {
        team: 1,
        event: {
          kind: 'verdictRevealed',
          result: {
            ...result({
              folderId: 'f5',
              outcome: 'wrong',
              reason: 'rejectedTrue',
              scoreDelta: -50,
            }),
            playerId: 'p5',
          },
        },
      },
    ]);
    for (const held of out.revealed) {
      expect(spectatorEventSchema.safeParse(held.event).success).toBe(true);
    }
    expect(out.embargo.held).toEqual([]);
    expect(release(out.embargo, 's3').revealed).toEqual([]);
  });

  it('keeps other spawn keys held while one is released', () => {
    let embargo = createEmbargo(2);
    embargo = maskForSpectators(
      embargo,
      0,
      verdict({ folderId: 'f1', spawnKey: 's1' }, 'p1'),
    ).embargo;
    embargo = maskForSpectators(embargo, 0, verdict({ folderId: 'f3' }, 'p1')).embargo;
    embargo = closeSpawnKey(embargo, 1, 's3');
    const out = release(embargo, 's3');
    expect(out.revealed.map((held) => held.event.result.spawnKey)).toEqual(['s3']);
    expect(out.embargo.held.map((held) => held.event.result.spawnKey)).toEqual(['s1']);
  });

  it('masks an expiry and holds its result, looked up by folder id', () => {
    const expired = result({
      folderId: 'f7',
      spawnKey: 'e2.0',
      outcome: 'expired',
      reason: 'expiredUnpenalized',
      verdict: null,
      scoreDelta: 0,
      credibilityDelta: 0,
      justifyingStampIds: [],
    });
    const masked = maskForSpectators(createEmbargo(2), 1, expiry('f7', 'e2.0'), [
      result(),
      expired,
    ]);
    expect(masked.event).toEqual({
      kind: 'verdictMasked',
      playerId: null,
      folderId: 'f7',
      spawnKey: 'e2.0',
      closedBy: 'expired',
    });
    expect(masked.embargo.held).toEqual([
      { team: 1, event: { kind: 'verdictRevealed', result: { ...expired, playerId: null } } },
    ]);

    // A botRaid sibling closes the same key without a result of its own.
    const sibling = maskForSpectators(masked.embargo, 1, expiry('f8', 'e2.0'), [result(), expired]);
    expect(sibling.event).toMatchObject({ kind: 'verdictMasked', folderId: 'f8' });
    expect(sibling.embargo.held).toHaveLength(1);
    expect(sibling.embargo.closed['e2.0']).toEqual([1]);
  });

  it('flushes every held result at level end and starts afresh', () => {
    let embargo: SpectatorEmbargo = createEmbargo(2);
    embargo = maskForSpectators(
      embargo,
      0,
      verdict({ folderId: 'f1', spawnKey: 's1' }, 'p1'),
    ).embargo;
    embargo = maskForSpectators(
      embargo,
      1,
      verdict({ folderId: 'f4', spawnKey: 's4' }, 'p6'),
    ).embargo;
    const out = releaseAll(embargo);
    expect(out.revealed.map((held) => [held.team, held.event.result.spawnKey])).toEqual([
      [0, 's1'],
      [1, 's4'],
    ]);
    expect(out.embargo).toEqual(createEmbargo(2));
  });

  it('passes events through unchanged in co-op and for events that close nothing', () => {
    const event = verdict({ folderId: 'f3' }, 'p1');
    const coop = createEmbargo(1);
    expect(maskForSpectators(coop, 0, event)).toEqual({ embargo: coop, event });

    const versus = createEmbargo(2);
    const pickUp: GameEvent = { kind: 'folderPickedUp', folderId: 'f3', playerId: 'p1' };
    const passed = maskForSpectators(versus, 0, pickUp);
    expect(passed.event).toBe(pickUp);
    expect(passed.embargo).toBe(versus);
  });

  it('opens and closes keys per team, idempotently', () => {
    const opened = openSpawnKey(createEmbargo(2), 0, 's2');
    expect(openSpawnKey(opened, 0, 's2')).toBe(opened);
    const closed = closeSpawnKey(opened, 0, 's2');
    expect(closed.open).toEqual({});
    expect(closed.closed).toEqual({ s2: [0] });
    expect(closeSpawnKey(closed, 0, 's2')).toBe(closed);
    expect(openSpawnKey(closed, 0, 's2')).toBe(closed);
  });
});
