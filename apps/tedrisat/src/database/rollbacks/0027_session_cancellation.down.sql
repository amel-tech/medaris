-- Reverses migrations/0027_session_cancellation.sql (MDRS-158). The app never
-- runs this: drizzle's migrator only moves forward. To roll back by hand, run
-- these statements, then delete 0027's row from "drizzle"."__drizzle_migrations"
-- so that the next boot applies it again. Every recorded cancellation, its
-- reason and its replacement link are lost: the three columns are the only
-- copy, and the cancelled sessions turn back into ordinary scheduled ones.
ALTER TABLE "lessons" DROP CONSTRAINT "lessons_replacement_lesson_id_lessons_id_fk";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "replacement_lesson_id";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "cancel_reason";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN "cancelled_at";
