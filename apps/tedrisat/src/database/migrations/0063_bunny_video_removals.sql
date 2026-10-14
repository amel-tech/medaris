CREATE TABLE "bunny_video_removals" (
	"video_id" text PRIMARY KEY NOT NULL,
	"recording_id" uuid NOT NULL,
	"replaced_by_video_id" text,
	"queued_by" uuid NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone
);
