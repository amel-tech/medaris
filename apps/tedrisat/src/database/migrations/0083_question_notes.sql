CREATE TABLE "question_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"shared_with_teacher" boolean DEFAULT false NOT NULL,
	"shared_at" timestamp with time zone,
	"teacher_reply" text,
	"replied_by" uuid,
	"replied_at" timestamp with time zone,
	"reply_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_notes_body_check" CHECK (char_length("question_notes"."body") between 1 and 1000),
	CONSTRAINT "question_notes_reply_check" CHECK ("question_notes"."teacher_reply" is null or char_length("question_notes"."teacher_reply") between 1 and 1000),
	CONSTRAINT "question_notes_reply_complete" CHECK (("question_notes"."teacher_reply" is null) = ("question_notes"."replied_by" is null) and ("question_notes"."teacher_reply" is null) = ("question_notes"."replied_at" is null)),
	CONSTRAINT "question_notes_shared_check" CHECK ("question_notes"."shared_with_teacher" = ("question_notes"."shared_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "exam_questions" ADD COLUMN "talebe_notes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "question_notes" ADD CONSTRAINT "question_notes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_notes" ADD CONSTRAINT "question_notes_exam_id_online_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."online_exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_notes" ADD CONSTRAINT "question_notes_question_id_exam_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."exam_questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "question_notes_user_question_uq" ON "question_notes" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "question_notes_exam_shared_idx" ON "question_notes" USING btree ("exam_id","shared_with_teacher");--> statement-breakpoint
CREATE INDEX "question_notes_course_user_idx" ON "question_notes" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "question_notes_question_idx" ON "question_notes" USING btree ("question_id");--> statement-breakpoint
UPDATE "exam_questions" SET "talebe_notes" = true WHERE "exam_id" IN (SELECT "id" FROM "online_exams" WHERE "kind" = 'PRACTICE');
