import { eq, sql } from "drizzle-orm";
import type { Tx } from "../course/course-purge";
import { courses } from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import { type HideLevel, hiderLevelOf, mayRestoreAt } from "./hide-level";

export type CourseRestoreOutcome =
  | { status: "restored"; title: string }
  | { status: "not-found" }
  | { status: "not-hidden" }
  | { status: "level"; hiddenAt: HideLevel }
  | { status: "parent-hidden" };

/**
 * Brings a hidden course back, in the caller's transaction. Both restore routes
 * (`POST /courses/:id/restore` and `POST /archive/course/:id/restore`) come
 * here, so they refuse the same things in the same order:
 *
 * - by kademe: the level that hid the course, or one above it (MDRS-135). The
 *   level is read under the row lock, so a re-hide at a higher level that lands
 *   between the caller's decision and this write is never undone by a lower one;
 * - a course whose köşk or medrese is still hidden: it comes back with them.
 */
export async function restoreCourseIn(
  tx: Tx,
  id: string,
  restorer: HideLevel
): Promise<CourseRestoreOutcome> {
  const [course] = await tx
    .select({
      title: courses.title,
      archivedAt: courses.archivedAt,
      archivedLevel: courses.archivedLevel,
      madrasahId: courses.madrasahId,
      koskArchivedAt: kosks.archivedAt,
      madrasahArchivedAt: madrasahs.archivedAt,
    })
    .from(courses)
    .innerJoin(kosks, eq(kosks.id, courses.koskId))
    .leftJoin(madrasahs, eq(madrasahs.id, courses.madrasahId))
    .where(eq(courses.id, id))
    .for("update", { of: courses });
  if (!course) return { status: "not-found" };
  if (course.archivedAt === null) return { status: "not-hidden" };
  const hiddenAt = hiderLevelOf({
    type: "course",
    madrasahId: course.madrasahId,
    archivedLevel: course.archivedLevel,
  });
  if (!mayRestoreAt(restorer, hiddenAt)) return { status: "level", hiddenAt };
  if (course.koskArchivedAt !== null || course.madrasahArchivedAt !== null) {
    return { status: "parent-hidden" };
  }
  await tx
    .update(courses)
    .set({
      archivedAt: null,
      archivedBy: null,
      archivedLevel: null,
      version: sql`${courses.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(courses.id, id));
  return { status: "restored", title: course.title };
}
