CREATE TABLE "lesson_teacher_notes" (
	"lesson_id" uuid PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_teacher_notes" ADD CONSTRAINT "lesson_teacher_notes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;