-- Reverses migrations/0067_offsite_requests_reach_kosk.sql. The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run it,
-- then delete 0067's row from "drizzle"."__drizzle_migrations" so that the next
-- boot applies it again.
--
-- Removes the copied requests that are still PENDING. One a köşk's nazım has
-- answered since stays, with its answer: offsite_course_requests has no column
-- for it. The rows in offsite_course_requests are untouched. Roll the
-- application back first, or nazar keeps writing course_requests.
DELETE FROM "course_requests"
WHERE "status" = 'PENDING'
  AND "id" IN (SELECT "id" FROM "offsite_course_requests");
