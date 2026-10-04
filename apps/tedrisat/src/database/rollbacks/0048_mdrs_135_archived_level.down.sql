-- Reverses migrations/0048_mdrs_135_archived_level.sql (MDRS-135). The app
-- never runs this: drizzle's migrator only moves forward. To roll back by
-- hand, run these statements, then delete 0048's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- Lost: the level (platform, köşk, medrese or course) each hidden row was hidden
-- at. Without it a hidden row counts as hidden at the lowest level that could
-- have hidden it, which is what a row hidden before the column existed always
-- was, so nothing stays hidden for good, but a restore by a lower level than
-- the hider's is no longer refused.
ALTER TABLE "course_weeks" DROP COLUMN "archived_level";
ALTER TABLE "courses" DROP COLUMN "archived_level";
ALTER TABLE "lessons" DROP COLUMN "archived_level";
ALTER TABLE "decks" DROP COLUMN "archived_level";
ALTER TABLE "kosks" DROP COLUMN "archived_level";
ALTER TABLE "madrasahs" DROP COLUMN "archived_level";
