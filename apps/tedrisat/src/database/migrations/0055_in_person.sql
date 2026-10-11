ALTER TABLE "courses" ADD COLUMN "in_person" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "in_person" boolean;