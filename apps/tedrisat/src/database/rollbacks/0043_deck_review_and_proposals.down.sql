-- Reverses migrations/0043_deck_review_and_proposals.sql (MDRS-180). The app
-- never runs this: drizzle's migrator only moves forward. To roll back by hand,
-- run these statements, then delete 0043's row from
-- "drizzle"."__drizzle_migrations" so that the next boot applies it again.
-- Every deck proposal and every recorded answer to a publish request is lost;
-- a deck whose request was refused stays REJECTED in "publish_status", so set
-- those back to PRIVATE first or the old code will not know the value.
UPDATE "decks" SET "publish_status" = 'PRIVATE' WHERE "publish_status" = 'REJECTED';--> statement-breakpoint
DROP TABLE "deck_proposals";--> statement-breakpoint
DROP INDEX "decks_publish_decided_at_idx";--> statement-breakpoint
ALTER TABLE "decks" DROP COLUMN "publish_decided_at";--> statement-breakpoint
ALTER TABLE "decks" DROP COLUMN "publish_decided_by";--> statement-breakpoint
ALTER TABLE "decks" DROP COLUMN "publish_reject_reason";
