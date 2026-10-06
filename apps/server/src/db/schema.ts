// Database schema: the single source of truth for persisted data. Live game state never goes
// here (AGENTS.md rule 9). After changing this file run `bun run db:generate`.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const gameModes = ['campaign', 'endless'] as const;
export type GameMode = (typeof gameModes)[number];

export const leaderboardEntries = sqliteTable(
  'leaderboard_entries',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    roomCode: text().notNull(),
    mode: text({ enum: gameModes }).notNull(),
    levelId: text().notNull(),
    score: integer().notNull(),
    /** Nicknames only — no other personal data. */
    nicknames: text({ mode: 'json' }).$type<string[]>().notNull(),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('leaderboard_mode_score_idx').on(table.mode, table.score),
    index('leaderboard_created_at_idx').on(table.createdAt),
  ],
);

export type LeaderboardEntry = typeof leaderboardEntries.$inferSelect;
export type NewLeaderboardEntry = typeof leaderboardEntries.$inferInsert;
