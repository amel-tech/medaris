-- Reverses migrations/0059_lesson_submissions.sql (MDRS-290). The app never
-- runs this: drizzle's migrator only moves forward. To roll back by hand, run
-- these statements in one transaction, then delete 0059's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every talebe's homework, notes and the record of their files. The
-- files themselves stay in the storage zone under the environment's key
-- prefix (`<prefix>/courses/<course>/lessons/<lesson>/submissions/...`): list
-- "submission_files"."storage_key" before running this if they are to be
-- removed by hand.
DROP INDEX "submission_files_submission_id_idx";
DROP INDEX "submission_files_storage_key_uq";
DROP INDEX "lesson_submissions_lesson_user_uq";
DROP TABLE "submission_files";
DROP TABLE "lesson_submissions";
