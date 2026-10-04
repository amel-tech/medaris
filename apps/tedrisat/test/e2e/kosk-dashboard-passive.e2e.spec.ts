import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
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
 * MDRS-135 follow-up: the köşk home page's applications say whether the
 * viewer may answer them, as the engine decides it (`canDecide`), and whether
 * the course's scope is passive (`scopePassive`), so the screen does not offer
 * Onayla and Reddet where `enrollment.decide` is closed. The refusal itself
 * stays on the route: the last case presses the button the screen hides.
 */
const ADMIN = "f3500000-0000-4000-8000-000000000001";
const KOSK_NAZIM = "f3500000-0000-4000-8000-000000000002";
const MEDARIS_NAZIM = "f3500000-0000-4000-8000-000000000003";
const HEAD = "f3500000-0000-4000-8000-000000000004";
const MUDERRIS = "f3500000-0000-4000-8000-000000000005";
const APPLICANT = "f3500000-0000-4000-8000-000000000006";

const DAY = 24 * 3_600_000;
const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Köşk home applications in a passive scope (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let kosk: string;
  let madrasah: string;
  let ownCourse: string;
  let medreseCourse: string;
  let orphanCourse: string;

  const db = () => databaseService.db;
  const http = () => request(app.getHttpServer());
  const dashboard = (sub: string) =>
    http().get(`/kosks/${kosk}/dashboard`).set("Authorization", auth(sub));
  const approve = (course: string, sub: string) =>
    http()
      .post(`/courses/${course}/enrollments/${APPLICANT}/approve`)
      .set("Authorization", auth(sub));
  const reject = (course: string, sub: string) =>
    http()
      .delete(`/courses/${course}/enrollments/${APPLICANT}`)
      .set("Authorization", auth(sub));
  const statusOf = async (course: string) => {
    const [row] = await db()
      .select({ status: enrollments.status })
      .from(enrollments)
      .where(eq(enrollments.courseId, course));
    return row?.status;
  };
  const rowOf = (
    body: { latestApplications: { courseId: string }[] },
    id: string
  ) => body.latestApplications.find((a) => a.courseId === id);
  const endHead = () =>
    db()
      .update(roleAssignments)
      .set({ revokedAt: new Date(Date.now() - DAY), revokedBy: ADMIN })
      .where(
        and(
          eq(roleAssignments.userId, HEAD),
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS)
        )
      );
  const endKoskNazim = () =>
    db()
      .update(roleAssignments)
      .set({ revokedAt: new Date(Date.now() - DAY), revokedBy: ADMIN })
      .where(
        and(
          eq(roleAssignments.userId, KOSK_NAZIM),
          eq(roleAssignments.role, ASSIGNED_ROLES.KOSK_NAZIM)
        )
      );
  const TABLES = [
    "permission_grants",
    "permission_group_items",
    "permission_groups",
    ...COURSE_TREE_TABLES,
    "madrasahs",
    "audit_log",
    "users",
  ] as const;

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    await db()
      .insert(users)
      .values(
        [ADMIN, KOSK_NAZIM, MEDARIS_NAZIM, HEAD, MUDERRIS, APPLICANT].map(
          (id, n) => ({ id, email: `u${n}@example.com`, givenName: `U${n}` })
        )
      );
    await db().insert(roleAssignments).values({
      userId: MEDARIS_NAZIM,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN,
    });
    await db().insert(permissionGrants).values({
      userId: MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      permission: "platform.kosk_edit",
      grantedBy: ADMIN,
    });
    [{ id: kosk }] = await db()
      .insert(kosks)
      .values({ ownerId: ADMIN, name: "Nûruosmaniye Köşkü" })
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: KOSK_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk,
      grantedBy: ADMIN,
    });
    [{ id: madrasah }] = await db()
      .insert(madrasahs)
      .values({ handle: "zeyrek", name: "Zeyrek Medresesi", createdBy: ADMIN })
      .returning({ id: madrasahs.id });
    await assignRole(db(), {
      userId: HEAD,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasah,
      grantedBy: ADMIN,
    });

    const open = async (title: string, madrasahId: string | null) => {
      const [row] = await db()
        .insert(courses)
        .values({
          koskId: kosk,
          madrasahId,
          authorId: KOSK_NAZIM,
          title,
          status: CourseStatus.PUBLISHED,
        })
        .returning({ id: courses.id });
      await assignRole(db(), {
        userId: MUDERRIS,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: row.id,
        grantedBy: ADMIN,
      });
      await db().insert(enrollments).values({
        userId: APPLICANT,
        courseId: row.id,
        status: EnrollmentStatus.PENDING,
      });
      return row.id;
    };
    ownCourse = await open("Köşkün kendi dersi", null);
    medreseCourse = await open("Medrese dersi", madrasah);
    orphanCourse = await open("Müderrissiz ders", null);
  });

  it("offers the decision where the medrese has its head and the course its müderris", async () => {
    const res = await dashboard(KOSK_NAZIM).expect(200);
    expect(res.body.latestApplications).toHaveLength(3);
    for (const id of [ownCourse, medreseCourse, orphanCourse]) {
      expect(rowOf(res.body, id)).toMatchObject({
        canDecide: true,
        scopePassive: false,
      });
    }
  });

  it("marks the application of a medrese course passive once its head's post has ended", async () => {
    await endHead();
    const res = await dashboard(KOSK_NAZIM).expect(200);
    expect(rowOf(res.body, medreseCourse)).toMatchObject({
      canDecide: false,
      scopePassive: true,
    });
    // the köşk's own course is not in that medrese
    expect(rowOf(res.body, ownCourse)).toMatchObject({
      canDecide: true,
      scopePassive: false,
    });
  });

  it("marks the application of a course whose müderris left passive too", async () => {
    await db()
      .update(roleAssignments)
      .set({ revokedAt: new Date(Date.now() - DAY), revokedBy: ADMIN })
      .where(
        and(
          eq(roleAssignments.scopeId, orphanCourse),
          eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
        )
      );
    const res = await dashboard(KOSK_NAZIM).expect(200);
    expect(rowOf(res.body, orphanCourse)).toMatchObject({
      canDecide: false,
      scopePassive: true,
    });
  });

  it("marks every application of a köşk whose nazımı left passive, for the başnazım and a Medaris nazımı", async () => {
    await endKoskNazim();
    // the başnazım may still decide; the Medaris nazımı has no course work
    const asAdmin = await dashboard(ADMIN).expect(200);
    const asMedarisNazim = await dashboard(MEDARIS_NAZIM).expect(200);
    for (const id of [ownCourse, medreseCourse, orphanCourse]) {
      expect(rowOf(asAdmin.body, id)).toMatchObject({
        canDecide: true,
        scopePassive: true,
      });
      expect(rowOf(asMedarisNazim.body, id)).toMatchObject({
        canDecide: false,
        scopePassive: true,
      });
    }
  });

  it("offers the decision again once the medrese has an active head", async () => {
    await endHead();
    await assignRole(db(), {
      userId: MUDERRIS,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasah,
      grantedBy: ADMIN,
    });
    const res = await dashboard(KOSK_NAZIM).expect(200);
    expect(rowOf(res.body, medreseCourse)).toMatchObject({
      canDecide: true,
      scopePassive: false,
    });
  });

  it("keeps the başnazım's bypass: the passive course stays decidable for them", async () => {
    await endHead();
    const res = await dashboard(ADMIN).expect(200);
    expect(rowOf(res.body, medreseCourse)).toMatchObject({
      canDecide: true,
      scopePassive: true,
    });
  });

  it("says a Medaris nazımı who holds no course work cannot decide, and that it is not the passive scope", async () => {
    const res = await dashboard(MEDARIS_NAZIM).expect(200);
    expect(rowOf(res.body, ownCourse)).toMatchObject({
      canDecide: false,
      scopePassive: false,
    });
  });

  it("still refuses the decision on the route, and writes nothing", async () => {
    await endHead();
    const res = await approve(medreseCourse, KOSK_NAZIM).expect(403);
    expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
    expect(await statusOf(medreseCourse)).toBe(EnrollmentStatus.PENDING);
    // and the köşk's own course is still decided by the same person
    await approve(ownCourse, KOSK_NAZIM).expect(201);
  });

  it("still refuses Reddet on the route wherever the screen hides it, and writes nothing", async () => {
    await endHead();
    await db()
      .update(roleAssignments)
      .set({ revokedAt: new Date(Date.now() - DAY), revokedBy: ADMIN })
      .where(
        and(
          eq(roleAssignments.scopeId, orphanCourse),
          eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
        )
      );
    const refusals: [string, string][] = [
      [medreseCourse, KOSK_NAZIM], // passive medrese
      [orphanCourse, KOSK_NAZIM], // passive course
      [ownCourse, MEDARIS_NAZIM], // a role with no course work
    ];
    for (const [course, sub] of refusals) {
      const res = await reject(course, sub).expect(403);
      expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      expect(await statusOf(course)).toBe(EnrollmentStatus.PENDING);
    }
    // and the same person still refuses a talebe of the köşk's own course
    await reject(ownCourse, KOSK_NAZIM).expect(200);
  });
});
