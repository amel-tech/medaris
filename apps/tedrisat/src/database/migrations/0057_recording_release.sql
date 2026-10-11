ALTER TABLE "lesson_recordings" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "recording_available_at" timestamp with time zone;--> statement-breakpoint
-- Backfill (MDRS-288, hand-appended to the generated statements above). A
-- recording that is READY now has already been open to its talebe, and was
-- announced when it became READY (MDRS-283) or before announcements existed:
-- it counts as announced, so a release time set on its session later never
-- tells them again. Every session keeps a null release time: as soon as READY,
-- which is how every recording has behaved so far.
UPDATE "lesson_recordings" SET "notified_at" = now() WHERE "status" = 'READY';