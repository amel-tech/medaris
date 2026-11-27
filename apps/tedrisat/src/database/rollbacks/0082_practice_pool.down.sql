-- Reverses migrations/0082_practice_pool.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run this
-- statement, then delete 0082's row from "drizzle"."__drizzle_migrations"
-- so that the next boot applies it again.
--
-- Lost: nothing but the rule that a talebe has one pool attempt of a course
-- in progress at a time (MDRS-248 Faz 4); the attempts stay.
DROP INDEX "practice_attempts_pool_open_uq";
