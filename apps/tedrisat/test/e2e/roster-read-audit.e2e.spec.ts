import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseRepository } from "../../src/course/course.repository";
import { ROSTER_READ_ACTION } from "../../src/course/domain/course-content";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courses,
  enrollments,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-135, the owner's "Kayda alınsın" (d-1003-09): a read of a course's roster
 * is written to `audit_log` like a read of its content. The talebe list carries
 * names and e-mail addresses; its numbers, the list of those taken out and the
 * köşk-wide list of waiting requests are the same list summarised.
 *
 * The rule is the content read's: the course's müderrisler and its enrolled talebe
 * leave no row; everyone else who may read does, the başnazım through the realm
 * bypass included. Real Postgres, real guard, minted tokens.
 */
const ADMIN_ID = "ca000000-0000-4000-8000-000000000001";
const MANAGER_ID = "ca000000-0000-4000-8000-000000000002";
const MUDERRIS_ID = "ca000000-0000-4000-8000-000000000003";
const TALEBE_ID = "ca000000-0000-4000-8000-000000000004";
const HEAD_ID = "ca000000-0000-4000-8000-000000000005";
const STRANGER_ID = "ca000000-0000-4000-8000-000000000006";
const MUDERRIS_TALEBE_ID = "ca000000-0000-4000-8000-000000000007";
const OTHER_MANAGER_ID = "ca000000-0000-4000-8000-000000000008";
const PENDING_ID = "ca000000-0000-4000-8000-000000000009";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const ROUTES = [
  ["enrollments", (id: string) => `/courses/${id}/enrollments`],
  ["removed", (id: string) => `/courses/${id}/enrollments/removed`],
  ["stats", (id: string) => `/courses/${id}/stats`],
  ["badge-counts", (id: string) => `/courses/${id}/badge-counts`],
] as const;

