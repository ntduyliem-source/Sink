CREATE TABLE `link_traffic` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`occurred_at` integer NOT NULL,
	`day` text NOT NULL,
	`link_id` text NOT NULL,
	`slug` text NOT NULL,
	`country` text NOT NULL,
	`device` text NOT NULL,
	`browser` text NOT NULL,
	`referrer` text NOT NULL,
	`automated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `link_traffic_time_slug_idx` ON `link_traffic` (`occurred_at`,`slug`);--> statement-breakpoint
CREATE INDEX `link_traffic_slug_time_idx` ON `link_traffic` (`slug`,`occurred_at`);