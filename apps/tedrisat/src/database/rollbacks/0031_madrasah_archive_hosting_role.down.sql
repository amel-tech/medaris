-- Reverses migrations/0031_madrasah_archive_hosting_role.sql (MDRS-170). The
-- app never runs this: drizzle's migrator only moves forward. To roll back by
-- hand, run these statements, then delete 0031's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- Every hidden medrese comes back (the stamps are the only record that it was
-- hidden, and nothing else reads them) and "Veren"'s role on a hosting right
-- is lost: the granter's id stays, only the role label goes.
ALTER TABLE "madrasah_kosk_hosting" DROP COLUMN "granted_by_role";--> statement-breakpoint
ALTER TABLE "madrasahs" DROP COLUMN "archived_by";--> statement-breakpoint
ALTER TABLE "madrasahs" DROP COLUMN "archived_at";
