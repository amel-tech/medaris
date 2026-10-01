ALTER TABLE "kosk_managers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "madrasah_nazirs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "kosk_managers" CASCADE;--> statement-breakpoint
DROP TABLE "madrasah_nazirs" CASCADE;--> statement-breakpoint
ALTER TABLE "kosks" DROP CONSTRAINT "kosks_madrasah_id_madrasahs_id_fk";
--> statement-breakpoint
ALTER TABLE "kosks" DROP COLUMN "madrasah_id";