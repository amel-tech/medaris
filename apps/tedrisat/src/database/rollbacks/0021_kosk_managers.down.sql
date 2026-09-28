-- Reverses migrations/0021_kosk_managers.sql (MDRS-126). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run it,
-- then delete 0021's row from "drizzle"."__drizzle_migrations" so that the
-- next boot applies it again. Every manager but the köşk's creator is lost:
-- `kosks.owner_id` is all that is left, and running 0021 again reseeds from it.
-- Pinned by test/e2e/kosk-managers-migration.e2e.spec.ts.
DROP TABLE "kosk_managers";
