-- Reverses migrations/0048_mdrs_135_archived_level.sql (MDRS-135). The app
-- never runs this: drizzle's migrator only moves forward. To roll back by
-- hand, run these statements, then delete 0048's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- Lost: the level (platform, köşk, medrese or course) each hidden row was hidden
-- at. Nothing stays hidden for good. Applying 0048 again fills the column from
-- `archived_by` and the role that person holds or held where the item sits, as
-- it did the first time; a row hidden after 0048 by someone who acted from a
-- level above their role there (the başnazım who is also a köşk nazımı, say)
-- then reads lower, so a restore by a lower level than the hider's is allowed.
ALTER TABLE "course_weeks" DROP COLUMN "archived_level";
ALTER TABLE "courses" DROP COLUMN "archived_level";
ALTER TABLE "lessons" DROP COLUMN "archived_level";
ALTER TABLE "decks" DROP COLUMN "archived_level";
ALTER TABLE "kosks" DROP COLUMN "archived_level";
ALTER TABLE "madrasahs" DROP COLUMN "archived_level";
