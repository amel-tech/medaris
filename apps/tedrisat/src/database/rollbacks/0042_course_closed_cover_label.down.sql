-- Reverses migrations/0042_course_closed_cover_label.sql (MDRS-176). The app
-- never runs this: drizzle's migrator only moves forward. To roll back by hand,
-- run these statements, then delete 0042's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- Which courses were closed, and every cover word, are lost; closed courses go
-- back to their own approval setting.
ALTER TABLE "courses" DROP COLUMN "cover_label";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "is_closed";
