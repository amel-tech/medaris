-- Reverses migrations/0045_madrasah_settings.sql (MDRS-184). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run this
-- statement, then delete 0045's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again. The policies and the last-save stamp of
-- every medrese are lost both ways: the table is the only copy.
DROP TABLE "madrasah_settings";
