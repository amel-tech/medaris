CREATE TABLE "course_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kosk_id" uuid NOT NULL,
	"madrasah_id" uuid NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reject_reason" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"course_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_policies" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "kosk_applications" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "kosk_applications" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kosk_applications" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "kosk_applications" ADD COLUMN "kosk_id" uuid;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_kosk_id_kosks_id_fk" FOREIGN KEY ("kosk_id") REFERENCES "public"."kosks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_requests" ADD CONSTRAINT "course_requests_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_requests_kosk_status_idx" ON "course_requests" USING btree ("kosk_id","status");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at" DESC NULLS LAST);