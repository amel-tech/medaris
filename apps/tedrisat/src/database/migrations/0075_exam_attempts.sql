CREATE TYPE "public"."exam_finished_by" AS ENUM('TALEBE', 'TIME', 'CLOSED_EARLY');--> statement-breakpoint
CREATE TABLE "exam_answers" (
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"option_ids" jsonb NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_answers_attempt_id_question_id_pk" PRIMARY KEY("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_order" jsonb NOT NULL,
	"option_order" jsonb NOT NULL,
	"current_question_id" uuid,
	"used_seconds" integer DEFAULT 0 NOT NULL,
	"counted_at" timestamp with time zone NOT NULL,
	"holder_id" text NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"switches" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"finished_by" "exam_finished_by",
	"score_hundredths" integer,
	CONSTRAINT "exam_attempts_used_check" CHECK ("exam_attempts"."used_seconds" >= 0),
	CONSTRAINT "exam_attempts_finished_check" CHECK (("exam_attempts"."finished_at" is null) = ("exam_attempts"."finished_by" is null))
);
--> statement-breakpoint
CREATE TABLE "exam_tab_switches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zeroth_answers" (
	"exam_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zeroth_answers_exam_id_user_id_pk" PRIMARY KEY("exam_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_online_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."online_exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_tab_switches" ADD CONSTRAINT "exam_tab_switches_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeroth_answers" ADD CONSTRAINT "zeroth_answers_exam_id_online_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."online_exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeroth_answers" ADD CONSTRAINT "zeroth_answers_option_id_zeroth_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."zeroth_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_answers_question_idx" ON "exam_answers" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_attempts_exam_user_uq" ON "exam_attempts" USING btree ("exam_id","user_id");--> statement-breakpoint
CREATE INDEX "exam_tab_switches_attempt_idx" ON "exam_tab_switches" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "zeroth_answers_option_idx" ON "zeroth_answers" USING btree ("option_id");