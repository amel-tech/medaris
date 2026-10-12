-- Reverses migrations/0060_lesson_assignments.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0060's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every celse's homework (its description and the record of its
-- files). The talebe's submissions (0059) are untouched. The files
-- themselves stay in the storage zone under the environment's key prefix
-- (`<prefix>/courses/<course>/lessons/<lesson>/assignment/...`): list
-- "lesson_assignment_files"."storage_key" before running this if they are to
-- be removed by hand.
DROP INDEX "lesson_assignments_lesson_id_uq";
DROP INDEX "lesson_assignment_files_assignment_id_idx";
DROP INDEX "lesson_assignment_files_storage_key_uq";
DROP TABLE "lesson_assignment_files";
DROP TABLE "lesson_assignments";
