import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
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
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
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
 * MDRS-170, nizam/26 and nizam/27: a köşk's hosting rights — listing them with
 * what the withdrawal dialog needs, giving one, withdrawing one while the
 * medrese's courses stay or are hidden — against a real Postgres.
 */
const ADMIN_ID = "e0000000-0000-4000-8000-000000000001";
const NAZIM = "e0000000-0000-4000-8000-000000000002";
const OTHER_NAZIM = "e0000000-0000-4000-8000-000000000003";
const HEAD = "e0000000-0000-4000-8000-000000000004";
const IMAM = "e0000000-0000-4000-8000-000000000005";
const TALEBE_1 = "e0000000-0000-4000-8000-000000000006";
const TALEBE_2 = "e0000000-0000-4000-8000-000000000007";
const TALEBE_3 = "e0000000-0000-4000-8000-000000000008";
const STRANGER = "e0000000-0000-4000-8000-000000000009";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Hosting rights (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let otherKoskId: string;
  let suleymaniye: string;
  let fatih: string;
  let vefa: string;
  let liveCourse: string;
  let draftCourse: string;
  let elsewhereCourse: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const path = (id = koskId) => `/kosks/${id}/hosting-rights`;
  const course = async (id: string) =>
    (await db().select().from(courses).where(eq(courses.id, id)))[0];
  const held = (madrasahId: string, id = koskId) =>
    db()
      .select()
      .from(madrasahKoskHosting)
      .where(
        and(
          eq(madrasahKoskHosting.koskId, id),
          eq(madrasahKoskHosting.madrasahId, madrasahId)
        )
      );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await db()
      .insert(users)
      .values([
        { id: HEAD, givenName: "Mehmet Emin", familyName: "Işıkoğlu" },
        { id: IMAM, givenName: "Mehmet Emin", familyName: "Işıkoğlu" },
      ]);
    const [s, f, v] = await db()
      .insert(madrasahs)
      .values([
        {
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN_ID,
        },
        { handle: "fatih", name: "Fatih Medresesi", createdBy: ADMIN_ID },
        {
          handle: "vefa",
          name: "Vefa Medresesi",
          createdBy: ADMIN_ID,
          archivedAt: new Date(),
          archivedBy: ADMIN_ID,
        },
      ])
      .returning();
    suleymaniye = s.id;
    fatih = f.id;
    vefa = v.id;
    await assignRole(db(), {
      userId: HEAD,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: suleymaniye,
      grantedBy: ADMIN_ID,
    });

    const [k, o] = await db()
      .insert(kosks)
      .values([
        { ownerId: NAZIM, name: "Nûruosmaniye Köşkü" },
        { ownerId: OTHER_NAZIM, name: "Beyazıt Köşkü" },
      ])
      .returning();
    koskId = k.id;
    otherKoskId = o.id;
    await assignRole(db(), {
      userId: NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    await assignRole(db(), {
      userId: OTHER_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: otherKoskId,
    });
    await db()
      .insert(madrasahKoskHosting)
      .values({
        madrasahId: suleymaniye,
        koskId,
        grantedBy: ADMIN_ID,
        grantedByRole: "SYSTEM_ADMIN",
        createdAt: new Date("2026-09-01T09:00:00Z"),
      });
    await db().insert(users).values({
      id: ADMIN_ID,
      givenName: "Yusuf Ziya",
      familyName: "Ertuğrul",
    });

    const [live, draft, elsewhere] = await db()
      .insert(courses)
      .values([
        {
          koskId,
          authorId: NAZIM,
          title: "Bina ve İzhar Şerhi",
          madrasahId: suleymaniye,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Maksûd şerhi",
          madrasahId: suleymaniye,
          status: CourseStatus.DRAFT,
        },
        {
          koskId: otherKoskId,
          authorId: OTHER_NAZIM,
          title: "Başka köşkte",
          madrasahId: suleymaniye,
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    liveCourse = live.id;
    draftCourse = draft.id;
    elsewhereCourse = elsewhere.id;
    await db().insert(courseMuderris).values({
      courseId: liveCourse,
      userId: IMAM,
      name: "Mehmet Emin Işıkoğlu",
    });
    await assignRole(db(), {
      userId: IMAM,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: liveCourse,
      isImam: true,
    });
    await db()
      .insert(enrollments)
      .values([
        {
          userId: TALEBE_1,
          courseId: liveCourse,
          status: EnrollmentStatus.ENROLLED,
        },
        {
          userId: TALEBE_2,
          courseId: liveCourse,
          status: EnrollmentStatus.ENROLLED,
        },
        {
          userId: TALEBE_3,
          courseId: liveCourse,
          status: EnrollmentStatus.PENDING,
        },
      ]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await app.close();
  });

  describe("GET /kosks/:id/hosting-rights", () => {
    it("lists the medreses with the granter, the başmüderris and the open courses with their talebe and imam", async () => {
      const res = await http()
        .get(path())
        .set("Authorization", auth(NAZIM))
        .expect(200);
      expect(res.body).toHaveLength(1);
      const [right] = res.body;
      expect(right).toMatchObject({
        madrasahId: suleymaniye,
        name: "Süleymaniye Medresesi",
        handle: "suleymaniye",
        headMuderris: { id: HEAD, name: "Mehmet Emin Işıkoğlu" },
        grantedBy: {
          id: ADMIN_ID,
          name: "Yusuf Ziya Ertuğrul",
          role: "SYSTEM_ADMIN",
        },
        grantedAt: "2026-09-01T09:00:00.000Z",
      });
      expect(right.openCourses).toEqual([
        {
          id: liveCourse,
          title: "Bina ve İzhar Şerhi",
          status: "PUBLISHED",
          studentCount: 2,
          imamName: "Mehmet Emin Işıkoğlu",
        },
        {
          id: draftCourse,
          title: "Maksûd şerhi",
          status: "DRAFT",
          studentCount: 0,
          imamName: null,
        },
      ]);
    });

    it("leaves out a withdrawn right, a hidden medrese and a hidden course", async () => {
      await db()
        .update(courses)
        .set({ archivedAt: new Date() })
        .where(eq(courses.id, draftCourse));
      await db()
        .insert(madrasahKoskHosting)
        .values([
          {
            madrasahId: fatih,
            koskId,
            grantedBy: NAZIM,
            revokedAt: new Date(),
            revokedBy: NAZIM,
          },
          { madrasahId: vefa, koskId, grantedBy: NAZIM },
        ]);
      const res = await http()
        .get(path())
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.map((r: { madrasahId: string }) => r.madrasahId)).toEqual(
        [suleymaniye]
      );
      expect(res.body[0].openCourses).toHaveLength(1);
    });

    it("is an empty list for a köşk with no right", async () => {
      const res = await http()
        .get(path(otherKoskId))
        .set("Authorization", auth(OTHER_NAZIM))
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it.each([
      ["another köşk's nazımı", OTHER_NAZIM],
      ["the medrese's başmüderris", HEAD],
      ["a stranger", STRANGER],
    ])("refuses %s with 403", (_who, sub) =>
      http().get(path()).set("Authorization", auth(sub)).expect(403));

    it("answers 404 for a missing köşk, 401 with no token", async () => {
      await http()
        .get(path("e0000000-0000-4000-8000-0000000000ff"))
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      await http().get(path()).expect(401);
    });
  });

  describe("POST /kosks/:id/hosting-rights", () => {
    it("lets the köşk nazımı give a medrese the right, naming them as the granter", async () => {
      const res = await http()
        .post(path())
        .set("Authorization", auth(NAZIM))
        .send({ madrasahId: fatih })
        .expect(201);
      expect(res.body).toMatchObject({
        madrasahId: fatih,
        grantedBy: { id: NAZIM, role: "KOSK_NAZIM" },
        openCourses: [],
        headMuderris: null,
      });
      const [entry] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "hosting_right.grant"));
      expect(entry).toMatchObject({ actorId: NAZIM, entityId: koskId });
    });

    it("records the başnazım as the granter in that role", async () => {
      const res = await http()
        .post(path())
        .set("Authorization", auth(ADMIN_ID))
        .send({ madrasahId: fatih })
        .expect(201);
      expect(res.body.grantedBy).toMatchObject({
        id: ADMIN_ID,
        role: "SYSTEM_ADMIN",
      });
    });

    it("is idempotent: asking again changes nothing and writes no second audit row", async () => {
      await http()
        .post(path())
        .set("Authorization", auth(NAZIM))
        .send({ madrasahId: suleymaniye })
        .expect(201);
      expect(await held(suleymaniye)).toHaveLength(1);
      expect(await db().select().from(auditLog)).toHaveLength(0);
    });

    it("gives a withdrawn right back as a new row, the old one staying as history", async () => {
      await http()
        .delete(`${path()}/${suleymaniye}?coursesAction=KEEP`)
        .set("Authorization", auth(NAZIM))
        .expect(204);
      await http()
        .post(path())
        .set("Authorization", auth(NAZIM))
        .send({ madrasahId: suleymaniye })
        .expect(201);
      const rows = await held(suleymaniye);
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
    });

    it("answers 404 for a missing or hidden medrese and 400 for a bad id", async () => {
      await http()
        .post(path())
        .set("Authorization", auth(NAZIM))
        .send({ madrasahId: vefa })
        .expect(404);
      await http()
        .post(path())
        .set("Authorization", auth(NAZIM))
        .send({ madrasahId: "e0000000-0000-4000-8000-0000000000ff" })
        .expect(404);
      await http()
        .post(path())
        .set("Authorization", auth(NAZIM))
        .send({ madrasahId: "nope" })
        .expect(400);
      expect(await held(vefa)).toHaveLength(0);
    });

    it("refuses another köşk's nazımı and the medrese's başmüderris with 403", async () => {
      await http()
        .post(path())
        .set("Authorization", auth(OTHER_NAZIM))
        .send({ madrasahId: fatih })
        .expect(403);
      await http()
        .post(path())
        .set("Authorization", auth(HEAD))
        .send({ madrasahId: fatih })
        .expect(403);
      expect(await held(fatih)).toHaveLength(0);
    });
  });

  describe("DELETE /kosks/:id/hosting-rights/:madrasahId", () => {
    it("KEEP withdraws the right and leaves every course as it was", async () => {
      await http()
        .delete(`${path()}/${suleymaniye}?coursesAction=KEEP`)
        .set("Authorization", auth(NAZIM))
        .expect(204);
      const [row] = await held(suleymaniye);
      expect(row.revokedAt).not.toBeNull();
      expect(row.revokedBy).toBe(NAZIM);
      expect((await course(liveCourse)).archivedAt).toBeNull();
      expect((await course(draftCourse)).archivedAt).toBeNull();
      const list = await http()
        .get(path())
        .set("Authorization", auth(NAZIM))
        .expect(200);
      expect(list.body).toEqual([]);
      const [entry] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "hosting_right.revoke"));
      expect(entry.details).toMatchObject({
        madrasahId: suleymaniye,
        coursesAction: "KEEP",
        hiddenCourseIds: [],
      });
    });

    it("HIDE hides the medrese's courses in this köşk only, and says which", async () => {
      const before = await course(liveCourse);
      await http()
        .delete(`${path()}/${suleymaniye}?coursesAction=HIDE`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(204);
      const live = await course(liveCourse);
      expect(live.archivedAt).not.toBeNull();
      expect(live.archivedBy).toBe(ADMIN_ID);
      expect(live.version).toBe(before.version + 1);
      expect((await course(draftCourse)).archivedAt).not.toBeNull();
      expect((await course(elsewhereCourse)).archivedAt).toBeNull();
      const [entry] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "hosting_right.revoke"));
      expect(entry.details).toMatchObject({ coursesAction: "HIDE" });
      expect(
        (entry.details as { hiddenCourseIds: string[] }).hiddenCourseIds.sort()
      ).toEqual([liveCourse, draftCourse].sort());
    });

    it("requires a coursesAction", async () => {
      await http()
        .delete(`${path()}/${suleymaniye}`)
        .set("Authorization", auth(NAZIM))
        .expect(400);
      await http()
        .delete(`${path()}/${suleymaniye}?coursesAction=DELETE`)
        .set("Authorization", auth(NAZIM))
        .expect(400);
      expect((await held(suleymaniye))[0].revokedAt).toBeNull();
    });

    it("answers 404 for a right that is not held, withdrawing nothing and hiding nothing", async () => {
      await http()
        .delete(`${path()}/${fatih}?coursesAction=HIDE`)
        .set("Authorization", auth(NAZIM))
        .expect(404);
      await http()
        .delete(`${path(otherKoskId)}/${suleymaniye}?coursesAction=HIDE`)
        .set("Authorization", auth(OTHER_NAZIM))
        .expect(404);
      expect((await course(elsewhereCourse)).archivedAt).toBeNull();
    });

    it("refuses another köşk's nazımı with 403", async () => {
      await http()
        .delete(`${path()}/${suleymaniye}?coursesAction=KEEP`)
        .set("Authorization", auth(OTHER_NAZIM))
        .expect(403);
      expect((await held(suleymaniye))[0].revokedAt).toBeNull();
    });
  });
});
