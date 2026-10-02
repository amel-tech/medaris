-- Reverses migrations/0035_course_closed.sql (MDRS-186). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run this
-- statement, then delete 0035's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again. Which courses were opened closed is
-- lost both ways: the column is the only copy.
ALTER TABLE "courses" DROP COLUMN "closed";
