-- Reverses migrations/0073_madrasah_zeroth_question.sql. The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0073's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every medrese's zeroth question and its options. The exams already
-- published keep theirs: publishing copies it into the exam.
DROP TABLE "madrasah_zeroth_options";
DROP TABLE "madrasah_zeroth_questions";
