-- Reverses migrations/0072_online_exams.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0072's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every online exam's settings, zeroth question and its options, its
-- topics and questions with their options, correct marks and points, and
-- the courses' topic lists with their numbers. No celse is touched: a draft
-- has none.
DROP TABLE "exam_options";
DROP TABLE "exam_question_topics";
DROP TABLE "exam_questions";
DROP TABLE "zeroth_options";
DROP TABLE "online_exam_topics";
DROP TABLE "online_exams";
DROP TABLE "course_exam_topics";
DROP TYPE "public"."exam_scoring";
DROP TYPE "public"."exam_answer_mode";
