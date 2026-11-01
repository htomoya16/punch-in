CREATE TABLE `categories` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`timezone` text DEFAULT 'Asia/Tokyo' NOT NULL,
	`day_start` integer DEFAULT 300 NOT NULL,
	`accent` text DEFAULT '#168ab5' NOT NULL,
	`sidebar` text DEFAULT '#272c34' NOT NULL,
	`reminder_enabled` integer DEFAULT 0 NOT NULL,
	`reminder_minutes` integer DEFAULT 360 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`mutation_token` text DEFAULT '' NOT NULL,
	`seeded` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`category_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`business_day` text NOT NULL,
	`day_start` integer NOT NULL,
	`timezone` text NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	CONSTRAINT "positive_duration" CHECK("sessions"."ended_at" IS NULL OR "sessions"."ended_at" >= "sessions"."started_at")
);
--> statement-breakpoint
CREATE INDEX `sessions_by_day` ON `sessions` (`user_id`,`business_day`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_running_session` ON `sessions` (`user_id`) WHERE "sessions"."ended_at" IS NULL;