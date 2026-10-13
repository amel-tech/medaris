-- Reverses migrations/0062_partner_enrollments.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0062's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: every partner application's course codes and the record of which
-- registration enrolled whom. The enrollments themselves stay; without the
-- links, a later DELETE from a partner answers NOT_FOUND and removes nothing.
DROP INDEX "partner_enrollment_links_course_user_idx";
DROP INDEX "partner_enrollment_links_partner_ref_code_uq";
DROP INDEX "partner_course_codes_course_id_idx";
DROP INDEX "partner_course_codes_partner_code_uq";
DROP TABLE "partner_enrollment_links";
DROP TABLE "partner_course_codes";
