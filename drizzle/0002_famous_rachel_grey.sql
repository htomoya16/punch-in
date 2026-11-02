CREATE TABLE `daily_notes` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`markdown` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`mutation_id` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	CONSTRAINT "positive_note_version" CHECK("daily_notes"."version" >= 1)
);
