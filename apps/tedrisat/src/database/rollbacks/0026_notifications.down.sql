-- Reverses migrations/0026_notifications.sql (MDRS-167). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements, then delete 0026's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again. Every stored notification is lost
-- both ways: the table is the only copy.
DROP INDEX "notifications_user_unread_idx";--> statement-breakpoint
DROP INDEX "notifications_user_created_idx";--> statement-breakpoint
DROP TABLE "notifications";
