import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
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
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-203: who reads the talebe list and the talebe's e-mails by default.
 *
 * The owner's standing rule (d-1001-28, "ikisi de varsayılan"; "şimdilik böyle,
 * sonra bakacağız"): course staff see the list and the addresses without a
 * separate permission, and every read but the course's müderris is on the record
 * (d-1003-09). The revisit is the owner's, so this file changes no rule: it pins
 * the one thing no other spec did, that the names and the addresses themselves
 * reach a müderris and a ders nazırı and nobody below them. The audit specs read
 * rows without names and e-mails; the course-team spec asserts `userId` and
 * `status` only.
 *
 * Real Postgres, real guard, minted tokens. The addresses are seeded as the
 * enrolment-time snapshot (`enrollments.student_email`), which is what the API
 * returns, and every assertion is on those exact strings.
 */
const ADMIN_ID = "cc000000-0000-4000-8000-000000000001";
const MANAGER_ID = "cc000000-0000-4000-8000-000000000002";
const MUDERRIS_ID = "cc000000-0000-4000-8000-000000000003";
const DERS_ID = "cc000000-0000-4000-8000-000000000004";
const HEAD_ID = "cc000000-0000-4000-8000-000000000005";
const STRANGER_ID = "cc000000-0000-4000-8000-000000000006";
const ENROLLED_ID = "cc000000-0000-4000-8000-000000000011";
const PENDING_ID = "cc000000-0000-4000-8000-000000000012";
const COMPLETED_ID = "cc000000-0000-4000-8000-000000000013";
const LEAVING_ID = "cc000000-0000-4000-8000-000000000014";

const TALEBE = {
  [ENROLLED_ID]: { name: "Ali Talebe", email: "ali.talebe@example.test" },
  [PENDING_ID]: { name: "Beyza Talebe", email: "beyza.talebe@example.test" },
  [COMPLETED_ID]: { name: "Cemal Talebe", email: "cemal.talebe@example.test" },
  [LEAVING_ID]: { name: "Derya Talebe", email: "derya.talebe@example.test" },
} as const;
const ALL_EMAILS = Object.values(TALEBE).map((t) => t.email);

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const inSeconds = (n: number) => new Date(Date.now() + n * 1000);

interface RosterRow {
  userId: string;
  studentName: string | null;
  studentEmail: string | null;
  status: string;
}