describe("Roster reads are audited (MDRS-135, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let otherKoskId: string;
  let madrasahId: string;
  let courseId: string;
  let medreseCourseId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const get = (sub: string, path: string) =>
    http().get(path).set("Authorization", auth(sub));
  const rosterRows = () =>
    db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, ROSTER_READ_ACTION))
      .orderBy(auditLog.seq);

  const clean = () =>
    dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "audit_log",
      "users"
    );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await clean();
    [{ id: koskId }, { id: otherKoskId }] = await db()
      .insert(kosks)
      .values([
        { ownerId: MANAGER_ID, name: "Süleymaniye Köşkü" },
        { ownerId: OTHER_MANAGER_ID, name: "Fatih Köşkü" },
      ])
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    await assignRole(db(), {
      userId: OTHER_MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: otherKoskId,
    });
    [{ id: madrasahId }] = await db()
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: ADMIN_ID,
      })
      .returning({ id: madrasahs.id });
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
    });
    const insertCourse = async (
      title: string,
      over: Partial<typeof courses.$inferInsert> = {}
    ) => {
      const [row] = await db()
        .insert(courses)
        .values({
          koskId,
          authorId: MANAGER_ID,
          title,
          status: CourseStatus.PUBLISHED,
          ...over,
        })
        .returning({ id: courses.id });
      return row.id;
    };
    courseId = await insertCourse("Bina ve İzhar Şerhi");
    medreseCourseId = await insertCourse("Emsile ve Bina", { madrasahId });
    for (const [sub, name] of [
      [MUDERRIS_ID, "Musa Müderris"],
      [MUDERRIS_TALEBE_ID, "Mahmud Müderris"],
    ]) {
      await db().insert(courseMuderris).values({ courseId, userId: sub, name });
      await assignRole(db(), {
        userId: sub,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: courseId,
      });
    }
    await db()
      .insert(enrollments)
      .values([
        { userId: TALEBE_ID, courseId, status: EnrollmentStatus.ENROLLED },
        { userId: PENDING_ID, courseId, status: EnrollmentStatus.PENDING },
        // A müderris who also took a seat is still a müderris, off the record.
        {
          userId: MUDERRIS_TALEBE_ID,
          courseId,
          status: EnrollmentStatus.ENROLLED,
        },
        // The köşk nazımı who enrolled too: enrolling is no way out of the audit.
        { userId: MANAGER_ID, courseId, status: EnrollmentStatus.ENROLLED },
      ]);
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe.each(ROUTES)("GET %s", (via, path) => {
    it("writes one row for the köşk nazımı, naming the course and the route", async () => {
      await get(MANAGER_ID, path(courseId)).expect(200);
      const rows = await rosterRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: MANAGER_ID,
        action: "course.roster_read",
        entity: "course",
        entityId: courseId,
        details: {
          via,
          systemAdmin: false,
          permission: "course.staff_read",
        },
      });
    });

    it("writes one row for the başnazım, who reads through the realm bypass", async () => {
      await get(ADMIN_ID, path(courseId)).expect(200);
      const rows = await rosterRows();
      expect(rows.map((row) => row.actorId)).toEqual([ADMIN_ID]);
      expect(rows[0].details).toMatchObject({ via, systemAdmin: true });
    });

    it("writes one row for a başmüderris reading a course of their medrese", async () => {
      await get(HEAD_ID, path(medreseCourseId)).expect(200);
      const rows = await rosterRows();
      expect(rows.map((row) => [row.actorId, row.entityId])).toEqual([
        [HEAD_ID, medreseCourseId],
      ]);
    });

    it("writes nothing for the course's müderris, whether or not they also hold a seat", async () => {
      await get(MUDERRIS_ID, path(courseId)).expect(200);
      await get(MUDERRIS_TALEBE_ID, path(courseId)).expect(200);
      expect(await rosterRows()).toEqual([]);
    });

    it("writes nothing for a caller the route refuses", async () => {
      await get(TALEBE_ID, path(courseId)).expect(403);
      await get(STRANGER_ID, path(courseId)).expect(403);
      await get(OTHER_MANAGER_ID, path(courseId)).expect(403);
      await http().get(path(courseId)).expect(401);
      expect(await rosterRows()).toEqual([]);
    });
  });

  it("keeps a köşk nazımı who is also enrolled on the record, as the content read does", async () => {
    await get(MANAGER_ID, `/courses/${courseId}/enrollments`).expect(200);
    expect((await rosterRows()).map((row) => row.actorId)).toEqual([
      MANAGER_ID,
    ]);
  });

  it("does not write a row for a course nobody may read, and none for a 404", async () => {
    await get(
      MANAGER_ID,
      "/courses/00000000-0000-4000-8000-000000000000/stats"
    ).expect(404);
    expect(await rosterRows()).toEqual([]);
  });

  it("adds one row per read, in order", async () => {
    await get(MANAGER_ID, `/courses/${courseId}/enrollments`).expect(200);
    await get(MANAGER_ID, `/courses/${courseId}/stats`).expect(200);
    await get(MANAGER_ID, `/courses/${courseId}/stats`).expect(200);
    expect(
      (await rosterRows()).map((row) => (row.details as { via: string }).via)
    ).toEqual(["enrollments", "stats", "stats"]);
  });

  describe("GET /kosks/:koskId/enrollments/pending", () => {
    const path = () => `/kosks/${koskId}/enrollments/pending`;

    it("writes one row against the köşk for its nazımı, every time they read it", async () => {
      await get(MANAGER_ID, path()).expect(200);
      await get(MANAGER_ID, path()).expect(200);
      const rows = await rosterRows();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        actorId: MANAGER_ID,
        action: "course.roster_read",
        entity: "kosk",
        entityId: koskId,
        details: {
          via: "pending",
          systemAdmin: false,
          permission: "course.manage_all",
        },
      });
    });

    it("is read by the köşk's nazımları alone, as before: the başnazım is refused and writes nothing", async () => {
      await get(ADMIN_ID, path()).expect(403);
      expect(await rosterRows()).toEqual([]);
    });

    it("writes nothing for a caller the route refuses", async () => {
      await get(OTHER_MANAGER_ID, path()).expect(403);
      await get(MUDERRIS_ID, path()).expect(403);
      await get(TALEBE_ID, path()).expect(403);
      await get(STRANGER_ID, path()).expect(403);
      await http().get(path()).expect(401);
      expect(await rosterRows()).toEqual([]);
    });
  });

  describe("when the row cannot be written", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ...ROUTES.map(
        ([via, path]) => [via, () => path(courseId)] as [string, () => string]
      ),
      ["pending", () => `/kosks/${koskId}/enrollments/pending`] as [
        string,
        () => string,
      ],
    ])("fails the %s read instead of answering with the roster unrecorded", async (_via, path) => {
      vi.spyOn(
        app.get(CourseRepository, { strict: false }),
        "recordRosterRead"
      ).mockRejectedValue(new Error("audit_log is down"));
      const res = await get(MANAGER_ID, path());
      expect(res.status).toBe(500);
      expect(res.body).not.toBeInstanceOf(Array);
      expect(JSON.stringify(res.body)).not.toContain(TALEBE_ID);
    });

    it("does not touch a müderris's read, which was never written", async () => {
      const spy = vi
        .spyOn(app.get(CourseRepository, { strict: false }), "recordRosterRead")
        .mockRejectedValue(new Error("audit_log is down"));
      await get(MUDERRIS_ID, `/courses/${courseId}/enrollments`).expect(200);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it("shows on the audit page as a personal-data read, against the course and the köşk", async () => {
    await get(MANAGER_ID, `/courses/${courseId}/enrollments`).expect(200);
    await get(MANAGER_ID, `/kosks/${koskId}/enrollments/pending`).expect(200);
    const page = await get(
      ADMIN_ID,
      "/nizam/audit-log?type=PERSONAL_DATA_READ"
    ).expect(200);
    expect(page.body.items.map((item: { type: string }) => item.type)).toEqual([
      "PERSONAL_DATA_READ",
      "PERSONAL_DATA_READ",
    ]);
    expect(
      page.body.items.map((item: { action: string }) => item.action)
    ).toEqual(["course.roster_read", "course.roster_read"]);
    expect(
      page.body.items.map(
        (item: { details: { via: string } }) => item.details.via
      )
    ).toEqual(["pending", "enrollments"]);
  });
});
