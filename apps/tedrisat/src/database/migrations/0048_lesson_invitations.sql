CREATE TABLE "lesson_invitations" (
	"lesson_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer,
	"course_title" text NOT NULL,
	"lesson_title" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_invitations_lesson_id_user_id_pk" PRIMARY KEY("lesson_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lesson_invitation_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "lesson_invitations_open_starts_at_idx" ON "lesson_invitations" USING btree ("starts_at") WHERE "lesson_invitations"."cancelled_at" is null;