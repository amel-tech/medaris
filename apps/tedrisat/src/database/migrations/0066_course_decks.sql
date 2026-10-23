ALTER TABLE "decks" ADD COLUMN "week_id" uuid;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "course_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_week_id_course_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."course_weeks"("id") ON DELETE set null ON UPDATE no action;