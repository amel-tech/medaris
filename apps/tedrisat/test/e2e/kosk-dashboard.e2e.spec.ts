import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { ROSTER_READ_ACTION } from "../../src/course/domain/course-content";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-135 on a köşk nazımı's home page (`GET /kosks/:id/dashboard`, nizam/02):
 * who is shown the meeting links and the applicants' e-mail addresses, what a
 * passive course leaves on the page, and which reads go on the record.
 *
 * One köşk with two published courses, each with a live session tomorrow and a
 * waiting applicant: "Bina" is taught; "Emsile" lost its müderris, so it is
 * passive. Real Postgres, real guard, minted tokens.
 */
const ADMIN_ID = "cb000000-0000-4000-8000-000000000001";
const NAZIM_ID = "cb000000-0000-4000-8000-000000000002";
const MEDARIS_ID = "cb000000-0000-4000-8000-000000000003";
const MUDERRIS_ID = "cb000000-0000-4000-8000-000000000004";
const GONE_ID = "cb000000-0000-4000-8000-000000000005";
const TALEBE_ID = "cb000000-0000-4000-8000-000000000006";

const LINK = "https://meet.google.com/aaa-bbbb-ccc";
const PASSIVE_LINK = "https://meet.google.com/ddd-eeee-fff";
const EMAIL = "talebe@example.com";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("The köşk home page under MDRS-135 (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let taughtId: string;
  let passiveId: string;

  const db = () => databaseService.db;
  const dashboard = (sub: string) =>
    request(app.getHttpServer())
      .get(`/kosks/${koskId}/dashboard`)
      .set("Authorization", auth(sub));
  const rows = (action: string) =>
    db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, action))
      .orderBy(auditLog.seq);

  type Body = {
    contentLocked: boolean;
    sessions: { courseId: string; meetingUrl?: string | null }[];
    latestApplications: { courseId: string; studentEmail?: string | null }[];
    sessionCounts: { upcoming: number };
  };
  const coursesOf = (body: Body) =>
    [...new Set(body.sessions.map((s) => s.courseId))].sort();

  /** A grant to the Medaris nazımı, at the platform unless a köşk is named. */
  const grantMedaris = (permission: string, kosk?: string) =>
    db()
      .insert(permissionGrants)
      .values({
        userId: MEDARIS_ID,
        scopeType: kosk ? SCOPE_TYPES.KOSK : SCOPE_TYPES.PLATFORM,
        scopeId: kosk ?? null,
        permission,
        grantedBy: kosk ? NAZIM_ID : ADMIN_ID,
      });

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      ...COURSE_TREE_TABLES,
      "audit_log",
      "users"
    );
    await db()
      .insert(users)
      .values(
        [ADMIN_ID, NAZIM_ID, MEDARIS_ID, MUDERRIS_ID, GONE_ID, TALEBE_ID].map(
          (id) => ({ id })
        )
      );
    [{ id: koskId }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_ID, name: "Süleymaniye Köşkü" })
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
      grantedBy: ADMIN_ID,
    });
    await db().insert(roleAssignments).values({
      userId: MEDARIS_ID,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN_ID,
    });

    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const seedCourse = async (title: string, link: string) => {
      const [course] = await db()
        .insert(courses)
        .values({
          koskId,
          authorId: NAZIM_ID,
          title,
          status: CourseStatus.PUBLISHED,
        })
        .returning();
      const [week] = await db()
        .insert(courseWeeks)
        .values({ courseId: course.id, weekNumber: 1, title: "Birinci Bab" })
        .returning();
      await db().insert(lessons).values({
        weekId: week.id,
        title: "Canlı celse",
        type: LessonType.LIVE,
        scheduledAt: tomorrow,
        meetingUrl: link,
      });
      await db().insert(enrollments).values({
        userId: TALEBE_ID,
        courseId: course.id,
        status: EnrollmentStatus.PENDING,
        studentName: "Talebe",
        studentEmail: EMAIL,
      });
      return course.id;
    };
    taughtId = await seedCourse("Bina", LINK);
    passiveId = await seedCourse("Emsile", PASSIVE_LINK);
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: taughtId,
      grantedBy: NAZIM_ID,
    });
    await db()
      .insert(courseMuderris)
      .values({ courseId: taughtId, userId: MUDERRIS_ID, name: "Müderris" });
    // Emsile's müderris has gone: the course is passive (MDRS-136).
    await db().insert(roleAssignments).values({
      userId: GONE_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeType: SCOPE_TYPES.COURSE,
      scopeId: passiveId,
      grantedBy: NAZIM_ID,
      revokedAt: new Date(),
      revokedBy: NAZIM_ID,
    });
  });

  it("gives the köşk nazımı every link and e-mail, the passive course's too, and puts each read on the record", async () => {
    const { body } = (await dashboard(NAZIM_ID).expect(200)) as { body: Body };
    expect(body.contentLocked).toBe(false);
    expect(coursesOf(body)).toEqual([taughtId, passiveId].sort());
    expect(body.sessions.map((s) => s.meetingUrl).sort()).toEqual(
      [LINK, PASSIVE_LINK].sort()
    );
    expect(body.latestApplications).toHaveLength(2);
    expect(body.latestApplications.map((a) => a.studentEmail)).toEqual([
      EMAIL,
      EMAIL,
    ]);

    const [roster, ...more] = await rows(ROSTER_READ_ACTION);
    expect(more).toEqual([]);
    expect(roster).toMatchObject({
      actorId: NAZIM_ID,
      entity: "kosk",
      entityId: koskId,
    });
    expect(roster.details).toMatchObject({
      via: "kosk-dashboard",
      systemAdmin: false,
      permission: PERMISSIONS.KOSK_MANAGE,
    });
    expect(
      [...((roster.details as { courseIds: string[] }).courseIds ?? [])].sort()
    ).toEqual([taughtId, passiveId].sort());
    const reads = await rows("course.content_read");
    expect(reads.map((r) => r.entityId).sort()).toEqual(
      [taughtId, passiveId].sort()
    );
    expect(reads.every((r) => r.actorId === NAZIM_ID)).toBe(true);
  });

  it("writes no content read for the link of a course the caller teaches", async () => {
    await db()
      .insert(courseMuderris)
      .values({ courseId: taughtId, userId: NAZIM_ID, name: "Nazım" });
    await dashboard(NAZIM_ID).expect(200);
    const reads = await rows("course.content_read");
    expect(reads.map((r) => r.entityId)).toEqual([passiveId]);
  });

  it("gives a Medaris nazımı holding only platform.kosk_edit no link, no e-mail and no passive course", async () => {
    await grantMedaris(PERMISSIONS.PLATFORM_KOSK_EDIT);
    const { body } = (await dashboard(MEDARIS_ID).expect(200)) as {
      body: Body;
    };
    expect(body.contentLocked).toBe(true);
    expect(coursesOf(body)).toEqual([taughtId]);
    expect(body.sessionCounts.upcoming).toBe(1);
    for (const session of body.sessions) {
      expect(session).not.toHaveProperty("meetingUrl");
    }
    expect(body.latestApplications.map((a) => a.courseId)).toEqual([taughtId]);
    for (const application of body.latestApplications) {
      expect(application).not.toHaveProperty("studentEmail");
    }
    // The names were read, so the roster read is on the record; no link was handed out.
    const [roster] = await rows(ROSTER_READ_ACTION);
    expect(roster.details).toMatchObject({
      permission: PERMISSIONS.PLATFORM_KOSK_EDIT,
    });
    expect(await rows("course.content_read")).toEqual([]);
  });

  it("keeps a passive course off the page for a kosk.manage grant, and on it for platform.inactive_scopes_manage", async () => {
    await grantMedaris(PERMISSIONS.KOSK_MANAGE, koskId);
    const managed = (await dashboard(MEDARIS_ID).expect(200)) as {
      body: Body;
    };
    expect(managed.body.contentLocked).toBe(false);
    expect(coursesOf(managed.body)).toEqual([taughtId]);
    expect(managed.body.sessions[0].meetingUrl).toBe(LINK);

    await grantMedaris(PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE);
    const opened = (await dashboard(MEDARIS_ID).expect(200)) as {
      body: Body;
    };
    expect(coursesOf(opened.body)).toEqual([taughtId, passiveId].sort());
    const reads = await db()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "course.content_read"),
          eq(auditLog.entityId, passiveId)
        )
      );
    expect(reads.map((r) => r.actorId)).toEqual([MEDARIS_ID]);
  });

  it("gives the başnazım everything, on the record as a bypass", async () => {
    const { body } = (await dashboard(ADMIN_ID).expect(200)) as { body: Body };
    expect(body.contentLocked).toBe(false);
    expect(coursesOf(body)).toEqual([taughtId, passiveId].sort());
    const [roster] = await rows(ROSTER_READ_ACTION);
    expect(roster.details).toMatchObject({ systemAdmin: true });
    expect(await rows("course.content_read")).toHaveLength(2);
  });
});
