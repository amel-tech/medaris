CREATE TABLE "kosk_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"field" text NOT NULL,
	"summary" text NOT NULL,
	"reason" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"given_name" text,
	"family_name" text,
	"kunye" text,
	"gender" text,
	"city" text,
	"about" text,
	"show_full_name" boolean DEFAULT false NOT NULL,
	"show_city" boolean DEFAULT false NOT NULL,
	"show_about" boolean DEFAULT false NOT NULL,
	"show_courses" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "kosk_applications_applicant_idx" ON "kosk_applications" USING btree ("applicant_id","created_at");--> statement-breakpoint
CREATE INDEX "kosk_applications_status_idx" ON "kosk_applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_kunye_lower_idx" ON "user_profiles" USING btree (lower("kunye")) WHERE "user_profiles"."kunye" is not null;