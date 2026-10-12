CREATE TABLE "lesson_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_submissions" ADD CONSTRAINT "lesson_submissions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_submission_id_lesson_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."lesson_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_submissions_lesson_user_uq" ON "lesson_submissions" USING btree ("lesson_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_files_storage_key_uq" ON "submission_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "submission_files_submission_id_idx" ON "submission_files" USING btree ("submission_id");