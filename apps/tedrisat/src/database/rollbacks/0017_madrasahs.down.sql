-- Reverses migrations/0017_madrasahs.sql (MDRS-106). The app never runs this:
-- drizzle's migrator only moves forward. To roll back by hand, run these
-- statements, then delete 0017's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again. Existing köşk rows survive both ways.
-- Pinned by test/e2e/madrasah-migration.e2e.spec.ts.
ALTER TABLE "kosks" DROP CONSTRAINT "kosks_madrasah_id_madrasahs_id_fk";--> statement-breakpoint
ALTER TABLE "kosks" DROP COLUMN "madrasah_id";--> statement-breakpoint
DROP TABLE "madrasah_nazirs";--> statement-breakpoint
DROP TABLE "madrasahs";
