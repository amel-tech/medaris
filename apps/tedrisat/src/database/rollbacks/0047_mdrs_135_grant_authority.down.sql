-- Reverses migrations/0047_mdrs_135_grant_authority.sql (MDRS-135). The app
-- never runs this: drizzle's migrator only moves forward. To roll back by
-- hand, run this statement, then delete 0047's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- Lost: the level each held grant was made at (platform, köşk, medrese or
-- course). Without it a grant counts as made at its own scope, which is the
-- reading a grant with a null level always had, so no grant is lost, but one
-- the başnazım made on a ders nazırı can no longer outrank a köşk's policy.
ALTER TABLE "permission_grants" DROP COLUMN "authority_scope_type";
