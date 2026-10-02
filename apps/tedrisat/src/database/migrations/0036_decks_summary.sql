ALTER TABLE "decks" ADD COLUMN "card_type" "flashcard_type" DEFAULT 'VOCABULARY' NOT NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "publish_status" text DEFAULT 'PRIVATE' NOT NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "publish_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "madrasah_id" uuid;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_course_id_idx" ON "decks" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "decks_madrasah_id_idx" ON "decks" USING btree ("madrasah_id");
--> statement-breakpoint
UPDATE "decks" SET "publish_status" = 'PUBLISHED' WHERE "is_public";--> statement-breakpoint
UPDATE "decks" SET "card_type" = 'HADEETH' WHERE "id" IN (SELECT "deck_id" FROM "flashcards" GROUP BY "deck_id" HAVING count(*) FILTER (WHERE "type" = 'HADEETH') * 2 > count(*));
