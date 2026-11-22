-- Reverses migrations/0077_exam_scoring_any_correct.sql. The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0077's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Postgres cannot drop one value of an enum, so the type is made again
-- without it. Lost: a check-box question scored "Doğrulardan biri yeterli"
-- becomes "Hepsi ya da hiç"; attempts already scored keep their scores.
UPDATE "exam_questions" SET "scoring" = 'ALL_OR_NOTHING'
WHERE "scoring" = 'ANY_CORRECT';
ALTER TYPE "public"."exam_scoring" RENAME TO "exam_scoring_old";
CREATE TYPE "public"."exam_scoring" AS ENUM('ALL_OR_NOTHING', 'IN_SHARES');
ALTER TABLE "exam_questions"
  ALTER COLUMN "scoring" TYPE "public"."exam_scoring"
  USING "scoring"::text::"public"."exam_scoring";
DROP TYPE "public"."exam_scoring_old";
