ALTER TABLE "enrollments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "kosk_id" uuid;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_kosk_id_kosks_id_fk" FOREIGN KEY ("kosk_id") REFERENCES "public"."kosks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_kosk_id_idx" ON "decks" USING btree ("kosk_id");--> statement-breakpoint
UPDATE "enrollments" SET "completed_at" = "updated_at" WHERE "status" = 'COMPLETED';
