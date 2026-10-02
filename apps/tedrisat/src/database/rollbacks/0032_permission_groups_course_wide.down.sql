-- Reverses migrations/0032_permission_groups_course_wide.sql (MDRS-171). The
-- app never runs this: drizzle's migrator only moves forward. To roll back by
-- hand, first delete every course-wide row the new constraint allows (a group
-- or a grant with scope_type 'course' and no scope_id), or the old constraint
-- cannot be added; then run these statements and delete 0032's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
DELETE FROM "permission_grants" WHERE "scope_type" = 'course' AND "scope_id" IS NULL;--> statement-breakpoint
DELETE FROM "permission_groups" WHERE "scope_type" = 'course' AND "scope_id" IS NULL AND NOT EXISTS (SELECT 1 FROM "permission_grants" g WHERE g."group_id" = "permission_groups"."id");--> statement-breakpoint
DROP INDEX "permission_groups_name_idx";--> statement-breakpoint
ALTER TABLE "permission_groups" DROP CONSTRAINT "permission_groups_scope_id_present";--> statement-breakpoint
ALTER TABLE "permission_grants" DROP CONSTRAINT "permission_grants_scope_id_present";--> statement-breakpoint
ALTER TABLE "permission_groups" ADD CONSTRAINT "permission_groups_scope_id_present" CHECK (("permission_groups"."scope_type" = 'platform') = ("permission_groups"."scope_id" is null));--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_scope_id_present" CHECK (("permission_grants"."scope_type" = 'platform') = ("permission_grants"."scope_id" is null));
