import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { flashcards } from "../../src/database/schema/flashcard.schema";
import { decks } from "../../src/database/schema/flashcard-deck.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { lessonNotes } from "../../src/database/schema/lesson-note.schema";
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
 * MDRS-173: the köşk archive (nizam/28) and the platform archive with its
 * permanent delete (nizam/29), against a real Postgres. Built with
 * `createTestApp()` and no `authUserId`, so the real AuthGuard verifies a
 * minted token and `realm_access` carries SYSTEM_ADMIN for the başnazım.
 */
const ADMIN_ID = "c0000000-0000-4000-8000-000000000001";
const NAZIM_A_ID = "c0000000-0000-4000-8000-000000000002";
const NAZIM_B_ID = "c0000000-0000-4000-8000-000000000003";
const MUDERRIS_ID = "c0000000-0000-4000-8000-000000000004";
const STRANGER_ID = "c0000000-0000-4000-8000-000000000005";
const STUDENT_ID = "c0000000-0000-4000-8000-000000000006";

// Every request syncs the caller's profile from the token (MDRS-104), so a
// name seeded in `users` only survives if the token carries it too.
const NAMES: Record<string, [string, string]> = {
  [NAZIM_A_ID]: ["Abdülhamit", "Karaosmanoğlu"],
  [MUDERRIS_ID]: ["Ayşe Nur", "Kılıçarslan"],
  [ADMIN_ID]: ["Yusuf Ziya", "Ertuğrul"],
};

const auth = (sub: string) => {
  const [given_name, family_name] = NAMES[sub] ?? [undefined, undefined];
  return bearerFor({
    sub,
    claims: {
      ...(given_name ? { given_name, family_name } : {}),
      ...(sub === ADMIN_ID
        ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } }
        : {}),
    },
  });
};

