-- Reverses migrations/0080_lesson_views.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run this
-- statement in one transaction, then delete 0080's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: where each talebe stopped in each celse's recording and which
-- celses they finished watching (MDRS-248). The course progress already
-- worked out from them stays in "enrollments"."progress" as it is.
DROP TABLE "lesson_views";
