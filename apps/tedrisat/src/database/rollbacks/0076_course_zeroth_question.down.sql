-- Reverses migrations/0076_course_zeroth_question.sql. The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0076's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every course's own zeroth question and its options; those courses
-- fall back on their medrese's. The exams already published keep theirs:
-- publishing copies it into the exam.
DROP TABLE "course_zeroth_options";
DROP TABLE "course_zeroth_questions";
