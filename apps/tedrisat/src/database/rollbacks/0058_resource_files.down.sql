-- Reverses migrations/0058_resource_files.sql (MDRS-287). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0058's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every resource that is a file (course and celse), and the list of
-- objects still waiting to be removed from storage. The objects themselves
-- stay in the storage zone under the environment's key prefix: list
-- "storage_deletions" and the resources' "storage_key" columns before running
-- this if they are to be removed by hand. Link resources are untouched.
DELETE FROM "lesson_resources" WHERE "storage_key" IS NOT NULL;
DELETE FROM "course_resources" WHERE "storage_key" IS NOT NULL;
ALTER TABLE "lesson_resources" DROP CONSTRAINT "lesson_resources_link_or_file";
ALTER TABLE "course_resources" DROP CONSTRAINT "course_resources_link_or_file";
DROP INDEX "lesson_resources_storage_key_uq";
DROP INDEX "course_resources_storage_key_uq";
ALTER TABLE "lesson_resources" DROP COLUMN "size_bytes";
ALTER TABLE "lesson_resources" DROP COLUMN "content_type";
ALTER TABLE "lesson_resources" DROP COLUMN "file_name";
ALTER TABLE "lesson_resources" DROP COLUMN "storage_key";
ALTER TABLE "course_resources" DROP COLUMN "size_bytes";
ALTER TABLE "course_resources" DROP COLUMN "content_type";
ALTER TABLE "course_resources" DROP COLUMN "file_name";
ALTER TABLE "course_resources" DROP COLUMN "storage_key";
ALTER TABLE "lesson_resources" ALTER COLUMN "url" SET NOT NULL;
DROP INDEX "storage_deletions_due_at_idx";
DROP TABLE "storage_deletions";
