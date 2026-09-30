-- Reverses migrations/0023_role_assignments_data.sql (MDRS-134): moves the
-- held roles and hosting rights back into the tables 0024's rollback has just
-- re-created, then empties the v2 tables so that 0023 can run again. Run
-- after rollbacks/0024 and before rollbacks/0022; see 0024's header.
--
-- Only what the old model can express comes back: held KOSK_NAZIM rows as
-- köşk managers, held MEDRESE_BASMUDERRIS rows as medrese nazırs, and one
-- hosting right per köşk (the oldest) as its affiliation. Everything v2-only
-- — revoked and expired rows, MEDARIS_NAZIM, MEDRESE_NAZIR and DERS_NAZIR
-- rows, a köşk's second hosting right — is lost, which is what a rollback
-- means here. MUDERRIS rows need nothing: `course_muderris.user_id` is kept
-- in step by the app and was never dropped. Pinned by
-- test/e2e/role-assignments-migration.e2e.spec.ts.
INSERT INTO "kosk_managers" ("kosk_id", "user_id", "added_by", "created_at")
SELECT "scope_id", "user_id", "granted_by", "created_at" AT TIME ZONE 'UTC'
FROM "role_assignments"
WHERE "role" = 'KOSK_NAZIM'
  AND "revoked_at" IS NULL
  AND ("expires_at" IS NULL OR "expires_at" > now());
--> statement-breakpoint
INSERT INTO "madrasah_nazirs" ("madrasah_id", "user_id", "created_at")
SELECT "scope_id", "user_id", "created_at" AT TIME ZONE 'UTC'
FROM "role_assignments"
WHERE "role" = 'MEDRESE_BASMUDERRIS'
  AND "revoked_at" IS NULL
  AND ("expires_at" IS NULL OR "expires_at" > now());
--> statement-breakpoint
UPDATE "kosks" k
SET "madrasah_id" = h."madrasah_id"
FROM (
  SELECT DISTINCT ON ("kosk_id") "kosk_id", "madrasah_id"
  FROM "madrasah_kosk_hosting"
  WHERE "revoked_at" IS NULL
  ORDER BY "kosk_id", "created_at", "id"
) h
WHERE k."id" = h."kosk_id";
--> statement-breakpoint
DELETE FROM "madrasah_kosk_hosting";
--> statement-breakpoint
DELETE FROM "role_assignments";
