CREATE TABLE `leaderboard_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_code` text NOT NULL,
	`mode` text NOT NULL,
	`level_id` text NOT NULL,
	`score` integer NOT NULL,
	`nicknames` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leaderboard_mode_score_idx` ON `leaderboard_entries` (`mode`,`score`);--> statement-breakpoint
CREATE INDEX `leaderboard_created_at_idx` ON `leaderboard_entries` (`created_at`);