import { describe, expect, it } from 'bun:test';
import { openDatabase } from './client.ts';
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
