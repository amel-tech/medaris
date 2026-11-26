-- Reverses migrations/0071_lesson_exams.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0071's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: which celses were exams ("Sınav", its format, "tam puan", topics,
-- place and the make-up mark), whether their results were opened to the
-- talebe, and every score and "Girmedi" entered. The celses themselves stay,
-- as ordinary live sessions. Nothing is held in storage.
DROP INDEX "exam_results_exam_user_uq";
DROP INDEX "lesson_exams_lesson_id_uq";
ALTER TABLE "exam_results" DROP CONSTRAINT "exam_results_exam_id_lesson_exams_id_fk";
ALTER TABLE "lesson_exams" DROP CONSTRAINT "lesson_exams_lesson_id_lessons_id_fk";
DROP TABLE "exam_results";
DROP TABLE "lesson_exams";
DROP TYPE "public"."exam_format";
