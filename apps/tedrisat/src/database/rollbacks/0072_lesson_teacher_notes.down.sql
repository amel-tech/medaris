-- Reverses migrations/0072_lesson_teacher_notes.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run this
-- statement, then delete 0072's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again.
--
-- Lost: every note a müderris wrote for a session. The table is the only
-- copy. The talebe's own notes ("lesson_notes") are not touched.
DROP TABLE "lesson_teacher_notes";
