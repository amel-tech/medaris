import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { FEED_POLL_LIMIT } from "../../src/calendar-feed/feed-poll-limiter";
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

/**
 * MDRS-120: the personal calendar feed. The document's own shape is
 * unit-tested in test/unit/calendar-feed/calendar-feed.spec.ts; this covers
 * whose sessions reach whose feed, regeneration, the window, and that a
 * moved or removed session keeps its UID.
 *
 * TEST_USER_ID owns the köşk (manages every course in it); OTHER_USER_ID is a
 * talebe who enrolls, or does not.
 */

const WEB_URL = "https://tedris.example";
const THIRD_USER_ID = "22222222-2222-2222-2222-222222222222";
const MEETING_URL = "https://meet.google.com/abc-defg-hij";
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY);

type Lesson = { id: string; title: string; type: string };
type Detail = {
  id: string;
  version: number;
  weeks: { id: string; lessons: Lesson[] }[];
};

const coursePayload = (
  title: string,
  options: {
    status?: "PUBLISHED" | "DRAFT";
    requiresApproval?: boolean;
    sessions?: { title: string; at: Date }[];
  } = {}
) => ({
  title,
  level: "INTERMEDIATE",
  durationWeeks: 4,
  status: options.status ?? "PUBLISHED",
  requiresApproval: options.requiresApproval ?? false,
  weeks: [
    {
      weekNumber: 1,
      title: "Birinci Bab",
      lessons: (options.sessions ?? [{ title: "Açılış", at: inDays(7) }]).map(
        (s) => ({
          title: s.title,
          type: "LIVE",
          durationMinutes: 60,
          scheduledAt: s.at.toISOString(),
          meetingUrl: MEETING_URL,
        })
      ),
    },
  ],
});

const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

/** The feed's events, each as its unfolded property lines. */
const events = (ics: string): string[][] => {
  const out: string[][] = [];
  let current: string[] | null = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT" && current) {
      out.push(current);
      current = null;
    } else current?.push(line);
  }
  return out;
};
const prop = (event: string[], name: string) =>
  event.find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1);
const eventFor = (ics: string, lessonId: string) =>
  events(ics).find((e) => prop(e, "UID") === `lesson-${lessonId}@medaris.app`);

