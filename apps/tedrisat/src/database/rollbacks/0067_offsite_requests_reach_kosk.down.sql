-- Reverses migrations/0067_offsite_requests_reach_kosk.sql. The app never runs
-- this: drizzle's migrator only moves forward. To roll back by hand, run it,
-- then delete 0067's row from "drizzle"."__drizzle_migrations" so that the next
-- boot applies it again.
--
-- Removes only what 0067 added and nobody has touched since: a course request
-- that is still PENDING and matches its offsite_course_requests row column by
-- column. A row that was in course_requests before 0067 and only shares the id
-- differs in its columns and stays. So does one a köşk's nazım has answered
-- since, with its answer: offsite_course_requests has no column for it. The
-- rows in offsite_course_requests are untouched. Roll the application back
-- first, or nazar keeps writing course_requests.
DELETE FROM "course_requests" AS cr
USING "offsite_course_requests" AS o
WHERE cr."id" = o."id"
  AND cr."status" = 'PENDING'
  AND cr."kosk_id" = o."kosk_id"
  AND cr."madrasah_id" = o."madrasah_id"
  AND cr."title" = o."title"
  AND cr."reason" = o."reason"
  AND cr."requested_by" = o."requested_by"
  AND cr."created_at" = o."created_at"
  AND cr."decided_by" IS NULL
  AND cr."course_id" IS NULL;
