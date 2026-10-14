CREATE TABLE "integration_partner_kosks" (
	"client_id" text NOT NULL,
	"kosk_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "integration_partner_kosks_client_id_kosk_id_pk" PRIMARY KEY("client_id","kosk_id")
);
--> statement-breakpoint
CREATE TABLE "integration_partners" (
	"client_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "integration_partners_name_length" CHECK (char_length("integration_partners"."name") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "integration_partner_kosks" ADD CONSTRAINT "integration_partner_kosks_kosk_id_kosks_id_fk" FOREIGN KEY ("kosk_id") REFERENCES "public"."kosks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_partner_kosks" ADD CONSTRAINT "integration_partner_kosks_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."integration_partners"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_partner_kosks_kosk_id_idx" ON "integration_partner_kosks" USING btree ("kosk_id");