describe("calendar feed (e2e)", () => {
  let app: INestApplication;
  let otherApp: INestApplication;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;

  beforeAll(async () => {
    // Read by the config factory when AppModule is first imported.
    process.env.TEDRIS_WEB_URL = WEB_URL;
    app = await createTestApp({ authUserId: TEST_USER_ID });
    otherApp = await createTestApp({ authUserId: OTHER_USER_ID });
    dbUtils = new TestDatabaseUtils(app.get(DatabaseService));
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("calendar_feed_tokens", ...COURSE_TREE_TABLES);
    const kosk = await request(app.getHttpServer())
      .post("/kosks")
      .send({ name: "Süleymaniye Köşkü" })
      .expect(201);
    koskId = kosk.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables("calendar_feed_tokens", ...COURSE_TREE_TABLES);
    await app.close();
    await otherApp.close();
    delete process.env.TEDRIS_WEB_URL;
  });

  const createCourse = async (
    ...args: Parameters<typeof coursePayload>
  ): Promise<Detail> =>
    (
      await request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send(coursePayload(...args))
        .expect(201)
    ).body;

  const firstLesson = (detail: Detail) => detail.weeks[0].lessons[0];

  const issueFeed = async (target: INestApplication) => {
    const res = await request(target.getHttpServer())
      .post("/me/calendar-feed")
      .expect(200);
    return res.body as { url: string; webcalUrl: string; createdAt: string };
  };

  /** Fetches a feed by its public URL, unauthenticated, as a calendar app. */
  const fetchFeed = (url: string) =>
    request(app.getHttpServer())
      .get(new URL(url).pathname)
      .buffer(true)
      .parse((res, done) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => done(null, body));
      });

  it("issues a URL in two forms and reports it without repeating it", async () => {
    const before = await request(otherApp.getHttpServer())
      .get("/me/calendar-feed")
      .expect(200);
    expect(before.body).toEqual({ active: false, createdAt: null });

    const feed = await issueFeed(otherApp);
    expect(feed.url).toMatch(
      /^https:\/\/tedris\.example\/calendar\/[A-Za-z0-9_-]{43}\.ics$/
    );
    expect(feed.webcalUrl).toBe(feed.url.replace(/^https:/, "webcal:"));

    const after = await request(otherApp.getHttpServer())
      .get("/me/calendar-feed")
      .expect(200);
    expect(after.body.active).toBe(true);
    expect(after.body.createdAt).toBe(feed.createdAt);
    expect(JSON.stringify(after.body)).not.toContain(
      new URL(feed.url).pathname
    );
  });

  it("serves an enrolled talebe's sessions without the meeting link", async () => {
    const detail = await createCourse("Bina ve İzhar Şerhi");
    const lesson = firstLesson(detail);
    await request(otherApp.getHttpServer())
      .post(`/courses/${detail.id}/enroll`)
      .expect(201);

    const res = await fetchFeed((await issueFeed(otherApp)).url).expect(200);
    const ics = res.body as string;

    expect(res.headers["content-type"]).toMatch(/^text\/calendar/);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(unfold(ics)).toContain("X-WR-CALNAME:Medaris");
    expect(ics).not.toContain("meet.google.com");

    const event = eventFor(ics, lesson.id);
    expect(event).toBeDefined();
    const page = `${WEB_URL}/courses/${detail.id}/lessons/${lesson.id}`;
    expect(prop(event as string[], "URL")).toBe(page);
    expect(prop(event as string[], "SUMMARY")).toBe(
      "Bina ve İzhar Şerhi — Açılış"
    );
    expect(prop(event as string[], "SEQUENCE")).toBe(String(detail.version));
  });

  it("leaves out courses the talebe is not in, is still waiting for, or has left", async () => {
    const notEnrolled = await createCourse("Kayıtsız");
    const pending = await createCourse("Onay bekleyen", {
      requiresApproval: true,
    });
    const left = await createCourse("Ayrılınan");
    await request(otherApp.getHttpServer())
      .post(`/courses/${pending.id}/enroll`)
      .expect(201);
    await request(otherApp.getHttpServer())
      .post(`/courses/${left.id}/enroll`)
      .expect(201);
    const { url } = await issueFeed(otherApp);

    expect(
      eventFor((await fetchFeed(url)).body, firstLesson(left).id)
    ).toBeDefined();

    // No unenroll route exists yet; the row going is what unenrolling is.
    await app
      .get(DatabaseService)
      .db.execute(
        `DELETE FROM "enrollments" WHERE "course_id" = '${left.id}' AND "user_id" = '${OTHER_USER_ID}'`
      );

    const ics = (await fetchFeed(url).expect(200)).body as string;
    expect(events(ics)).toHaveLength(0);
    for (const course of [notEnrolled, pending, left]) {
      expect(ics).not.toContain(firstLesson(course).id);
    }

    await request(app.getHttpServer())
      .post(`/courses/${pending.id}/enrollments/${OTHER_USER_ID}/approve`)
      .expect(201);
    expect(
      eventFor((await fetchFeed(url)).body, firstLesson(pending).id)
    ).toBeDefined();
  });

  it("gives the köşk manager every course, drafts included; a hidden course is in no feed", async () => {
    const draft = await createCourse("Taslak", { status: "DRAFT" });
    const hidden = await createCourse("Gizlenen");
    await request(otherApp.getHttpServer())
      .post(`/courses/${hidden.id}/enroll`)
      .expect(201);
    const managerUrl = (await issueFeed(app)).url;
    const talebeUrl = (await issueFeed(otherApp)).url;

    const managerIcs = (await fetchFeed(managerUrl)).body as string;
    expect(eventFor(managerIcs, firstLesson(draft).id)).toBeDefined();
    expect(eventFor(managerIcs, firstLesson(hidden).id)).toBeDefined();

    await request(app.getHttpServer())
      .post(`/courses/${hidden.id}/archive`)
      .expect((res) => expect(res.status).toBeLessThan(300));

    for (const url of [managerUrl, talebeUrl]) {
      const ics = (await fetchFeed(url)).body as string;
      expect(ics).not.toContain(firstLesson(hidden).id);
    }
  });

  it("covers 30 days back to 180 days ahead", async () => {
    const detail = await createCourse("Pencere", {
      sessions: [
        { title: "Çok eski", at: inDays(-31) },
        { title: "Geçen ay", at: inDays(-29) },
        { title: "Yarın", at: inDays(1) },
        { title: "Beş ay sonra", at: inDays(179) },
        { title: "Çok ileri", at: inDays(181) },
      ],
    });
    const ics = (await fetchFeed((await issueFeed(app)).url)).body as string;
    const titles = events(ics).map((e) => prop(e, "SUMMARY"));
    expect(titles).toEqual([
      "Pencere — Geçen ay",
      "Pencere — Yarın",
      "Pencere — Beş ay sonra",
    ]);
    expect(detail.weeks[0].lessons).toHaveLength(5);
  });

  it("moves a rescheduled session in place: same UID, higher SEQUENCE, one event", async () => {
    const detail = await createCourse("Taşınan");
    const lesson = firstLesson(detail);
    const { url } = await issueFeed(app);
    const before = eventFor((await fetchFeed(url)).body, lesson.id);

    const movedTo = inDays(8);
    await request(app.getHttpServer())
      .patch(`/lessons/${lesson.id}`)
      .send({ version: detail.version, scheduledAt: movedTo.toISOString() })
      .expect(200);

    const ics = (await fetchFeed(url)).body as string;
    const matching = events(ics).filter(
      (e) => prop(e, "UID") === `lesson-${lesson.id}@medaris.app`
    );
    expect(matching).toHaveLength(1);
    expect(Number(prop(matching[0], "SEQUENCE"))).toBeGreaterThan(
      Number(prop(before as string[], "SEQUENCE"))
    );
    expect(prop(matching[0], "DTSTART")).toBe(
      movedTo
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z")
        .replace(/[-:]/g, "")
    );
  });

  it("keeps a removed session as STATUS:CANCELLED with a higher SEQUENCE", async () => {
    const detail = await createCourse("İptal");
    const lesson = firstLesson(detail);
    const { url } = await issueFeed(app);
    const before = eventFor((await fetchFeed(url)).body, lesson.id);
    expect(prop(before as string[], "STATUS")).toBeUndefined();

    await request(app.getHttpServer())
      .delete(`/lessons/${lesson.id}`)
      .expect(200);

    const after = eventFor((await fetchFeed(url)).body, lesson.id);
    expect(prop(after as string[], "STATUS")).toBe("CANCELLED");
    expect(Number(prop(after as string[], "SEQUENCE"))).toBeGreaterThan(
      Number(prop(before as string[], "SEQUENCE"))
    );
  });

  it("answers 404 for the old URL once the link is regenerated", async () => {
    await createCourse("Yenilenen");
    const first = await issueFeed(app);
    await fetchFeed(first.url).expect(200);

    const second = await issueFeed(app);
    expect(second.url).not.toBe(first.url);

    await fetchFeed(first.url)
      .expect(404)
      .expect((res) => {
        expect(JSON.parse(res.body as string)).toHaveProperty(
          "code",
          "CALENDAR_FEED_NOT_FOUND"
        );
      });
    await fetchFeed(second.url).expect(200);
  });

  it("answers 404 for a URL that was never issued or has another shape", async () => {
    await fetchFeed(`${WEB_URL}/calendar/${"A".repeat(43)}.ics`).expect(404);
    await fetchFeed(`${WEB_URL}/calendar/not-a-token.ics`).expect(404);
    await fetchFeed(`${WEB_URL}/calendar/${"A".repeat(43)}`).expect(404);
  });

  it("rate-limits each feed on its own", async () => {
    // The counter lives in the app for the whole file, and earlier tests
    // have already read TEST_USER_ID's feed: count up to the first 429
    // rather than assume a fresh budget.
    const busy = (await issueFeed(app)).url;
    let statuses: number[] = [];
    for (let i = 0; i <= FEED_POLL_LIMIT; i++) {
      const { status } = await fetchFeed(busy);
      statuses = [...statuses, status];
      if (status === 429) break;
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1).every((s) => s === 200)).toBe(true);

    // A user whose feed nobody has read yet is not affected.
    const fresh = await createTestApp({ authUserId: THIRD_USER_ID });
    try {
      await fetchFeed((await issueFeed(fresh)).url).expect(200);
    } finally {
      await fresh.close();
    }
  });

  it("stores only a hash of the token", async () => {
    const { url } = await issueFeed(app);
    const token = new URL(url).pathname.split("/").pop()?.replace(".ics", "");
    const rows = (await app
      .get(DatabaseService)
      .db.execute(`SELECT "token_hash" FROM "calendar_feed_tokens"`)) as {
      rows: { token_hash: string }[];
    };
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.rows[0].token_hash).not.toContain(token as string);
  });
});
