CREATE TABLE "course_sarf_roots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"kok" text NOT NULL,
	"bab" text NOT NULL,
	"mastar" text,
	"masdar_vezin" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_sarf_roots_bab_known" CHECK ("course_sarf_roots"."bab" in ('nasara', 'daraba', 'fataha', 'semia', 'hasune', 'hasibe'))
);
--> statement-breakpoint
CREATE TABLE "course_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"term" text NOT NULL,
	"arabic" text,
	"lexical_meaning" text,
	"technical_meaning" text,
	"example" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_board_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_board_files_size_positive" CHECK ("lesson_board_files"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "lesson_boards" (
	"lesson_id" uuid PRIMARY KEY NOT NULL,
	"scene" jsonb NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_teacher_notes" (
	"lesson_id" uuid PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_sarf_roots" ADD CONSTRAINT "course_sarf_roots_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_terms" ADD CONSTRAINT "course_terms_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_board_files" ADD CONSTRAINT "lesson_board_files_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_boards" ADD CONSTRAINT "lesson_boards_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_teacher_notes" ADD CONSTRAINT "lesson_teacher_notes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_sarf_roots_course_kok_bab_idx" ON "course_sarf_roots" USING btree ("course_id","kok","bab");--> statement-breakpoint
CREATE INDEX "course_terms_course_idx" ON "course_terms" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_board_files_lesson_key_idx" ON "lesson_board_files" USING btree ("lesson_id","file_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_board_files_storage_key_idx" ON "lesson_board_files" USING btree ("storage_key");