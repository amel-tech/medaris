-- Reverses migrations/0020_calendar_feed_tokens.sql (MDRS-120). The app never
-- runs this: drizzle's migrator only moves forward. To roll back by hand, run
-- these statements, then delete 0020's row from "drizzle"."__drizzle_migrations"
-- so that the next boot applies it again. Every subscribed feed URL stops
-- working both ways: the table holds only hashes, so nothing can re-create them.
DROP INDEX "lessons_scheduled_at_idx";--> statement-breakpoint
DROP TABLE "calendar_feed_tokens";
