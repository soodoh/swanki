ALTER TABLE `notes` ADD `anki_guid` text;--> statement-breakpoint
CREATE INDEX `notes_anki_guid_idx` ON `notes` (`user_id`,`anki_guid`);