-- Reverses migrations/0047_bunny_stream_recordings.sql (MDRS-116). The app never
-- runs this: drizzle's migrator only moves forward. To roll back by hand, run
-- these statements in one transaction, then delete 0047's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost both ways: every BUNNY recording row is deleted (its video stays in the
-- Bunny library, unreferenced), and a FAILED recording of another provider goes
-- back to PROCESSING. Postgres cannot drop an enum value, so both enums are
-- rebuilt without the value this migration added.
ALTER TABLE "lesson_recordings" DROP CONSTRAINT "lesson_recordings_provider_columns";
DROP INDEX "lesson_recordings_bunny_video_id_uq";
DELETE FROM "lesson_recordings" WHERE "provider"::text = 'BUNNY';
UPDATE "lesson_recordings" SET "status" = 'PROCESSING' WHERE "status"::text = 'FAILED';
ALTER TABLE "lesson_recordings" DROP COLUMN "upload_expires_at";
ALTER TABLE "lesson_recordings" DROP COLUMN "bunny_video_id";

ALTER TABLE "lesson_recordings" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TYPE "public"."recording_provider" RENAME TO "recording_provider_old";
CREATE TYPE "public"."recording_provider" AS ENUM('YOUTUBE', 'DRIVE', 'OTHER');
ALTER TABLE "lesson_recordings" ALTER COLUMN "provider" TYPE "public"."recording_provider" USING "provider"::text::"public"."recording_provider";
ALTER TABLE "lesson_recordings" ALTER COLUMN "provider" SET DEFAULT 'OTHER';
DROP TYPE "public"."recording_provider_old";

ALTER TABLE "lesson_recordings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "public"."recording_status" RENAME TO "recording_status_old";
CREATE TYPE "public"."recording_status" AS ENUM('PROCESSING', 'READY');
ALTER TABLE "lesson_recordings" ALTER COLUMN "status" TYPE "public"."recording_status" USING "status"::text::"public"."recording_status";
ALTER TABLE "lesson_recordings" ALTER COLUMN "status" SET DEFAULT 'PROCESSING';
DROP TYPE "public"."recording_status_old";
