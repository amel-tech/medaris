import { ROLES } from "@medaris/common";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import type { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { assignRole } from "./test-database.helper";
import { bearerFor } from "./test-keycloak.helper";

/**
 * One published course with a müderris, an enrolled talebe and a session, and
 * a second course beside it: what the specs of a müderris's own material (the
 * sarf page, the lesson board, the glossary, the lesson note) all start from.
 * Each of those is written by the course's staff and read by whoever reads the
 * course's content, so the same six callers answer every one of them.
 */
export const EMSILE = {
  MANAGER: "e5110000-0000-4000-8000-000000000001",
  MUDERRIS: "e5110000-0000-4000-8000-000000000002",
  TALEBE: "e5110000-0000-4000-8000-000000000003",
  PENDING: "e5110000-0000-4000-8000-000000000004",
  STRANGER: "e5110000-0000-4000-8000-000000000005",
  ADMIN: "e5110000-0000-4000-8000-00000000000a",
  ABSENT: "00000000-0000-4000-8000-000000000000",
} as const;

export const emsileBearer = (sub: string) =>
  sub === EMSILE.ADMIN
    ? bearerFor({
        sub,
        claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
      })
    : bearerFor({ sub });

export interface EmsileCourse {
  koskId: string;
  courseId: string;
  lessonId: string;
  foreignCourseId: string;
  foreignLessonId: string;
}

export async function seedEmsileCourse(
  db: DatabaseService["db"]
): Promise<EmsileCourse> {
  const [kosk] = await db
    .insert(kosks)
    .values({ ownerId: EMSILE.MANAGER, name: "Argedik Köşkü" })
    .returning();
  await assignRole(db, {
    userId: EMSILE.MANAGER,
    role: ASSIGNED_ROLES.KOSK_NAZIM,
    scopeId: kosk.id,
  });
  const [course, foreignCourse] = await db
    .insert(courses)
    .values([
      {
        koskId: kosk.id,
        authorId: EMSILE.MANAGER,
        title: "Emsile",
        status: CourseStatus.PUBLISHED,
      },
      {
        koskId: kosk.id,
        authorId: EMSILE.MANAGER,
        title: "Nahiv",
        status: CourseStatus.PUBLISHED,
      },
    ])
    .returning();
  await assignRole(db, {
    userId: EMSILE.MUDERRIS,
    role: ASSIGNED_ROLES.MUDERRIS,
    scopeId: course.id,
    grantedBy: EMSILE.MANAGER,
  });
  const [week, foreignWeek] = await db
    .insert(courseWeeks)
    .values([
      { courseId: course.id, weekNumber: 1, title: "Muhtelife", orderIndex: 0 },
      {
        courseId: foreignCourse.id,
        weekNumber: 1,
        title: "Nahiv",
        orderIndex: 0,
      },
    ])
    .returning();
  const [lesson, foreignLesson] = await db
    .insert(lessons)
    .values([
      {
        weekId: week.id,
        title: "Ders 1",
        type: LessonType.LIVE,
        orderIndex: 0,
        scheduledAt: new Date(Date.now() - 10 * 60_000),
        durationMinutes: 60,
      },
      {
        weekId: foreignWeek.id,
        title: "Başka dersin celsesi",
        type: LessonType.LIVE,
        orderIndex: 0,
      },
    ])
    .returning();
  await db.insert(enrollments).values([
    {
      userId: EMSILE.TALEBE,
      courseId: course.id,
      status: EnrollmentStatus.ENROLLED,
    },
    {
      userId: EMSILE.PENDING,
      courseId: course.id,
      status: EnrollmentStatus.PENDING,
    },
  ]);
  return {
    koskId: kosk.id,
    courseId: course.id,
    lessonId: lesson.id,
    foreignCourseId: foreignCourse.id,
    foreignLessonId: foreignLesson.id,
  };
}
