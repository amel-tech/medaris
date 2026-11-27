CREATE TYPE "public"."exam_kind" AS ENUM('EXAM', 'PRACTICE');--> statement-breakpoint
CREATE TABLE "practice_answers" (
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"option_ids" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practice_answers_attempt_id_question_id_pk" PRIMARY KEY("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"set_id" uuid,
	"pool_mode" text,
	"question_order" jsonb NOT NULL,
	"option_order" jsonb NOT NULL,
	"current_question_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"correct_count" integer,
	"wrong_count" integer,
	"blank_count" integer,
	"score_hundredths" integer,
	CONSTRAINT "practice_attempts_pool_check" CHECK (("practice_attempts"."set_id" is null) = ("practice_attempts"."pool_mode" is not null) and ("practice_attempts"."pool_mode" is null or "practice_attempts"."pool_mode" in ('ALL', 'RANDOM'))),
	CONSTRAINT "practice_attempts_finished_check" CHECK (("practice_attempts"."finished_at" is null) = ("practice_attempts"."score_hundredths" is null))
);
--> statement-breakpoint
ALTER TABLE "online_exams" ADD COLUMN "kind" "exam_kind" DEFAULT 'EXAM' NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_attempt_id_practice_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."practice_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_set_id_online_exams_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."online_exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_answers_question_idx" ON "practice_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "practice_attempts_user_course_idx" ON "practice_attempts" USING btree ("user_id","course_id");--> statement-breakpoint
CREATE INDEX "practice_attempts_set_idx" ON "practice_attempts" USING btree ("set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_attempts_open_uq" ON "practice_attempts" USING btree ("user_id","set_id") WHERE "practice_attempts"."finished_at" is null and "practice_attempts"."set_id" is not null;--> statement-breakpoint
ALTER TABLE "online_exams" ADD CONSTRAINT "online_exams_kind_lesson_check" CHECK ("online_exams"."kind" = 'EXAM' or "online_exams"."lesson_id" is null);