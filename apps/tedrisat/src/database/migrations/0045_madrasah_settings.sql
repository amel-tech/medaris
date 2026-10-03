CREATE TABLE "madrasah_settings" (
	"madrasah_id" uuid PRIMARY KEY NOT NULL,
	"policy_closed_course_required" boolean DEFAULT false NOT NULL,
	"policy_always_approval" boolean DEFAULT false NOT NULL,
	"policy_no_public_recordings" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "madrasah_settings" ADD CONSTRAINT "madrasah_settings_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE cascade ON UPDATE no action;