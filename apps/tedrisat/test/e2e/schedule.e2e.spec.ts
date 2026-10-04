import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { enrollments } from "../../src/database/schema/course.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { FIXTURE_TEAM, openKosk } from "../helpers/open-scopes.helper";
import {
  createTestApp,
  OTHER_USER_ID,
  TEST_USER_ID,
} from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

/**
 * MDRS-163: `GET /sessions?from&to` (Programım) and `GET /me/upcoming-lessons`
 * (the phone menu). TEST_USER_ID owns the köşk; OTHER_USER_ID is the talebe
 * whose schedule is read.
 */

const MEETING_URL = "https://zoom.us/j/123456789";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

type Detail = {
  id: string;
  weeks: { id: string; lessons: { id: string; title: string }[] }[];
};

const payload = (
  title: string,
  options: {
    status?: "PUBLISHED" | "DRAFT";
    requiresApproval?: boolean;
    sessions: { title: string; at: Date; type?: string }[];
  }
) => ({
  title,
  level: "INTERMEDIATE",
  durationWeeks: 4,
  status: options.status ?? "PUBLISHED",
  requiresApproval: options.requiresApproval ?? false,
  muderris: FIXTURE_TEAM,
  weeks: [
    {
      weekNumber: 5,
      title: "Mehmûz fiiller",
      lessons: options.sessions.map((s) => ({
        title: s.title,
        type: s.type ?? "LIVE",
        durationMinutes: 60,
        scheduledAt: s.at.toISOString(),
        meetingUrl: MEETING_URL,
      })),
    },
  ],
});

