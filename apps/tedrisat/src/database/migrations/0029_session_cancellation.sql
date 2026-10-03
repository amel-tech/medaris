ALTER TABLE "lessons" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "replacement_lesson_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_replacement_lesson_id_lessons_id_fk" FOREIGN KEY ("replacement_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;