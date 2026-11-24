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
ALTER TABLE "lesson_board_files" ADD CONSTRAINT "lesson_board_files_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_boards" ADD CONSTRAINT "lesson_boards_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_board_files_lesson_key_idx" ON "lesson_board_files" USING btree ("lesson_id","file_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_board_files_storage_key_idx" ON "lesson_board_files" USING btree ("storage_key");