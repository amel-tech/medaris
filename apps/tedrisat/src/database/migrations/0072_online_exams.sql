CREATE TYPE "public"."exam_answer_mode" AS ENUM('SINGLE', 'MULTIPLE');--> statement-breakpoint
CREATE TYPE "public"."exam_scoring" AS ENUM('ALL_OR_NOTHING', 'IN_SHARES');--> statement-breakpoint
CREATE TABLE "course_exam_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_exam_topics_number_check" CHECK ("course_exam_topics"."number" between 1 and 999)
);
--> statement-breakpoint
CREATE TABLE "exam_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"correct" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_question_topics" (
	"question_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "exam_question_topics_question_id_topic_id_pk" PRIMARY KEY("question_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "exam_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"answer_mode" "exam_answer_mode" DEFAULT 'SINGLE' NOT NULL,
	"scoring" "exam_scoring",
	"own_points" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_questions_own_points_check" CHECK ("exam_questions"."own_points" is null or "exam_questions"."own_points" between 1 and 10000),
	CONSTRAINT "exam_questions_scoring_check" CHECK (("exam_questions"."answer_mode" = 'MULTIPLE') = ("exam_questions"."scoring" is not null))
);
--> statement-breakpoint
CREATE TABLE "online_exam_topics" (
	"exam_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "online_exam_topics_exam_id_topic_id_pk" PRIMARY KEY("exam_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "online_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"lesson_id" uuid,
	"title" text NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"instructions" text,
	"zeroth_question" text DEFAULT '' NOT NULL,
	"latest_start_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"closed_early_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "online_exams_duration_check" CHECK ("online_exams"."duration_minutes" >= 1)
);
--> statement-breakpoint
CREATE TABLE "zeroth_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_exam_topics" ADD CONSTRAINT "course_exam_topics_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_options" ADD CONSTRAINT "exam_options_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_topics" ADD CONSTRAINT "exam_question_topics_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_question_topics" ADD CONSTRAINT "exam_question_topics_topic_id_course_exam_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."course_exam_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_online_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."online_exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_exam_topics" ADD CONSTRAINT "online_exam_topics_exam_id_online_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."online_exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_exam_topics" ADD CONSTRAINT "online_exam_topics_topic_id_course_exam_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."course_exam_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_exams" ADD CONSTRAINT "online_exams_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_exams" ADD CONSTRAINT "online_exams_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeroth_options" ADD CONSTRAINT "zeroth_options_exam_id_online_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."online_exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_exam_topics_number_uq" ON "course_exam_topics" USING btree ("course_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "course_exam_topics_name_uq" ON "course_exam_topics" USING btree ("course_id","name_key");--> statement-breakpoint
CREATE INDEX "exam_options_question_idx" ON "exam_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "exam_question_topics_topic_idx" ON "exam_question_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "exam_questions_exam_idx" ON "exam_questions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "online_exam_topics_topic_idx" ON "online_exam_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "online_exams_course_idx" ON "online_exams" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "online_exams_lesson_uq" ON "online_exams" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "zeroth_options_exam_idx" ON "zeroth_options" USING btree ("exam_id");