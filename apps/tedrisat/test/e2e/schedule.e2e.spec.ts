import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import {
  createTestApp,
  OTHER_USER_ID,
  TEST_USER_ID,
} from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

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
    koskId = (
      await request(adminApp.getHttpServer())
        .post("/kosks")
        .set(
          "Authorization",
          bearerFor({
            sub: TEST_USER_ID,
            claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
          })
        )
        .send({ name: "Nûruosmaniye Köşkü" })
        .expect(201)
    ).body.id;
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
