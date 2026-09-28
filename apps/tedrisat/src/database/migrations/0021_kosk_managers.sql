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
-- MDRS-126, added by hand after drizzle-kit generated the statements above:
-- every existing köşk's owner becomes its first manager, so nobody loses a
-- köşk they managed before this migration. `kosks.owner_id` stays, as who
-- created the köşk. Pinned by test/e2e/kosk-managers-migration.e2e.spec.ts.
INSERT INTO "kosk_managers" ("kosk_id", "user_id", "added_by", "created_at")
SELECT "id", "owner_id", "owner_id", "created_at" FROM "kosks";
