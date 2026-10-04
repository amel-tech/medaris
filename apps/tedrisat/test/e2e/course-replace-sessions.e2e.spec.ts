import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courseResources,
  courses,
  courseWeeks,
  lessons,
} from "../../src/database/schema/course.schema";
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
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

/**
 * MDRS-247 — `PUT /courses/:id` asks `course.edit`, and also `session.manage`
 * when the save adds, moves or hides a session, because those are what the
 * lesson routes ask `session.manage` for. A save that leaves every session
 * where it is stays `course.edit` alone, including the content the editor
 * reads back (links, agendas) and sends again. The comparison itself is unit
 * tested (test/unit/course/session-changes.spec.ts).
 */

const MEETING = "https://zoom.us/j/55501";

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
}
interface IWeekBody {
  id: string;
  weekNumber: number;
  title: string;
  lessons: ILessonBody[];
}
interface ICourseBody {
  title: string;
  status: string;
  version: number;
  weeks: IWeekBody[];
  muderris: { id: string; userId: string | null; name: string }[];
  resources: {
    id: string;
    name: string;
    type?: string | null;
    url?: string | null;
  }[];
}

/** What the Müfredat editor sends back for the course it read: everything it was given. */
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
      ...(lesson.kaynak != null ? { kaynak: lesson.kaynak } : {}),
      ...(lesson.scheduledAt != null
        ? { scheduledAt: lesson.scheduledAt }
        : {}),
      ...(lesson.meetingUrl != null ? { meetingUrl: lesson.meetingUrl } : {}),
      ...(lesson.agenda != null ? { agenda: lesson.agenda } : {}),
      isPreview: lesson.isPreview ?? false,
    })),
  })),
  muderris: body.muderris.map((m) => ({
    id: m.id,
    ...(m.userId ? { userId: m.userId } : {}),
    name: m.name,
  })),
  resources: body.resources.map((r) => ({
    id: r.id,
    name: r.name,
    ...(r.type ? { type: r.type } : {}),
    ...(r.url ? { url: r.url } : {}),
  })),
});
type Payload = ReturnType<typeof payloadFrom>;

