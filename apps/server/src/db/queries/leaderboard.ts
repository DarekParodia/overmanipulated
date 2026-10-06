import { LEADERBOARD_DEFAULT_LIMIT, LEADERBOARD_RETENTION_DAYS } from '@redakcja/shared';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '../client.ts';
import {
  type GameMode,
  type LeaderboardEntry,
  leaderboardEntries,
  type NewLeaderboardEntry,
} from '../schema.ts';

export function insertLeaderboardEntry(db: Db, entry: NewLeaderboardEntry): LeaderboardEntry {
  return db.insert(leaderboardEntries).values(entry).returning().get();
}

export function getTopEntries(
  db: Db,
  filter: { mode: GameMode; levelId?: string | undefined; limit?: number | undefined },
): LeaderboardEntry[] {
  const conditions = [eq(leaderboardEntries.mode, filter.mode)];
  if (filter.levelId !== undefined) {
    conditions.push(eq(leaderboardEntries.levelId, filter.levelId));
  }
  return db
    .select()
    .from(leaderboardEntries)
    .where(and(...conditions))
    .orderBy(desc(leaderboardEntries.score), leaderboardEntries.createdAt)
    .limit(filter.limit ?? LEADERBOARD_DEFAULT_LIMIT)
    .all();
}

/** Deletes entries past the retention window. Returns the number of deleted rows. */
export function deleteExpiredEntries(db: Db, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - LEADERBOARD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = db
    .delete(leaderboardEntries)
    .where(lt(leaderboardEntries.createdAt, cutoff))
    .returning({ id: leaderboardEntries.id })
    .all();
  return deleted.length;
}
