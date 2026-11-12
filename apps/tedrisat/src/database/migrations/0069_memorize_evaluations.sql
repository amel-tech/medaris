CREATE TYPE "public"."assignment_kind" AS ENUM('FILE', 'MEMORIZE');--> statement-breakpoint
CREATE TYPE "public"."evaluation_status" AS ENUM('FULL', 'INCOMPLETE', 'ABSENT');--> statement-breakpoint
CREATE TABLE "assignment_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "evaluation_status" NOT NULL,
	"note" text,
	"evaluated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson_assignments" ADD COLUMN "kind" "assignment_kind" DEFAULT 'FILE' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_evaluations" ADD CONSTRAINT "assignment_evaluations_assignment_id_lesson_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."lesson_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_evaluations_assignment_user_uq" ON "assignment_evaluations" USING btree ("assignment_id","user_id");