describe("a whole-course save and the sessions in it (MDRS-247, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let secondWeekId: string;
  let firstId: string;
  let secondId: string;
  let thirdId: string;
  let cancelledId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const read = async (sub: CastMember = CAST.MANAGER): Promise<ICourseBody> =>
    (
      await http()
        .get(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(sub))
        .expect(200)
    ).body;
  const save = (sub: CastMember, payload: object) =>
    http()
      .put(`/courses/${ids.courseId}`)
      .set("Authorization", bearerOf(sub))
      .send(payload);

  const liveLessons = () =>
    db()
      .select({ id: lessons.id, weekId: lessons.weekId })
      .from(lessons)
      .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
      .where(
        and(eq(courseWeeks.courseId, ids.courseId), isNull(lessons.archivedAt))
      );
  const storedVersion = async () =>
    (
      await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, ids.courseId))
    )[0].version;

  const lessonIn = (payload: Payload, id: string) => {
    const lesson = payload.weeks
      .flatMap((w) => w.lessons)
      .find((l) => l.id === id);
    if (!lesson) throw new Error(`no lesson ${id} in the payload`);
    return lesson;
  };

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "audit_log",
      "users"
    );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await clean();
    ids = await seedCourseScope(db());
    const [second] = await db()
      .insert(courseWeeks)
      .values({
        courseId: ids.courseId,
        weekNumber: 2,
        title: "Bina",
        orderIndex: 1,
      })
      .returning();
    secondWeekId = second.id;
    const day = 86_400_000;
    firstId = await insertLiveLesson(db(), ids.weekId, 0, {
      title: "Bir",
      scheduledAt: new Date(Date.now() + 2 * day),
      meetingUrl: MEETING,
      agenda: [{ time: "00:00", title: "Giriş" }],
      kaynak: "Emsile, 1. bab",
    });
    secondId = await insertLiveLesson(db(), ids.weekId, 1, {
      title: "İki",
      scheduledAt: new Date(Date.now() + 3 * day),
    });
    thirdId = await insertLiveLesson(db(), secondWeekId, 0, {
      title: "Üç",
      scheduledAt: new Date(Date.now() + 9 * day),
    });
    cancelledId = await insertLiveLesson(db(), secondWeekId, 1, {
      title: "İptal",
      scheduledAt: new Date(Date.now() + 10 * day),
      cancelledAt: new Date(),
      cancelReason: "Müderris hasta",
    });
    await db().insert(courseResources).values({
      courseId: ids.courseId,
      name: "Emsile PDF",
      type: "pdf",
      url: "https://example.org/emsile.pdf",
      orderIndex: 0,
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("a save that leaves every session where it is: course.edit alone", () => {
    it("lets a ders nazırı holding only course.edit save what the editor read back, links and agendas intact", async () => {
      const body = await read(CAST.EDIT);
      // what the editor was given is everything it needs to send again
      expect(lessonIn(payloadFrom(body), firstId)).toMatchObject({
        meetingUrl: MEETING,
        agenda: [{ time: "00:00", title: "Giriş" }],
        kaynak: "Emsile, 1. bab",
      });
      await save(CAST.EDIT, payloadFrom(body)).expect(200);

      const after = await read();
      const first = after.weeks
        .flatMap((w) => w.lessons)
        .find((l) => l.id === firstId);
      expect(first).toMatchObject({
        meetingUrl: MEETING,
        agenda: [{ time: "00:00", title: "Giriş" }],
        kaynak: "Emsile, 1. bab",
      });
      expect(after.resources[0].url).toBe("https://example.org/emsile.pdf");
      // the cancelled session is still cancelled and the sessions are the same
      const stored = (await liveLessons()).map((l) => l.id).sort();
      expect(stored).toEqual([firstId, secondId, thirdId, cancelledId].sort());
      expect(
        after.weeks.flatMap((w) => w.lessons).find((l) => l.id === cancelledId)
      ).toMatchObject({ title: "İptal" });
    });

    it("lets them change the course, a week's title and what a session says", async () => {
      const payload = payloadFrom(await read(CAST.EDIT));
      payload.title = "Emsile ve Bina Şerhi";
      payload.weeks[0].title = "Emsile-i muhtelife";
      Object.assign(lessonIn(payload, firstId), {
        title: "Bir: giriş",
        agenda: [{ time: "00:00", title: "Hoş geldiniz" }],
        meetingUrl: "https://zoom.us/j/55502",
        kaynak: "Emsile, 2. bab",
        durationMinutes: 90,
      });
      const res = await save(CAST.EDIT, payload).expect(200);
      expect(res.body.title).toBe("Emsile ve Bina Şerhi");
      expect(
        res.body.weeks
          .flatMap((w: IWeekBody) => w.lessons)
          .find((l: ILessonBody) => l.id === firstId)
      ).toMatchObject({
        title: "Bir: giriş",
        meetingUrl: "https://zoom.us/j/55502",
        durationMinutes: 90,
      });
    });

    it("lets a week with no sessions be renamed, and the weeks be put in another order", async () => {
      const payload = payloadFrom(await read(CAST.EDIT));
      payload.weeks.reverse();
      await save(CAST.EDIT, payload).expect(200);
    });
  });

  describe("a save that adds, moves or hides a session also needs session.manage", () => {
    const refusedWithoutWriting = async (sub: CastMember, payload: Payload) => {
      const version = await storedVersion();
      const before = (await liveLessons()).map((l) => `${l.id}@${l.weekId}`);
      const res = await save(sub, payload).expect(403);
      expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      expect(await storedVersion()).toBe(version);
      expect((await liveLessons()).map((l) => `${l.id}@${l.weekId}`)).toEqual(
        before
      );
      return res;
    };

    const changes: [string, (payload: Payload) => void][] = [
      [
        "adds a session",
        (p) => {
          p.weeks[0].lessons.push({
            title: "Yeni celse",
            type: LessonType.LIVE,
          } as Payload["weeks"][number]["lessons"][number]);
        },
      ],
      [
        "hides a session",
        (p) => {
          p.weeks[0].lessons = p.weeks[0].lessons.filter(
            (l) => l.id !== secondId
          );
        },
      ],
      [
        "moves a session to another week",
        (p) => {
          const [moved] = p.weeks[0].lessons.splice(1, 1);
          p.weeks[1].lessons.push(moved);
        },
      ],
      [
        "puts a session in another place in its week",
        (p) => {
          p.weeks[0].lessons.reverse();
        },
      ],
      [
        "moves a session in time",
        (p) => {
          lessonIn(p, secondId).scheduledAt = new Date(
            Date.now() + 5 * 86_400_000
          ).toISOString();
        },
      ],
      [
        "clears a session's time",
        (p) => {
          Object.assign(lessonIn(p, secondId), { scheduledAt: null });
        },
      ],
      [
        "drops a week and the sessions in it",
        (p) => {
          p.weeks.pop();
        },
      ],
    ];

    it.each(
      changes
    )("refuses a ders nazırı holding only course.edit when the save %s, and writes nothing", async (_name, change) => {
      const payload = payloadFrom(await read(CAST.EDIT));
      change(payload);
      const res = await refusedWithoutWriting(CAST.EDIT, payload);
      expect(res.body.context).toMatchObject({
        courseId: ids.courseId,
        permission: "session.manage",
      });
    });

    it.each(
      changes
    )("lets a ders nazırı holding both, the müderris, the köşk nazım and the başnazım do it when the save %s", async (_name, change) => {
      for (const sub of [
        CAST.EDIT_AND_SESSION,
        CAST.MUDERRIS,
        CAST.MANAGER,
        CAST.ADMIN,
      ]) {
        await clean();
        ids = await seedCourseScope(db());
        const [week2] = await db()
          .insert(courseWeeks)
          .values({
            courseId: ids.courseId,
            weekNumber: 2,
            title: "Bina",
            orderIndex: 1,
          })
          .returning();
        secondWeekId = week2.id;
        firstId = await insertLiveLesson(db(), ids.weekId, 0, {
          title: "Bir",
          scheduledAt: new Date(Date.now() + 2 * 86_400_000),
        });
        secondId = await insertLiveLesson(db(), ids.weekId, 1, {
          title: "İki",
          scheduledAt: new Date(Date.now() + 3 * 86_400_000),
        });
        thirdId = await insertLiveLesson(db(), secondWeekId, 0, {
          title: "Üç",
          scheduledAt: new Date(Date.now() + 9 * 86_400_000),
        });
        const payload = payloadFrom(await read(sub));
        change(payload);
        expect([sub, (await save(sub, payload)).status]).toEqual([sub, 200]);
      }
    });

    it("is refused before a stale version is, so course.edit alone is told 403 and not 409", async () => {
      const payload = payloadFrom(await read(CAST.EDIT));
      payload.weeks[0].lessons.pop();
      await http()
        .patch(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .send({ subtitle: "Başkası yazdı" })
        .expect(200);
      // the payload is stale now: one that may change sessions is told so
      const stale = await save(CAST.EDIT_AND_SESSION, payload).expect(409);
      expect(stale.body.code).toBe("COURSE_VERSION_CONFLICT");
      await refusedWithoutWriting(CAST.EDIT, payload);
    });

    it("leaves a save that changes nothing about the sessions to the version check", async () => {
      const payload = payloadFrom(await read(CAST.EDIT));
      payload.version = payload.version + 7;
      const res = await save(CAST.EDIT, payload).expect(409);
      expect(res.body.code).toBe("COURSE_VERSION_CONFLICT");
    });
  });

  describe("a save needs course.edit whatever it changes", () => {
    it.each([
      ["a ders nazırı holding only session.manage", CAST.SESSION],
      [
        "a ders nazırı given a group of recording.manage and session.manage",
        CAST.GROUP,
      ],
      ["a ders nazırı holding recording.manage", CAST.RECORDING],
      ["a ders nazırı with an unrelated grant", CAST.WEEK_HIDE],
      ["a ders nazırı with no grant", CAST.BARE],
      [
        "a ders nazırı of another course with course.edit and session.manage there",
        CAST.OTHER_COURSE,
      ],
      ["an enrolled talebe", CAST.TALEBE],
      ["a stranger", CAST.STRANGER],
    ])("refuses %s, even for a save that changes nothing", async (_name, sub) => {
      const payload = payloadFrom(await read(CAST.MANAGER));
      const version = await storedVersion();
      await save(sub, payload).expect(403);
      expect(await storedVersion()).toBe(version);
    });
  });
});
