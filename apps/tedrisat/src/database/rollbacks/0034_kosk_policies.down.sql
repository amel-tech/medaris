-- Reverses migrations/0034_kosk_policies.sql (MDRS-174). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements, then delete 0034's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again. Both köşk-wide policies are lost; every
-- course goes back to its own approval setting.
ALTER TABLE "kosks" DROP COLUMN "recordings_never_public";--> statement-breakpoint
ALTER TABLE "kosks" DROP COLUMN "always_require_approval";
