CREATE TABLE "calendar_feed_tokens" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feed_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "lessons_scheduled_at_idx" ON "lessons" USING btree ("scheduled_at");