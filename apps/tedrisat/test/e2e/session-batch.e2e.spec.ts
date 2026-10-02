import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import {
  createTestApp,
  OTHER_USER_ID,
  TEST_USER_ID,
} from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

type Lesson = {
  id: string;
  weekId: string;
  title: string;
  type: string;
  scheduledAt: string | null;
  meetingUrl: string | null;
  durationMinutes: number | null;
};
type Week = {
  id: string;
  weekNumber: number;
  title: string;
  lessons: Lesson[];
};
type Detail = { id: string; title: string; version: number; weeks: Week[] };

/** "Tuesday and Thursday, 21:00, 60 minutes, Europe/Istanbul, from 6 October, 8 sessions". */
const istanbulBatch = {
  title: "Canlı ders",
  weekdays: [2, 4],
  startTime: "21:00",
  durationMinutes: 60,
  timeZone: "Europe/Istanbul",
  startDate: "2026-10-06",
  count: 8,
};

const berlinLocalTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

describe("POST /courses/:courseId/sessions/batch (MDRS-109)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    const kosk = await request(app.getHttpServer())
      .post("/kosks")
      .send({ name: "Süleymaniye Köşkü" })
      .expect(201);
    koskId = kosk.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES);
    await app.close();
  });

  /** A course with week 1 (one video lesson) and week 2 (none yet). */
  const createCourse = async (timeZone?: string): Promise<Detail> =>
    (
      await request(app.getHttpServer())
        .post(`/kosks/${koskId}/courses`)
        .send({
          title: "Bina ve İzhar Şerhi",
          status: "PUBLISHED",
          timeZone,
          muderris: [{ name: "Müderris Ahmed Hilmi" }],
          weeks: [
            {
              weekNumber: 1,
              title: "Birinci Bab",
              lessons: [{ title: "Açılış", type: "VIDEO" }],
            },
            { weekNumber: 2, title: "İkinci Bab", lessons: [] },
          ],
        })
        .expect(201)
    ).body;

  const getDetail = async (id: string): Promise<Detail> =>
    (await request(app.getHttpServer()).get(`/courses/${id}`).expect(200)).body;

  const batch = (courseId: string) =>
    request(app.getHttpServer()).post(`/courses/${courseId}/sessions/batch`);

  const preview = (courseId: string) =>
    request(app.getHttpServer()).post(
      `/courses/${courseId}/sessions/batch/preview`
    );

  it("Tuesday and Thursday 21:00 Istanbul from 6 October, 8 sessions: 8 sessions at 18:00 UTC in weeks 1–4", async () => {
    const course = await createCourse();

    const res = await batch(course.id)
      .send({
        ...istanbulBatch,
        meetingUrl: "https://meet.google.com/bqx-mfzn-rde",
      })
      .expect(201);

    expect(res.body.timeZone).toBe("Europe/Istanbul");
    expect(res.body.courseVersion).toBe(course.version + 1);
    expect(
      res.body.lessons.map((l: Lesson & { weekNumber: number }) => [
        l.scheduledAt,
        l.weekNumber,
      ])
    ).toEqual([
      ["2026-10-06T18:00:00.000Z", 1],
      ["2026-10-08T18:00:00.000Z", 1],
      ["2026-10-13T18:00:00.000Z", 2],
      ["2026-10-15T18:00:00.000Z", 2],
      ["2026-10-20T18:00:00.000Z", 3],
      ["2026-10-22T18:00:00.000Z", 3],
      ["2026-10-27T18:00:00.000Z", 4],
      ["2026-10-29T18:00:00.000Z", 4],
    ]);
    // Existing weeks 1 and 2 are reused; 3 and 4 are created as "Hafta N".
    expect(
      res.body.weeks.map((w: { weekNumber: number; created: boolean }) => [
        w.weekNumber,
        w.created,
      ])
    ).toEqual([
      [1, false],
      [2, false],
      [3, true],
      [4, true],
    ]);

    const detail = await getDetail(course.id);
    expect(detail.weeks.map((w) => [w.weekNumber, w.title])).toEqual([
      [1, "Birinci Bab"],
      [2, "İkinci Bab"],
      [3, "Hafta 3"],
      [4, "Hafta 4"],
    ]);
    // Appended after what the week already held.
    expect(detail.weeks[0].lessons.map((l) => l.title)).toEqual([
      "Açılış",
      "Canlı ders",
      "Canlı ders",
    ]);
    const generated = detail.weeks
      .flatMap((w) => w.lessons)
      .filter((l) => l.type === "LIVE");
    expect(generated).toHaveLength(8);
    expect(generated.every((l) => l.durationMinutes === 60)).toBe(true);
    // Links change every week: only the first session carries one.
    expect(generated.map((l) => l.meetingUrl)).toEqual([
      "https://meet.google.com/bqx-mfzn-rde",
      ...Array(7).fill(null),
    ]);
  });

  it("keeps 21:00 Berlin time across the end of daylight saving, in the course's own zone by default", async () => {
    const course = await createCourse("Europe/Berlin");

    const res = await batch(course.id)
      .send({
        title: "Pazar dersi",
        weekdays: [7],
        startTime: "21:00",
        durationMinutes: 90,
        startDate: "2026-10-18",
        endDate: "2026-11-01",
      })
      .expect(201);

    expect(res.body.timeZone).toBe("Europe/Berlin");
    const starts = res.body.lessons.map((l: Lesson) => l.scheduledAt);
    expect(starts).toEqual([
      "2026-10-18T19:00:00.000Z",
      "2026-10-25T20:00:00.000Z",
      "2026-11-01T20:00:00.000Z",
    ]);
    expect(starts.map(berlinLocalTime)).toEqual(["21:00", "21:00", "21:00"]);
  });

  it("generated sessions keep their ids through a PATCH and a whole-course PUT (MDRS-95)", async () => {
    const course = await createCourse();
    const created = (
      await batch(course.id)
        .send({ ...istanbulBatch, count: 4 })
        .expect(201)
    ).body as { courseVersion: number; lessons: Lesson[] };
    const ids = created.lessons.map((l) => l.id);

    // Move the first generated session to week 2 and retitle it.
    const loaded = await getDetail(course.id);
    await request(app.getHttpServer())
      .patch(`/lessons/${ids[0]}`)
      .send({
        version: loaded.version,
        weekId: loaded.weeks[1].id,
        title: "Taşınan ders",
      })
      .expect(200);

    // Then save the whole course as nizam does, from a fresh load.
    const beforePut = await getDetail(course.id);
    await request(app.getHttpServer())
      .put(`/courses/${course.id}`)
      .send({
        title: beforePut.title,
        version: beforePut.version,
        weeks: beforePut.weeks.map((w) => ({
          id: w.id,
          weekNumber: w.weekNumber,
          title: w.title,
          lessons: w.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            type: l.type,
            scheduledAt: l.scheduledAt ?? undefined,
            durationMinutes: l.durationMinutes ?? undefined,
          })),
        })),
      })
      .expect(200);

    const after = await getDetail(course.id);
    const liveIds = after.weeks
      .flatMap((w) => w.lessons)
      .filter((l) => l.type === "LIVE")
      .map((l) => l.id);
    expect([...liveIds].sort()).toEqual([...ids].sort());
    const moved = after.weeks[1].lessons.find((l) => l.id === ids[0]);
    expect(moved).toHaveProperty("title", "Taşınan ders");
  });

  it("refuses a PUT loaded before the batch, and keeps the batch", async () => {
    const course = await createCourse();
    const res = await batch(course.id)
      .send({ ...istanbulBatch, count: 2 })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/courses/${course.id}`)
      .send({
        title: course.title,
        version: course.version,
        weeks: course.weeks.map((w) => ({
          id: w.id,
          weekNumber: w.weekNumber,
          title: w.title,
          lessons: w.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            type: l.type,
          })),
        })),
      })
      .expect(409);

    for (const lesson of res.body.lessons as Lesson[]) {
      const [row] = await databaseService.db
        .select()
        .from(lessons)
        .where(eq(lessons.id, lesson.id));
      expect(row.archivedAt).toBeNull();
    }
  });

  it("previews the same sessions without writing anything", async () => {
    const course = await createCourse();
    const {
      title: _title,
      durationMinutes: _minutes,
      ...pattern
    } = istanbulBatch;

    const res = await preview(course.id).send(pattern).expect(200);

    expect(res.body.timeZone).toBe("Europe/Istanbul");
    expect(res.body.sessions).toHaveLength(8);
    expect(res.body.sessions[0]).toEqual({
      scheduledAt: "2026-10-06T18:00:00.000Z",
      localDate: "2026-10-06",
      weekNumber: 1,
    });
    const after = await getDetail(course.id);
    expect(after.version).toBe(course.version);
    expect(after.weeks).toHaveLength(2);
  });

  it("previews the week numbers the batch then writes (nizam/55)", async () => {
    const course = await createCourse();
    await batch(course.id).send(istanbulBatch).expect(201);
    const fridays = {
      weekdays: [5],
      startTime: "21:00",
      timeZone: "Europe/Istanbul",
      startDate: "2026-10-16",
      count: 3,
    };

    const previewed = await preview(course.id).send(fridays).expect(200);
    const written = await batch(course.id)
      .send({ ...fridays, title: "Cuma", durationMinutes: 30 })
      .expect(201);

    const previewedWeeks = previewed.body.sessions.map(
      (s: { weekNumber: number }) => s.weekNumber
    );
    expect(previewedWeeks).toEqual([2, 3, 4]);
    expect(
      written.body.lessons.map((l: { weekNumber: number }) => l.weekNumber)
    ).toEqual(previewedWeeks);
  });

  it("answers 400 INVALID_SESSION_PATTERN to a pattern that cannot be expanded, and writes nothing", async () => {
    const course = await createCourse();

    const both = await batch(course.id)
      .send({ ...istanbulBatch, endDate: "2026-11-01" })
      .expect(400);
    expect(both.body).toHaveProperty("code", "INVALID_SESSION_PATTERN");

    const backwards = await preview(course.id)
      .send({
        weekdays: [2],
        startTime: "21:00",
        startDate: "2026-10-06",
        endDate: "2026-10-01",
      })
      .expect(400);
    expect(backwards.body).toHaveProperty("code", "INVALID_SESSION_PATTERN");

    const after = await getDetail(course.id);
    expect(after.version).toBe(course.version);
  });

  it("answers 400 to malformed fields", async () => {
    const course = await createCourse();
    for (const body of [
      { ...istanbulBatch, weekdays: [0] },
      { ...istanbulBatch, weekdays: [] },
      { ...istanbulBatch, startTime: "9:00" },
      { ...istanbulBatch, startTime: "24:00" },
      { ...istanbulBatch, startDate: "06.10.2026" },
      { ...istanbulBatch, timeZone: "Mars/Olympus" },
      { ...istanbulBatch, count: 0 },
      { ...istanbulBatch, count: null },
      { ...istanbulBatch, durationMinutes: undefined },
      { ...istanbulBatch, meetingUrl: "http://meet.google.com/abc" },
    ]) {
      await batch(course.id).send(body).expect(400);
    }
    expect((await getDetail(course.id)).version).toBe(course.version);
  });

  it("answers 403 to a caller without EDIT on the course, including an enrolled talebe", async () => {
    const [otherKosk] = await databaseService.db
      .insert(kosks)
      .values({ ownerId: OTHER_USER_ID, name: "Başka Köşk" })
      .returning();
    await assignRole(databaseService.db, {
      userId: OTHER_USER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: otherKosk.id,
      grantedBy: OTHER_USER_ID,
    });
    const [otherCourse] = await databaseService.db
      .insert(courses)
      .values({
        koskId: otherKosk.id,
        authorId: OTHER_USER_ID,
        title: "Başka Kurs",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    const {
      title: _title,
      durationMinutes: _minutes,
      ...pattern
    } = istanbulBatch;

    await batch(otherCourse.id).send(istanbulBatch).expect(403);
    await preview(otherCourse.id).send(pattern).expect(403);

    await databaseService.db
      .insert(enrollments)
      .values({ userId: TEST_USER_ID, courseId: otherCourse.id });
    await batch(otherCourse.id).send(istanbulBatch).expect(403);

    const weeks = await databaseService.db
      .select()
      .from(courseWeeks)
      .where(eq(courseWeeks.courseId, otherCourse.id));
    expect(weeks).toHaveLength(0);
  });
});
