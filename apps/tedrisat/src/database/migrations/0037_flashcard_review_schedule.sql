ALTER TABLE "flashcard_progress" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flashcard_progress" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flashcard_progress" ADD COLUMN "interval_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "flashcard_progress_user_due_idx" ON "flashcard_progress" USING btree ("user_id","due_at");