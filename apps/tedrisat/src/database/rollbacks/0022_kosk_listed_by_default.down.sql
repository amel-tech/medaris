-- Reverses migrations/0022_kosk_listed_by_default.sql (MDRS-122). The app never
-- runs this: drizzle's migrator only moves forward. To roll back by hand, run
-- it, then delete 0022's row from "drizzle"."__drizzle_migrations" so that the
-- next boot applies it again. Only the column default moves; no row is
-- touched in either direction, so a köşk created while 0022 was live stays
-- listed after the rollback.
-- Pinned by test/e2e/kosk-listed-by-default-migration.e2e.spec.ts.
ALTER TABLE "kosks" ALTER COLUMN "is_private" SET DEFAULT true;
