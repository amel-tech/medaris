-- Reverses migrations/0070_memorize_evaluations.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0070's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every mark the course team gave on a memorisation homework ("Tam",
-- "Eksik", "Vermedi" and its note), and which homework were memorisation:
-- every homework reads as a file homework again. The homework themselves and
-- the talebe's submissions are untouched. Nothing is held in storage.
DROP INDEX "assignment_evaluations_assignment_user_uq";
ALTER TABLE "assignment_evaluations" DROP CONSTRAINT "assignment_evaluations_assignment_id_lesson_assignments_id_fk";
DROP TABLE "assignment_evaluations";
ALTER TABLE "lesson_assignments" DROP COLUMN "kind";
DROP TYPE "public"."evaluation_status";
DROP TYPE "public"."assignment_kind";
