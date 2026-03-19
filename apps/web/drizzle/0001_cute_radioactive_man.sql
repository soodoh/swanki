ALTER TABLE `cards` ADD `suspended` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `buried_until` integer;