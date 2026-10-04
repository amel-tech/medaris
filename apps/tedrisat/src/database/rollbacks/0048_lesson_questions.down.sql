-- Reverses migrations/0048_lesson_questions.sql (MDRS-150). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run this
-- statement, then delete 0048's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again. Every question and answer is lost both
-- ways: the table is the only copy.
DROP TABLE "lesson_questions";
