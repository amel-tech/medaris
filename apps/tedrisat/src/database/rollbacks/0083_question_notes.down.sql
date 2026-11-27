-- Reverses migrations/0083_question_notes.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0083's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every talebe's note on a question with the hoca's answers to them,
-- and each question's "talebe notes" switch (MDRS-248, soru notları).
DROP TABLE "question_notes";
ALTER TABLE "exam_questions" DROP COLUMN "talebe_notes";
