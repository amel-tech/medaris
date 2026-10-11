import { INestApplication } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  lessons,
} from "../../src/database/schema/course.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import {
  bearerOf,
  CAST,
  type CastMember,
  type ICourseScopeIds,
  insertLiveLesson,
  seedCourseScope,
} from "../helpers/course-scope-cast";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-283 — a celse is covered by its meeting link, its live stream or the
 * in-person mark (the course's, unless the celse says otherwise). Only an
 * upcoming, standing celse with none of the three is flagged: on the course
 * menu's badge, the köşk nazımı's home page and the medrese's Pano, by one
 * rule (`withoutAccessSql`, unit tested in test/unit/course/session-access.spec.ts).
 * The screens are told how each celse is attended, a stream as a boolean and
 * never its link, and only where its meeting link would go; the course's own
 * mark is public.
 */

const WEB_URL = "https://tedris.example";
const BASMUDERRIS = "e2830000-0000-4000-8000-000000000001";
const MEETING = "https://zoom.us/j/28301";
const VIDEO_ID = "dQw4w9WgXcQ";
const STREAM = `https://www.youtube.com/live/${VIDEO_ID}`;
const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);

interface ILessonBody {
  id: string;
  title: string;
  type: string;
  durationMinutes?: number | null;
  kaynak?: string | null;
  scheduledAt?: string | null;
  meetingUrl?: string | null;
  agenda?: { time: string; title: string }[] | null;
  isPreview?: boolean;
  inPerson?: boolean;
  inPersonOverride?: boolean | null;
  hasLiveStream?: boolean;
}
interface ICourseBody {
  title: string;
  status: string;
  version: number;
  inPerson: boolean;
  weeks: {
    id: string;
    weekNumber: number;
    title: string;
    lessons: ILessonBody[];
  }[];
}

/** What a Müfredat editor sends back: the lessons as read, without the attendance fields it was given. */
const payloadFrom = (body: ICourseBody) => ({
  title: body.title,
  status: body.status,
  version: body.version,
  weeks: body.weeks.map((week) => ({
    id: week.id,
    weekNumber: week.weekNumber,
    title: week.title,
    lessons: week.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      ...(lesson.durationMinutes != null
        ? { durationMinutes: lesson.durationMinutes }
        : {}),
      ...(lesson.scheduledAt != null
        ? { scheduledAt: lesson.scheduledAt }
        : {}),
      // A blank stored link is no link to send back (the DTO wants a URL).
      ...(lesson.meetingUrl?.trim() ? { meetingUrl: lesson.meetingUrl } : {}),
      isPreview: lesson.isPreview ?? false,
    })),
  })),
  resources: [],
});

