-- Drop all data tables and recreate with text PKs (UUIDs).
-- Auth tables (user, session, account, verification) already use text PKs and are left untouched.

DROP TABLE IF EXISTS `note_media`;--> statement-breakpoint
DROP TABLE IF EXISTS `review_logs`;--> statement-breakpoint
DROP TABLE IF EXISTS `cards`;--> statement-breakpoint
DROP TABLE IF EXISTS `notes`;--> statement-breakpoint
DROP TABLE IF EXISTS `card_templates`;--> statement-breakpoint
DROP TABLE IF EXISTS `media`;--> statement-breakpoint
DROP TABLE IF EXISTS `note_types`;--> statement-breakpoint
DROP TABLE IF EXISTS `decks`;--> statement-breakpoint

CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`description` text DEFAULT '',
	`settings` text DEFAULT '{"newCardsPerDay":20,"maxReviewsPerDay":200}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `decks_user_id_idx` ON `decks` (`user_id`);--> statement-breakpoint
CREATE INDEX `decks_parent_id_idx` ON `decks` (`parent_id`);--> statement-breakpoint

CREATE TABLE `note_types` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`fields` text NOT NULL,
	`css` text DEFAULT '',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `note_types_user_id_idx` ON `note_types` (`user_id`);--> statement-breakpoint

CREATE TABLE `card_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`note_type_id` text NOT NULL,
	`name` text NOT NULL,
	`ordinal` integer NOT NULL,
	`question_template` text NOT NULL,
	`answer_template` text NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `card_templates_note_type_id_idx` ON `card_templates` (`note_type_id`);--> statement-breakpoint

CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`note_type_id` text NOT NULL,
	`fields` text NOT NULL,
	`tags` text DEFAULT '',
	`anki_guid` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `notes_user_id_idx` ON `notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `notes_note_type_id_idx` ON `notes` (`note_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_anki_guid_idx` ON `notes` (`user_id`,`anki_guid`);--> statement-breakpoint

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
	`suspended` integer DEFAULT 0 NOT NULL,
	`buried_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `cards_note_id_idx` ON `cards` (`note_id`);--> statement-breakpoint
CREATE INDEX `cards_deck_id_idx` ON `cards` (`deck_id`);--> statement-breakpoint
CREATE INDEX `cards_due_idx` ON `cards` (`due`);--> statement-breakpoint
CREATE INDEX `cards_state_idx` ON `cards` (`state`);--> statement-breakpoint

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
);--> statement-breakpoint
CREATE INDEX `review_logs_card_id_idx` ON `review_logs` (`card_id`);--> statement-breakpoint
CREATE INDEX `review_logs_reviewed_at_idx` ON `review_logs` (`reviewed_at`);--> statement-breakpoint

CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `media_user_id_idx` ON `media` (`user_id`);--> statement-breakpoint

CREATE TABLE `note_media` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`media_id` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `note_media_note_id_idx` ON `note_media` (`note_id`);--> statement-breakpoint
CREATE INDEX `note_media_media_id_idx` ON `note_media` (`media_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_media_note_media_unique` ON `note_media` (`note_id`,`media_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `deletions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`entity_id` text NOT NULL,
	`user_id` text NOT NULL,
	`deleted_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `deletions_user_id_deleted_at_idx` ON `deletions` (`user_id`, `deleted_at`);
