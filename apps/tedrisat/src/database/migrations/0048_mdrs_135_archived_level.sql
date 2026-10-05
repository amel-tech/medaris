ALTER TABLE "course_weeks" ADD COLUMN "archived_level" "scope_type";--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "archived_level" "scope_type";--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "archived_level" "scope_type";--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "archived_level" "scope_type";--> statement-breakpoint
ALTER TABLE "kosks" ADD COLUMN "archived_level" "scope_type";--> statement-breakpoint
ALTER TABLE "madrasahs" ADD COLUMN "archived_level" "scope_type";--> statement-breakpoint
-- What is already hidden keeps the kademe the archive enforced before this
-- column (MDRS-135, d-1003-07): the hider's level is the role `archived_by`
-- holds, or held (revoked rows count), where the item sits: its köşk, its
-- medrese and its course, the highest first. A köşk nazımı is the köşk, a
-- başmüderris or a medrese nazırı the medrese, a müderris or a ders nazırı the
-- course; a hider with no role there is the Medaris administration (the
-- SYSTEM_ADMIN realm role and a Medaris nazımı's platform row name no köşk,
-- medrese or course), the platform. A row that names no hider keeps a null
-- level: it counts as the lowest level that could have hidden it.
UPDATE "courses" c SET "archived_level" = COALESCE((
  SELECT CASE
    WHEN bool_or(ra."role" = 'KOSK_NAZIM') THEN 'kosk'
    WHEN bool_or(ra."role" IN ('MEDRESE_BASMUDERRIS', 'MEDRESE_NAZIR')) THEN 'madrasah'
    ELSE 'course'
  END::"scope_type"
  FROM "role_assignments" ra
  WHERE ra."user_id" = c."archived_by"
    AND ra."scope_id" IN (c."kosk_id", c."madrasah_id", c."id")
  HAVING count(*) > 0
), 'platform')
WHERE c."archived_at" IS NOT NULL AND c."archived_by" IS NOT NULL;--> statement-breakpoint
UPDATE "course_weeks" w SET "archived_level" = COALESCE((
  SELECT CASE
    WHEN bool_or(ra."role" = 'KOSK_NAZIM') THEN 'kosk'
    WHEN bool_or(ra."role" IN ('MEDRESE_BASMUDERRIS', 'MEDRESE_NAZIR')) THEN 'madrasah'
    ELSE 'course'
  END::"scope_type"
  FROM "role_assignments" ra
  JOIN "courses" c ON c."id" = w."course_id"
  WHERE ra."user_id" = w."archived_by"
    AND ra."scope_id" IN (c."kosk_id", c."madrasah_id", c."id")
  HAVING count(*) > 0
), 'platform')
WHERE w."archived_at" IS NOT NULL AND w."archived_by" IS NOT NULL;--> statement-breakpoint
UPDATE "lessons" l SET "archived_level" = COALESCE((
  SELECT CASE
    WHEN bool_or(ra."role" = 'KOSK_NAZIM') THEN 'kosk'
    WHEN bool_or(ra."role" IN ('MEDRESE_BASMUDERRIS', 'MEDRESE_NAZIR')) THEN 'madrasah'
    ELSE 'course'
  END::"scope_type"
  FROM "role_assignments" ra
  JOIN "course_weeks" w ON w."id" = l."week_id"
  JOIN "courses" c ON c."id" = w."course_id"
  WHERE ra."user_id" = l."archived_by"
    AND ra."scope_id" IN (c."kosk_id", c."madrasah_id", c."id")
  HAVING count(*) > 0
), 'platform')
WHERE l."archived_at" IS NOT NULL AND l."archived_by" IS NOT NULL;--> statement-breakpoint
UPDATE "decks" d SET "archived_level" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "role_assignments" ra
    WHERE ra."user_id" = d."archived_by"
      AND ra."role" = 'KOSK_NAZIM'
      AND ra."scope_id" = d."kosk_id"
  ) THEN 'kosk'
  ELSE 'platform'
END::"scope_type"
WHERE d."archived_at" IS NOT NULL AND d."archived_by" IS NOT NULL;--> statement-breakpoint
UPDATE "kosks" k SET "archived_level" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "role_assignments" ra
    WHERE ra."user_id" = k."archived_by"
      AND ra."role" = 'KOSK_NAZIM'
      AND ra."scope_id" = k."id"
  ) THEN 'kosk'
  ELSE 'platform'
END::"scope_type"
WHERE k."archived_at" IS NOT NULL AND k."archived_by" IS NOT NULL;--> statement-breakpoint
UPDATE "madrasahs" m SET "archived_level" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "role_assignments" ra
    WHERE ra."user_id" = m."archived_by"
      AND ra."role" IN ('MEDRESE_BASMUDERRIS', 'MEDRESE_NAZIR')
      AND ra."scope_id" = m."id"
  ) THEN 'madrasah'
  ELSE 'platform'
END::"scope_type"
WHERE m."archived_at" IS NOT NULL AND m."archived_by" IS NOT NULL;
