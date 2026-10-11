-- Reverses migrations/0055_in_person.sql (MDRS-283). The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0055's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: which courses hold their sessions face to face, and every session's
-- own in-person mark. After re-applying, every course and session is back to
-- not in person, as the migration leaves them.
ALTER TABLE "lessons" DROP COLUMN "in_person";
ALTER TABLE "courses" DROP COLUMN "in_person";
