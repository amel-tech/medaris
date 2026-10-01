CREATE TABLE "madrasah_nazirs" (
	"madrasah_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "madrasah_nazirs_madrasah_id_user_id_pk" PRIMARY KEY("madrasah_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "madrasahs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cover_hue" integer DEFAULT 215 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "madrasahs_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "kosks" ADD COLUMN "madrasah_id" uuid;--> statement-breakpoint
ALTER TABLE "madrasah_nazirs" ADD CONSTRAINT "madrasah_nazirs_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kosks" ADD CONSTRAINT "kosks_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE set null ON UPDATE no action;