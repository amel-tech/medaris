-- Reverses migrations/0085_permanent_ban_decisions.sql (MDRS-194). The app
-- never runs this: drizzle's migrator only moves forward. To roll back by
-- hand, run these statements in one transaction, then delete 0085's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
--
-- Lost, because these rows and columns are the only copy: every platform ban
-- (the lower ban each was approved from stays), and every decision on a
-- request for a permanent ban (who decided, when, the note of a refusal).
-- The requests themselves stay and read as undecided again.
-- Postgres cannot drop one value from an enum, so "ban_scope" is rebuilt
-- without 'PLATFORM', and the partial indexes and the checks that name its
-- values are dropped first and recreated as 0046 left them.
ALTER TABLE "ban_permanent_requests" DROP CONSTRAINT "ban_permanent_requests_note_length";--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" DROP CONSTRAINT "ban_permanent_requests_decision_complete";--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" DROP CONSTRAINT "ban_permanent_requests_status_known";--> statement-breakpoint
DROP INDEX "ban_permanent_requests_status_idx";--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" DROP COLUMN "platform_ban_id";--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" DROP COLUMN "decision_note";--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" DROP COLUMN "decided_at";--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" DROP COLUMN "decided_by";--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" DROP COLUMN "status";--> statement-breakpoint
DELETE FROM "bans" WHERE "scope"::text = 'PLATFORM';--> statement-breakpoint
DROP INDEX "bans_open_platform_uq";--> statement-breakpoint
ALTER TABLE "bans" DROP CONSTRAINT "bans_madrasah_scope_columns";--> statement-breakpoint
DROP INDEX "bans_open_course_uq";--> statement-breakpoint
DROP INDEX "bans_open_kosk_uq";--> statement-breakpoint
ALTER TABLE "bans" DROP CONSTRAINT "bans_scope_matches_course";--> statement-breakpoint
ALTER TYPE "public"."ban_scope" RENAME TO "ban_scope_old";--> statement-breakpoint
CREATE TYPE "public"."ban_scope" AS ENUM('COURSE', 'KOSK', 'MADRASAH');--> statement-breakpoint
ALTER TABLE "bans" ALTER COLUMN "scope" TYPE "public"."ban_scope" USING "scope"::text::"public"."ban_scope";--> statement-breakpoint
DROP TYPE "public"."ban_scope_old";--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_scope_matches_course" CHECK (("bans"."scope" = 'COURSE') = ("bans"."course_id" is not null));--> statement-breakpoint
CREATE UNIQUE INDEX "bans_open_course_uq" ON "bans" USING btree ("user_id","course_id") WHERE "bans"."lifted_at" is null and "bans"."scope" = 'COURSE';--> statement-breakpoint
CREATE UNIQUE INDEX "bans_open_kosk_uq" ON "bans" USING btree ("user_id","kosk_id") WHERE "bans"."lifted_at" is null and "bans"."scope" = 'KOSK';--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_madrasah_scope_columns" CHECK (("bans"."scope"::text = 'MADRASAH') = ("bans"."madrasah_id" is not null) and ("bans"."scope"::text = 'MADRASAH') = ("bans"."kosk_id" is null));
