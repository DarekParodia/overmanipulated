CREATE TABLE `blunder_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level_id` text NOT NULL,
	`story_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blunder_votes_level_story_idx` ON `blunder_votes` (`level_id`,`story_id`);--> statement-breakpoint
CREATE INDEX `blunder_votes_created_at_idx` ON `blunder_votes` (`created_at`);