CREATE TABLE "lesson_views" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_views_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id"),
	CONSTRAINT "lesson_views_position_not_negative" CHECK ("lesson_views"."position_seconds" >= 0),
	CONSTRAINT "lesson_views_duration_positive" CHECK ("lesson_views"."duration_seconds" is null or "lesson_views"."duration_seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "lesson_views" ADD CONSTRAINT "lesson_views_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;