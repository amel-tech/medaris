ALTER TABLE "Flashcard_labeling" RENAME TO "flashcard_labelings";--> statement-breakpoint
ALTER TABLE "deck_label_stats" RENAME COLUMN "lable_id" TO "label_id";--> statement-breakpoint
ALTER TABLE "flashcard_label_stats" RENAME COLUMN "usageCount" TO "usage_count";--> statement-breakpoint
ALTER TABLE "deck_label_stats" DROP CONSTRAINT "deck_label_stats_lable_id_deck_label_id_fk";
--> statement-breakpoint
ALTER TABLE "flashcard_labelings" DROP CONSTRAINT "Flashcard_labeling_label_id_flashcard_labels_id_fk";
--> statement-breakpoint
ALTER TABLE "flashcard_labelings" DROP CONSTRAINT "Flashcard_labeling_flashcard_id_flashcards_id_fk";
--> statement-breakpoint
ALTER TABLE "deck_labelings" ALTER COLUMN "private_to_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deck_labelings" ALTER COLUMN "create_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "deck_label_stats" ADD CONSTRAINT "deck_label_stats_label_id_deck_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."deck_label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_labelings" ADD CONSTRAINT "flashcard_labelings_label_id_flashcard_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."flashcard_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcard_labelings" ADD CONSTRAINT "flashcard_labelings_flashcard_id_flashcards_id_fk" FOREIGN KEY ("flashcard_id") REFERENCES "public"."flashcards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deck_label_stats_label_id_idx" ON "deck_label_stats" USING btree ("label_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flashcard_label_stats_label_id_idx" ON "flashcard_label_stats" USING btree ("label_id");