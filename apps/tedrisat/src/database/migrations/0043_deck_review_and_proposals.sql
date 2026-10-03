CREATE TABLE "deck_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kosk_id" uuid NOT NULL,
	"course_id" uuid,
	"proposed_by" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"card_type" "flashcard_type" DEFAULT 'VOCABULARY' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reject_reason" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"deck_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "publish_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "publish_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "publish_reject_reason" text;--> statement-breakpoint
ALTER TABLE "deck_proposals" ADD CONSTRAINT "deck_proposals_kosk_id_kosks_id_fk" FOREIGN KEY ("kosk_id") REFERENCES "public"."kosks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_proposals" ADD CONSTRAINT "deck_proposals_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_proposals" ADD CONSTRAINT "deck_proposals_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_proposals_kosk_status_idx" ON "deck_proposals" USING btree ("kosk_id","status");