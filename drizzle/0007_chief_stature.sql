CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`avatar_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
