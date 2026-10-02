ALTER TABLE "courses" ADD COLUMN "time_zone" text DEFAULT 'Europe/Istanbul' NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
-- Backfill (MDRS-110, hand-appended to the generated statements above).
-- nizam has only ever written "N dk", so a text that is a number with an
-- optional minute unit becomes that number, if it is a length the API accepts
-- (1-1440). Anything else — "10 soru" on a quiz, "0 dk", an empty string — is
-- not a length in minutes and stays NULL, which the apps show as "no
-- duration". The old column is left in place for a follow-up migration to
-- drop.
UPDATE "lessons" AS l
SET "duration_minutes" = parsed.minutes
FROM (
  SELECT "id", substring(lower("duration") from '^\s*(\d{1,4})\s*(?:dk\.?|dakika|min\.?|mins?|minutes?)?\s*$')::integer AS minutes
  FROM "lessons"
  WHERE lower("duration") ~ '^\s*\d{1,4}\s*(?:dk\.?|dakika|min\.?|mins?|minutes?)?\s*$'
) AS parsed
WHERE l."id" = parsed."id"
  AND parsed.minutes BETWEEN 1 AND 1440;
