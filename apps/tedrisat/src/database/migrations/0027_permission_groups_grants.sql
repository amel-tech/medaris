CREATE TABLE "permission_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"scope_id" uuid,
	"permission" text,
	"group_id" uuid,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "permission_grants_permission_xor_group" CHECK (("permission_grants"."permission" is null) <> ("permission_grants"."group_id" is null)),
	CONSTRAINT "permission_grants_scope_id_present" CHECK (("permission_grants"."scope_type" = 'platform') = ("permission_grants"."scope_id" is null)),
	CONSTRAINT "permission_grants_revocation_complete" CHECK (("permission_grants"."revoked_at" is null) = ("permission_grants"."revoked_by" is null))
);
--> statement-breakpoint
CREATE TABLE "permission_group_items" (
	"group_id" uuid NOT NULL,
	"permission" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"scope_id" uuid,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "permission_groups_scope_id_present" CHECK (("permission_groups"."scope_type" = 'platform') = ("permission_groups"."scope_id" is null))
);
--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_group_id_permission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."permission_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_group_items" ADD CONSTRAINT "permission_group_items_group_id_permission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."permission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "permission_grants_user_idx" ON "permission_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "permission_grants_group_idx" ON "permission_grants" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_group_items_unique_idx" ON "permission_group_items" USING btree ("group_id","permission");--> statement-breakpoint
CREATE INDEX "permission_groups_scope_idx" ON "permission_groups" USING btree ("scope_type","scope_id");