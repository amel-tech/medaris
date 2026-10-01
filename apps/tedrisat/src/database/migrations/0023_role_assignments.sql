CREATE TYPE "public"."assigned_role" AS ENUM('MEDARIS_NAZIM', 'KOSK_NAZIM', 'MEDRESE_BASMUDERRIS', 'MEDRESE_NAZIR', 'MUDERRIS', 'DERS_NAZIR');--> statement-breakpoint
CREATE TYPE "public"."scope_type" AS ENUM('platform', 'kosk', 'madrasah', 'course');--> statement-breakpoint
CREATE TABLE "madrasah_kosk_hosting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"madrasah_id" uuid NOT NULL,
	"kosk_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "madrasah_kosk_hosting_revocation_complete" CHECK (("madrasah_kosk_hosting"."revoked_at" is null) = ("madrasah_kosk_hosting"."revoked_by" is null))
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "assigned_role" NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"scope_id" uuid,
	"is_imam" boolean DEFAULT false NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "role_assignments_scope_matches_role" CHECK (("role_assignments"."role" = 'MEDARIS_NAZIM' and "role_assignments"."scope_type" = 'platform')
        or ("role_assignments"."role" = 'KOSK_NAZIM' and "role_assignments"."scope_type" = 'kosk')
        or ("role_assignments"."role" in ('MEDRESE_BASMUDERRIS', 'MEDRESE_NAZIR') and "role_assignments"."scope_type" = 'madrasah')
        or ("role_assignments"."role" in ('MUDERRIS', 'DERS_NAZIR') and "role_assignments"."scope_type" = 'course')),
	CONSTRAINT "role_assignments_scope_id_present" CHECK (("role_assignments"."scope_type" = 'platform') = ("role_assignments"."scope_id" is null)),
	CONSTRAINT "role_assignments_imam_is_muderris" CHECK (not "role_assignments"."is_imam" or "role_assignments"."role" = 'MUDERRIS'),
	CONSTRAINT "role_assignments_revocation_complete" CHECK (("role_assignments"."revoked_at" is null) = ("role_assignments"."revoked_by" is null))
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "madrasah_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "passive_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "passive_reason" text;--> statement-breakpoint
ALTER TABLE "kosks" ADD COLUMN "passive_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kosks" ADD COLUMN "passive_reason" text;--> statement-breakpoint
ALTER TABLE "madrasahs" ADD COLUMN "passive_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "madrasahs" ADD COLUMN "passive_reason" text;--> statement-breakpoint
ALTER TABLE "madrasah_kosk_hosting" ADD CONSTRAINT "madrasah_kosk_hosting_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "madrasah_kosk_hosting" ADD CONSTRAINT "madrasah_kosk_hosting_kosk_id_kosks_id_fk" FOREIGN KEY ("kosk_id") REFERENCES "public"."kosks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "madrasah_kosk_hosting_held_idx" ON "madrasah_kosk_hosting" USING btree ("madrasah_id","kosk_id") WHERE "madrasah_kosk_hosting"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "madrasah_kosk_hosting_kosk_id_idx" ON "madrasah_kosk_hosting" USING btree ("kosk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_held_scoped_idx" ON "role_assignments" USING btree ("user_id","role","scope_id") WHERE "role_assignments"."revoked_at" is null and "role_assignments"."scope_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_held_platform_idx" ON "role_assignments" USING btree ("user_id","role") WHERE "role_assignments"."revoked_at" is null and "role_assignments"."scope_id" is null;--> statement-breakpoint
CREATE INDEX "role_assignments_scope_idx" ON "role_assignments" USING btree ("scope_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_one_imam_per_course_idx" ON "role_assignments" USING btree ("scope_id") WHERE "role_assignments"."is_imam" and "role_assignments"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE set null ON UPDATE no action;