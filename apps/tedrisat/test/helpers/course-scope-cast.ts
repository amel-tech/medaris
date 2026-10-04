import { ROLES } from "@medaris/common";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import type { DatabaseService } from "../../src/database/database.service";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../../src/database/schema/permission.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { assignRole } from "./test-database.helper";
import { bearerFor } from "./test-keycloak.helper";

/**
 * The people of the nazir course scope (MDRS-247), for the specs that pin who
 * may do what in one course: the course's müderris, ders nazırları holding one
 * code each (in course A, or in course B beside it), a lapsed grant, a group,
 * and the people who hold nothing. Every id is fixed so a spec can name them.
 */
export const CAST = {
  MANAGER: "e2470000-0000-4000-8000-0000000000a1",
  MUDERRIS: "e2470000-0000-4000-8000-0000000000a2",
  /** Ders nazırı of course A with `recording.manage`. */
  RECORDING: "e2470000-0000-4000-8000-0000000000a3",
  /** Ders nazırı of course A with `course.edit`. */
  EDIT: "e2470000-0000-4000-8000-0000000000a4",
  /** Ders nazırı of course A with `session.manage`. */
  SESSION: "e2470000-0000-4000-8000-0000000000a5",
  /** Ders nazırı of course A with `course.edit` and `session.manage`. */
  EDIT_AND_SESSION: "e2470000-0000-4000-8000-0000000000a6",
  /** Ders nazırı of course A with `enrollment.decide`. */
  ROSTER: "e2470000-0000-4000-8000-0000000000a7",
  /** Ders nazırı of course A with `week.hide`, which opens no content. */
  WEEK_HIDE: "e2470000-0000-4000-8000-0000000000a8",
  /** Ders nazırı of course A with no grant at all. */
  BARE: "e2470000-0000-4000-8000-0000000000a9",
  /** Ders nazırı of course A whose `recording.manage` has run out. */
  LAPSED: "e2470000-0000-4000-8000-0000000000aa",
  /** Ders nazırı of course A given a group of `recording.manage` and `session.manage`. */
  GROUP: "e2470000-0000-4000-8000-0000000000ab",
  /** Ders nazırı of course B with `recording.manage`, `course.edit` and `session.manage`: nothing in A. */
  OTHER_COURSE: "e2470000-0000-4000-8000-0000000000ac",
  TALEBE: "e2470000-0000-4000-8000-0000000000ad",
  PENDING: "e2470000-0000-4000-8000-0000000000ae",
  STRANGER: "e2470000-0000-4000-8000-0000000000af",
  ADMIN: "e2470000-0000-4000-8000-0000000000b0",
} as const;

export type CastMember = (typeof CAST)[keyof typeof CAST];

/** A bearer token for a member of the cast; the başnazım carries the realm role. */
export const bearerOf = (sub: CastMember): string =>
  sub === CAST.ADMIN
    ? bearerFor({
        sub,
        claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
      })
    : bearerFor({ sub });

/** What `seedCourseScope` made. */
export interface ICourseScopeIds {
  koskId: string;
  /** The course the cast holds things in. */
  courseId: string;
  /** A second course of the same köşk, where only `OTHER_COURSE` holds anything. */
  otherCourseId: string;
  weekId: string;
}

/**
 * Inserts the köşk, two published courses, one week of the first, the müderris
 * on the first course's list, and every role, grant, group and enrollment of `CAST`. Clean the tables first
 * (`permission_grants`, `permission_groups`, `COURSE_TREE_TABLES`).
 */
