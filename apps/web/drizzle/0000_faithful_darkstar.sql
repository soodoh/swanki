CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `card_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`note_type_id` text NOT NULL,
	`name` text NOT NULL,
	`ordinal` integer NOT NULL,
	`question_template` text NOT NULL,
	`answer_template` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `card_templates_note_type_id_idx` ON `card_templates` (`note_type_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`template_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`due` integer NOT NULL,
	`stability` real DEFAULT 0,
	`difficulty` real DEFAULT 0,
	`elapsed_days` integer DEFAULT 0,
	`scheduled_days` integer DEFAULT 0,
	`reps` integer DEFAULT 0,
	`lapses` integer DEFAULT 0,
	`state` integer DEFAULT 0,
	`last_review` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cards_note_id_idx` ON `cards` (`note_id`);--> statement-breakpoint
CREATE INDEX `cards_deck_id_idx` ON `cards` (`deck_id`);--> statement-breakpoint
CREATE INDEX `cards_due_idx` ON `cards` (`due`);--> statement-breakpoint
CREATE INDEX `cards_state_idx` ON `cards` (`state`);--> statement-breakpoint
CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`description` text DEFAULT '',
	`settings` text DEFAULT '{"newCardsPerDay":20,"maxReviewsPerDay":200}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `decks_user_id_idx` ON `decks` (`user_id`);--> statement-breakpoint
CREATE INDEX `decks_parent_id_idx` ON `decks` (`parent_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`hash` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_user_id_idx` ON `media` (`user_id`);--> statement-breakpoint
CREATE INDEX `media_hash_idx` ON `media` (`hash`);--> statement-breakpoint
CREATE TABLE `note_types` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`fields` text NOT NULL,
	`css` text DEFAULT '',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `note_types_user_id_idx` ON `note_types` (`user_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`note_type_id` text NOT NULL,
	`fields` text NOT NULL,
	`tags` text DEFAULT '',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notes_user_id_idx` ON `notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `notes_note_type_id_idx` ON `notes` (`note_type_id`);--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`rating` integer NOT NULL,
	`state` integer NOT NULL,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`elapsed_days` integer NOT NULL,
	`last_elapsed_days` integer NOT NULL,
	`scheduled_days` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	`time_taken_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `review_logs_card_id_idx` ON `review_logs` (`card_id`);--> statement-breakpoint
CREATE INDEX `review_logs_reviewed_at_idx` ON `review_logs` (`reviewed_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);