-- Reverses migrations/0056_lesson_resources.sql (MDRS-286). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0056's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every celse's own resources, names and links. After re-applying, every
-- celse has none; the course's resources (course_resources) are untouched.
DROP INDEX "lesson_resources_lesson_id_idx";
DROP TABLE "lesson_resources";
