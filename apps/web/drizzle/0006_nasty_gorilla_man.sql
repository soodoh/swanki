ALTER TABLE `decks` ADD `numeric_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `decks_user_numeric_idx` ON `decks` (`user_id`,`numeric_id`);