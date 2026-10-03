CREATE TYPE "public"."recording_provider" AS ENUM('YOUTUBE', 'DRIVE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."recording_status" AS ENUM('PROCESSING', 'READY');--> statement-breakpoint
CREATE TYPE "public"."recording_visibility" AS ENUM('PUBLIC', 'ENROLLED');--> statement-breakpoint
CREATE TABLE "lesson_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"title" text NOT NULL,
	"provider" "recording_provider" DEFAULT 'OTHER' NOT NULL,
	"url" text,
	"duration_minutes" integer,
	"recorded_at" timestamp with time zone,
	"visibility" "recording_visibility" DEFAULT 'ENROLLED' NOT NULL,
	"status" "recording_status" DEFAULT 'PROCESSING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "live_stream_url" text;--> statement-breakpoint
ALTER TABLE "lesson_recordings" ADD CONSTRAINT "lesson_recordings_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_recordings_lesson_id_idx" ON "lesson_recordings" USING btree ("lesson_id");