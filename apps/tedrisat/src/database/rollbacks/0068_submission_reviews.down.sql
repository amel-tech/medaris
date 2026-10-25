-- Reverses migrations/0068_submission_reviews.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0068's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every review of a homework (the reviewer's note, who sent it and when)
-- and the record of its files. The talebe's own submissions and files (0059)
-- are untouched. The review files themselves stay in the storage zone under
-- the environment's key prefix
-- (`<prefix>/courses/<course>/lessons/<lesson>/submissions/<user>/review/...`):
-- list "submission_review_files"."storage_key" before running this if they are
-- to be removed by hand.
ALTER TABLE "lesson_submissions" DROP CONSTRAINT "lesson_submissions_review_sent";
DROP INDEX "submission_review_files_submission_id_idx";
DROP INDEX "submission_review_files_storage_key_uq";
DROP TABLE "submission_review_files";
ALTER TABLE "lesson_submissions" DROP COLUMN "reviewed_at";
ALTER TABLE "lesson_submissions" DROP COLUMN "reviewed_by";
ALTER TABLE "lesson_submissions" DROP COLUMN "review_note";
