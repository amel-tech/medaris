-- Reverses migrations/0019_lesson_duration_minutes_course_time_zone.sql
-- (MDRS-110). The app never runs this: drizzle's migrator only moves forward.
-- To roll back by hand, run these statements, then delete 0019's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- 0019 never touches the old free-text "duration" column, and the release
-- that ships with it keeps that column in step ("N dk") on every lesson
-- write, so after this rollback the previous release shows each lesson's
-- current length. Not covered: a lesson written by a pod of the previous
-- release while 0019 was already applied has a "duration" text but a NULL
-- "duration_minutes" (deploy tedrisat and both web apps together). A course
-- loses its time zone and is read as Europe/Istanbul again.
-- Pinned by test/e2e/lesson-duration-migration.e2e.spec.ts.
ALTER TABLE "lessons" DROP COLUMN "duration_minutes";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "time_zone";