describe("schedule (e2e)", () => {
  let app: INestApplication;
  let talebe: INestApplication;
  let adminApp: INestApplication;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    talebe = await createTestApp({ authUserId: OTHER_USER_ID });
    adminApp = await createTestApp();
    dbUtils = new TestDatabaseUtils(app.get(DatabaseService));
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    // Opening a köşk is SYSTEM_ADMIN only (2026-10-02); signed with
    // TEST_USER_ID's own `sub`, the köşk is still that user's to manage.
    koskId = (await openKosk(adminApp, { name: "Nûruosmaniye Köşkü" })).body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    await app.close();
    await talebe.close();
    await adminApp.close();
  });

  const createCourse = async (
    ...args: Parameters<typeof payload>
  ): Promise<Detail> =>
    (
      await request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(payload(...args))
        .expect(201)
    ).body;

  const enroll = (courseId: string) =>
    request(talebe.getHttpServer())
      .post(`/courses/${courseId}/enroll`)
      .expect(201);

  const cancel = (lessonId: string) =>
    app
      .get(DatabaseService)
      .db.execute(
        `UPDATE "lessons" SET "cancelled_at" = now() WHERE "id" = '${lessonId}'`
      );

  const window = (fromDays: number, toDays: number) => ({
    from: new Date(Date.now() + fromDays * DAY).toISOString(),
    to: new Date(Date.now() + toDays * DAY).toISOString(),
  });

  const list = (fromDays = -1, toDays = 7) =>
    request(talebe.getHttpServer())
      .get("/sessions")
      .query(window(fromDays, toDays));

  describe("GET /sessions", () => {
    it("lists the enrolled courses' sessions soonest first, with the course, köşk and week", async () => {
      const course = await createCourse("Emsile ve Bina", {
        sessions: [
          { title: "İkinci", at: inHours(50) },
          { title: "Birinci", at: inHours(26) },
        ],
      });
      await enroll(course.id);

      const res = await list().expect(200);
      expect(res.body.map((s: { title: string }) => s.title)).toEqual([
        "Birinci",
        "İkinci",
      ]);
      expect(res.body[0]).toMatchObject({
        courseId: course.id,
        courseTitle: "Emsile ve Bina",
        koskId,
        koskName: "Nûruosmaniye Köşkü",
        weekNumber: 5,
        durationMinutes: 60,
        status: "SCHEDULED",
        meetingUrl: MEETING_URL,
      });
      expect(res.headers["cache-control"]).toBe("private, no-store");
    });

    it("leaves out courses the talebe is not in or is still waiting for, and drafts", async () => {
      const mine = await createCourse("Kayıtlı", {
        sessions: [{ title: "Benim", at: inHours(30) }],
      });
      const other = await createCourse("Kayıtsız", {
        sessions: [{ title: "Başkasının", at: inHours(30) }],
      });
      const pending = await createCourse("Onay bekleyen", {
        requiresApproval: true,
        sessions: [{ title: "Bekleyen", at: inHours(30) }],
      });
      await enroll(mine.id);
      await enroll(pending.id);

      const titles = (await list().expect(200)).body.map(
        (s: { title: string }) => s.title
      );
      expect(titles).toEqual(["Benim"]);
      expect(other.id).toBeDefined();

      await request(app.getHttpServer())
        .post(`/courses/${pending.id}/enrollments/${OTHER_USER_ID}/approve`)
        .expect(201);
      const approved = (await list().expect(200)).body.map(
        (s: { title: string }) => s.title
      );
      expect(approved.sort()).toEqual(["Bekleyen", "Benim"]);
    });

    it("leaves out the sessions of a passive course, whose live link is closed even to its talebe (review M5)", async () => {
      const course = await createCourse("Müderrissiz kalan", {
        sessions: [{ title: "Eski celse", at: inHours(30) }],
      });
      await enroll(course.id);
      expect((await list().expect(200)).body).toHaveLength(1);

      // Its only müderris is gone: the course is passive (MDRS-136).
      await app
        .get(DatabaseService)
        .db.update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: TEST_USER_ID })
        .where(
          and(
            eq(roleAssignments.scopeId, course.id),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
          )
        );
      expect((await list().expect(200)).body).toEqual([]);
      const upcoming = await request(talebe.getHttpServer())
        .get("/me/upcoming-lessons")
        .expect(200);
      expect(upcoming.body).toEqual([]);
    });

    it("keeps a passive course for the köşk's nazımı enrolled in it, as the engine keeps it open to them (owner, 4 October)", async () => {
      const course = await createCourse("Müderrissiz kalan", {
        sessions: [{ title: "Eski celse", at: inHours(30) }],
      });
      await enroll(course.id);
      const db = app.get(DatabaseService).db;
      await db.insert(enrollments).values({
        userId: TEST_USER_ID,
        courseId: course.id,
        status: EnrollmentStatus.ENROLLED,
      });
      await db.insert(roleAssignments).values({
        userId: OTHER_USER_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: course.id,
        grantedBy: TEST_USER_ID,
        revokedAt: new Date(),
        revokedBy: TEST_USER_ID,
      });

      const mine = await request(app.getHttpServer())
        .get("/sessions")
        .query(window(-1, 7))
        .expect(200);
      expect(
        mine.body.map((s: { title: string; meetingUrl: string }) => [
          s.title,
          s.meetingUrl,
        ])
      ).toEqual([["Eski celse", MEETING_URL]]);
      // The talebe of the same course is still closed out.
      expect((await list().expect(200)).body).toEqual([]);

      // The link of a passive course is passive content: each list that hands
      // it out writes what GET /courses/:id writes for the same reader
      // (review D1: their reads stay audited).
      await request(app.getHttpServer())
        .get("/me/upcoming-lessons")
        .expect(200);
      const audited = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, course.id))
        .orderBy(auditLog.seq);
      expect(audited.map((r) => [r.actorId, r.action, r.details.via])).toEqual([
        [TEST_USER_ID, "scope.passive_open", "schedule"],
        [TEST_USER_ID, "course.content_read", "schedule"],
        [TEST_USER_ID, "scope.passive_open", "schedule.upcoming"],
        [TEST_USER_ID, "course.content_read", "schedule.upcoming"],
      ]);
      expect(audited[0].details).toMatchObject({
        passiveScope: { type: "course", id: course.id },
      });
    });

    it("keeps a cancelled session, marked, with no meeting link", async () => {
      const course = await createCourse("Emsile ve Bina", {
        sessions: [
          { title: "Planlı", at: inHours(30) },
          { title: "İptal", at: inHours(28) },
        ],
      });
      await enroll(course.id);
      const cancelled = course.weeks[0].lessons.find(
        (l) => l.title === "İptal"
      );
      await cancel((cancelled as { id: string }).id);

      const res = await list().expect(200);
      expect(
        res.body.map((s: { title: string; status: string }) => [
          s.title,
          s.status,
        ])
      ).toEqual([
        ["İptal", "CANCELLED"],
        ["Planlı", "SCHEDULED"],
      ]);
      expect(res.body[0].meetingUrl).toBeNull();
      expect(res.body[1].meetingUrl).toBe(MEETING_URL);
    });

    it("applies the window: from inclusive, to exclusive; other lesson types and hidden lessons are not sessions", async () => {
      const course = await createCourse("Pencere", {
        sessions: [
          { title: "Dün", at: inHours(-30) },
          { title: "İçeride", at: inHours(24 * 3) },
          { title: "Sekizinci gün", at: inHours(24 * 8) },
          { title: "Video", at: inHours(24 * 3 + 1), type: "VIDEO" },
          { title: "Gizlenecek", at: inHours(24 * 3 + 2) },
        ],
      });
      await enroll(course.id);
      const hidden = course.weeks[0].lessons.find(
        (l) => l.title === "Gizlenecek"
      ) as { id: string };
      await request(app.getHttpServer())
        .delete(`/lessons/${hidden.id}`)
        .expect(200);

      const titles = (await list(0, 7).expect(200)).body.map(
        (s: { title: string }) => s.title
      );
      expect(titles).toEqual(["İçeride"]);
      const next = (await list(7, 14).expect(200)).body.map(
        (s: { title: string }) => s.title
      );
      expect(next).toEqual(["Sekizinci gün"]);
    });

    it("answers 400 for a missing, malformed, inverted or oversized window", async () => {
      const get = (query: Record<string, string>) =>
        request(talebe.getHttpServer()).get("/sessions").query(query);
      await get({}).expect(400);
      await get({ from: "2026-10-01" }).expect(400);
      await get({ from: "bugün", to: "2026-10-08" }).expect(400);
      await get({ from: "2026-10-08", to: "2026-10-01" }).expect(400);
      const tooLong = await get({
        from: "2026-10-01",
        to: "2026-12-01",
      }).expect(400);
      expect(tooLong.body.code ?? tooLong.body.error?.code).toBe(
        "INVALID_SCHEDULE_WINDOW"
      );
    });
  });

  describe("GET /me/upcoming-lessons", () => {
    it("returns the next sessions that stand, skipping a cancelled and a finished one", async () => {
      const course = await createCourse("Emsile ve Bina", {
        sessions: [
          { title: "Bitti", at: inHours(-5) },
          { title: "Sürüyor", at: new Date(Date.now() - 20 * 60 * 1000) },
          { title: "İptal", at: inHours(5) },
          { title: "Sıradaki", at: inHours(30) },
          { title: "Sonraki", at: inHours(60) },
        ],
      });
      await enroll(course.id);
      const off = course.weeks[0].lessons.find((l) => l.title === "İptal") as {
        id: string;
      };
      await cancel(off.id);

      const res = await request(talebe.getHttpServer())
        .get("/me/upcoming-lessons")
        .expect(200);
      expect(
        res.body.map((s: { title: string; status: string }) => [
          s.title,
          s.status,
        ])
      ).toEqual([
        ["Sürüyor", "LIVE"],
        ["Sıradaki", "SCHEDULED"],
        ["Sonraki", "SCHEDULED"],
      ]);

      const one = await request(talebe.getHttpServer())
        .get("/me/upcoming-lessons")
        .query({ limit: 1 })
        .expect(200);
      expect(one.body).toHaveLength(1);
    });

    it("is empty without enrollments, and refuses a limit that is not a number", async () => {
      await createCourse("Kayıtsız", {
        sessions: [{ title: "Başkası", at: inHours(30) }],
      });
      const res = await request(talebe.getHttpServer())
        .get("/me/upcoming-lessons")
        .expect(200);
      expect(res.body).toEqual([]);
      await request(talebe.getHttpServer())
        .get("/me/upcoming-lessons")
        .query({ limit: "x" })
        .expect(400);
    });
  });
});
