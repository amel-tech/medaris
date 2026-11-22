-- Reverses migrations/0074_exam_format_multiple_choice.sql. The app never
-- runs this: drizzle's migrator only moves forward. To roll back by hand, run
-- these statements in one transaction, then delete 0074's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Postgres cannot drop one value of an enum, so the type is made again
-- without it. Lost: every published online exam goes back to a draft, with
-- its questions, and the celses they were published with are no longer
-- exams (their exam rows and any results go). The celses themselves stay.
UPDATE "online_exams"
SET "lesson_id" = NULL, "published_at" = NULL, "latest_start_at" = NULL
WHERE "lesson_id" IS NOT NULL;
DELETE FROM "exam_results"
WHERE "exam_id" IN (
  SELECT "id" FROM "lesson_exams" WHERE "format" = 'MULTIPLE_CHOICE'
);
DELETE FROM "lesson_exams" WHERE "format" = 'MULTIPLE_CHOICE';
ALTER TABLE "lesson_exams" ALTER COLUMN "format" DROP DEFAULT;
ALTER TYPE "public"."exam_format" RENAME TO "exam_format_old";
CREATE TYPE "public"."exam_format" AS ENUM('WRITTEN', 'ORAL');
ALTER TABLE "lesson_exams"
  ALTER COLUMN "format" TYPE "public"."exam_format"
  USING "format"::text::"public"."exam_format";
ALTER TABLE "lesson_exams" ALTER COLUMN "format" SET DEFAULT 'WRITTEN';
DROP TYPE "public"."exam_format_old";
