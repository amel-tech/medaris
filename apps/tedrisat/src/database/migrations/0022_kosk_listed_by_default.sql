ALTER TABLE "kosks" ALTER COLUMN "is_private" SET DEFAULT false;--> statement-breakpoint
UPDATE "kosks" SET "is_private" = false WHERE "is_private" = true;
