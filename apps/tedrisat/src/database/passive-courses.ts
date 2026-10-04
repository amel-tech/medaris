import type { ScopeRef } from "@medaris/common";
import { inArray, sql } from "drizzle-orm";
import type { DatabaseService } from "./database.service";
import { isPassiveScope } from "./role-assignments";
import { courses } from "./schema/course.schema";
import { ASSIGNED_ROLES, SCOPE_TYPES } from "./schema/role-assignment.schema";

/**
 * For each of these courses that sits in a passive scope (MDRS-136), the first
 * such scope, narrowest first as the engine's chain reads them: the course, its
 * medrese, its köşk. A list that hands out a passive course's content (a live
 * link) to the köşk's nazımı or the platform's management writes the
 * `scope.passive_open` the engine writes for the same open (MDRS-135).
 */
export async function passiveScopesOf(
  db: DatabaseService["db"],
  courseIds: readonly string[]
): Promise<Map<string, ScopeRef>> {
  const result = new Map<string, ScopeRef>();
  if (courseIds.length === 0) return result;
  const rows = await db
    .select({
      id: courses.id,
      koskId: courses.koskId,
      madrasahId: courses.madrasahId,
      course: sql<boolean>`${isPassiveScope(ASSIGNED_ROLES.MUDERRIS, courses.id)}`,
      madrasah: sql<boolean>`${isPassiveScope(
        ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
        courses.madrasahId
      )}`,
      kosk: sql<boolean>`${isPassiveScope(ASSIGNED_ROLES.KOSK_NAZIM, courses.koskId)}`,
    })
    .from(courses)
    .where(inArray(courses.id, [...new Set(courseIds)]));
  for (const row of rows) {
    const scope: ScopeRef | null = row.course
      ? { type: SCOPE_TYPES.COURSE, id: row.id }
      : row.madrasah && row.madrasahId
        ? { type: SCOPE_TYPES.MADRASAH, id: row.madrasahId }
        : row.kosk
          ? { type: SCOPE_TYPES.KOSK, id: row.koskId }
          : null;
    if (scope) result.set(row.id, scope);
  }
  return result;
}
