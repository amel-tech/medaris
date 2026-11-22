CREATE TABLE "course_zeroth_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_zeroth_questions" (
	"course_id" uuid PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_zeroth_options" ADD CONSTRAINT "course_zeroth_options_question_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course_zeroth_questions"("course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_zeroth_questions" ADD CONSTRAINT "course_zeroth_questions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_zeroth_options_position_uq" ON "course_zeroth_options" USING btree ("course_id","position");