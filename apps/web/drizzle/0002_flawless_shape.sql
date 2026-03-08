CREATE TABLE `note_media` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`media_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `note_media_note_id_idx` ON `note_media` (`note_id`);--> statement-breakpoint
CREATE INDEX `note_media_media_id_idx` ON `note_media` (`media_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `note_media_note_media_unique` ON `note_media` (`note_id`,`media_id`);