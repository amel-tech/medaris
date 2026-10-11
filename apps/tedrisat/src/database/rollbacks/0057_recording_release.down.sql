-- Reverses migrations/0057_recording_release.sql (MDRS-288). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0057's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every session's recording release time, so each recording opens to its
-- talebe as soon as it is READY again, and which recordings were announced.
-- Re-applying counts every READY recording as announced, as the migration does.
ALTER TABLE "lessons" DROP COLUMN "recording_available_at";
ALTER TABLE "lesson_recordings" DROP COLUMN "notified_at";
