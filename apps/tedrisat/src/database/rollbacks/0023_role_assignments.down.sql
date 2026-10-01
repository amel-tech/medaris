-- Reverses migrations/0023_role_assignments.sql (MDRS-134). Run last, after
-- rollbacks/0025 and rollbacks/0024; see 0025's header. Every course's
-- medrese and every passive mark are lost, which is what a rollback means
-- here. Pinned by test/e2e/role-assignments-migration.e2e.spec.ts.
ALTER TABLE "courses" DROP CONSTRAINT "courses_madrasah_id_madrasahs_id_fk";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "madrasah_id";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "passive_since";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "passive_reason";--> statement-breakpoint
ALTER TABLE "kosks" DROP COLUMN "passive_since";--> statement-breakpoint
ALTER TABLE "kosks" DROP COLUMN "passive_reason";--> statement-breakpoint
ALTER TABLE "madrasahs" DROP COLUMN "passive_since";--> statement-breakpoint
ALTER TABLE "madrasahs" DROP COLUMN "passive_reason";--> statement-breakpoint
DROP TABLE "madrasah_kosk_hosting";--> statement-breakpoint
DROP TABLE "role_assignments";--> statement-breakpoint
DROP TYPE "public"."scope_type";--> statement-breakpoint
DROP TYPE "public"."assigned_role";