describe("Archive (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskA: string;
  let koskB: string;
  let hiddenCourse: string;
  let liveCourse: string;
  let hiddenWeek: string;
  let sessionOfHiddenWeek: string;
  let liveWeek: string;
  let hiddenSession: string;
  let liveSession: string;
  let hiddenDeck: string;
  let foreignHiddenCourse: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const TABLES = [...COURSE_TREE_TABLES, "audit_log", "users"] as const;

  const hide = new Date("2026-09-30T10:00:00Z");

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    await db().delete(flashcards);
    await db().delete(decks);

    await db()
      .insert(users)
      .values([
        {
          id: NAZIM_A_ID,
          givenName: "Abdülhamit",
          familyName: "Karaosmanoğlu",
        },
        { id: MUDERRIS_ID, givenName: "Ayşe Nur", familyName: "Kılıçarslan" },
        { id: ADMIN_ID, givenName: "Yusuf Ziya", familyName: "Ertuğrul" },
      ]);

    [{ id: koskA }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_A_ID, name: "Nûruosmaniye Köşkü" })
      .returning({ id: kosks.id });
    [{ id: koskB }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_B_ID, name: "Fatih Köşkü" })
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: NAZIM_A_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskA,
    });
    await assignRole(db(), {
      userId: NAZIM_B_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskB,
    });

    // A hidden course with two weeks, three sessions and two talebe.
    [{ id: hiddenCourse }] = await db()
      .insert(courses)
      .values({
        koskId: koskA,
        authorId: NAZIM_A_ID,
        title: "Maksûd okumaları",
        status: CourseStatus.PUBLISHED,
        archivedAt: hide,
        archivedBy: NAZIM_A_ID,
      })
      .returning({ id: courses.id });
    const hiddenCourseWeeks = await db()
      .insert(courseWeeks)
      .values([
        { courseId: hiddenCourse, weekNumber: 1, title: "Giriş" },
        { courseId: hiddenCourse, weekNumber: 2, title: "Tarif" },
      ])
      .returning({ id: courseWeeks.id });
    await db()
      .insert(lessons)
      .values([
        { weekId: hiddenCourseWeeks[0].id, title: "a", type: LessonType.LIVE },
        { weekId: hiddenCourseWeeks[0].id, title: "b", type: LessonType.LIVE },
        { weekId: hiddenCourseWeeks[1].id, title: "c", type: LessonType.LIVE },
      ]);
    await db()
      .insert(enrollments)
      .values([
        {
          userId: STUDENT_ID,
          courseId: hiddenCourse,
          status: EnrollmentStatus.ENROLLED,
        },
        {
          userId: STRANGER_ID,
          courseId: hiddenCourse,
          status: EnrollmentStatus.ENROLLED,
        },
      ]);

    // A shown course: one hidden week (with the session hidden together with
    // it), one live week with a session hidden alone.
    [{ id: liveCourse }] = await db()
      .insert(courses)
      .values({
        koskId: koskA,
        authorId: NAZIM_A_ID,
        title: "Emsile ve Bina",
        status: CourseStatus.PUBLISHED,
      })
      .returning({ id: courses.id });
    [{ id: hiddenWeek }] = await db()
      .insert(courseWeeks)
      .values({
        courseId: liveCourse,
        weekNumber: 11,
        title: "Hafta 11: Tasrîf tekrarı",
        archivedAt: new Date("2026-09-29T14:05:00Z"),
        archivedBy: MUDERRIS_ID,
      })
      .returning({ id: courseWeeks.id });
    [{ id: sessionOfHiddenWeek }] = await db()
      .insert(lessons)
      .values({
        weekId: hiddenWeek,
        title: "Hafta 11 celse",
        type: LessonType.LIVE,
        archivedAt: new Date("2026-09-29T14:05:00Z"),
        archivedBy: MUDERRIS_ID,
      })
      .returning({ id: lessons.id });
    [{ id: liveWeek }] = await db()
      .insert(courseWeeks)
      .values({ courseId: liveCourse, weekNumber: 5, title: "Hafta 5" })
      .returning({ id: courseWeeks.id });
    [{ id: hiddenSession }] = await db()
      .insert(lessons)
      .values({
        weekId: liveWeek,
        title: "Mehmûz fiiller (mükerrer)",
        type: LessonType.LIVE,
        scheduledAt: new Date("2026-10-03T18:00:00Z"),
        archivedAt: new Date("2026-10-01T15:20:00Z"),
        archivedBy: NAZIM_A_ID,
      })
      .returning({ id: lessons.id });
    [{ id: liveSession }] = await db()
      .insert(lessons)
      .values({
        weekId: liveWeek,
        title: "Hafta 5 asıl",
        type: LessonType.LIVE,
      })
      .returning({ id: lessons.id });

    [{ id: hiddenDeck }] = await db()
      .insert(decks)
      .values({
        authorId: MUDERRIS_ID,
        title: "Fiil kalıpları",
        archivedAt: new Date("2026-09-28T09:00:00Z"),
        archivedBy: MUDERRIS_ID,
      })
      .returning({ id: decks.id });
    await db()
      .insert(flashcards)
      .values([
        {
          deckId: hiddenDeck,
          authorId: MUDERRIS_ID,
          type: FlashcardType.VOCABULARY,
          contentFront: "ضرب",
          contentBack: "vurdu",
        },
        {
          deckId: hiddenDeck,
          authorId: MUDERRIS_ID,
          type: FlashcardType.VOCABULARY,
          contentFront: "نصر",
          contentBack: "yardım etti",
        },
      ]);

    // The other köşk's hidden course must never show up in A's archive.
    [{ id: foreignHiddenCourse }] = await db()
      .insert(courses)
      .values({
        koskId: koskB,
        authorId: NAZIM_B_ID,
        title: "Hüküm ve hâkim",
        archivedAt: hide,
        archivedBy: NAZIM_B_ID,
      })
      .returning({ id: courses.id });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await db().delete(flashcards);
    await db().delete(decks);
    await app.close();
  });

  describe("GET /kosks/:id/archive", () => {
    it("lists what is hidden in the köşk, newest first, with who hid it (a deck belongs to no köşk)", async () => {
      const res = await http()
        .get(`/kosks/${koskA}/archive`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);

      expect(res.body.total).toBe(3);
      expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
        hiddenSession,
        hiddenCourse,
        hiddenWeek,
      ]);
      const [session, course, week] = res.body.items;
      expect(session).toMatchObject({
        type: "session",
        title: "Mehmûz fiiller (mükerrer)",
        courseTitle: "Emsile ve Bina",
        weekNumber: 5,
        koskName: "Nûruosmaniye Köşkü",
        archivedBy: {
          id: NAZIM_A_ID,
          name: "Abdülhamit Karaosmanoğlu",
          role: "KOSK_NAZIM",
        },
      });
      expect(new Date(session.scheduledAt).toISOString()).toBe(
        "2026-10-03T18:00:00.000Z"
      );
      expect(course).toMatchObject({
        type: "course",
        weekCount: 2,
        studentCount: 2,
      });
      expect(week).toMatchObject({
        type: "week",
        weekNumber: 11,
        sessionCount: 0,
        archivedBy: { name: "Ayşe Nur Kılıçarslan", role: null },
      });
    });

    it("leaves the sessions of a hidden week and the other köşk's items out", async () => {
      const res = await http()
        .get(`/kosks/${koskA}/archive?limit=50`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      const ids = res.body.items.map((i: { id: string }) => i.id);
      expect(ids).not.toContain(sessionOfHiddenWeek);
      expect(ids).not.toContain(foreignHiddenCourse);
      expect(ids).not.toContain(liveSession);
    });

    it("filters by type and by title, and the total follows", async () => {
      const byType = await http()
        .get(`/kosks/${koskA}/archive?type=course`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(byType.body.total).toBe(1);
      expect(byType.body.items[0].id).toBe(hiddenCourse);

      const bySearch = await http()
        .get(`/kosks/${koskA}/archive?q=mehm%C3%BBz`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(bySearch.body.items.map((i: { id: string }) => i.id)).toEqual([
        hiddenSession,
      ]);

      const wildcard = await http()
        .get(`/kosks/${koskA}/archive?q=%25`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(wildcard.body.total).toBe(0);
    });

    it("lists nothing for the types that have no storage yet", async () => {
      for (const type of ["recording", "madrasah", "kosk"]) {
        const res = await http()
          .get(`/kosks/${koskA}/archive?type=${type}`)
          .set("Authorization", auth(NAZIM_A_ID))
          .expect(200);
        expect(res.body.total).toBe(0);
      }
    });

    it("pages", async () => {
      const res = await http()
        .get(`/kosks/${koskA}/archive?limit=2&page=2`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(res.body).toMatchObject({ total: 3, page: 2, limit: 2 });
      expect(res.body.items).toHaveLength(1);
    });

    it("rejects an unknown type with 400", () =>
      http()
        .get(`/kosks/${koskA}/archive?type=nothing`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(400));

    it.each([
      ["another köşk's nazım", NAZIM_B_ID],
      ["a müderris", MUDERRIS_ID],
      ["a stranger", STRANGER_ID],
    ])("refuses %s with 403", (_who, sub) =>
      http()
        .get(`/kosks/${koskA}/archive`)
        .set("Authorization", auth(sub))
        .expect(403));

    it("lets the başnazım read any köşk's archive", async () => {
      const res = await http()
        .get(`/kosks/${koskB}/archive`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
        foreignHiddenCourse,
      ]);
    });

    it("answers 404 for a köşk that does not exist and 401 without a token", async () => {
      await http()
        .get("/kosks/c0000000-0000-4000-8000-0000000000ff/archive")
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      await http().get(`/kosks/${koskA}/archive`).expect(401);
    });

    it("records who hid a session removed through the lesson endpoint", async () => {
      await http()
        .delete(`/lessons/${liveSession}`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      const res = await http()
        .get(`/kosks/${koskA}/archive?type=session`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      const row = res.body.items.find(
        (i: { id: string }) => i.id === liveSession
      );
      expect(row.archivedBy.id).toBe(NAZIM_A_ID);
    });
  });

  describe("POST /archive/:type/:id/restore", () => {
    it("brings a course back and takes it out of the archive", async () => {
      const res = await http()
        .post(`/archive/course/${hiddenCourse}/restore`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(res.body).toEqual({
        type: "course",
        id: hiddenCourse,
        title: "Maksûd okumaları",
      });
      const [row] = await db()
        .select()
        .from(courses)
        .where(eq(courses.id, hiddenCourse));
      expect(row.archivedAt).toBeNull();
      expect(row.archivedBy).toBeNull();
      expect(row.version).toBe(1);

      const list = await http()
        .get(`/kosks/${koskA}/archive?type=course`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(list.body.total).toBe(0);

      // Its sessions were never hidden on their own; they are listed
      // nowhere and the course is whole again.
      await http()
        .post(`/archive/course/${hiddenCourse}/restore`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(404);
    });

    it("brings a week back with the sessions hidden together with it, not the one hidden before", async () => {
      const alone = await db()
        .insert(lessons)
        .values({
          weekId: hiddenWeek,
          title: "Önceden gizlenmiş",
          type: LessonType.LIVE,
          archivedAt: new Date("2026-09-01T10:00:00Z"),
        })
        .returning({ id: lessons.id });
      await http()
        .post(`/archive/week/${hiddenWeek}/restore`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);

      const [week] = await db()
        .select()
        .from(courseWeeks)
        .where(eq(courseWeeks.id, hiddenWeek));
      expect(week.archivedAt).toBeNull();
      const [together] = await db()
        .select()
        .from(lessons)
        .where(eq(lessons.id, sessionOfHiddenWeek));
      expect(together.archivedAt).toBeNull();
      const [before] = await db()
        .select()
        .from(lessons)
        .where(eq(lessons.id, alone[0].id));
      expect(before.archivedAt).not.toBeNull();

      const [course] = await db()
        .select()
        .from(courses)
        .where(eq(courses.id, liveCourse));
      expect(course.version).toBe(1);
    });

    it("brings a session back", async () => {
      await http()
        .post(`/archive/session/${hiddenSession}/restore`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      const [row] = await db()
        .select()
        .from(lessons)
        .where(eq(lessons.id, hiddenSession));
      expect(row.archivedAt).toBeNull();
    });

    it("answers 404 for a session of a hidden week: the week is what gets restored", async () => {
      const res = await http()
        .post(`/archive/session/${sessionOfHiddenWeek}/restore`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(404);
      expect(res.body.code).toBe("ARCHIVE_ITEM_NOT_FOUND");
    });

    it("answers 409 for a course whose köşk is hidden", async () => {
      await db()
        .update(kosks)
        .set({ archivedAt: hide, archivedBy: ADMIN_ID })
        .where(eq(kosks.id, koskA));
      const res = await http()
        .post(`/archive/course/${hiddenCourse}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(409);
      expect(res.body.code).toBe("ARCHIVE_PARENT_HIDDEN");
    });

    it("does not let a nazım restore another köşk's item or a deck", async () => {
      await http()
        .post(`/archive/course/${foreignHiddenCourse}/restore`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(403);
      await http()
        .post(`/archive/deck/${hiddenDeck}/restore`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(403);
      await http()
        .post(`/archive/course/${hiddenCourse}/restore`)
        .set("Authorization", auth(STRANGER_ID))
        .expect(403);
    });

    it("lets the başnazım restore a deck and a köşk", async () => {
      await http()
        .post(`/archive/deck/${hiddenDeck}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      const [deck] = await db()
        .select()
        .from(decks)
        .where(eq(decks.id, hiddenDeck));
      expect(deck.archivedAt).toBeNull();

      await db()
        .update(kosks)
        .set({ archivedAt: hide, archivedBy: ADMIN_ID })
        .where(eq(kosks.id, koskB));
      await http()
        .post(`/archive/kosk/${koskB}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
    });

    it("answers 404 for a shown item, a type with no storage and 400 for a bad id", async () => {
      await http()
        .post(`/archive/course/${liveCourse}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      await http()
        .post(`/archive/recording/${hiddenCourse}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      await http()
        .post("/archive/course/not-a-uuid/restore")
        .set("Authorization", auth(ADMIN_ID))
        .expect(400);
    });
  });

  describe("GET /archive — the platform archive", () => {
    it("is the başnazım's alone", async () => {
      for (const sub of [NAZIM_A_ID, MUDERRIS_ID, STRANGER_ID]) {
        await http()
          .get("/archive")
          .set("Authorization", auth(sub))
          .expect(403);
        await http()
          .get("/archive/scopes")
          .set("Authorization", auth(sub))
          .expect(403);
      }
    });

    it("lists every köşk's hidden items, including decks and köşks", async () => {
      await db()
        .update(kosks)
        .set({
          archivedAt: new Date("2026-10-01T20:00:00Z"),
          archivedBy: ADMIN_ID,
        })
        .where(eq(kosks.id, koskB));
      const res = await http()
        .get("/archive")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.total).toBe(6);
      expect(res.body.items[0]).toMatchObject({
        type: "kosk",
        id: koskB,
        archivedBy: { name: "Yusuf Ziya Ertuğrul", role: null },
      });
    });

    it("filters by scope and type, and pages in tens", async () => {
      const byKosk = await http()
        .get(`/archive?koskId=${koskB}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(byKosk.body.items.map((i: { id: string }) => i.id)).toEqual([
        foreignHiddenCourse,
      ]);

      const decksOnly = await http()
        .get("/archive?type=deck")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(decksOnly.body.total).toBe(1);

      const many = Array.from({ length: 13 }, (_, i) => ({
        weekId: liveWeek,
        title: `Ek celse ${i}`,
        type: LessonType.LIVE,
        archivedAt: new Date(Date.UTC(2026, 8, 1, 10, i)),
      }));
      await db().insert(lessons).values(many);
      const first = await http()
        .get("/archive")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(first.body).toMatchObject({ total: 18, page: 1, limit: 10 });
      expect(first.body.items).toHaveLength(10);
      const second = await http()
        .get("/archive?page=2")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(second.body.items).toHaveLength(8);
    });

    it("names the köşks that hold something hidden", async () => {
      const res = await http()
        .get("/archive/scopes")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.kosks.map((k: { name: string }) => k.name)).toEqual([
        "Fatih Köşkü",
        "Nûruosmaniye Köşkü",
      ]);
      expect(res.body.madrasahs).toEqual([]);
    });
  });

  describe("impact and delete", () => {
    it("counts what a course delete would take", async () => {
      const res = await http()
        .get(`/archive/course/${hiddenCourse}/impact`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body).toMatchObject({
        type: "course",
        title: "Maksûd okumaları",
        weeks: 2,
        sessions: 3,
        students: 2,
        recordings: 0,
      });
    });

    it("counts a deck's cards", async () => {
      const res = await http()
        .get(`/archive/deck/${hiddenDeck}/impact`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(res.body.cards).toBe(2);
    });

    it("refuses impact and delete to anyone but the başnazım", async () => {
      for (const sub of [NAZIM_A_ID, MUDERRIS_ID]) {
        await http()
          .get(`/archive/course/${hiddenCourse}/impact`)
          .set("Authorization", auth(sub))
          .expect(403);
        await http()
          .delete(`/archive/course/${hiddenCourse}`)
          .set("Authorization", auth(sub))
          .expect(403);
      }
      const [still] = await db()
        .select()
        .from(courses)
        .where(eq(courses.id, hiddenCourse));
      expect(still).toBeDefined();
    });

    it("deletes a hidden course for real and writes the caller's name to the audit log", async () => {
      await http()
        .delete(`/archive/course/${hiddenCourse}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(204);

      expect(
        await db().select().from(courses).where(eq(courses.id, hiddenCourse))
      ).toHaveLength(0);
      expect(
        await db()
          .select()
          .from(enrollments)
          .where(eq(enrollments.courseId, hiddenCourse))
      ).toHaveLength(0);
      await http()
        .get(`/courses/${hiddenCourse}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);

      const [entry] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, hiddenCourse));
      expect(entry).toMatchObject({
        actorId: ADMIN_ID,
        action: "course.delete",
        entity: "course",
      });
      expect(entry.details).toMatchObject({
        title: "Maksûd okumaları",
        actorName: "Yusuf Ziya Ertuğrul",
        removed: { courses: 1, weeks: 2, lessons: 3, enrollments: 2 },
      });
    });

    it("refuses to delete what is not hidden, with 404", async () => {
      await http()
        .delete(`/archive/course/${liveCourse}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      await http()
        .delete(`/archive/week/${liveWeek}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      expect(
        await db().select().from(courses).where(eq(courses.id, liveCourse))
      ).toHaveLength(1);
    });

    it("deletes a hidden week with its sessions, a session, and a deck with its cards", async () => {
      await http()
        .delete(`/archive/week/${hiddenWeek}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(204);
      expect(
        await db()
          .select()
          .from(lessons)
          .where(eq(lessons.id, sessionOfHiddenWeek))
      ).toHaveLength(0);

      await http()
        .delete(`/archive/session/${hiddenSession}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(204);
      expect(
        await db().select().from(lessons).where(eq(lessons.id, hiddenSession))
      ).toHaveLength(0);

      await http()
        .delete(`/archive/deck/${hiddenDeck}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(204);
      expect(
        await db()
          .select()
          .from(flashcards)
          .where(eq(flashcards.deckId, hiddenDeck))
      ).toHaveLength(0);

      const entries = await db().select().from(auditLog);
      expect(entries.map((e) => e.entity).sort()).toEqual([
        "deck",
        "session",
        "week",
      ]);
    });

    it("deletes a hidden week and a hidden session together with the notes written on them", async () => {
      await db()
        .insert(lessonNotes)
        .values([
          { lessonId: sessionOfHiddenWeek, authorId: STUDENT_ID, body: "a" },
          { lessonId: hiddenSession, authorId: STUDENT_ID, body: "b" },
          { lessonId: liveSession, authorId: STUDENT_ID, body: "kalır" },
        ]);

      await http()
        .delete(`/archive/week/${hiddenWeek}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(204);
      await http()
        .delete(`/archive/session/${hiddenSession}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(204);

      const left = await db().select().from(lessonNotes);
      expect(left.map((n) => n.body)).toEqual(["kalır"]);
    });

    it("deletes a hidden köşk with its courses", async () => {
      await db()
        .update(kosks)
        .set({ archivedAt: hide, archivedBy: ADMIN_ID })
        .where(eq(kosks.id, koskA));
      const impact = await http()
        .get(`/archive/kosk/${koskA}/impact`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(impact.body).toMatchObject({ courses: 2, students: 2 });

      await http()
        .delete(`/archive/kosk/${koskA}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(204);
      expect(
        await db().select().from(kosks).where(eq(kosks.id, koskA))
      ).toHaveLength(0);
      expect(
        await db().select().from(courses).where(eq(courses.koskId, koskA))
      ).toHaveLength(0);
    });
  });
});