describe("Roster contact details for course staff (MDRS-203, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
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
  const grant = (
    userId: string,
    permission: string,
    values: Partial<typeof permissionGrants.$inferInsert> = {}
  ) =>
    db()
      .insert(permissionGrants)
      .values({
        userId,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: courseId,
        grantedBy: MANAGER_ID,
        permission,
        groupId: null,
        ...values,
      });

  /** What a row of the roster must say, taken from the seed and nowhere else. */
  const contact = (rows: RosterRow[]) =>
    Object.fromEntries(
      rows.map((row) => [row.userId, [row.studentName, row.studentEmail]])
    );
  const SEEDED = Object.fromEntries(
    Object.entries(TALEBE).map(([id, t]) => [id, [t.name, t.email]])
  );
  /** The roster without the talebe who left in the removed-list tests. */
  const SEEDED_ROSTER = Object.fromEntries(
    Object.entries(SEEDED).filter(([id]) => id !== LEAVING_ID)
  );
  const readsRosterWithContact = async (sub: string, id = courseId) => {
    const res = await get(sub, `/courses/${id}/enrollments`).expect(200);
    expect(contact(res.body as RosterRow[])).toEqual(SEEDED_ROSTER);
    return res;
  };
  const noEmailIn = (body: unknown) => {
    const text = JSON.stringify(body);
    for (const email of ALL_EMAILS) expect(text).not.toContain(email);
    for (const { name } of Object.values(TALEBE)) {
      expect(text).not.toContain(name);
    }
  };

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
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
    [{ id: koskId }] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Süleymaniye Köşkü" })
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
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
    await db()
      .insert(courseMuderris)
      .values({ courseId, userId: MUDERRIS_ID, name: "Musa Müderris" });
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
    });
    await assignRole(db(), {
      userId: DERS_ID,
      role: ASSIGNED_ROLES.DERS_NAZIR,
      scopeId: courseId,
      grantedBy: MANAGER_ID,
    });
    const seat = (
      courseOf: string,
      userId: keyof typeof TALEBE,
      status: EnrollmentStatus
    ) => ({
      userId,
      courseId: courseOf,
      status,
      studentName: TALEBE[userId].name,
      studentEmail: TALEBE[userId].email,
    });
    const rows = [
      seat(courseId, ENROLLED_ID, EnrollmentStatus.ENROLLED),
      seat(courseId, PENDING_ID, EnrollmentStatus.PENDING),
      seat(courseId, COMPLETED_ID, EnrollmentStatus.COMPLETED),
    ];
    await db()
      .insert(enrollments)
      .values([
        ...rows,
        // The same four people in the medrese's course, so the başmüderris
        // reads the same kind of list.
        ...rows.map((row) => ({ ...row, courseId: medreseCourseId })),
      ]);
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("the müderris", () => {
    it("reads every talebe's name and e-mail, requests included, and leaves no row", async () => {
      const res = await readsRosterWithContact(MUDERRIS_ID);
      expect((res.body as RosterRow[]).map((row) => row.status).sort()).toEqual(
        ["COMPLETED", "ENROLLED", "PENDING"]
      );
      expect(await rosterRows()).toEqual([]);
    });
  });

  describe("a ders nazırı holding one piece of enrollment work", () => {
    it.each([
      PERMISSIONS.ENROLLMENT_DECIDE,
      PERMISSIONS.ENROLLMENT_REMOVE,
      PERMISSIONS.ENROLLMENT_COMPLETE,
    ])("reads the same names and e-mails with %s alone, on the record", async (permission) => {
      await grant(DERS_ID, permission);
      await readsRosterWithContact(DERS_ID);
      const rows = await rosterRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: DERS_ID,
        entity: "course",
        entityId: courseId,
        details: {
          via: "enrollments",
          systemAdmin: false,
          permission: "course.staff_read",
        },
      });
    });

    it.each([
      ["no grant", []],
      ["week.hide alone", [{ permission: PERMISSIONS.WEEK_HIDE }]],
      ["course.edit alone", [{ permission: PERMISSIONS.COURSE_EDIT }]],
      [
        "an enrollment grant that has expired",
        [
          {
            permission: PERMISSIONS.ENROLLMENT_DECIDE,
            values: { expiresAt: inSeconds(-60) },
          },
        ],
      ],
    ] as const)("is refused with %s: 403, no name or e-mail in the body, no row", async (_label, grants) => {
      for (const g of grants) {
        await grant(
          DERS_ID,
          g.permission,
          "values" in g ? g.values : undefined
        );
      }
      const res = await get(DERS_ID, `/courses/${courseId}/enrollments`).expect(
        403
      );
      noEmailIn(res.body);
      const removed = await get(
        DERS_ID,
        `/courses/${courseId}/enrollments/removed`
      ).expect(403);
      noEmailIn(removed.body);
      expect(await rosterRows()).toEqual([]);
    });

    it("holds the grant for its own course only", async () => {
      await grant(DERS_ID, PERMISSIONS.ENROLLMENT_DECIDE);
      const res = await get(
        DERS_ID,
        `/courses/${medreseCourseId}/enrollments`
      ).expect(403);
      noEmailIn(res.body);
    });
  });

  describe("those who are not course staff", () => {
    it("refuses an enrolled talebe and a stranger, and the talebe's course page carries no other talebe's e-mail", async () => {
      for (const sub of [ENROLLED_ID, STRANGER_ID]) {
        const res = await get(sub, `/courses/${courseId}/enrollments`).expect(
          403
        );
        noEmailIn(res.body);
        const removed = await get(
          sub,
          `/courses/${courseId}/enrollments/removed`
        ).expect(403);
        noEmailIn(removed.body);
      }
      // Their own seat carries their own address, and nobody else's.
      const page = await get(ENROLLED_ID, `/courses/${courseId}`).expect(200);
      expect(page.body.enrollment).toMatchObject({
        studentEmail: TALEBE[ENROLLED_ID].email,
      });
      for (const email of ALL_EMAILS) {
        if (email === TALEBE[ENROLLED_ID].email) continue;
        expect(JSON.stringify(page.body)).not.toContain(email);
      }
      expect(await rosterRows()).toEqual([]);
    });

    it("refuses a caller with no token", async () => {
      const res = await http().get(`/courses/${courseId}/enrollments`);
      expect(res.status).toBe(401);
      noEmailIn(res.body);
    });
  });

  describe("GET /courses/:id/enrollments/removed", () => {
    beforeEach(async () => {
      await db().insert(enrollments).values({
        userId: LEAVING_ID,
        courseId,
        status: EnrollmentStatus.ENROLLED,
        studentName: TALEBE[LEAVING_ID].name,
        studentEmail: TALEBE[LEAVING_ID].email,
      });
      await http()
        .post(`/courses/${courseId}/enrollments/${LEAVING_ID}/remove`)
        .set("Authorization", auth(MUDERRIS_ID))
        .send({ reason: "Üç haftadır derslere katılmıyor." })
        .expect(200);
    });

    const readsRemoved = async (sub: string) => {
      const res = await get(
        sub,
        `/courses/${courseId}/enrollments/removed`
      ).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        userId: LEAVING_ID,
        name: TALEBE[LEAVING_ID].name,
        email: TALEBE[LEAVING_ID].email,
      });
    };

    it("gives the müderris the removed talebe's e-mail", async () => {
      await readsRemoved(MUDERRIS_ID);
    });

    it("gives a ders nazırı holding enrollment.remove the same e-mail, on the record", async () => {
      await grant(DERS_ID, PERMISSIONS.ENROLLMENT_REMOVE);
      await readsRemoved(DERS_ID);
      const rows = await rosterRows();
      expect(rows.map((row) => [row.actorId, row.details])).toEqual([
        [DERS_ID, expect.objectContaining({ via: "removed" })],
      ]);
    });

    it("refuses a ders nazırı holding week.hide alone", async () => {
      await grant(DERS_ID, PERMISSIONS.WEEK_HIDE);
      const res = await get(
        DERS_ID,
        `/courses/${courseId}/enrollments/removed`
      ).expect(403);
      expect(JSON.stringify(res.body)).not.toContain(TALEBE[LEAVING_ID].email);
    });
  });

  describe("GET /kosks/:koskId/enrollments/pending", () => {
    const path = () => `/kosks/${koskId}/enrollments/pending`;

    it("gives the köşk nazımı every waiting request with its name and e-mail", async () => {
      const res = await get(MANAGER_ID, path()).expect(200);
      const rows = res.body as {
        userId: string;
        studentName: string;
        studentEmail: string;
      }[];
      // One request in each of the köşk's two courses.
      expect(rows.map((row) => row.userId)).toEqual([PENDING_ID, PENDING_ID]);
      for (const row of rows) {
        expect([row.studentName, row.studentEmail]).toEqual(SEEDED[PENDING_ID]);
      }
    });

    it("is the köşk nazımı's list alone: a müderris and a ders nazırı are refused, even with enrollment work", async () => {
      await grant(DERS_ID, PERMISSIONS.ENROLLMENT_DECIDE);
      for (const sub of [MUDERRIS_ID, DERS_ID]) {
        const res = await get(sub, path()).expect(403);
        noEmailIn(res.body);
      }
    });
  });

  describe("a passive course (every müderris assignment revoked)", () => {
    const passivate = () =>
      db()
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: MANAGER_ID })
        .where(
          and(
            eq(roleAssignments.scopeId, courseId),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
          )
        );

    // The reviewed engine keeps a passive course of their köşk open to the
    // köşk's nazımı (owner, 4 October), so the roster and the köşk-wide pending
    // list agree: both are theirs. (Before that review the roster closed and the
    // pending list stayed open; this test pinned the disagreement.)
    it("keeps the roster and the köşk-wide pending list open to the köşk nazımı, whose course it still is", async () => {
      await passivate();
      await readsRosterWithContact(MANAGER_ID);

      const res = await get(
        MANAGER_ID,
        `/kosks/${koskId}/enrollments/pending`
      ).expect(200);
      const rows = res.body as {
        courseId: string;
        studentName: string;
        studentEmail: string;
      }[];
      const ofPassive = rows.filter((row) => row.courseId === courseId);
      expect(
        ofPassive.map((row) => [row.studentName, row.studentEmail])
      ).toEqual([SEEDED[PENDING_ID]]);
    });
  });

  describe("the köşk nazımı, the başmüderris and the başnazım", () => {
    it("the köşk nazımı reads the names and e-mails of their course, on the record", async () => {
      await readsRosterWithContact(MANAGER_ID);
      const rows = await rosterRows();
      expect(rows.map((row) => row.actorId)).toEqual([MANAGER_ID]);
    });

    it("a başmüderris reads the names and e-mails of a course of their medrese, on the record", async () => {
      await readsRosterWithContact(HEAD_ID, medreseCourseId);
      const rows = await rosterRows();
      expect(rows.map((row) => [row.actorId, row.entityId])).toEqual([
        [HEAD_ID, medreseCourseId],
      ]);
    });

    it("a başmüderris is refused a course outside their medrese", async () => {
      const res = await get(HEAD_ID, `/courses/${courseId}/enrollments`).expect(
        403
      );
      noEmailIn(res.body);
    });

    it("the başnazım reads them through the realm bypass, on the record", async () => {
      await readsRosterWithContact(ADMIN_ID);
      const rows = await rosterRows();
      expect(rows.map((row) => row.actorId)).toEqual([ADMIN_ID]);
      expect(rows[0].details).toMatchObject({ systemAdmin: true });
    });
  });
});
