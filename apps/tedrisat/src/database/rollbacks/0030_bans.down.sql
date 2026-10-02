-- Reverses migrations/0030_bans.sql (MDRS-177). The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements, then delete 0030's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again. Every ban, open or lifted, is lost
-- both ways: the table is the only copy, and a ban that is gone lets the
-- person back in.
DROP TABLE "bans";--> statement-breakpoint
DROP TYPE "public"."ban_scope";
