-- Reverses migrations/0081_practice_sets.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0081's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every talebe's solving of every çalışma seti with its answers, and
-- the çalışma setleri themselves (MDRS-248). A set is an `online_exams` row
-- of kind PRACTICE with its questions; without the kind it would read as an
-- exam draft, so the sets go with their questions, options and topics.
DROP TABLE "practice_answers";
DROP TABLE "practice_attempts";
DELETE FROM "exam_options" WHERE "question_id" IN (
  SELECT "q"."id" FROM "exam_questions" "q"
  JOIN "online_exams" "e" ON "e"."id" = "q"."exam_id"
  WHERE "e"."kind" = 'PRACTICE'
);
DELETE FROM "exam_question_topics" WHERE "question_id" IN (
  SELECT "q"."id" FROM "exam_questions" "q"
  JOIN "online_exams" "e" ON "e"."id" = "q"."exam_id"
  WHERE "e"."kind" = 'PRACTICE'
);
DELETE FROM "exam_questions" WHERE "exam_id" IN (
  SELECT "id" FROM "online_exams" WHERE "kind" = 'PRACTICE'
);
DELETE FROM "zeroth_options" WHERE "exam_id" IN (
  SELECT "id" FROM "online_exams" WHERE "kind" = 'PRACTICE'
);
DELETE FROM "online_exam_topics" WHERE "exam_id" IN (
  SELECT "id" FROM "online_exams" WHERE "kind" = 'PRACTICE'
);
DELETE FROM "online_exams" WHERE "kind" = 'PRACTICE';
ALTER TABLE "online_exams" DROP CONSTRAINT "online_exams_kind_lesson_check";
ALTER TABLE "online_exams" DROP COLUMN "kind";
DROP TYPE "public"."exam_kind";
