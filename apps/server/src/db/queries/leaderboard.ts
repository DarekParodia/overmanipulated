import { LEADERBOARD_DEFAULT_LIMIT, LEADERBOARD_RETENTION_DAYS } from '@redakcja/shared';
import { desc, eq, lt } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { type LeaderboardEntry, leaderboardEntries, type NewLeaderboardEntry } from '../schema.ts';

/** Stores a finished endless run. */
export function insertLeaderboardEntry(db: Db, entry: NewLeaderboardEntry): LeaderboardEntry {
  return db.insert(leaderboardEntries).values(entry).returning().get();
}

/** Best runs first (score, then longer survival, then earlier). `roomCode` limits to one room. */
export function getTopEntries(
  db: Db,
  filter: { roomCode?: string | undefined; limit?: number | undefined } = {},
): LeaderboardEntry[] {
  let query = db.select().from(leaderboardEntries).$dynamic();
  if (filter.roomCode !== undefined) {
    query = query.where(eq(leaderboardEntries.roomCode, filter.roomCode));
  }
  return query
    .orderBy(
      desc(leaderboardEntries.score),
      desc(leaderboardEntries.survivedS),
      leaderboardEntries.createdAt,
    )
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