describe("how a celse is attended (MDRS-283, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let madrasahId: string;

  // Course A ("Emsile ve Bina"), not in person.
  let link: string;
  let stream: string;
  let ownMark: string;
  let none: string;
  let blank: string;
  let past: string;
  let cancelled: string;
  // Course B ("Başka ders"), in person.
  let follows: string;
  let notInPerson: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: CastMember | typeof BASMUDERRIS) =>
    sub === BASMUDERRIS ? bearerFor({ sub }) : bearerOf(sub);
  const get = (path: string, sub?: CastMember | typeof BASMUDERRIS) => {
    const req = http().get(path);
    return sub ? req.set("Authorization", as(sub)) : req;
  };
  const detail = async (
    courseId: string,
    sub?: CastMember
  ): Promise<ICourseBody> =>
    (await get(`/courses/${courseId}`, sub).expect(200)).body;
  const lessonOf = (body: ICourseBody, id: string): ILessonBody => {
    const found = body.weeks.flatMap((w) => w.lessons).find((l) => l.id === id);
    if (!found) throw new Error(`no lesson ${id}`);
    return found;
  };
  const badge = async (courseId: string) =>
    (await get(`/courses/${courseId}/badge-counts`, CAST.MANAGER).expect(200))
      .body.sessionsWithoutAccess;
  const version = async (courseId: string) =>
    (
      await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, courseId))
    )[0].version;

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "audit_log",
      "users"
    );

  beforeAll(async () => {
    // Read by the config factory when AppModule is first imported.
    process.env.TEDRIS_WEB_URL = WEB_URL;
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await clean();
    ids = await seedCourseScope(db());
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({
        handle: "zeyrek",
        name: "Zeyrek Medresesi",
        createdBy: BASMUDERRIS,
      })
      .returning();
    madrasahId = madrasah.id;
    await assignRole(db(), {
      userId: BASMUDERRIS,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
    });
    await db()
      .update(courses)
      .set({ madrasahId })
      .where(inArray(courses.id, [ids.courseId, ids.otherCourseId]));
    await db()
      .update(courses)
      .set({ inPerson: true })
      .where(eq(courses.id, ids.otherCourseId));

    link = await insertLiveLesson(db(), ids.weekId, 0, {
      title: "Bağlantılı",
      scheduledAt: inHours(24),
      meetingUrl: MEETING,
    });
    stream = await insertLiveLesson(db(), ids.weekId, 1, {
      title: "Yalnız yayın",
      scheduledAt: inHours(25),
      liveStreamUrl: STREAM,
    });
    ownMark = await insertLiveLesson(db(), ids.weekId, 2, {
      title: "Yüz yüze celse",
      scheduledAt: inHours(26),
      inPersonOverride: true,
    });
    none = await insertLiveLesson(db(), ids.weekId, 3, {
      title: "Hiçbiri",
      scheduledAt: inHours(27),
    });
    blank = await insertLiveLesson(db(), ids.weekId, 4, {
      title: "Boşluklu",
      scheduledAt: inHours(28),
      meetingUrl: "   ",
      liveStreamUrl: " ",
    });
    // A finished celse without a recording is information, not work.
    past = await insertLiveLesson(db(), ids.weekId, 5, {
      title: "Geçmiş",
      scheduledAt: inHours(-48),
    });
    cancelled = await insertLiveLesson(db(), ids.weekId, 6, {
      title: "İptal",
      scheduledAt: inHours(29),
      cancelledAt: new Date(),
    });

    const [otherWeek] = await db()
      .insert(courseWeeks)
      .values({
        courseId: ids.otherCourseId,
        weekNumber: 1,
        title: "Bina",
        orderIndex: 0,
      })
      .returning();
    follows = await insertLiveLesson(db(), otherWeek.id, 0, {
      title: "Dersin ayarı",
      scheduledAt: inHours(30),
    });
    notInPerson = await insertLiveLesson(db(), otherWeek.id, 1, {
      title: "Yüz yüze değil",
      scheduledAt: inHours(31),
      inPersonOverride: false,
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
    delete process.env.TEDRIS_WEB_URL;
  });

  describe("the coverage rule", () => {
    it("counts on the course badge only the celses with none of the three", async () => {
      expect(await badge(ids.courseId)).toBe(2); // none, blank
      expect(await badge(ids.otherCourseId)).toBe(1); // notInPerson
    });

    it("flags the same celses on the köşk nazımı's home page", async () => {
      const res = await get(
        `/kosks/${ids.koskId}/dashboard`,
        CAST.MANAGER
      ).expect(200);
      expect(res.body.withoutAccessCount).toBe(3);
      expect(res.body.firstWithoutAccess.id).toBe(none);
      expect(res.body).not.toHaveProperty("missingLinkCount");
      const row = (id: string) =>
        res.body.sessions.find((s: { id: string }) => s.id === id);
      expect(row(link)).toMatchObject({
        withoutAccess: false,
        inPerson: false,
        hasLiveStream: false,
      });
      expect(row(stream)).toMatchObject({
        withoutAccess: false,
        hasLiveStream: true,
      });
      expect(row(ownMark)).toMatchObject({
        withoutAccess: false,
        inPerson: true,
      });
      expect(row(none).withoutAccess).toBe(true);
      expect(row(blank).withoutAccess).toBe(true);
      expect(row(follows)).toMatchObject({
        withoutAccess: false,
        inPerson: true,
      });
      expect(row(notInPerson)).toMatchObject({
        withoutAccess: true,
        inPerson: false,
      });
      expect(JSON.stringify(res.body)).not.toContain(VIDEO_ID);

      // A finished celse with none of the three is not flagged, nor counted.
      const pastTab = await get(
        `/kosks/${ids.koskId}/dashboard?sessions=PAST`,
        CAST.MANAGER
      ).expect(200);
      const finished = pastTab.body.sessions.find(
        (s: { id: string }) => s.id === past
      );
      expect(finished).toMatchObject({ withoutAccess: false });
    });

    it("flags the same celses on the medrese's Pano", async () => {
      const res = await get(
        `/madrasahs/${madrasahId}/dashboard`,
        BASMUDERRIS
      ).expect(200);
      const flagged = res.body.upcomingSessions
        .filter((s: { withoutAccess: boolean }) => s.withoutAccess)
        .map((s: { lessonId: string }) => s.lessonId);
      expect(flagged.sort()).toEqual([none, blank, notInPerson].sort());
      const row = (id: string) =>
        res.body.upcomingSessions.find(
          (s: { lessonId: string }) => s.lessonId === id
        );
      expect(row(stream)).toMatchObject({
        hasLiveStream: true,
        meetingHost: null,
      });
      expect(row(follows).inPerson).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain(VIDEO_ID);
    });

    it("stops flagging a celse once it has any of the three", async () => {
      await db()
        .update(lessons)
        .set({ liveStreamUrl: STREAM })
        .where(eq(lessons.id, none));
      await db()
        .update(lessons)
        .set({ inPersonOverride: true })
        .where(eq(lessons.id, blank));
      await db()
        .update(lessons)
        .set({ meetingUrl: MEETING })
        .where(eq(lessons.id, notInPerson));
      expect(await badge(ids.courseId)).toBe(0);
      expect(await badge(ids.otherCourseId)).toBe(0);
      const home = await get(
        `/kosks/${ids.koskId}/dashboard`,
        CAST.MANAGER
      ).expect(200);
      expect(home.body.withoutAccessCount).toBe(0);
      expect(home.body.firstWithoutAccess).toBeNull();
    });
  });

  describe("the course detail", () => {
    it("carries the course's in-person mark to everyone", async () => {
      expect((await detail(ids.otherCourseId)).inPerson).toBe(true);
      expect((await detail(ids.courseId, CAST.STRANGER)).inPerson).toBe(false);
    });

    it("tells a content reader how each celse is attended, and never the stream link", async () => {
      const a = await detail(ids.courseId, CAST.MUDERRIS);
      expect(lessonOf(a, stream)).toMatchObject({
        hasLiveStream: true,
        inPerson: false,
        inPersonOverride: null,
      });
      expect(lessonOf(a, link).hasLiveStream).toBe(false);
      expect(lessonOf(a, blank).hasLiveStream).toBe(false);
      expect(lessonOf(a, ownMark)).toMatchObject({
        inPerson: true,
        inPersonOverride: true,
      });
      expect(lessonOf(a, none)).toMatchObject({
        inPerson: false,
        inPersonOverride: null,
        hasLiveStream: false,
      });
      expect(lessonOf(a, stream)).not.toHaveProperty("liveStreamUrl");
      expect(JSON.stringify(a)).not.toContain(VIDEO_ID);

      const b = await detail(ids.otherCourseId, CAST.MANAGER);
      expect(lessonOf(b, follows)).toMatchObject({
        inPerson: true,
        inPersonOverride: null,
      });
      expect(lessonOf(b, notInPerson)).toMatchObject({
        inPerson: false,
        inPersonOverride: false,
      });
    });

    it("tells a ders nazırı holding session.manage, and not session.live_link, that a celse is streamed", async () => {
      await get(`/courses/${ids.courseId}/live-streams`, CAST.SESSION).expect(
        403
      );
      const a = await detail(ids.courseId, CAST.SESSION);
      expect(lessonOf(a, stream).hasLiveStream).toBe(true);
      expect(JSON.stringify(a)).not.toContain(VIDEO_ID);
    });

    it("tells nobody else how a celse is attended", async () => {
      for (const sub of [undefined, CAST.STRANGER, CAST.PENDING]) {
        const a = await detail(ids.courseId, sub);
        expect(a.inPerson).toBe(false);
        for (const lesson of a.weeks.flatMap((w) => w.lessons)) {
          for (const key of ["inPerson", "inPersonOverride", "hasLiveStream"]) {
            expect(lesson).not.toHaveProperty(key);
          }
        }
        expect(JSON.stringify(a)).not.toContain(VIDEO_ID);
      }
    });
  });

  describe("the session page", () => {
    const session = (id: string, courseId = ids.courseId) =>
      `/courses/${courseId}/sessions/${id}`;

    it("says a stream is set before the celse starts, to a content reader only, and holds the link back until it starts", async () => {
      const talebe = await get(session(stream), CAST.TALEBE).expect(200);
      expect(talebe.body).toMatchObject({
        status: "SCHEDULED",
        hasLiveStream: true,
        liveStreamUrl: null,
        inPerson: false,
      });
      expect((await get(session(link), CAST.TALEBE)).body.hasLiveStream).toBe(
        false
      );
      for (const sub of [undefined, CAST.STRANGER, CAST.PENDING]) {
        const locked = await get(session(stream), sub).expect(200);
        expect(locked.body.contentLocked).toBe(true);
        expect(locked.body).not.toHaveProperty("hasLiveStream");
        expect(JSON.stringify(locked.body)).not.toContain(VIDEO_ID);
      }
    });

    it("says whether the celse is held in person to everyone, its own mark included", async () => {
      for (const sub of [undefined, CAST.TALEBE]) {
        expect((await get(session(ownMark), sub)).body.inPerson).toBe(true);
        expect((await get(session(none), sub)).body.inPerson).toBe(false);
        expect(
          (await get(session(follows, ids.otherCourseId), sub)).body.inPerson
        ).toBe(true);
        expect(
          (await get(session(notInPerson, ids.otherCourseId), sub)).body
            .inPerson
        ).toBe(false);
      }
    });

    it("tells the talebe's own list how each celse is attended", async () => {
      const res = await get(
        "/me/upcoming-lessons?limit=20",
        CAST.TALEBE
      ).expect(200);
      const row = (id: string) =>
        res.body.find((s: { id: string }) => s.id === id);
      expect(row(stream)).toMatchObject({
        hasLiveStream: true,
        inPerson: false,
      });
      expect(row(ownMark)).toMatchObject({
        hasLiveStream: false,
        inPerson: true,
      });
      expect(JSON.stringify(res.body)).not.toContain(VIDEO_ID);
    });
  });

  describe("setting the mark", () => {
    it("sets the course's mark under course.edit, which its celses follow, and refuses null", async () => {
      await http()
        .patch(`/courses/${ids.courseId}`)
        .set("Authorization", as(CAST.EDIT))
        .send({ inPerson: true })
        .expect(200);
      const a = await detail(ids.courseId, CAST.MUDERRIS);
      expect(a.inPerson).toBe(true);
      expect(lessonOf(a, none)).toMatchObject({
        inPerson: true,
        inPersonOverride: null,
      });
      expect(await badge(ids.courseId)).toBe(0);

      await http()
        .patch(`/courses/${ids.courseId}`)
        .set("Authorization", as(CAST.EDIT))
        .send({ inPerson: null })
        .expect(400);
      expect((await detail(ids.courseId)).inPerson).toBe(true);
    });

    it("overrides a celse's mark in both directions, and back to the course's", async () => {
      const patch = async (id: string, inPersonOverride: boolean | null) => {
        const res = await http()
          .patch(`/lessons/${id}`)
          .set("Authorization", as(CAST.SESSION))
          .send({ version: await version(ids.courseId), inPersonOverride });
        expect(res.status).toBe(200);
        return res;
      };

      const on = await patch(none, true);
      expect(on.body).toMatchObject({ inPerson: true, inPersonOverride: true });
      expect(await badge(ids.courseId)).toBe(1);

      const back = await patch(none, null);
      expect(back.body).toMatchObject({
        inPerson: false,
        inPersonOverride: null,
      });
      expect(await badge(ids.courseId)).toBe(2);

      // Course B is in person; this celse no longer is.
      const off = await http()
        .patch(`/lessons/${follows}`)
        .set("Authorization", as(CAST.MANAGER))
        .send({
          version: await version(ids.otherCourseId),
          inPersonOverride: false,
        })
        .expect(200);
      expect(off.body).toMatchObject({
        inPerson: false,
        inPersonOverride: false,
      });
      expect(await badge(ids.otherCourseId)).toBe(2);
    });

    it("asks session.manage for a celse's mark", async () => {
      await http()
        .patch(`/lessons/${none}`)
        .set("Authorization", as(CAST.EDIT))
        .send({ version: await version(ids.courseId), inPersonOverride: true })
        .expect(403);
    });

    it("keeps a celse's mark through a whole-course save that leaves it out, and asks session.manage to change it there", async () => {
      const read = await detail(ids.courseId, CAST.MUDERRIS);
      await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", as(CAST.EDIT))
        .send(payloadFrom(read))
        .expect(200);
      const kept = await detail(ids.courseId, CAST.MUDERRIS);
      expect(lessonOf(kept, ownMark)).toMatchObject({
        inPerson: true,
        inPersonOverride: true,
      });

      const marked = payloadFrom(kept);
      const target = marked.weeks
        .flatMap((w) => w.lessons)
        .find((l) => l.id === none) as Record<string, unknown>;
      target.inPersonOverride = true;
      await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", as(CAST.EDIT))
        .send(marked)
        .expect(403);
      await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", as(CAST.EDIT_AND_SESSION))
        .send(marked)
        .expect(200);
      expect(
        lessonOf(await detail(ids.courseId, CAST.MUDERRIS), none)
      ).toMatchObject({ inPerson: true, inPersonOverride: true });
    });

    it("adds a celse with a mark of its own", async () => {
      const res = await http()
        .post(`/courses/${ids.courseId}/weeks/${ids.weekId}/lessons`)
        .set("Authorization", as(CAST.SESSION))
        .send({
          title: "Yeni celse",
          type: LessonType.LIVE,
          inPersonOverride: true,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        inPerson: true,
        inPersonOverride: true,
        hasLiveStream: false,
      });
    });

    it("lets the celses of a weekly plan follow the course, as it is and as it changes", async () => {
      const res = await http()
        .post(`/courses/${ids.otherCourseId}/sessions/batch`)
        .set("Authorization", as(CAST.MANAGER))
        .send({
          title: "Haftalık",
          weekdays: [2, 4],
          startTime: "21:00",
          durationMinutes: 60,
          timeZone: "Europe/Istanbul",
          startDate: "2026-11-03",
          count: 4,
        })
        .expect(201);
      const planned: string[] = res.body.lessons.map(
        (l: { id: string }) => l.id
      );
      expect(planned).toHaveLength(4);
      for (const lesson of res.body.lessons) {
        expect(lesson).toMatchObject({
          inPerson: true,
          inPersonOverride: null,
        });
      }

      await http()
        .patch(`/courses/${ids.otherCourseId}`)
        .set("Authorization", as(CAST.MANAGER))
        .send({ inPerson: false })
        .expect(200);
      const b = await detail(ids.otherCourseId, CAST.MANAGER);
      for (const id of planned) {
        expect(lessonOf(b, id)).toMatchObject({
          inPerson: false,
          inPersonOverride: null,
        });
      }
    });
  });

  describe("the single-celse calendar file", () => {
    const description = async (
      id: string,
      sub: CastMember,
      locale = "tr"
    ): Promise<string> => {
      const res = await http()
        .get(`/lessons/${id}/calendar.ics?locale=${locale}`)
        .set("Authorization", as(sub))
        .buffer(true)
        .parse((response, done) => {
          let text = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            text += chunk;
          });
          response.on("end", () => done(null, text));
        })
        .expect(200);
      const line = (res.body as string)
        .replace(/\r\n /g, "")
        .split("\r\n")
        .find((l) => l.startsWith("DESCRIPTION:"));
      return (line ?? "").slice("DESCRIPTION:".length);
    };

    it("says how the celse is attended, in tr, en and ar", async () => {
      expect(await description(link, CAST.TALEBE)).toMatch(
        /^Toplantı bağlantısı celse sayfasındadır:/
      );
      expect(await description(stream, CAST.TALEBE)).toMatch(
        /^Bu celse canlı yayınlanır/
      );
      expect(await description(ownMark, CAST.TALEBE)).toMatch(
        /^Bu celse yüz yüze yapılır\./
      );
      expect(await description(ownMark, CAST.TALEBE, "en")).toMatch(
        /^This session is held in person\./
      );
      expect(await description(stream, CAST.TALEBE, "ar")).toContain(
        "بثًّا مباشرًا"
      );
      expect(await description(none, CAST.TALEBE)).not.toContain("oturum");
    });

    it("tells a caller who may not read the content no more than the in-person mark", async () => {
      expect(await description(stream, CAST.STRANGER)).toMatch(
        /^Toplantı bağlantısı celse sayfasındadır:/
      );
      expect(await description(ownMark, CAST.STRANGER)).toMatch(
        /^Bu celse yüz yüze yapılır\./
      );
    });
  });

  it("counts neither a finished celse without a recording nor a cancelled one", async () => {
    // Both have none of the three; neither is anyone's work.
    expect(await badge(ids.courseId)).toBe(2);
    const a = await detail(ids.courseId, CAST.MUDERRIS);
    expect(lessonOf(a, past)).toMatchObject({ hasLiveStream: false });
    expect(lessonOf(a, cancelled)).toMatchObject({ hasLiveStream: false });
  });
});
