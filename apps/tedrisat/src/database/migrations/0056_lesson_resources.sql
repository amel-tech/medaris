CREATE TABLE "lesson_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"name" text NOT NULL,
	"meta" text,
	"url" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_resources_lesson_id_idx" ON "lesson_resources" USING btree ("lesson_id");