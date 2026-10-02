ALTER TABLE "course_weeks" ADD COLUMN "archived_by" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "archived_by" uuid;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "archived_by" uuid;--> statement-breakpoint
ALTER TABLE "kosks" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kosks" ADD COLUMN "archived_by" uuid;