CREATE TABLE "partner_course_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_client_id" text NOT NULL,
	"code" text NOT NULL,
	"course_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_enrollment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_client_id" text NOT NULL,
	"registration_ref" text NOT NULL,
	"course_code" text NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_enrollment" boolean DEFAULT false NOT NULL,
	"enrollment_created_at" timestamp,
	"enrollment_removed_at" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "partner_course_codes" ADD CONSTRAINT "partner_course_codes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_enrollment_links" ADD CONSTRAINT "partner_enrollment_links_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_course_codes_partner_code_uq" ON "partner_course_codes" USING btree ("partner_client_id","code");--> statement-breakpoint
CREATE INDEX "partner_course_codes_course_id_idx" ON "partner_course_codes" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_enrollment_links_partner_ref_code_uq" ON "partner_enrollment_links" USING btree ("partner_client_id","registration_ref","course_code");--> statement-breakpoint
CREATE INDEX "partner_enrollment_links_course_user_idx" ON "partner_enrollment_links" USING btree ("course_id","user_id");