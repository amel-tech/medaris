-- Reverses migrations/0025_drop_superseded_role_tables.sql (MDRS-134): puts
-- back, empty, exactly what 0017 and 0021 created. The rows come back with
-- rollbacks/0024_role_assignments_data.down.sql, which runs next. The app
-- never runs this: drizzle's migrator only moves forward. To roll back by
-- hand, run 0025, 0024 and 0023's down scripts in that order, then delete
-- those three rows from "drizzle"."__drizzle_migrations" so that the next
-- boot applies them again. Pinned by
-- test/e2e/role-assignments-migration.e2e.spec.ts.
CREATE TABLE "kosk_managers" (
	"kosk_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kosk_managers_kosk_id_user_id_pk" PRIMARY KEY("kosk_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "kosk_managers" ADD CONSTRAINT "kosk_managers_kosk_id_kosks_id_fk" FOREIGN KEY ("kosk_id") REFERENCES "public"."kosks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kosk_managers_user_id_idx" ON "kosk_managers" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "madrasah_nazirs" (
	"madrasah_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "madrasah_nazirs_madrasah_id_user_id_pk" PRIMARY KEY("madrasah_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "madrasah_nazirs" ADD CONSTRAINT "madrasah_nazirs_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kosks" ADD COLUMN "madrasah_id" uuid;--> statement-breakpoint
ALTER TABLE "kosks" ADD CONSTRAINT "kosks_madrasah_id_madrasahs_id_fk" FOREIGN KEY ("madrasah_id") REFERENCES "public"."madrasahs"("id") ON DELETE set null ON UPDATE no action;
