-- Reverses migrations/0018_hide_instead_of_delete.sql (MDRS-124). The app
-- never runs this: drizzle's migrator only moves forward. To roll back by
-- hand, run these statements, then delete 0018's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- Rolling back puts the six foreign keys back to ON DELETE CASCADE and drops
-- the hide columns — any course hidden in the meantime becomes visible again —
-- and the audit log. Every other row survives both ways.
-- Pinned by test/e2e/hide-instead-of-delete-migration.e2e.spec.ts.
ALTER TABLE "course_muderris" DROP CONSTRAINT "course_muderris_course_id_courses_id_fk";--> statement-breakpoint
ALTER TABLE "course_resources" DROP CONSTRAINT "course_resources_course_id_courses_id_fk";--> statement-breakpoint
ALTER TABLE "course_weeks" DROP CONSTRAINT "course_weeks_course_id_courses_id_fk";--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT "courses_kosk_id_kosks_id_fk";--> statement-breakpoint
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_course_id_courses_id_fk";--> statement-breakpoint
ALTER TABLE "lessons" DROP CONSTRAINT "lessons_week_id_course_weeks_id_fk";--> statement-breakpoint
ALTER TABLE "course_muderris" ADD CONSTRAINT "course_muderris_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_weeks" ADD CONSTRAINT "course_weeks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_kosk_id_kosks_id_fk" FOREIGN KEY ("kosk_id") REFERENCES "public"."kosks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_week_id_course_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."course_weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "archived_by";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN "archived_at";--> statement-breakpoint
DROP TABLE "audit_log";
