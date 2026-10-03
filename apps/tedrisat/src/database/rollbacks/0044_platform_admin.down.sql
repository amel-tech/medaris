-- Reverses migrations/0044_platform_admin.sql (MDRS-181). The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run these
-- statements, then delete 0044's row from "drizzle"."__drizzle_migrations" so
-- that the next boot applies it again. Every platform policy switch, every
-- medrese course request and every recorded answer to a köşk application is
-- lost, and a köşk the platform policies were enforcing on is left to its own
-- settings.
ALTER TABLE "audit_log" DROP COLUMN "seq";--> statement-breakpoint
DROP INDEX "audit_log_actor_idx";--> statement-breakpoint
DROP INDEX "audit_log_created_idx";--> statement-breakpoint
DROP TABLE "course_requests";--> statement-breakpoint
DROP TABLE "platform_policies";--> statement-breakpoint
ALTER TABLE "kosk_applications" DROP COLUMN "kosk_id";--> statement-breakpoint
ALTER TABLE "kosk_applications" DROP COLUMN "reject_reason";--> statement-breakpoint
ALTER TABLE "kosk_applications" DROP COLUMN "decided_at";--> statement-breakpoint
ALTER TABLE "kosk_applications" DROP COLUMN "decided_by";
