ALTER TYPE "public"."ban_scope" ADD VALUE 'PLATFORM';--> statement-breakpoint
ALTER TABLE "bans" DROP CONSTRAINT "bans_madrasah_scope_columns";--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" ADD COLUMN "status" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" ADD COLUMN "decision_note" text;--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" ADD COLUMN "platform_ban_id" uuid;--> statement-breakpoint
CREATE INDEX "ban_permanent_requests_status_idx" ON "ban_permanent_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bans_open_platform_uq" ON "bans" USING btree ("user_id") WHERE "bans"."lifted_at" is null and "bans"."kosk_id" is null and "bans"."madrasah_id" is null;--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" ADD CONSTRAINT "ban_permanent_requests_status_known" CHECK ("ban_permanent_requests"."status" in ('PENDING', 'APPROVED', 'REJECTED'));--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" ADD CONSTRAINT "ban_permanent_requests_decision_complete" CHECK (("ban_permanent_requests"."status" = 'PENDING') = ("ban_permanent_requests"."decided_at" is null) and ("ban_permanent_requests"."status" = 'PENDING') = ("ban_permanent_requests"."decided_by" is null));--> statement-breakpoint
ALTER TABLE "ban_permanent_requests" ADD CONSTRAINT "ban_permanent_requests_note_length" CHECK ("ban_permanent_requests"."decision_note" is null or char_length("ban_permanent_requests"."decision_note") <= 1000);--> statement-breakpoint
ALTER TABLE "bans" ADD CONSTRAINT "bans_madrasah_scope_columns" CHECK (("bans"."scope"::text = 'MADRASAH') = ("bans"."madrasah_id" is not null) and ("bans"."scope"::text in ('MADRASAH', 'PLATFORM')) = ("bans"."kosk_id" is null));