CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"madrasah_id" uuid NOT NULL,
	"course_request_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "appeals_reason_length" CHECK (char_length("appeals"."reason") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_course_request_id_course_requests_id_fk" FOREIGN KEY ("course_request_id") REFERENCES "public"."course_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_course_request_uq" ON "appeals" USING btree ("course_request_id");--> statement-breakpoint
CREATE INDEX "appeals_status_idx" ON "appeals" USING btree ("status","created_at");