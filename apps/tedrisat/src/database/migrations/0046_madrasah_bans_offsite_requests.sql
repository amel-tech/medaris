CREATE TYPE "public"."offsite_request_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."ban_scope" ADD VALUE 'MADRASAH';--> statement-breakpoint
CREATE TABLE "ban_permanent_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ban_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offsite_course_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"madrasah_id" uuid NOT NULL,
	"kosk_id" uuid NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" "offsite_request_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bans" ALTER COLUMN "kosk_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bans" ADD COLUMN "madrasah_id" uuid;--> statement-breakpoint
ALTER TABLE "offsite_course_requests" ADD CONSTRAINT "offsite_course_requests_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offsite_course_requests" ADD CONSTRAINT "offsite_course_requests_kosk_id_kosks_id_fk" FOREIGN KEY ("kosk_id") REFERENCES "public"."kosks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ban_permanent_requests_ban_uq" ON "ban_permanent_requests" USING btree ("ban_id");--> statement-breakpoint
CREATE INDEX "offsite_course_requests_madrasah_idx" ON "offsite_course_requests" USING btree ("madrasah_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "bans_open_madrasah_uq" ON "bans" USING btree ("user_id","madrasah_id") WHERE "bans"."lifted_at" is null and "bans"."madrasah_id" is not null;--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_madrasah_scope_columns" CHECK (("bans"."scope"::text = 'MADRASAH') = ("bans"."madrasah_id" is not null) and ("bans"."scope"::text = 'MADRASAH') = ("bans"."kosk_id" is null));