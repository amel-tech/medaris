-- Reverses migrations/0065_course_muderris_unvan.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0065's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: the unvan each hoca was given in each course; every hoca reads as
-- "{name} Hoca" again. The code that reads the column does not run without
-- it: roll the application back first.
ALTER TABLE "course_muderris" DROP COLUMN "unvan";--> statement-breakpoint
DROP TYPE "public"."hoca_unvan";
