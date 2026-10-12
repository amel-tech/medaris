CREATE TABLE "lesson_assignment_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_assignment_files" ADD CONSTRAINT "lesson_assignment_files_assignment_id_lesson_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."lesson_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_assignments" ADD CONSTRAINT "lesson_assignments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_assignment_files_storage_key_uq" ON "lesson_assignment_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "lesson_assignment_files_assignment_id_idx" ON "lesson_assignment_files" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_assignments_lesson_id_uq" ON "lesson_assignments" USING btree ("lesson_id");