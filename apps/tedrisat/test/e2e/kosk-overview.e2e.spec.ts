import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { bans } from "../../src/database/schema/ban.schema";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
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
 * MDRS-175, nizam/20, 23 and 53: the köşk page's numbers, the Dersler table,
 * taking a köşk out of service and a course's stats — against a real Postgres.
 */
const ADMIN = "e0000000-0000-4000-8000-000000000001";
const NAZIM = "e0000000-0000-4000-8000-000000000002";
const OTHER_NAZIM = "e0000000-0000-4000-8000-000000000003";
const S1 = "e0000000-0000-4000-8000-000000000011";
const S2 = "e0000000-0000-4000-8000-000000000012";
const S3 = "e0000000-0000-4000-8000-000000000013";
const S4 = "e0000000-0000-4000-8000-000000000014";
const S5 = "e0000000-0000-4000-8000-000000000015";
const IMAM = "e0000000-0000-4000-8000-000000000021";
const SECOND = "e0000000-0000-4000-8000-000000000022";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN
        ? {
            given_name: "Yusuf Ziya",
            family_name: "Ertuğrul",
            realm_access: { roles: [ROLES.SYSTEM_ADMIN] },
          }
        : {},
  });

describe("Köşk overview, course roster and stats (e2e)", () => {
  let app: INestApplication;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let otherKoskId: string;
  let madrasahId: string;
  let own: string;
  let hosted: string;
  let draft: string;
  let hidden: string;

  const http = () => request(app.getHttpServer());
  const get = (path: string, sub = ADMIN) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (path: string, sub = ADMIN) =>
    http().post(path).set("Authorization", auth(sub)).send({});

  beforeAll(async () => {
    app = await createTestApp();
    const databaseService = app.get<DatabaseService>(DatabaseService);
    db = databaseService.db;
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "bans",
      "audit_log",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users"
    );
    await db.insert(users).values([
      {
        id: ADMIN,
        email: "basnazim@example.com",
        givenName: "Yusuf Ziya",
        familyName: "Ertuğrul",
      },
      { id: NAZIM, email: "nazim@example.com", givenName: "Abdülhamit" },
    ]);
    const [kosk, other] = await db
      .insert(kosks)
      .values([
        { ownerId: ADMIN, name: "Nûruosmaniye Köşkü", handle: "nuruosmaniye" },
        { ownerId: ADMIN, name: "Fatih Köşkü", handle: "fatih" },
      ])
      .returning();
    koskId = kosk.id;
    otherKoskId = other.id;
    await assignRole(db, {
      userId: NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
      grantedBy: ADMIN,
    });
    await assignRole(db, {
      userId: OTHER_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: otherKoskId,
      grantedBy: ADMIN,
    });
    const [madrasah] = await db
      .insert(madrasahs)
      .values({ handle: "suleymaniye", name: "Süleymaniye", createdBy: ADMIN })
      .returning();
    madrasahId = madrasah.id;
    await db
      .insert(madrasahKoskHosting)
      .values({ madrasahId, koskId, grantedBy: ADMIN });
    const rows = await db
      .insert(courses)
      .values([
        {
          koskId,
          authorId: NAZIM,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
          createdAt: new Date("2026-09-01T10:00:00Z"),
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Bina ve İzhar Şerhi",
          status: CourseStatus.PUBLISHED,
          madrasahId,
          createdAt: new Date("2026-09-02T10:00:00Z"),
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Kâfiye'ye giriş",
          status: CourseStatus.DRAFT,
          createdAt: new Date("2026-09-03T10:00:00Z"),
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Maksûd okumaları",
          status: CourseStatus.PUBLISHED,
          archivedAt: new Date("2026-09-25T10:00:00Z"),
          archivedBy: NAZIM,
          createdAt: new Date("2026-09-04T10:00:00Z"),
        },
      ])
      .returning();
    [own, hosted, draft, hidden] = rows.map((r) => r.id);
    await db.insert(enrollments).values([
      { userId: S1, courseId: own, status: EnrollmentStatus.ENROLLED },
      { userId: S2, courseId: own, status: EnrollmentStatus.ENROLLED },
      { userId: S3, courseId: own, status: EnrollmentStatus.PENDING },
      { userId: S1, courseId: hosted, status: EnrollmentStatus.ENROLLED },
      { userId: S4, courseId: hosted, status: EnrollmentStatus.ENROLLED },
      { userId: S5, courseId: hidden, status: EnrollmentStatus.ENROLLED },
    ]);
    await db.insert(courseMuderris).values([
      { courseId: own, userId: SECOND, name: "Ayşe Nur", orderIndex: 1 },
      { courseId: own, userId: IMAM, name: "Mehmet Emin", orderIndex: 0 },
    ]);
    await assignRole(db, {
      userId: IMAM,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: own,
      grantedBy: NAZIM,
      isImam: true,
    });
    await assignRole(db, {
      userId: SECOND,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: own,
      grantedBy: NAZIM,
    });
    // Two weeks of Emsile ve Bina: the first has begun, the second has not,
    // and a third was dropped from the programme.
    const weeks = await db
      .insert(courseWeeks)
      .values([
        { courseId: own, weekNumber: 1, title: "Hafta 1" },
        { courseId: own, weekNumber: 2, title: "Hafta 2" },
        {
          courseId: own,
          weekNumber: 3,
          title: "Hafta 3",
          archivedAt: new Date(),
        },
      ])
      .returning();
    await db.insert(lessons).values([
      {
        weekId: weeks[0].id,
        title: "Geçmiş",
        type: "LIVE",
        scheduledAt: new Date("2020-01-01T10:00:00Z"),
      },
      {
        weekId: weeks[1].id,
        title: "Gelecek",
        type: "LIVE",
        scheduledAt: new Date("2099-01-01T10:00:00Z"),
      },
    ]);
    await db.insert(bans).values([
      {
        userId: S1,
        koskId,
        courseId: own,
        scope: "COURSE",
        reason: "x",
        bannedBy: NAZIM,
        bannedRole: "MUDERRIS",
        bannedTier: 1,
      },
      {
        userId: S4,
        koskId,
        scope: "KOSK",
        reason: "x",
        bannedBy: NAZIM,
        bannedRole: "KOSK_NAZIM",
        bannedTier: 3,
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /kosks/:id/overview (nizam/20)", () => {
    it("counts courses by status, talebe without the hidden course, waiting applications, nazımları and medreses", async () => {
      const res = await get(`/kosks/${koskId}/overview`).expect(200);
      expect(res.body.courses).toEqual({
        all: 4,
        published: 2,
        draft: 1,
        hidden: 1,
      });
      // S1 is in two courses and S5 only in the hidden one.
      expect(res.body.students).toBe(3);
      expect(res.body.pendingApplications).toBe(1);
      expect(res.body.nazimCount).toBe(1);
      expect(res.body.hostingMadrasahs).toEqual([
        { id: madrasahId, name: "Süleymaniye" },
      ]);
      expect(res.body.status).toBe("ACTIVE");
      expect(res.body.openedBy.name).toBe("Yusuf Ziya Ertuğrul");
    });

    it("lets the köşk's own nazım read it and refuses another köşk's nazım, a talebe and a stranger", async () => {
      await get(`/kosks/${koskId}/overview`, NAZIM).expect(200);
      await get(`/kosks/${koskId}/overview`, OTHER_NAZIM).expect(403);
      await get(`/kosks/${koskId}/overview`, S1).expect(403);
      await http().get(`/kosks/${koskId}/overview`).expect(401);
    });

    it("answers 404 for a köşk that is not there", async () => {
      await get("/kosks/e0000000-0000-4000-8000-0000000000ff/overview").expect(
        404
      );
    });
  });

  describe("GET /kosks/:id/course-roster (nizam/23)", () => {
    it("lists every course, hidden ones too, newest first, with the tabs' counts", async () => {
      const res = await get(`/kosks/${koskId}/course-roster`, NAZIM).expect(
        200
      );
      expect(res.body.counts).toEqual({
        all: 4,
        published: 2,
        draft: 1,
        hidden: 1,
      });
      expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
        "Maksûd okumaları",
        "Kâfiye'ye giriş",
        "Bina ve İzhar Şerhi",
        "Emsile ve Bina",
      ]);
      const status = Object.fromEntries(
        res.body.items.map((i: { id: string; status: string }) => [
          i.id,
          i.status,
        ])
      );
      expect(status[hidden]).toBe("HIDDEN");
      expect(status[draft]).toBe("DRAFT");
      expect(status[own]).toBe("PUBLISHED");
    });

    it("gives each row its müderrisler with the imam flagged, talebe, waiting applications, bans, weeks and medrese", async () => {
      const res = await get(`/kosks/${koskId}/course-roster`).expect(200);
      const row = (id: string) =>
        res.body.items.find((i: { id: string }) => i.id === id);
      expect(row(own).muderris).toEqual([
        { name: "Mehmet Emin", isImam: true },
        { name: "Ayşe Nur", isImam: false },
      ]);
      expect(row(own).studentCount).toBe(2);
      expect(row(own).pendingCount).toBe(1);
      // S1 barred from the course and S4 from the whole köşk.
      expect(row(own).bannedCount).toBe(2);
      expect(row(own).weekCount).toBe(2);
      expect(row(own).madrasah).toBeNull();
      expect(row(hosted).madrasah).toEqual({
        id: madrasahId,
        name: "Süleymaniye",
      });
      expect(row(hosted).studentCount).toBe(2);
      expect(row(hosted).bannedCount).toBe(1);
      expect(row(hidden).hiddenAt).not.toBeNull();
      expect(row(draft).studentCount).toBe(0);
    });

    describe("who hid a course and who may bring it back", () => {
      const row = async (id: string, sub: string) =>
        (
          await get(`/kosks/${koskId}/course-roster`, sub).expect(200)
        ).body.items.find((i: { id: string }) => i.id === id);

      it("names the level a hidden row was hidden at, and says nothing for a shown one", async () => {
        // Hidden before levels were recorded: the köşk's own course counts as köşk level.
        expect(await row(hidden, NAZIM)).toMatchObject({
          hiddenLevel: "kosk",
          canRestore: true,
        });
        for (const id of [own, hosted, draft]) {
          expect(await row(id, NAZIM)).toMatchObject({
            hiddenLevel: null,
            canRestore: false,
          });
        }
      });

      it("counts a medrese's course hidden by the medrese as medrese level, which the köşk's nazımı is above", async () => {
        await db
          .update(courses)
          .set({
            archivedAt: new Date(),
            archivedBy: NAZIM,
            archivedLevel: "madrasah",
          })
          .where(eq(courses.id, hosted));
        expect(await row(hosted, NAZIM)).toMatchObject({
          hiddenLevel: "madrasah",
          canRestore: true,
        });
      });

      it("says the nazımı cannot restore what the başnazım hid, which the API refuses too", async () => {
        await post(`/courses/${own}/archive`).expect(200);
        expect(await row(own, NAZIM)).toMatchObject({
          hiddenLevel: "platform",
          canRestore: false,
        });
        expect(await row(own, ADMIN)).toMatchObject({
          hiddenLevel: "platform",
          canRestore: true,
        });
        const refused = await post(`/courses/${own}/restore`, NAZIM).expect(
          403
        );
        expect(refused.body.code).toBe("ARCHIVE_RESTORE_LEVEL");
        await post(`/courses/${own}/restore`).expect(200);
      });
    });

    it("does not count a lifted ban", async () => {
      await db
        .update(bans)
        .set({ liftedAt: new Date(), liftedBy: NAZIM })
        .where(eq(bans.koskId, koskId));
      const res = await get(`/kosks/${koskId}/course-roster`).expect(200);
      const row = res.body.items.find((i: { id: string }) => i.id === own);
      expect(row.bannedCount).toBe(0);
    });

    it("refuses another köşk's nazım", async () => {
      await get(`/kosks/${koskId}/course-roster`, OTHER_NAZIM).expect(403);
    });
  });

  describe("POST /kosks/:id/deactivate (nizam/20)", () => {
    it("makes the köşk passive, takes its nazımları off the post and writes the audit row", async () => {
      const res = await post(`/kosks/${koskId}/deactivate`).expect(200);
      expect(res.body.status).toBe("PASSIVE");
      expect(res.body.nazims).toEqual([]);
      const held = (
        await db
          .select()
          .from(roleAssignments)
          .where(eq(roleAssignments.scopeId, koskId))
      ).filter((r) => r.revokedAt === null);
      expect(held).toEqual([]);
      const audit = (
        await db
          .select()
          .from(auditLog)
          .where(eq(auditLog.action, "kosk.deactivate"))
      )[0];
      expect(audit.entityId).toBe(koskId);
      expect(audit.actorId).toBe(ADMIN);
      expect(audit.details).toMatchObject({ removedNazimIds: [NAZIM] });
    });

    it("answers 409 when the köşk is passive already", async () => {
      await post(`/kosks/${koskId}/deactivate`).expect(200);
      const res = await post(`/kosks/${koskId}/deactivate`).expect(409);
      expect(JSON.stringify(res.body)).toContain("KOSK_ALREADY_PASSIVE");
    });

    it("is the başnazım's alone", async () => {
      await post(`/kosks/${koskId}/deactivate`, NAZIM).expect(403);
      const [row] = await db.select().from(kosks).where(eq(kosks.id, koskId));
      expect(row.passiveSince).toBeNull();
    });

    it("answers 404 for a köşk that is not there", async () => {
      await post(
        "/kosks/e0000000-0000-4000-8000-0000000000ff/deactivate"
      ).expect(404);
    });
  });

  describe("GET /courses/:id/stats (nizam/53)", () => {
    it("counts talebe, applications and the weeks that have begun", async () => {
      const res = await get(`/courses/${own}/stats`, NAZIM).expect(200);
      expect(res.body).toEqual({
        enrolledCount: 2,
        pendingCount: 1,
        completedCount: 0,
        weekCount: 2,
        startedWeekCount: 1,
      });
    });

    it("follows an approval: the application leaves and the talebe count goes up", async () => {
      await http()
        .post(`/courses/${own}/enrollments/${S3}/approve`)
        .set("Authorization", auth(NAZIM))
        .expect(201);
      const res = await get(`/courses/${own}/stats`, NAZIM).expect(200);
      expect(res.body.enrolledCount).toBe(3);
      expect(res.body.pendingCount).toBe(0);
    });

    it("is for the course team: a talebe and another köşk's nazım are refused", async () => {
      await get(`/courses/${own}/stats`, S1).expect(403);
      await get(`/courses/${own}/stats`, OTHER_NAZIM).expect(403);
      await get("/courses/e0000000-0000-4000-8000-0000000000ff/stats").expect(
        404
      );
    });
  });
});
