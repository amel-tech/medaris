-- Reverses migrations/0036_madrasah_bans_offsite_requests.sql (MDRS-187). The
-- app never runs this: drizzle's migrator only moves forward. To roll back by
-- hand, run these statements, then delete 0036's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- Lost both ways, because these tables and rows are the only copy: every
-- medrese-wide ban (the course bans it was widened from stay), every request
-- for a permanent ban and every request for a course outside a medrese.
-- Postgres cannot drop one value from an enum, so "ban_scope" is rebuilt
-- without 'MADRASAH', and the partial indexes and the check that name its
-- values are dropped first and recreated as 0030 wrote them.
DROP TABLE "ban_permanent_requests";--> statement-breakpoint
DROP TABLE "offsite_course_requests";--> statement-breakpoint
DROP TYPE "public"."offsite_request_status";--> statement-breakpoint
DELETE FROM "bans" WHERE "scope" = 'MADRASAH';--> statement-breakpoint
ALTER TABLE "bans" DROP CONSTRAINT "bans_madrasah_scope_columns";--> statement-breakpoint
DROP INDEX "bans_open_madrasah_uq";--> statement-breakpoint
DROP INDEX "bans_open_course_uq";--> statement-breakpoint
DROP INDEX "bans_open_kosk_uq";--> statement-breakpoint
ALTER TABLE "bans" DROP CONSTRAINT "bans_scope_matches_course";--> statement-breakpoint
ALTER TABLE "bans" DROP COLUMN "madrasah_id";--> statement-breakpoint
ALTER TABLE "bans" ALTER COLUMN "kosk_id" SET NOT NULL;--> statement-breakpoint
ALTER TYPE "public"."ban_scope" RENAME TO "ban_scope_old";--> statement-breakpoint
CREATE TYPE "public"."ban_scope" AS ENUM('COURSE', 'KOSK');--> statement-breakpoint
ALTER TABLE "bans" ALTER COLUMN "scope" TYPE "public"."ban_scope" USING "scope"::text::"public"."ban_scope";--> statement-breakpoint
DROP TYPE "public"."ban_scope_old";--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_scope_matches_course" CHECK (("bans"."scope" = 'COURSE') = ("bans"."course_id" is not null));--> statement-breakpoint
CREATE UNIQUE INDEX "bans_open_course_uq" ON "bans" USING btree ("user_id","course_id") WHERE "bans"."lifted_at" is null and "bans"."scope" = 'COURSE';--> statement-breakpoint
CREATE UNIQUE INDEX "bans_open_kosk_uq" ON "bans" USING btree ("user_id","kosk_id") WHERE "bans"."lifted_at" is null and "bans"."scope" = 'KOSK';
