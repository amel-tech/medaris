-- Reverses migrations/0069_appeals.sql. The app never runs this: drizzle's
-- migrator only moves forward. To roll back by hand, run these statements in
-- one transaction, then delete 0069's row from "drizzle"."__drizzle_migrations"
-- so that the next boot applies it again.
--
-- Lost: every medrese's appeal against a köşk refusing its course request,
-- with its reason and the decision on it. The course requests themselves are
-- untouched: one whose appeal was accepted stays PENDING for the köşk, as the
-- acceptance left it. The audit rows (appeal.create, appeal.accept,
-- appeal.reject) stay in "audit_log". Roll the application back first, or
-- nazar and nizam keep calling routes whose table is gone.
DROP INDEX "appeals_status_idx";
DROP INDEX "appeals_course_request_uq";
DROP TABLE "appeals";
