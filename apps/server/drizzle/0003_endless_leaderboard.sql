CREATE TABLE `leaderboard_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_code` text NOT NULL,
	`players` text NOT NULL,
	`score` integer NOT NULL,
	`survived_s` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leaderboard_score_idx` ON `leaderboard_entries` (`score`);--> statement-breakpoint
CREATE INDEX `leaderboard_room_idx` ON `leaderboard_entries` (`room_code`);--> statement-breakpoint
CREATE INDEX `leaderboard_created_at_idx` ON `leaderboard_entries` (`created_at`);