-- Reverses migrations/0075_exam_attempts.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0075's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every talebe's sitting of an online exam (their order, time used,
-- score and how it ended), their answers, their switches to another tab and
-- their zeroth answers. The exams themselves are not touched.
DROP TABLE "exam_answers";
DROP TABLE "exam_tab_switches";
DROP TABLE "exam_attempts";
DROP TABLE "zeroth_answers";
DROP TYPE "public"."exam_finished_by";
