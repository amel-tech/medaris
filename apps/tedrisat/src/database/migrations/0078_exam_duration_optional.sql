ALTER TABLE "online_exams" ALTER COLUMN "duration_minutes" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "online_exams" ALTER COLUMN "duration_minutes" DROP NOT NULL;