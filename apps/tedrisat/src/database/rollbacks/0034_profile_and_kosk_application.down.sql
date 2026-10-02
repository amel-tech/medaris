-- Reverses migrations/0034_profile_and_kosk_application.sql (MDRS-166). The app
-- never runs this: drizzle's migrator only moves forward. To roll back by hand,
-- run these statements, then delete 0034's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- Every typed name, künye, public-profile choice and köşk application is lost
-- both ways: the tables are the only copy.
DROP TABLE "user_profiles";--> statement-breakpoint
DROP TABLE "kosk_applications";
