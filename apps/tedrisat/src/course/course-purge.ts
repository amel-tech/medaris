import { eq, inArray } from "drizzle-orm";
import type { DatabaseService } from "../database/database.service";
import { deleteAssignmentsIn } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import {
  courseMuderris,
  courseResources,
  courses,
  courseWeeks,
  enrollments,
  lessonRecordings,
  lessons,
} from "../database/schema/course.schema";
import { lessonNotes } from "../database/schema/lesson-note.schema";
import { lessonQuestions } from "../database/schema/lesson-question.schema";
import { SCOPE_TYPES } from "../database/schema/role-assignment.schema";

export type Tx = Parameters<
  Parameters<DatabaseService["db"]["transaction"]>[0]
>[0];

/** How many rows of each table a real delete removed (MDRS-124). */
export interface IPurgeCounts {
  courses: number;
  weeks: number;
  lessons: number;
  muderris: number;
  resources: number;
  enrollments: number;
}

export const emptyPurgeCounts = (): IPurgeCounts => ({
  courses: 0,
  weeks: 0,
  lessons: 0,
  muderris: 0,
  resources: 0,
  enrollments: 0,
});

/**
 * Deletes the given courses and every row under them, children first, inside
 * the caller's transaction, and returns what went.
 *
 * This is the only code that deletes a course (MDRS-124). The foreign keys
 * under a course are `ON DELETE RESTRICT`, so nothing is taken implicitly:
 * every table is named here, and a table added under a course later without
 * being added here makes this fail loudly instead of leaving orphans or
 * silently cascading. Lessons and weeks are removed whether hidden or not.
 */
export async function purgeCourses(
  tx: Tx,
  courseIds: string[]
): Promise<IPurgeCounts> {
  const counts = emptyPurgeCounts();
  if (courseIds.length === 0) return counts;

  const weekIds = (
    await tx
      .select({ id: courseWeeks.id })
      .from(courseWeeks)
      .where(inArray(courseWeeks.courseId, courseIds))
  ).map((w) => w.id);

  if (weekIds.length > 0) {
    // Recordings (MDRS-162), notes and questions (MDRS-150) hang off lessons;
    // they go first, uncounted.
    const lessonIds = tx
      .select({ id: lessons.id })
      .from(lessons)
      .where(inArray(lessons.weekId, weekIds));
    await tx
      .delete(lessonRecordings)
      .where(inArray(lessonRecordings.lessonId, lessonIds));
    await tx
      .delete(lessonNotes)
      .where(inArray(lessonNotes.lessonId, lessonIds));
    await tx
      .delete(lessonQuestions)
      .where(inArray(lessonQuestions.lessonId, lessonIds));
    counts.lessons = (
      await tx
        .delete(lessons)
        .where(inArray(lessons.weekId, weekIds))
        .returning({ id: lessons.id })
    ).length;
    counts.weeks = (
      await tx
        .delete(courseWeeks)
        .where(inArray(courseWeeks.id, weekIds))
        .returning({ id: courseWeeks.id })
    ).length;
  }
  // The courses' role rows (MUDERRIS, DERS_NAZIR) are no foreign-key
  // children — `scope_id` points at any kind of scope — so they are named
  // here too (MDRS-134). Not counted: `muderris` below already counts who
  // taught there.
  await deleteAssignmentsIn(tx, SCOPE_TYPES.COURSE, courseIds);
  counts.muderris = (
    await tx
      .delete(courseMuderris)
      .where(inArray(courseMuderris.courseId, courseIds))
      .returning({ id: courseMuderris.id })
  ).length;
  counts.resources = (
    await tx
      .delete(courseResources)
      .where(inArray(courseResources.courseId, courseIds))
      .returning({ id: courseResources.id })
  ).length;
  counts.enrollments = (
    await tx
      .delete(enrollments)
      .where(inArray(enrollments.courseId, courseIds))
      .returning({ userId: enrollments.userId })
  ).length;
  counts.courses = (
    await tx
      .delete(courses)
      .where(inArray(courses.id, courseIds))
      .returning({ id: courses.id })
  ).length;
  return counts;
}

/** The ids of every course of a köşk, hidden or not. */
export async function courseIdsOfKosk(
  tx: Tx,
  koskId: string
): Promise<string[]> {
  return (
    await tx
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.koskId, koskId))
  ).map((c) => c.id);
}

/** One `audit_log` row, written in the same transaction as the delete. */
export async function recordDeletion(
  tx: Tx,
  entry: {
    actorId: string;
    entity: string;
    entityId: string;
    details: Record<string, unknown>;
  }
): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: entry.actorId,
    action: `${entry.entity}.delete`,
    entity: entry.entity,
    entityId: entry.entityId,
    details: entry.details,
  });
}
