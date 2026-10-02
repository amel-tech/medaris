ALTER TABLE "madrasahs" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "madrasahs" ADD COLUMN "archived_by" uuid;--> statement-breakpoint
ALTER TABLE "madrasah_kosk_hosting" ADD COLUMN "granted_by_role" text;