CREATE TABLE "course_sarf_roots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"kok" text NOT NULL,
	"bab" text NOT NULL,
	"mastar" text,
	"masdar_vezin" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_sarf_roots_bab_known" CHECK ("course_sarf_roots"."bab" in ('nasara', 'daraba', 'fataha', 'semia', 'hasune', 'hasibe'))
);
--> statement-breakpoint
ALTER TABLE "course_sarf_roots" ADD CONSTRAINT "course_sarf_roots_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_sarf_roots_course_kok_bab_idx" ON "course_sarf_roots" USING btree ("course_id","kok","bab");