export async function seedCourseScope(
  db: DatabaseService["db"]
): Promise<ICourseScopeIds> {
  const [kosk] = await db
    .insert(kosks)
    .values({ ownerId: CAST.MANAGER, name: "Nûruosmaniye Köşkü" })
    .returning();
  await assignRole(db, {
    userId: CAST.MANAGER,
    role: ASSIGNED_ROLES.KOSK_NAZIM,
    scopeId: kosk.id,
  });
  const [course, other] = await db
    .insert(courses)
    .values([
      {
        koskId: kosk.id,
        authorId: CAST.MANAGER,
        title: "Emsile ve Bina",
        status: CourseStatus.PUBLISHED,
      },
      {
        koskId: kosk.id,
        authorId: CAST.MANAGER,
        title: "Başka ders",
        status: CourseStatus.PUBLISHED,
      },
    ])
    .returning();
  await assignRole(db, {
    userId: CAST.MUDERRIS,
    role: ASSIGNED_ROLES.MUDERRIS,
    scopeId: course.id,
    grantedBy: CAST.MANAGER,
  });
  // The müderris is listed on the course as well as seated: a course whose
  // seats all end is passive, and a save that sends the list back would end
  // the seat of an unlisted müderris.
  await db.insert(courseMuderris).values({
    courseId: course.id,
    userId: CAST.MUDERRIS,
    name: "Musa Müderris",
    orderIndex: 0,
  });
  const [week] = await db
    .insert(courseWeeks)
    .values({
      courseId: course.id,
      weekNumber: 1,
      title: "Emsile",
      orderIndex: 0,
    })
    .returning();

  const nazirsOfA = [
    CAST.RECORDING,
    CAST.EDIT,
    CAST.SESSION,
    CAST.EDIT_AND_SESSION,
    CAST.ROSTER,
    CAST.WEEK_HIDE,
    CAST.BARE,
    CAST.LAPSED,
    CAST.GROUP,
  ];
  for (const userId of nazirsOfA) {
    await assignRole(db, {
      userId,
      role: ASSIGNED_ROLES.DERS_NAZIR,
      scopeId: course.id,
      grantedBy: CAST.MANAGER,
    });
  }
  await assignRole(db, {
    userId: CAST.OTHER_COURSE,
    role: ASSIGNED_ROLES.DERS_NAZIR,
    scopeId: other.id,
    grantedBy: CAST.MANAGER,
  });

  const [group] = await db
    .insert(permissionGroups)
    .values({
      scopeType: "course",
      scopeId: course.id,
      name: "Kayıtlar ve celseler",
      createdBy: CAST.MUDERRIS,
    })
    .returning();
  await db.insert(permissionGroupItems).values([
    { groupId: group.id, permission: "recording.manage" },
    { groupId: group.id, permission: "session.manage" },
  ]);
  const grant = { scopeType: "course" as const, grantedBy: CAST.MANAGER };
  const inA = { ...grant, scopeId: course.id };
  const inB = { ...grant, scopeId: other.id };
  await db.insert(permissionGrants).values([
    { ...inA, userId: CAST.RECORDING, permission: "recording.manage" },
    { ...inA, userId: CAST.EDIT, permission: "course.edit" },
    { ...inA, userId: CAST.SESSION, permission: "session.manage" },
    { ...inA, userId: CAST.EDIT_AND_SESSION, permission: "course.edit" },
    { ...inA, userId: CAST.EDIT_AND_SESSION, permission: "session.manage" },
    { ...inA, userId: CAST.ROSTER, permission: "enrollment.decide" },
    { ...inA, userId: CAST.WEEK_HIDE, permission: "week.hide" },
    {
      ...inA,
      userId: CAST.LAPSED,
      permission: "recording.manage",
      expiresAt: new Date(Date.now() - 60_000),
    },
    { ...inA, userId: CAST.GROUP, groupId: group.id },
    { ...inB, userId: CAST.OTHER_COURSE, permission: "recording.manage" },
    { ...inB, userId: CAST.OTHER_COURSE, permission: "course.edit" },
    { ...inB, userId: CAST.OTHER_COURSE, permission: "session.manage" },
  ]);

  await db.insert(enrollments).values([
    {
      userId: CAST.TALEBE,
      courseId: course.id,
      status: EnrollmentStatus.ENROLLED,
    },
    {
      userId: CAST.PENDING,
      courseId: course.id,
      status: EnrollmentStatus.PENDING,
    },
  ]);

  return {
    koskId: kosk.id,
    courseId: course.id,
    otherCourseId: other.id,
    weekId: week.id,
  };
}

/** A live lesson of `weekId`, held an hour ago unless the values say otherwise. */
export async function insertLiveLesson(
  db: DatabaseService["db"],
  weekId: string,
  orderIndex: number,
  values: Partial<typeof lessons.$inferInsert> = {}
): Promise<string> {
  const [lesson] = await db
    .insert(lessons)
    .values({
      weekId,
      orderIndex,
      title: `Celse ${orderIndex + 1}`,
      type: LessonType.LIVE,
      durationMinutes: 60,
      scheduledAt: new Date(Date.now() - 48 * 3_600_000),
      ...values,
    })
    .returning();
  return lesson.id;
}
