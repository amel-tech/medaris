CREATE TABLE "lesson_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"answer" text,
	"answered_by" uuid,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_questions_answer_complete" CHECK (("lesson_questions"."answer" is null) = ("lesson_questions"."answered_by" is null) and ("lesson_questions"."answer" is null) = ("lesson_questions"."answered_at" is null))
);
--> statement-breakpoint
ALTER TABLE "lesson_questions" ADD CONSTRAINT "lesson_questions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_questions_author_idx" ON "lesson_questions" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "lesson_questions_lesson_idx" ON "lesson_questions" USING btree ("lesson_id");