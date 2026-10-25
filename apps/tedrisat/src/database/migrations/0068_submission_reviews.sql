CREATE TABLE "submission_review_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_submissions" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "lesson_submissions" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "lesson_submissions" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submission_review_files" ADD CONSTRAINT "submission_review_files_submission_id_lesson_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."lesson_submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_review_files_storage_key_uq" ON "submission_review_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "submission_review_files_submission_id_idx" ON "submission_review_files" USING btree ("submission_id");--> statement-breakpoint
ALTER TABLE "lesson_submissions" ADD CONSTRAINT "lesson_submissions_review_sent" CHECK (("lesson_submissions"."reviewed_by" is null) = ("lesson_submissions"."reviewed_at" is null));