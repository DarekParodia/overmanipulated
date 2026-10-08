import { BLUNDER_VOTE_RETENTION_DAYS } from '@redakcja/shared';
import { count, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { blunderVotes } from '../schema.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Stores a player's blunder vote. When `previousId` is set (the player changed their mind in
 * the same run) that row is replaced, so every player counts once per run.
 * Returns the id of the stored row.
 */
export function recordBlunderVote(
  db: Db,
  vote: { levelId: string; storyId: string; previousId: number | null },
): number {
  return db.transaction((tx) => {
    if (vote.previousId !== null) {
      tx.delete(blunderVotes).where(eq(blunderVotes.id, vote.previousId)).run();
    }
    const row = tx
      .insert(blunderVotes)
      .values({ levelId: vote.levelId, storyId: vote.storyId })
      .returning({ id: blunderVotes.id })
      .get();
    return row.id;
  });
}

/** Vote counts per story for one level, most-voted first (ties by story id). */
export function getBlunderTallies(db: Db, levelId: string): { storyId: string; votes: number }[] {
  return db
    .select({ storyId: blunderVotes.storyId, votes: count() })
    .from(blunderVotes)
    .where(eq(blunderVotes.levelId, levelId))
    .groupBy(blunderVotes.storyId)
    .orderBy(desc(count()), blunderVotes.storyId)
    .all();
}

/** Deletes votes past the retention window. Returns the number of deleted rows. */
export function deleteExpiredBlunderVotes(db: Db, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - BLUNDER_VOTE_RETENTION_DAYS * DAY_MS);
  return db
    .delete(blunderVotes)
    .where(lt(blunderVotes.createdAt, cutoff))
    .returning({ id: blunderVotes.id })
    .all().length;
}
