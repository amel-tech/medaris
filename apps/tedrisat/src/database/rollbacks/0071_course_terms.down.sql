-- Reverses migrations/0071_course_terms.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run this
-- statement, then delete 0071's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again.
--
-- Lost: every course's glossary (each term, its Arabic spelling, its two
-- meanings and its example). The table is the only copy.
DROP TABLE "course_terms";
