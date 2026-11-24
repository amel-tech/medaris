-- Reverses migrations/0069_course_sarf_roots.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run this
-- statement, then delete 0069's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again.
--
-- Lost: which roots each course's müderris put on its sarf page (the root, its
-- bâb, the Turkish mastar and the masdar's vezin). The tables themselves are
-- derived in the browser and the cards already drafted into a deck are
-- untouched.
DROP TABLE "course_sarf_roots";
