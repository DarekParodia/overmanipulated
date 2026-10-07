import { describe, expect, it } from 'bun:test';
import { openDatabase } from './client.ts';
import {
  deleteExpiredBlunderVotes,
  getBlunderTallies,
  recordBlunderVote,
} from './queries/blunder-votes.ts';
import {
  deleteExpiredEntries,
  getTopEntries,
  insertLeaderboardEntry,
} from './queries/leaderboard.ts';

const entry = (score: number, createdAt = new Date()) => ({
  roomCode: 'ABCD',
  mode: 'endless' as const,
  levelId: 'endless',
  score,
  nicknames: ['Ala', 'Bartek'],
  createdAt,
});

describe('database', () => {
  it('applies all migrations to an empty database', () => {
    const db = openDatabase(':memory:');
    const tables = db.$client
      .query("select name from sqlite_master where type = 'table'")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain('leaderboard_entries');
    expect(tables.map((t) => t.name)).toContain('blunder_votes');
  });

  it('stores and returns top entries by score', () => {
    const db = openDatabase(':memory:');
    insertLeaderboardEntry(db, entry(50));
    insertLeaderboardEntry(db, entry(120));
    insertLeaderboardEntry(db, { ...entry(500), mode: 'campaign', levelId: 'level-1' });
    const top = getTopEntries(db, { mode: 'endless' });
    expect(top.map((e) => e.score)).toEqual([120, 50]);
    expect(top[0]?.nicknames).toEqual(['Ala', 'Bartek']);
  });

  it('filters by level and limits results', () => {
    const db = openDatabase(':memory:');
    for (let i = 0; i < 5; i++) {
      insertLeaderboardEntry(db, { ...entry(i), mode: 'campaign', levelId: 'level-1' });
    }
    insertLeaderboardEntry(db, { ...entry(99), mode: 'campaign', levelId: 'level-2' });
    const top = getTopEntries(db, { mode: 'campaign', levelId: 'level-1', limit: 2 });
    expect(top.map((e) => e.score)).toEqual([4, 3]);
  });

  it('deletes entries past the retention window', () => {
    const db = openDatabase(':memory:');
    const now = new Date('2026-10-06T12:00:00Z');
    insertLeaderboardEntry(db, entry(1, new Date('2026-01-01T00:00:00Z')));
    insertLeaderboardEntry(db, entry(2, new Date('2026-10-01T00:00:00Z')));
    expect(deleteExpiredEntries(db, now)).toBe(1);
    expect(getTopEntries(db, { mode: 'endless' }).map((e) => e.score)).toEqual([2]);
  });
});

describe('blunder votes', () => {
  const cast = (db: ReturnType<typeof openDatabase>, storyId: string, levelId = 'level-1') =>
    recordBlunderVote(db, { levelId, storyId, previousId: null });

  it('tallies votes per story for one level, most-voted first', () => {
    const db = openDatabase(':memory:');
    cast(db, 's-b');
    cast(db, 's-a');
    cast(db, 's-a');
    cast(db, 's-c');
    cast(db, 's-a', 'level-2');
    expect(getBlunderTallies(db, 'level-1')).toEqual([
      { storyId: 's-a', votes: 2 },
      { storyId: 's-b', votes: 1 },
      { storyId: 's-c', votes: 1 },
    ]);
    expect(getBlunderTallies(db, 'level-9')).toEqual([]);
  });

  it('replaces the earlier row when a player changes their vote', () => {
    const db = openDatabase(':memory:');
    const first = cast(db, 's-a');
    const second = recordBlunderVote(db, { levelId: 'level-1', storyId: 's-b', previousId: first });
    expect(second).not.toBe(first);
    expect(getBlunderTallies(db, 'level-1')).toEqual([{ storyId: 's-b', votes: 1 }]);
  });

  it('stores no room code or player data', () => {
    const db = openDatabase(':memory:');
    const columns = db.$client.query('pragma table_info(blunder_votes)').all() as {
      name: string;
    }[];
    expect(columns.map((c) => c.name).sort()).toEqual(['created_at', 'id', 'level_id', 'story_id']);
  });

  it('deletes votes past the retention window', () => {
    const db = openDatabase(':memory:');
    db.$client.run(
      "insert into blunder_votes (level_id, story_id, created_at) values ('level-1', 's-old', ?)",
      [new Date('2026-01-01T00:00:00Z').getTime()],
    );
    recordBlunderVote(db, { levelId: 'level-1', storyId: 's-new', previousId: null });
    expect(deleteExpiredBlunderVotes(db, new Date('2026-10-07T00:00:00Z'))).toBe(1);
    expect(getBlunderTallies(db, 'level-1').map((t) => t.storyId)).toEqual(['s-new']);
  });
});
