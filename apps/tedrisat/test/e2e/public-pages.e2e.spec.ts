import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courseResources,
  courses,
  courseWeeks,
  lessons,
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
import { bearerFor, mintTestToken } from "../helpers/test-keycloak.helper";

/**
 * MDRS-122 — köşk, medrese and course pages for a caller with no token, and
 * the unlisted (`is_private`) köşk.
 *
 * Like `flashcard-deck-public.e2e.spec.ts`, this app runs the real
 * `AuthGuard` and `JwtVerifierService` against the run's stubbed signing key
 * (no `authUserId`), so each request carries exactly the header the test
 * gives it: none, a minted token, or a broken one. Nothing here reaches a
 * live Keycloak.
 */

const MANAGER_ID = "e3000000-0000-4000-8000-000000000001";
const STRANGER_ID = "e3000000-0000-4000-8000-000000000002";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const MEETING_URL = "https://meet.google.com/abc-defg-hij";
const RESOURCE_URL = "https://files.medaris.test/serh.pdf";
const KAYNAK = "Şerh · s. 1-4";
const CONTENT_MARKERS = [
  "meetingUrl",
  "agenda",
  "kaynak",
  '"url"',
  MEETING_URL,
  RESOURCE_URL,
  KAYNAK,
];

describe("Public köşk, medrese and course pages (MDRS-122, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let madrasahId: string;
  /** Listed köşk, hosting the medrese. */
  let listedKoskId: string;
  /** Unlisted köşk (`is_private`), hosting the same medrese. */
  let unlistedKoskId: string;
  let publishedCourseId: string;
  let draftCourseId: string;
  let hiddenCourseId: string;
  /** PUBLISHED, `requires_approval` false — in the unlisted köşk. */
  let unlistedCourseId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) => bearerFor({ sub });

  const insertKosk = async (name: string, isPrivate: boolean) => {
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name, isPrivate })
      .returning();
    // The medrese's only link to a köşk is a hosting right (MDRS-134).
    await db()
      .insert(madrasahKoskHosting)
      .values({ madrasahId, koskId: kosk.id, grantedBy: MANAGER_ID });
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
      grantedBy: MANAGER_ID,
    });
    return kosk.id;
  };

  const insertCourse = async (
    koskId: string,
    title: string,
    values: Partial<typeof courses.$inferInsert> = {}
  ) => {
    const [course] = await db()
      .insert(courses)
      .values({
        koskId,
        authorId: MANAGER_ID,
        title,
        status: CourseStatus.PUBLISHED,
        ...values,
      })
      .returning();
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId: course.id, weekNumber: 1, title: "Birinci Bab" })
      .returning();
    await db()
      .insert(lessons)
      .values({
        weekId: week.id,
        title: "Canlı halka",
        type: LessonType.LIVE,
        durationMinutes: 60,
        scheduledAt: new Date("2026-10-05T18:00:00Z"),
        meetingUrl: MEETING_URL,
        kaynak: KAYNAK,
        agenda: [{ time: "21:00", title: "Açılış" }],
        isPreview: true,
      });
    await db().insert(courseResources).values({
      courseId: course.id,
      name: "Şerh",
      type: "pdf",
      url: RESOURCE_URL,
    });
    return course.id;
  };

  const expectNoContent = (body: unknown) => {
    const text = JSON.stringify(body);
    for (const marker of CONTENT_MARKERS) {
      expect(text).not.toContain(marker);
    }
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "users");
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({
        handle: "hadis-ve-siyer",
        name: "Hadis ve Siyer Medresesi",
        description: "Rivayet ve dirayet.",
        createdBy: MANAGER_ID,
      })
      .returning();
    madrasahId = madrasah.id;
    listedKoskId = await insertKosk("Süleymaniye Köşkü", false);
    unlistedKoskId = await insertKosk("Liste Dışı Köşk", true);
    publishedCourseId = await insertCourse(listedKoskId, "Bina Şerhi");
    draftCourseId = await insertCourse(listedKoskId, "Taslak Kurs", {
      status: CourseStatus.DRAFT,
    });
    hiddenCourseId = await insertCourse(listedKoskId, "Gizlenen Kurs", {
      archivedAt: new Date(),
      archivedBy: MANAGER_ID,
    });
    unlistedCourseId = await insertCourse(unlistedKoskId, "Linkle Açılan", {
      requiresApproval: false,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "madrasahs", "users");
    await app.close();
  });

  describe("köşk list — an unlisted köşk is in no list", () => {
    const listed = (body: { items: { id: string }[] }) =>
      body.items.map((k) => k.id);

    it("gives a caller with no token the listed köşks only", async () => {
      const res = await http().get("/kosks").expect(200);
      expect(listed(res.body)).toEqual([listedKoskId]);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).toHaveProperty("isFollowing", false);
    });

    it("leaves the unlisted köşk out for a signed-in caller too — its manager included", async () => {
      for (const sub of [STRANGER_ID, MANAGER_ID]) {
        const res = await http().get("/kosks").set("Authorization", as(sub));
        expect(res.status).toBe(200);
        expect(listed(res.body)).toEqual([listedKoskId]);
        expect(res.body.total).toBe(1);
      }
    });

    it("keeps it in the manager's own list (managedBy=me)", async () => {
      const res = await http()
        .get("/kosks?managedBy=me")
        .set("Authorization", as(MANAGER_ID))
        .expect(200);
      expect(listed(res.body).sort()).toEqual(
        [listedKoskId, unlistedKoskId].sort()
      );
      expect(res.body.total).toBe(2);
    });

    it("refuses managedBy=me with no token — there is no caller to narrow to", async () => {
      await http().get("/kosks?managedBy=me").expect(401);
    });

    it("narrows to a medrese's köşks, still without the unlisted one", async () => {
      const anonymous = await http()
        .get(`/kosks?madrasahId=${madrasahId}`)
        .expect(200);
      expect(listed(anonymous.body)).toEqual([listedKoskId]);

      const other = await http().get(`/kosks?madrasahId=${ABSENT_ID}`);
      expect(other.status).toBe(200);
      expect(other.body).toMatchObject({ items: [], total: 0 });

      await http().get("/kosks?madrasahId=not-a-uuid").expect(400);
    });
  });

  describe("köşk page", () => {
    it("opens a listed köşk with no token", async () => {
      const res = await http().get(`/kosks/${listedKoskId}`).expect(200);
      expect(res.body).toMatchObject({
        id: listedKoskId,
        name: "Süleymaniye Köşkü",
        isFollowing: false,
      });
    });

    it("answers an unlisted köşk with no token exactly as a köşk that does not exist", async () => {
      const unlisted = await http().get(`/kosks/${unlistedKoskId}`);
      const absent = await http().get(`/kosks/${ABSENT_ID}`);
      expect(unlisted.status).toBe(404);
      expect(absent.status).toBe(404);
      expect(unlisted.body.code).toBe("KOSK_NOT_FOUND");
      expect(unlisted.body.code).toBe(absent.body.code);
      expect(unlisted.body.message).toBe(
        absent.body.message.replace(ABSENT_ID, unlistedKoskId)
      );
      expect(JSON.stringify(unlisted.body)).not.toContain("Liste Dışı");
    });

    it("opens the unlisted köşk by its link to a signed-in caller", async () => {
      const res = await http()
        .get(`/kosks/${unlistedKoskId}`)
        .set("Authorization", as(STRANGER_ID))
        .expect(200);
      expect(res.body).toMatchObject({ id: unlistedKoskId, isPrivate: true });
    });

    it("answers a malformed id with 400, as for everyone", async () => {
      await http().get("/kosks/not-a-uuid").expect(400);
    });
  });

  describe("masking for a caller with no token (MDRS-160)", () => {
    beforeEach(async () => {
      await db().insert(users).values({
        id: MANAGER_ID,
        givenName: "Abdülhamit",
        familyName: "Karaosmanoğlu",
      });
    });

    it("names the köşk's manager and hides who that is, on the page and in the list", async () => {
      const page = await http().get(`/kosks/${listedKoskId}`).expect(200);
      expect(page.body).toMatchObject({
        ownerId: null,
        managerIds: [],
        managerName: "Abdülhamit Karaosmanoğlu",
      });
      const list = await http().get("/kosks").expect(200);
      expect(list.body.items[0]).toMatchObject({
        ownerId: null,
        managerIds: [],
        managerName: "Abdülhamit Karaosmanoğlu",
      });
      expect(JSON.stringify([page.body, list.body])).not.toContain(MANAGER_ID);
    });

    it("leaves the ids to a signed-in caller", async () => {
      const page = await http()
        .get(`/kosks/${listedKoskId}`)
        .set("Authorization", as(STRANGER_ID))
        .expect(200);
      expect(page.body).toMatchObject({
        ownerId: MANAGER_ID,
        managerIds: [MANAGER_ID],
        managerName: "Abdülhamit Karaosmanoğlu",
      });
    });

    it("gives a null name when the manager has none on file", async () => {
      await db().delete(users);
      const page = await http().get(`/kosks/${listedKoskId}`).expect(200);
      expect(page.body.managerName).toBeNull();
    });

    it("hides who created a medrese and who its nazırs are, and keeps them for a signed-in caller", async () => {
      const anonymous = await http()
        .get(`/madrasahs/${madrasahId}`)
        .expect(200);
      expect(anonymous.body).toMatchObject({ createdBy: null, nazirIds: [] });
      const list = await http().get("/madrasahs").expect(200);
      expect(list.body.items[0]).toMatchObject({
        createdBy: null,
        nazirIds: [],
      });
      const signedIn = await http()
        .get(`/madrasahs/${madrasahId}`)
        .set("Authorization", as(STRANGER_ID))
        .expect(200);
      expect(signedIn.body.createdBy).toBe(MANAGER_ID);
    });
  });

  describe("köşk's courses", () => {
    it("lists the published courses with no token — no draft, no hidden course, no enrollment", async () => {
      const res = await http()
        .get(`/kosks/${listedKoskId}/courses`)
        .expect(200);
      expect(res.body.map((c: { id: string }) => c.id)).toEqual([
        publishedCourseId,
      ]);
      expect(res.body[0].enrollment).toBeNull();
    });

    it("answers the unlisted köşk's shelf with 404", async () => {
      const res = await http()
        .get(`/kosks/${unlistedKoskId}/courses`)
        .expect(404);
      expect(res.body.code).toBe("KOSK_NOT_FOUND");
    });

    it("refuses the archive view with no token", async () => {
      await http()
        .get(`/kosks/${listedKoskId}/courses?archived=true`)
        .expect(401);
    });
  });

  describe("course page", () => {
    it("gives a caller with no token MDRS-103's filtered body", async () => {
      const res = await http().get(`/courses/${publishedCourseId}`).expect(200);
      expect(res.body).toMatchObject({
        id: publishedCourseId,
        title: "Bina Şerhi",
        contentLocked: true,
        enrollment: null,
      });
      expect(res.body.weeks[0].lessons[0]).toMatchObject({
        title: "Canlı halka",
        durationMinutes: 60,
      });
      expectNoContent(res.body);
    });

    it("answers a draft, a hidden course and any course of an unlisted köşk as not found", async () => {
      const absent = await http().get(`/courses/${ABSENT_ID}`);
      expect(absent.status).toBe(404);
      for (const id of [draftCourseId, hiddenCourseId, unlistedCourseId]) {
        const res = await http().get(`/courses/${id}`);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe("COURSE_NOT_FOUND");
        expect(res.body.code).toBe(absent.body.code);
        expect(res.body.message).toBe(
          absent.body.message.replace(ABSENT_ID, id)
        );
      }
    });

    it("opens a course of the unlisted köşk to a signed-in caller, still without content", async () => {
      const res = await http()
        .get(`/courses/${unlistedCourseId}`)
        .set("Authorization", as(STRANGER_ID))
        .expect(200);
      expect(res.body.contentLocked).toBe(true);
      expectNoContent(res.body);
    });

    it("answers a malformed id with 400", async () => {
      await http().get("/courses/not-a-uuid").expect(400);
    });
  });

  describe("medrese", () => {
    it("lists and opens a medrese with no token", async () => {
      const list = await http().get("/madrasahs").expect(200);
      expect(list.body.items.map((m: { id: string }) => m.id)).toEqual([
        madrasahId,
      ]);
      const page = await http().get(`/madrasahs/${madrasahId}`).expect(200);
      expect(page.body).toMatchObject({
        id: madrasahId,
        name: "Hadis ve Siyer Medresesi",
      });
    });

    // `byExistingMadrasah` answers a malformed id as not-found too, for every
    // caller — the anonymous one gets the same answer as a signed-in one.
    it("answers a missing or malformed medrese id with 404", async () => {
      await http().get(`/madrasahs/${ABSENT_ID}`).expect(404);
      await http().get("/madrasahs/not-a-uuid").expect(404);
    });
  });

  describe("enrollment in an unlisted köşk always waits for approval", () => {
    it("lands PENDING there, whatever the course's own setting, and ENROLLED elsewhere", async () => {
      const unlisted = await http()
        .post(`/courses/${unlistedCourseId}/enroll`)
        .set("Authorization", as(STRANGER_ID))
        .expect(201);
      expect(unlisted.body.status).toBe(EnrollmentStatus.PENDING);

      const listed = await http()
        .post(`/courses/${publishedCourseId}/enroll`)
        .set("Authorization", as(STRANGER_ID))
        .expect(201);
      expect(listed.body.status).toBe(EnrollmentStatus.ENROLLED);
    });
  });

  describe("reading is all a caller with no token may do", () => {
    it("is a 401 on every write next to the public reads", async () => {
      await http().post(`/courses/${publishedCourseId}/enroll`).expect(401);
      await http().post(`/kosks/${listedKoskId}/follow`).expect(401);
      await http()
        .patch(`/kosks/${listedKoskId}`)
        .send({ name: "Ele geçirildi" })
        .expect(401);
      await http().post("/kosks").send({ name: "Yeni" }).expect(401);
      await http()
        .patch(`/courses/${publishedCourseId}`)
        .send({ title: "Ele geçirildi" })
        .expect(401);
      await http()
        .patch(`/madrasahs/${madrasahId}`)
        .send({ name: "Ele geçirildi" })
        .expect(401);

      const kosk = await http().get(`/kosks/${listedKoskId}`).expect(200);
      expect(kosk.body.name).toBe("Süleymaniye Köşkü");
    });
  });

  describe("a token that is present but invalid is a 401, never anonymous", () => {
    const invalidHeaders: [string, () => string][] = [
      [
        "an expired token",
        () => bearerFor({ sub: STRANGER_ID, expiresInSeconds: -3600 }),
      ],
      [
        "a token signed by a key the realm does not know",
        () => bearerFor({ sub: STRANGER_ID, header: { kid: "unknown-kid" } }),
      ],
      [
        "a token with a tampered signature",
        () => {
          const [header, payload] = mintTestToken({ sub: STRANGER_ID }).split(
            "."
          );
          return `Bearer ${header}.${payload}.${Buffer.from("forged").toString("base64url")}`;
        },
      ],
      ["a string that is not a JWT", () => "Bearer not-a-jwt"],
      ["a non-Bearer scheme", () => "Basic dXNlcjpwYXNz"],
      ["Bearer with no token", () => "Bearer"],
    ];
    const routes = () => [
      "/kosks",
      `/kosks/${listedKoskId}`,
      `/kosks/${listedKoskId}/courses`,
      `/courses/${publishedCourseId}`,
      "/madrasahs",
      `/madrasahs/${madrasahId}`,
    ];

    for (const [label, header] of invalidHeaders) {
      it(`${label} — on each public read`, async () => {
        for (const route of routes()) {
          const res = await http().get(route).set("Authorization", header());
          expect({ route, status: res.status }).toEqual({ route, status: 401 });
        }
      });
    }
  });
});
