CREATE TABLE "madrasah_zeroth_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"madrasah_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "madrasah_zeroth_questions" (
	"madrasah_id" uuid PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "madrasah_zeroth_options" ADD CONSTRAINT "madrasah_zeroth_options_question_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasah_zeroth_questions"("madrasah_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "madrasah_zeroth_questions" ADD CONSTRAINT "madrasah_zeroth_questions_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "madrasah_zeroth_options_position_uq" ON "madrasah_zeroth_options" USING btree ("madrasah_id","position");