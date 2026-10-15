-- Reverses migrations/0064_integration_partners.sql. The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements in one transaction, then delete 0064's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost: the partner applications the başnazım registered in nizam, whether
-- each is enabled, and the köşks each is bound to. The codes and the
-- registrations' links stay (partner_course_codes, partner_enrollment_links).
-- The code that reads these tables does not run without them: roll the
-- application back first, and set INTEGRATION_PARTNERS again for the release
-- that reads its partners from there.
DROP INDEX "integration_partner_kosks_kosk_id_idx";
DROP TABLE "integration_partner_kosks";
DROP TABLE "integration_partners";
