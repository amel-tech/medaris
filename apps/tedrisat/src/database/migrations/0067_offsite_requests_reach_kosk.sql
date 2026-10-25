-- MDRS-187 and MDRS-181 built the two halves of one request on two tables.
-- nazar's "Medrese dışı ders talebi" (nazir/09) wrote offsite_course_requests,
-- which no screen reads. The köşk's "Ders talepleri" (nizam/39) lists and
-- decides course_requests, which nothing wrote. From this release nazar writes
-- course_requests too; this copies the requests already sent, with their ids,
-- so that each one reaches its köşk as PENDING. offsite_course_requests is left
-- as it is, no longer read or written, for a later migration to drop.
INSERT INTO "course_requests" ("id", "kosk_id", "madrasah_id", "title", "reason", "requested_by", "status", "created_at")
SELECT "id", "kosk_id", "madrasah_id", "title", "reason", "requested_by", "status"::text, "created_at"
FROM "offsite_course_requests"
ON CONFLICT ("id") DO NOTHING;
