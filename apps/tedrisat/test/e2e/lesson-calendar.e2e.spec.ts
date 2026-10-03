import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { asSystemAdmin } from "../helpers/system-admin.helper";
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
 * MDRS-117: `GET /lessons/:id/calendar.ics`. The file's own shape (folding,
 * escaping, UTC) is unit-tested in test/unit/course/lesson-calendar.spec.ts;
 * this covers what needs the app — authorization, the course version as
 * SEQUENCE across a move, and the headers.
 */

const WEB_URL = "https://tedris.example";
const MEETING_URL = "https://meet.google.com/abc-defg-hij";
const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

type Lesson = { id: string; title: string; type: string };
type Detail = {
  id: string;
  version: number;
  weeks: { id: string; lessons: Lesson[] }[];
};

const coursePayload = (status: "PUBLISHED" | "DRAFT") => ({
  title: "Bina ve İzhar Şerhi",
  level: "INTERMEDIATE",
  durationWeeks: 4,
  status,
  weeks: [
    {
      weekNumber: 1,
      title: "Birinci Bab",
      lessons: [
        {
          title: "Açılış halkası",
          type: "LIVE",
          durationMinutes: 60,
          // 21:00 in Istanbul.
          scheduledAt: "2026-10-01T18:00:00.000Z",
          meetingUrl: MEETING_URL,
        },
        { title: "Şerh", type: "VIDEO", durationMinutes: 20 },
      ],
    },
  ],
});

const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");
const prop = (ics: string, name: string) =>
  unfold(ics)
    .find((l) => l.startsWith(`${name}:`))
    ?.slice(name.length + 1);

describe("GET /lessons/:id/calendar.ics (e2e)", () => {
  let app: INestApplication;
  let adminApp: INestApplication;
  let otherApp: INestApplication;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;

  beforeAll(async () => {
    // Read by the config factory when AppModule is first imported.
    process.env.TEDRIS_WEB_URL = `${WEB_URL}/`;
    app = await createTestApp({ authUserId: TEST_USER_ID });
    adminApp = await createTestApp();
    otherApp = await createTestApp({ authUserId: OTHER_USER_ID });
    dbUtils = new TestDatabaseUtils(app.get(DatabaseService));
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    const kosk = await request(adminApp.getHttpServer())
      .post("/kosks")
      .set("Authorization", asSystemAdmin(TEST_USER_ID))
      .send({ name: "Süleymaniye Köşkü" })
      .expect(201);
    koskId = kosk.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    await app.close();
    await adminApp.close();
    await otherApp.close();
    delete process.env.TEDRIS_WEB_URL;
  });

  const createCourse = async (
    status: "PUBLISHED" | "DRAFT" = "PUBLISHED"
  ): Promise<Detail> =>
    (
      await request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(coursePayload(status))
        .expect(201)
    ).body;

  const liveLesson = (detail: Detail) =>
    detail.weeks[0].lessons.find((l) => l.type === "LIVE") as Lesson;

  const getIcs = (target: INestApplication, lessonId: string, query = "") =>
    request(target.getHttpServer())
      .get(`/lessons/${lessonId}/calendar.ics${query}`)
      .buffer(true)
      .parse((res, done) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => done(null, body));
      });

  it("serves one event that links the session page and never the meeting link", async () => {
    const detail = await createCourse();
    const lesson = liveLesson(detail);

    const res = await getIcs(app, lesson.id).expect(200);
    const ics = res.body as string;

    expect(res.headers["content-type"]).toMatch(/^text\/calendar/);
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="medaris-${lesson.id}.ics"`
    );
    expect(res.headers["cache-control"]).toBe("private, no-store");

    const page = `${WEB_URL}/courses/${detail.id}/lessons/${lesson.id}`;
    expect(prop(ics, "UID")).toBe(`lesson-${lesson.id}@medaris.app`);
    expect(prop(ics, "SEQUENCE")).toBe(String(detail.version));
    expect(prop(ics, "DTSTART")).toBe("20261001T180000Z");
    expect(prop(ics, "DTEND")).toBe("20261001T190000Z");
    expect(prop(ics, "SUMMARY")).toBe("Bina ve İzhar Şerhi — Açılış halkası");
    expect(prop(ics, "URL")).toBe(page);
    expect(prop(ics, "LOCATION")).toBe(page);
    expect(prop(ics, "DESCRIPTION")).toContain(page);
    expect(ics).not.toContain("meet.google.com");
  });

  it("keeps the UID and raises SEQUENCE when the session is moved", async () => {
    const detail = await createCourse();
    const lesson = liveLesson(detail);
    const before = (await getIcs(app, lesson.id).expect(200)).body as string;

    await request(app.getHttpServer())
      .patch(`/lessons/${lesson.id}`)
      .send({
        version: detail.version,
        scheduledAt: "2026-10-02T17:30:00.000Z",
      })
      .expect(200);

    const after = (await getIcs(app, lesson.id).expect(200)).body as string;
    expect(prop(after, "UID")).toBe(prop(before, "UID"));
    expect(Number(prop(after, "SEQUENCE"))).toBeGreaterThan(
      Number(prop(before, "SEQUENCE"))
    );
    expect(prop(after, "DTSTART")).toBe("20261002T173000Z");
  });

  it("writes the description in the requested language and refuses an unknown one", async () => {
    const lesson = liveLesson(await createCourse());
    const en = await getIcs(app, lesson.id, "?locale=en").expect(200);
    expect(prop(en.body as string, "DESCRIPTION")).toMatch(
      /^The meeting link is on the session page:/
    );
    await request(app.getHttpServer())
      .get(`/lessons/${lesson.id}/calendar.ics?locale=de`)
      .expect(400);
  });

  it("answers 409 for a session without a time", async () => {
    const detail = await createCourse();
    const video = detail.weeks[0].lessons.find((l) => l.type === "VIDEO");
    await request(app.getHttpServer())
      .get(`/lessons/${video?.id}/calendar.ics`)
      .expect(409)
      .expect((res) => {
        expect(res.body).toHaveProperty("code", "LESSON_NOT_SCHEDULED");
      });
  });

  it("answers 404 for a missing or archived lesson, and 400 for a malformed id", async () => {
    await request(app.getHttpServer())
      .get(`/lessons/${MISSING_UUID}/calendar.ics`)
      .expect(404);

    const detail = await createCourse();
    const lesson = liveLesson(detail);
    await request(app.getHttpServer())
      .delete(`/lessons/${lesson.id}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/lessons/${lesson.id}/calendar.ics`)
      .expect(404);

    await request(app.getHttpServer())
      .get("/lessons/not-a-uuid/calendar.ics")
      .expect(400);
  });

  it("follows the session page: another user sees a published course's session", async () => {
    const lesson = liveLesson(await createCourse("PUBLISHED"));
    await getIcs(otherApp, lesson.id).expect(200);
  });

  it("follows the session page: a draft is not-found to anyone but its köşk owner", async () => {
    const lesson = liveLesson(await createCourse("DRAFT"));
    await getIcs(app, lesson.id).expect(200);
    await request(otherApp.getHttpServer())
      .get(`/lessons/${lesson.id}/calendar.ics`)
      .expect(404)
      .expect((res) => {
        expect(res.body).toHaveProperty("code", "LESSON_NOT_FOUND");
      });
  });
});
