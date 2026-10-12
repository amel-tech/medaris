CREATE TABLE "storage_deletions" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_resources" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "course_resources" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "course_resources" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "course_resources" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "course_resources" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
CREATE INDEX "storage_deletions_due_at_idx" ON "storage_deletions" USING btree ("due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "course_resources_storage_key_uq" ON "course_resources" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_resources_storage_key_uq" ON "lesson_resources" USING btree ("storage_key");--> statement-breakpoint
ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_link_or_file" CHECK (("course_resources"."storage_key" is null and "course_resources"."file_name" is null and "course_resources"."content_type" is null and "course_resources"."size_bytes" is null) or ("course_resources"."storage_key" is not null and "course_resources"."file_name" is not null and "course_resources"."content_type" is not null and "course_resources"."size_bytes" is not null and "course_resources"."url" is null));--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_link_or_file" CHECK (("lesson_resources"."url" is not null and "lesson_resources"."storage_key" is null and "lesson_resources"."file_name" is null and "lesson_resources"."content_type" is null and "lesson_resources"."size_bytes" is null) or ("lesson_resources"."url" is null and "lesson_resources"."storage_key" is not null and "lesson_resources"."file_name" is not null and "lesson_resources"."content_type" is not null and "lesson_resources"."size_bytes" is not null));