import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { flashcards } from "../../src/database/schema/flashcard.schema";
import {
  decks,
  decksUsers,
} from "../../src/database/schema/flashcard-deck.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-159: what Keşfet, the köşk page and Derslerim read. Built with the real
 * guard (`createTestApp()` with no `authUserId`) so a caller with no token and
 * a signed-in one are told apart.
 */
const ADMIN_ID = "d0000000-0000-4000-8000-000000000001";
const MANAGER_ID = "d0000000-0000-4000-8000-000000000002";
const TALEBE_ID = "d0000000-0000-4000-8000-000000000003";
const STRANGER_ID = "d0000000-0000-4000-8000-000000000004";
const HEAD_ID = "d0000000-0000-4000-8000-000000000005";

const auth = (sub: string) => bearerFor({ sub });

describe("Keşfet, köşk page and Derslerim reads (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const makeKosk = async (
    values: Partial<typeof kosks.$inferInsert> & { name: string }
  ) => {
    const [row] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, ...values })
      .returning();
    return row;
  };

  const makeCourse = async (
    koskId: string,
    title: string,
    extra: Partial<typeof courses.$inferInsert> = {}
  ) => {
    const [row] = await db()
      .insert(courses)
      .values({
        koskId,
        authorId: MANAGER_ID,
        title,
        status: CourseStatus.PUBLISHED,
        ...extra,
      })
      .returning();
    return row;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "decks_users",
      "flashcards",
      "decks",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users"
    );
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      "decks_users",
      "flashcards",
      "decks",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users"
    );
    await app.close();
  });

  describe("GET /kosks filters and GET /kosks/fields", () => {
    beforeEach(async () => {
      await makeKosk({
        name: "Nûruosmaniye Köşkü",
        field: "Arapça dil ilimleri",
        level: "BEGINNER",
        description: "Sarf ve nahiv.",
      });
      await makeKosk({
        name: "Fatih Köşkü",
        field: "Fıkıh",
        level: "INTERMEDIATE",
      });
      await makeKosk({
        name: "Beyazıt Köşkü",
        field: "Hadis",
        level: "BEGINNER",
      });
      await makeKosk({
        name: "Gizli Köşk",
        field: "Hadis",
        level: "BEGINNER",
        isPrivate: true,
      });
      await makeKosk({
        name: "Gizlenmiş Köşk",
        field: "Tefsir",
        level: "BEGINNER",
        archivedAt: new Date(),
      });
    });

    it("keeps the köşks of one level, with the total of that level", async () => {
      const res = await http().get("/kosks?level=INTERMEDIATE").expect(200);
      expect(res.body.items.map((k: { name: string }) => k.name)).toEqual([
        "Fatih Köşkü",
      ]);
      expect(res.body.total).toBe(1);
    });

    it("keeps the köşks of one ilim alanı", async () => {
      const res = await http()
        .get(`/kosks?field=${encodeURIComponent("Fıkıh")}`)
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].field).toBe("Fıkıh");
    });

    it("combines the filters, and an unlisted or hidden köşk is in none", async () => {
      const res = await http()
        .get("/kosks?level=BEGINNER&field=Hadis")
        .expect(200);
      expect(res.body.items.map((k: { name: string }) => k.name)).toEqual([
        "Beyazıt Köşkü",
      ]);
      const hidden = await http().get("/kosks?field=Tefsir").expect(200);
      expect(hidden.body.total).toBe(0);
    });

    it("searches the name, description and field, every word", async () => {
      const byName = await http().get("/kosks?q=fatih").expect(200);
      expect(byName.body.total).toBe(1);
      const byDescription = await http()
        .get("/kosks?q=sarf%20nahiv")
        .expect(200);
      expect(byDescription.body.items[0].name).toBe("Nûruosmaniye Köşkü");
      const nothing = await http().get("/kosks?q=sarf%20fatih").expect(200);
      expect(nothing.body.total).toBe(0);
    });

    it("reads a wildcard in the search as text", async () => {
      const res = await http().get("/kosks?q=%25").expect(200);
      expect(res.body.total).toBe(0);
    });

    it("counts a köşk's published courses only, drafts left out", async () => {
      const kosk = await makeKosk({ name: "Sayılı Köşk", field: "Sayı" });
      await makeCourse(kosk.id, "Yayında");
      await makeCourse(kosk.id, "Taslak", { status: CourseStatus.DRAFT });
      const res = await http().get("/kosks?field=Say%C4%B1").expect(200);
      expect(res.body.items[0].courseCount).toBe(1);
    });

    it("refuses a level it does not know", async () => {
      await http().get("/kosks?level=EXPERT").expect(400);
    });

    it("lists the ilim alanı of the listed köşks, alphabetical, to anyone", async () => {
      const res = await http().get("/kosks/fields").expect(200);
      expect(res.body).toEqual(["Arapça dil ilimleri", "Fıkıh", "Hadis"]);
    });
  });

  describe("GET /madrasahs/explore", () => {
    let koskId: string;

    beforeEach(async () => {
      const kosk = await makeKosk({
        name: "Nûruosmaniye Köşkü",
        field: "Arapça dil ilimleri",
        level: "BEGINNER",
      });
      koskId = kosk.id;
      const [suleymaniye] = await db()
        .insert(madrasahs)
        .values({
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN_ID,
        })
        .returning();
      await db().insert(madrasahs).values({
        handle: "zeyrek",
        name: "Zeyrek Medresesi",
        createdBy: ADMIN_ID,
      });
      await db().insert(users).values({
        id: HEAD_ID,
        givenName: "Mehmet Emin",
        familyName: "Işıkoğlu",
        email: "head@example.test",
      });
      await assignRole(db(), {
        userId: HEAD_ID,
        role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
        scopeId: suleymaniye.id,
        grantedBy: ADMIN_ID,
      });
      await makeCourse(koskId, "Bina ve İzhar Şerhi", {
        madrasahId: suleymaniye.id,
      });
      await makeCourse(koskId, "İsâgûcî ile mantığa giriş", {
        madrasahId: suleymaniye.id,
      });
      await makeCourse(koskId, "Taslak ders", {
        madrasahId: suleymaniye.id,
        status: CourseStatus.DRAFT,
      });
    });

    it("lists each medrese with its başmüderris and its listed courses", async () => {
      const res = await http().get("/madrasahs/explore").expect(200);
      expect(res.body).toHaveLength(2);
      const [suleymaniye, zeyrek] = res.body;
      expect(suleymaniye.name).toBe("Süleymaniye Medresesi");
      expect(suleymaniye.headMuderrisName).toBe("Mehmet Emin Işıkoğlu");
      expect(suleymaniye.courseCount).toBe(2);
      expect(
        suleymaniye.courses.map((c: { title: string }) => c.title)
      ).toEqual(["Bina ve İzhar Şerhi", "İsâgûcî ile mantığa giriş"]);
      expect(zeyrek.courseCount).toBe(0);
      expect(zeyrek.courses).toEqual([]);
      expect(zeyrek.headMuderrisName).toBeNull();
    });

    it("leaves out the courses of an unlisted köşk", async () => {
      await db().update(kosks).set({ isPrivate: true });
      const res = await http().get("/madrasahs/explore").expect(200);
      expect(res.body[0].courseCount).toBe(0);
    });

    it("narrows by the level and field of the köşks the courses are in", async () => {
      const match = await http()
        .get(
          `/madrasahs/explore?level=BEGINNER&field=${encodeURIComponent("Arapça dil ilimleri")}`
        )
        .expect(200);
      expect(match.body.map((m: { name: string }) => m.name)).toEqual([
        "Süleymaniye Medresesi",
      ]);
      const none = await http()
        .get("/madrasahs/explore?level=ADVANCED")
        .expect(200);
      expect(none.body).toEqual([]);
    });

    it("searches the name and the başmüderris's name", async () => {
      const byName = await http()
        .get("/madrasahs/explore?q=zeyrek")
        .expect(200);
      expect(byName.body).toHaveLength(1);
      const byHead = await http()
        .get(`/madrasahs/explore?q=${encodeURIComponent("ışıkoğlu")}`)
        .expect(200);
      expect(byHead.body.map((m: { name: string }) => m.name)).toEqual([
        "Süleymaniye Medresesi",
      ]);
    });

    it("keeps one medrese by id", async () => {
      const all = await http().get("/madrasahs/explore").expect(200);
      const res = await http()
        .get(`/madrasahs/explore?madrasahId=${all.body[1].id}`)
        .expect(200);
      expect(res.body.map((m: { name: string }) => m.name)).toEqual([
        "Zeyrek Medresesi",
      ]);
    });
  });

  describe("GET /kosks/:id/decks", () => {
    let koskId: string;
    let courseId: string;

    beforeEach(async () => {
      const kosk = await makeKosk({ name: "Nûruosmaniye Köşkü" });
      koskId = kosk.id;
      await assignRole(db(), {
        userId: MANAGER_ID,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: koskId,
      });
      courseId = (await makeCourse(koskId, "Emsile ve Bina")).id;
      await db().insert(enrollments).values({
        userId: TALEBE_ID,
        courseId,
        status: EnrollmentStatus.ENROLLED,
      });
      await db().insert(enrollments).values({
        userId: STRANGER_ID,
        courseId,
        status: EnrollmentStatus.PENDING,
      });
      const [shared] = await db()
        .insert(decks)
        .values({
          authorId: MANAGER_ID,
          title: "Sarfın temel kelimeleri",
          isPublic: true,
          koskId,
        })
        .returning();
      await db().insert(decks).values({
        authorId: MANAGER_ID,
        title: "Özel deste",
        isPublic: false,
        koskId,
      });
      await db().insert(decks).values({
        authorId: MANAGER_ID,
        title: "Gizlenmiş deste",
        isPublic: true,
        koskId,
        archivedAt: new Date(),
      });
      await db()
        .insert(flashcards)
        .values(
          [1, 2, 3].map((n) => ({
            deckId: shared.id,
            authorId: MANAGER_ID,
            type: FlashcardType.VOCABULARY,
            contentFront: `ön ${n}`,
            contentBack: `arka ${n}`,
          }))
        );
      await db().insert(decksUsers).values({
        userId: TALEBE_ID,
        deckId: shared.id,
      });
    });

    it("gives a talebe of the köşk's courses the shared decks, with the card count and the collection mark", async () => {
      const res = await http()
        .get(`/kosks/${koskId}/decks`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      expect(res.body.accessible).toBe(true);
      expect(res.body.decks).toEqual([
        expect.objectContaining({
          title: "Sarfın temel kelimeleri",
          cardCount: 3,
          inCollection: true,
        }),
      ]);
    });

    it("marks a deck outside the caller's collection", async () => {
      const res = await http()
        .get(`/kosks/${koskId}/decks`)
        .set("Authorization", auth(MANAGER_ID))
        .expect(200);
      expect(res.body.accessible).toBe(true);
      expect(res.body.decks[0].inCollection).toBe(false);
    });

    it("gives a müderris of a course of the köşk the decks", async () => {
      await db().insert(courseMuderris).values({
        courseId,
        userId: HEAD_ID,
        name: "Abdülhamit Karaosmanoğlu",
      });
      const res = await http()
        .get(`/kosks/${koskId}/decks`)
        .set("Authorization", auth(HEAD_ID))
        .expect(200);
      expect(res.body.accessible).toBe(true);
    });

    it("tells a pending applicant and a stranger the block is not theirs", async () => {
      for (const sub of [STRANGER_ID, ADMIN_ID]) {
        const res = await http()
          .get(`/kosks/${koskId}/decks`)
          .set("Authorization", auth(sub))
          .expect(200);
        expect(res.body).toEqual({ accessible: false, decks: [] });
      }
    });

    it("asks a caller with no token to sign in, and answers 404 for no köşk", async () => {
      await http().get(`/kosks/${koskId}/decks`).expect(401);
      await http()
        .get("/kosks/d0000000-0000-4000-8000-0000000000ff/decks")
        .set("Authorization", auth(TALEBE_ID))
        .expect(404);
    });
  });

  describe("GET /kosks/:id/courses, as the köşk page reads it", () => {
    it("names the medrese, the next standing session and the imam of each course", async () => {
      const kosk = await makeKosk({ name: "Nûruosmaniye Köşkü" });
      const [madrasah] = await db()
        .insert(madrasahs)
        .values({
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN_ID,
        })
        .returning();
      const own = await makeCourse(kosk.id, "Emsile ve Bina");
      const opened = await makeCourse(kosk.id, "Bina ve İzhar Şerhi", {
        madrasahId: madrasah.id,
      });
      await db()
        .insert(courseMuderris)
        .values([
          {
            courseId: opened.id,
            userId: HEAD_ID,
            name: "Birinci",
            orderIndex: 0,
          },
          {
            courseId: opened.id,
            userId: TALEBE_ID,
            name: "İkinci",
            orderIndex: 1,
          },
        ]);
      await assignRole(db(), {
        userId: HEAD_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: opened.id,
        isImam: true,
      });
      const [week] = await db()
        .insert(courseWeeks)
        .values({ courseId: opened.id, weekNumber: 1, title: "Bir" })
        .returning();
      const later = new Date(Date.now() + 3 * 24 * 3600_000);
      await db().insert(lessons).values({
        weekId: week.id,
        title: "celse",
        type: LessonType.LIVE,
        scheduledAt: later,
      });

      const res = await http().get(`/kosks/${kosk.id}/courses`).expect(200);
      const byId = Object.fromEntries(
        res.body.map((c: { id: string }) => [c.id, c])
      );
      expect(byId[own.id].madrasah).toBeNull();
      expect(byId[own.id].nextSessionAt).toBeNull();
      expect(byId[opened.id].madrasah).toEqual({
        id: madrasah.id,
        name: "Süleymaniye Medresesi",
      });
      expect(new Date(byId[opened.id].nextSessionAt).getTime()).toBe(
        later.getTime()
      );
      expect(
        byId[opened.id].muderris.map((m: { name: string; isImam: boolean }) => [
          m.name,
          m.isImam,
        ])
      ).toEqual([
        ["Birinci", true],
        ["İkinci", false],
      ]);
    });
  });

  describe("GET /courses/enrolled", () => {
    let koskId: string;
    const idOf: Record<string, string> = {};

    beforeEach(async () => {
      koskId = (await makeKosk({ name: "Nûruosmaniye Köşkü" })).id;
      for (const [key, status, progress] of [
        ["running", EnrollmentStatus.ENROLLED, 40],
        ["waiting", EnrollmentStatus.PENDING, 0],
        ["done", EnrollmentStatus.COMPLETED, 100],
        ["removed", EnrollmentStatus.REVOKED, 10],
      ] as const) {
        const course = await makeCourse(koskId, key);
        idOf[key] = course.id;
        await db().insert(enrollments).values({
          userId: TALEBE_ID,
          courseId: course.id,
          status,
          progress,
        });
      }
      const [week4] = await db()
        .insert(courseWeeks)
        .values({ courseId: idOf.running, weekNumber: 4, title: "Dördüncü" })
        .returning();
      const [week5] = await db()
        .insert(courseWeeks)
        .values({ courseId: idOf.running, weekNumber: 5, title: "Beşinci" })
        .returning();
      const hour = 3600_000;
      const at = (n: number) => new Date(Date.now() + n * hour);
      await db()
        .insert(lessons)
        .values([
          {
            weekId: week4.id,
            title: "geçmiş",
            type: LessonType.LIVE,
            scheduledAt: at(-48),
          },
          {
            weekId: week4.id,
            title: "iptal",
            type: LessonType.LIVE,
            scheduledAt: at(24),
            cancelledAt: new Date(),
          },
          {
            weekId: week5.id,
            title: "sıradaki",
            type: LessonType.LIVE,
            scheduledAt: at(72),
          },
          {
            weekId: week5.id,
            title: "sonraki",
            type: LessonType.LIVE,
            scheduledAt: at(96),
          },
        ]);
    });

    it("leaves a pending request out, as it always has", async () => {
      const res = await http()
        .get("/courses/enrolled")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      expect(res.body.map((c: { title: string }) => c.title).sort()).toEqual([
        "done",
        "running",
      ]);
    });

    it("adds the pending requests when asked, each marked by its status", async () => {
      const res = await http()
        .get("/courses/enrolled?includePending=true")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      const byTitle = Object.fromEntries(
        res.body.map((c: { title: string }) => [c.title, c])
      );
      expect(byTitle.waiting.enrollment.status).toBe("PENDING");
      expect(byTitle.running.enrollment.status).toBe("ENROLLED");
      expect(byTitle.done.enrollment.status).toBe("COMPLETED");
      expect(byTitle.removed).toBeUndefined();
    });

    it("adds the courses whose access was withdrawn only when asked", async () => {
      const res = await http()
        .get("/courses/enrolled?includePending=true&includeRevoked=true")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      expect(res.body.map((c: { title: string }) => c.title).sort()).toEqual([
        "done",
        "removed",
        "running",
        "waiting",
      ]);
      const removed = res.body.find(
        (c: { title: string }) => c.title === "removed"
      );
      expect(removed.enrollment.status).toBe("REVOKED");
    });

    it("gives the next standing session and its week", async () => {
      const res = await http()
        .get("/courses/enrolled")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      const running = res.body.find(
        (c: { title: string }) => c.title === "running"
      );
      expect(running.nextSession.weekNumber).toBe(5);
      const done = res.body.find((c: { title: string }) => c.title === "done");
      expect(done.nextSession).toBeNull();
      expect(running.madrasahName).toBeNull();
    });

    it("names the medrese that opened a course and marks its imam", async () => {
      const [madrasah] = await db()
        .insert(madrasahs)
        .values({
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN_ID,
        })
        .returning();
      await db()
        .update(courses)
        .set({ madrasahId: madrasah.id })
        .where(eq(courses.id, idOf.running));
      await db().insert(courseMuderris).values({
        courseId: idOf.running,
        userId: HEAD_ID,
        name: "Mehmet Emin Işıkoğlu",
      });
      await assignRole(db(), {
        userId: HEAD_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: idOf.running,
        isImam: true,
      });
      const res = await http()
        .get("/courses/enrolled")
        .set("Authorization", auth(TALEBE_ID))
        .expect(200);
      const running = res.body.find(
        (c: { title: string }) => c.title === "running"
      );
      expect(running.madrasahName).toBe("Süleymaniye Medresesi");
      expect(running.muderris[0]).toMatchObject({
        name: "Mehmet Emin Işıkoğlu",
        isImam: true,
      });
    });

    it("dates a completion when the team marks it, and clears it on reopening", async () => {
      await db().insert(courseMuderris).values({
        courseId: idOf.running,
        userId: MANAGER_ID,
        name: "Müderris",
      });
      await assignRole(db(), {
        userId: MANAGER_ID,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: koskId,
      });
      const mark = (status: string) =>
        http()
          .patch(`/courses/${idOf.running}/enrollments/${TALEBE_ID}`)
          .set("Authorization", auth(MANAGER_ID))
          .send({ status });
      const read = async () =>
        (
          await http()
            .get("/courses/enrolled")
            .set("Authorization", auth(TALEBE_ID))
            .expect(200)
        ).body.find((c: { title: string }) => c.title === "running").enrollment;

      await mark("COMPLETED").expect(200);
      const first = (await read()).completedAt;
      expect(first).toEqual(expect.any(String));
      await mark("COMPLETED").expect(200);
      expect((await read()).completedAt).toBe(first);
      await mark("ENROLLED").expect(200);
      expect((await read()).completedAt).toBeNull();
    });
  });
});
