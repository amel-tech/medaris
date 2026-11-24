-- Reverses migrations/0078_exam_duration_optional.sql. The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0078's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: a draft whose length was never typed gets 60 minutes, the default
-- before 0078. Published exams always have a length and keep it.
UPDATE "online_exams" SET "duration_minutes" = 60
WHERE "duration_minutes" IS NULL;
ALTER TABLE "online_exams" ALTER COLUMN "duration_minutes" SET DEFAULT 60;
ALTER TABLE "online_exams" ALTER COLUMN "duration_minutes" SET NOT NULL;
