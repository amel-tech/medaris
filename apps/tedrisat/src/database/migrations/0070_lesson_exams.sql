CREATE TYPE "public"."exam_format" AS ENUM('WRITTEN', 'ORAL');--> statement-breakpoint
CREATE TABLE "exam_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer,
	"absent" boolean DEFAULT false NOT NULL,
	"graded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_results_score_check" CHECK (("exam_results"."absent" and "exam_results"."score" is null) or (not "exam_results"."absent" and "exam_results"."score" >= 0))
);
--> statement-breakpoint
CREATE TABLE "lesson_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"format" "exam_format" DEFAULT 'WRITTEN' NOT NULL,
	"max_score" integer DEFAULT 100 NOT NULL,
	"topics" text,
	"location" text,
	"is_retake" boolean DEFAULT false NOT NULL,
	"reminded_at" timestamp with time zone,
	"results_released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_exams_max_score_check" CHECK ("lesson_exams"."max_score" between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_exam_id_lesson_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."lesson_exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_exams" ADD CONSTRAINT "lesson_exams_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_results_exam_user_uq" ON "exam_results" USING btree ("exam_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_exams_lesson_id_uq" ON "lesson_exams" USING btree ("lesson_id");