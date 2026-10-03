CREATE TYPE "public"."ban_scope" AS ENUM('COURSE', 'KOSK');--> statement-breakpoint
CREATE TABLE "bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kosk_id" uuid NOT NULL,
	"course_id" uuid,
	"scope" "ban_scope" NOT NULL,
	"extended_from_course_id" uuid,
	"reason" text NOT NULL,
	"banned_by" uuid NOT NULL,
	"banned_role" text NOT NULL,
	"banned_tier" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	"lift_reason" text,
	CONSTRAINT "bans_scope_matches_course" CHECK (("bans"."scope" = 'COURSE') = ("bans"."course_id" is not null)),
	CONSTRAINT "bans_lift_complete" CHECK (("bans"."lifted_at" is null) = ("bans"."lifted_by" is null)),
	CONSTRAINT "bans_tier_range" CHECK ("bans"."banned_tier" between 1 and 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bans_open_course_uq" ON "bans" USING btree ("user_id","course_id") WHERE "bans"."lifted_at" is null and "bans"."scope" = 'COURSE';--> statement-breakpoint
CREATE UNIQUE INDEX "bans_open_kosk_uq" ON "bans" USING btree ("user_id","kosk_id") WHERE "bans"."lifted_at" is null and "bans"."scope" = 'KOSK';--> statement-breakpoint
CREATE INDEX "bans_kosk_created_idx" ON "bans" USING btree ("kosk_id","created_at" DESC NULLS LAST);