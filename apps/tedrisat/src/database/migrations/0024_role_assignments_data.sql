-- MDRS-134: moves what PR #99 created into role model v2's tables, which 0023
-- created. 0025 then drops the old tables and `kosks.madrasah_id`. A custom
-- migration (`drizzle-kit generate --custom`), because drizzle-kit does not
-- write data statements. Reversed by rollbacks/0024_role_assignments_data.down.sql;
-- pinned by test/e2e/role-assignments-migration.e2e.spec.ts.
--
-- The old tables store naive timestamps; `AT TIME ZONE 'UTC'` reads them as
-- UTC — what `now()` wrote on the UTC database — and the rollback writes them
-- back the same way, so the round trip is exact whatever the session zone.

-- Every köşk manager becomes a KOSK_NAZIM of that köşk, granted by whoever
-- added them.
INSERT INTO "role_assignments" ("user_id", "role", "scope_type", "scope_id", "granted_by", "created_at")
SELECT "user_id", 'KOSK_NAZIM', 'kosk', "kosk_id", "added_by", "created_at" AT TIME ZONE 'UTC'
FROM "kosk_managers";
--> statement-breakpoint
-- Every medrese nazır becomes a MEDRESE_BASMUDERRIS of that medrese.
-- `madrasah_nazirs` never recorded who added a nazır; the SYSTEM_ADMIN who
-- opened the medrese stands in as the granter.
INSERT INTO "role_assignments" ("user_id", "role", "scope_type", "scope_id", "granted_by", "created_at")
SELECT n."user_id", 'MEDRESE_BASMUDERRIS', 'madrasah', n."madrasah_id", m."created_by", n."created_at" AT TIME ZONE 'UTC'
FROM "madrasah_nazirs" n
JOIN "madrasahs" m ON m."id" = n."madrasah_id";
--> statement-breakpoint
-- Every müderris bound to an account becomes a MUDERRIS of that course, once
-- per person even if the course lists them twice. The one listed first (the
-- lowest `order_index`) is the course's imam. `course_muderris` stays as it
-- is: it is what the course page shows. It records neither who bound the
-- account nor when, so the course's author and creation time stand in.
WITH "bound" AS (
  SELECT "course_id", "user_id", min("order_index") AS "first_index", min("id"::text) AS "first_id"
  FROM "course_muderris"
  WHERE "user_id" IS NOT NULL
  GROUP BY "course_id", "user_id"
), "ranked" AS (
  SELECT "bound".*, row_number() OVER (PARTITION BY "course_id" ORDER BY "first_index", "first_id") AS "rank"
  FROM "bound"
)
INSERT INTO "role_assignments" ("user_id", "role", "scope_type", "scope_id", "is_imam", "granted_by", "created_at")
SELECT r."user_id", 'MUDERRIS', 'course', r."course_id", r."rank" = 1, c."author_id", c."created_at" AT TIME ZONE 'UTC'
FROM "ranked" r
JOIN "courses" c ON c."id" = r."course_id";
--> statement-breakpoint
-- A köşk affiliated with a medrese (MDRS-106) becomes a köşk that medrese
-- holds a hosting right in. Who affiliated it was never recorded; the
-- medrese's opener stands in as the granter.
INSERT INTO "madrasah_kosk_hosting" ("madrasah_id", "kosk_id", "granted_by")
SELECT k."madrasah_id", k."id", m."created_by"
FROM "kosks" k
JOIN "madrasahs" m ON m."id" = k."madrasah_id";
--> statement-breakpoint
-- The courses of those köşks are NOT moved into the medrese: that is a
-- decision for a person. They are printed for review instead — the app's
-- migrator logs each notice (DatabaseService) — and can be listed again
-- until a hosting right is revoked with the query in
-- docs/migration/mdrs-134-role-assignments.md.
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT m."handle" AS "madrasah", k."name" AS "kosk", c."id", c."title"
    FROM "kosks" k
    JOIN "madrasahs" m ON m."id" = k."madrasah_id"
    JOIN "courses" c ON c."kosk_id" = k."id"
    ORDER BY m."handle", k."name", c."title", c."id"
  LOOP
    RAISE NOTICE 'MDRS-134 review: course % "%" of köşk "%", formerly affiliated with medrese %, belongs to no medrese',
      r."id", r."title", r."kosk", r."madrasah";
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'MDRS-134 review: % course(s) of formerly affiliated köşks to review', n;
END $$;
