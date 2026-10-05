-- Reverses migrations/0054_lesson_invitations.sql (MDRS-121). The app never
-- runs this: drizzle's migrator only moves forward. To roll back by hand, run
-- these statements in one transaction, then delete 0048's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: the record of which invitations went out. Calendars keep the events
-- they already hold; after re-applying, the next sweep sees no record and
-- e-mails every upcoming session again, as a new invitation with SEQUENCE 0,
-- which a calendar holding a higher SEQUENCE for that UID may ignore. Every
-- talebe's opt-out is lost as well and is back on.
DROP INDEX "lesson_invitations_open_starts_at_idx";
DROP TABLE "lesson_invitations";
ALTER TABLE "users" DROP COLUMN "lesson_invitation_emails";
