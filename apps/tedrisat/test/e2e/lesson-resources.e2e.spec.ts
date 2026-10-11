import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  lessonResources,
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
 * MDRS-286 — a celse's own resources: links, like the course's since
 * MDRS-279. Written under `session.manage` (`PATCH /lessons/:id`, and in a
 * whole-course save only with it); validated as a course resource's link is;
 * read like the course's: every name for everyone who may see the celse, each
 * link only for a caller who may read the course content ("Adlarını herkes
 * görür; bağlantıları derse kayıtlı talebeler açar."). Kept while the celse is
 * hidden and removed with it when it is deleted for real.
 */

const DRIVE = "https://drive.google.com/file/d/1a2b3c/view";
const BINA = "http://files.medaris.test/bina.pdf";

interface IResourceBody {
  id: string;
  lessonId: string;
  name: string;
  meta: string | null;
  url?: string;
  orderIndex: number;
}
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
  resources: IResourceBody[];
}
interface ICourseBody {
  title: string;
  status: string;
  version: number;
  contentLocked: boolean;
  weeks: {
    id: string;
    weekNumber: number;
    title: string;
    lessons: ILessonBody[];
  }[];
}

describe("a celse's own resources (MDRS-286, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let ids: ICourseScopeIds;
  let sessionId: string;
  let sampleId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const read = async (sub?: CastMember): Promise<ICourseBody> => {
    const call = http().get(`/courses/${ids.courseId}`);
    if (sub) call.set("Authorization", bearerOf(sub));
    return (await call.expect(200)).body;
  };
  const lessonOf = (body: ICourseBody, id: string): ILessonBody => {
    const found = body.weeks.flatMap((w) => w.lessons).find((l) => l.id === id);
    if (!found) throw new Error(`no lesson ${id} in the body`);
    return found;
  };
  const patch = (sub: CastMember, id: string, body: object) =>
    http()
      .patch(`/lessons/${id}`)
      .set("Authorization", bearerOf(sub))
      .send(body);
  const storedVersion = async () =>
    (
      await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, ids.courseId))
    )[0].version;
  const storedRows = (lessonId: string) =>
    db()
      .select()
      .from(lessonResources)
      .where(eq(lessonResources.lessonId, lessonId))
      .orderBy(lessonResources.orderIndex);

  /** Writes two resources on the celse through the session route. */
  const seedResources = async () =>
    (
      await patch(CAST.MANAGER, sessionId, {
        version: await storedVersion(),
        resources: [
          { name: "Emsile şerhi", meta: "PDF · 12 sayfa", url: DRIVE },
          { name: "Bina", url: BINA },
        ],
      }).expect(200)
    ).body.resources as IResourceBody[];

  /** What the Müfredat editor sends back for the course it read. */
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
        resources: lesson.resources.map(({ id, name, meta, url }) => ({
          id,
          name,
          meta,
          url,
        })),
      })),
    })),
  });

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
    sessionId = await insertLiveLesson(db(), ids.weekId, 0, {
      title: "Emsile, birinci bab",
      scheduledAt: new Date(Date.now() + 2 * 86_400_000),
      meetingUrl: "https://zoom.us/j/55501",
    });
    sampleId = await insertLiveLesson(db(), ids.weekId, 1, {
      title: "Örnek celse",
      scheduledAt: new Date(Date.now() + 3 * 86_400_000),
      isPreview: true,
      kaynak: "Emsile, s. 1",
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("writing them under session.manage", () => {
    it("adds, renames, reorders and removes a celse's links through PATCH /lessons/:id, keeping the ids of the rows it keeps", async () => {
      const res = await patch(CAST.SESSION, sessionId, {
        version: await storedVersion(),
        resources: [
          { name: "Emsile şerhi", meta: "PDF · 12 sayfa", url: DRIVE },
          { name: "Bina", url: BINA },
          { name: "Maksûd", url: "https://example.org/maksud" },
        ],
      }).expect(200);
      const [emsile, bina, maksud] = res.body.resources as IResourceBody[];
      expect(res.body.resources).toEqual([
        expect.objectContaining({
          lessonId: sessionId,
          name: "Emsile şerhi",
          meta: "PDF · 12 sayfa",
          url: DRIVE,
          orderIndex: 0,
        }),
        expect.objectContaining({ name: "Bina", meta: null, url: BINA }),
        expect.objectContaining({ name: "Maksûd", orderIndex: 2 }),
      ]);

      // Renamed and moved first, the second dropped, the first kept second.
      await patch(CAST.SESSION, sessionId, {
        version: res.body.courseVersion,
        resources: [
          { id: maksud.id, name: "Maksûd şerhi", url: maksud.url },
          { id: emsile.id, name: emsile.name, url: emsile.url },
        ],
      }).expect(200);
      expect(
        (await storedRows(sessionId)).map((r) => [r.id, r.name, r.meta])
      ).toEqual([
        [maksud.id, "Maksûd şerhi", null],
        // Rewritten whole: a line left out is none.
        [emsile.id, "Emsile şerhi", null],
      ]);
      expect((await storedRows(sessionId)).some((r) => r.id === bina.id)).toBe(
        false
      );

      // Left out, the list stays as it is.
      await patch(CAST.SESSION, sessionId, {
        version: await storedVersion(),
        kaynak: "Emsile, s. 4",
      }).expect(200);
      expect(await storedRows(sessionId)).toHaveLength(2);
    });

    it("refuses a ders nazırı holding only course.edit on PATCH /lessons/:id", async () => {
      await patch(CAST.EDIT, sessionId, {
        version: await storedVersion(),
        resources: [{ name: "Emsile", url: DRIVE }],
      }).expect(403);
      expect(await storedRows(sessionId)).toHaveLength(0);
    });

    it("lets a whole-course save send the list back as read with course.edit alone, and asks session.manage to change it", async () => {
      await seedResources();
      const asRead = payloadFrom(await read(CAST.EDIT));
      await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.EDIT))
        .send(asRead)
        .expect(200);

      const renamed = payloadFrom(await read(CAST.EDIT));
      renamed.weeks[0].lessons[0].resources[0].name = "Emsile şerhi (yeni)";
      const version = await storedVersion();
      const refused = await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.EDIT))
        .send(renamed)
        .expect(403);
      expect(refused.body.context).toMatchObject({
        courseId: ids.courseId,
        permission: "session.manage",
      });
      expect(await storedVersion()).toBe(version);
      expect((await storedRows(sessionId))[0].name).toBe("Emsile şerhi");

      await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.EDIT_AND_SESSION))
        .send(renamed)
        .expect(200);
      expect((await storedRows(sessionId))[0].name).toBe("Emsile şerhi (yeni)");
    });

    it("stores the list of a celse a whole-course save adds", async () => {
      const payload = payloadFrom(await read(CAST.MANAGER));
      payload.weeks[0].lessons.push({
        title: "Yeni celse",
        type: "LIVE",
        isPreview: false,
        resources: [{ name: "Emsile", url: DRIVE }],
      } as (typeof payload.weeks)[number]["lessons"][number]);
      const saved = await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .send(payload)
        .expect(200);
      const added = (saved.body as ICourseBody).weeks[0].lessons.find(
        (l) => l.title === "Yeni celse"
      );
      expect(added?.resources).toEqual([
        expect.objectContaining({ name: "Emsile", url: DRIVE, orderIndex: 0 }),
      ]);
    });
  });

  // The acceptance criterion: the API refuses a link that is not an absolute
  // http(s) address, exactly as it refuses one for a course resource.
  describe("the link is checked as a course resource's is (MDRS-279)", () => {
    it.each([
      "javascript:alert(document.cookie)",
      "drive.google.com/file/d/1a2b3c/view",
      "/bina.pdf",
      "ftp://files.medaris.test/bina.pdf",
    ])("refuses %s with a 400 naming the field, on PATCH and in a whole-course save", async (url) => {
      const version = await storedVersion();
      const patched = await patch(CAST.MANAGER, sessionId, {
        version,
        resources: [{ name: "Bina", url }],
      }).expect(400);
      expect(patched.body.context.errors).toEqual([
        expect.objectContaining({
          property: "resources.0.url",
          constraints: { isUrl: "url must be an http:// or https:// URL" },
        }),
      ]);

      const payload = payloadFrom(await read(CAST.MANAGER));
      payload.weeks[0].lessons[0].resources = [
        { name: "Bina", url } as IResourceBody,
      ];
      const saved = await http()
        .put(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .send(payload)
        .expect(400);
      expect(saved.body.context.errors).toEqual([
        expect.objectContaining({
          property: "weeks.0.lessons.0.resources.0.url",
          constraints: { isUrl: "url must be an http:// or https:// URL" },
        }),
      ]);
      expect(await storedRows(sessionId)).toHaveLength(0);
      expect(await storedVersion()).toBe(version);
    });

    it("refuses a link longer than 500 characters, a row without one, and a list sent as null", async () => {
      const version = await storedVersion();
      const long = `https://example.org/${"a".repeat(481)}`;
      expect(long).toHaveLength(501);
      const tooLong = await patch(CAST.MANAGER, sessionId, {
        version,
        resources: [{ name: "Uzun", url: long }],
      }).expect(400);
      expect(tooLong.body.context.errors).toEqual([
        expect.objectContaining({
          property: "resources.0.url",
          constraints: {
            maxLength: "url must be shorter than or equal to 500 characters",
          },
        }),
      ]);
      const missing = await patch(CAST.MANAGER, sessionId, {
        version,
        resources: [{ name: "Adsız" }],
      }).expect(400);
      expect(missing.body.context.errors).toEqual([
        expect.objectContaining({ property: "resources.0.url" }),
      ]);
      await patch(CAST.MANAGER, sessionId, {
        version,
        resources: null,
      }).expect(400);
      // Exactly 500 is taken.
      await patch(CAST.MANAGER, sessionId, {
        version,
        resources: [{ name: "Sınırda", url: long.slice(0, 500) }],
      }).expect(200);
    });
  });

  // The acceptance criterion: a caller who may not read the course content
  // sees the names and not the links, as for the course's resources.
  describe("reading them", () => {
    beforeEach(async () => {
      await seedResources();
      await patch(CAST.MANAGER, sampleId, {
        version: await storedVersion(),
        resources: [{ name: "Örnek metin", url: DRIVE }],
      }).expect(200);
    });

    it("gives the enrolled talebe and the course team every link, on the course page and on the session page", async () => {
      for (const sub of [CAST.TALEBE, CAST.MUDERRIS, CAST.MANAGER]) {
        const course = await read(sub);
        expect(course.contentLocked).toBe(false);
        expect(
          lessonOf(course, sessionId).resources.map((r) => [r.name, r.url])
        ).toEqual([
          ["Emsile şerhi", DRIVE],
          ["Bina", BINA],
        ]);
        const session = await http()
          .get(`/courses/${ids.courseId}/sessions/${sessionId}`)
          .set("Authorization", bearerOf(sub))
          .expect(200);
        expect(
          (session.body.resources as IResourceBody[]).map((r) => r.url)
        ).toEqual([DRIVE, BINA]);
      }
    });

    it("gives a pending talebe, a stranger and a visitor with no token the names and lines, and no link, a sample celse's included", async () => {
      for (const sub of [CAST.PENDING, CAST.STRANGER, undefined]) {
        const course = await read(sub);
        expect(course.contentLocked).toBe(true);
        expect(lessonOf(course, sessionId).resources).toEqual([
          expect.objectContaining({
            name: "Emsile şerhi",
            meta: "PDF · 12 sayfa",
            orderIndex: 0,
          }),
          expect.objectContaining({ name: "Bina", meta: null, orderIndex: 1 }),
        ]);
        const sample = lessonOf(course, sampleId);
        expect(sample.kaynak).toBe("Emsile, s. 1");
        expect(sample.resources.map((r) => r.name)).toEqual(["Örnek metin"]);

        const call = http().get(
          `/courses/${ids.courseId}/sessions/${sessionId}`
        );
        if (sub) call.set("Authorization", bearerOf(sub));
        const session = (await call.expect(200)).body;
        expect(session.contentLocked).toBe(true);
        expect(
          (session.resources as IResourceBody[]).map((r) => r.name)
        ).toEqual(["Emsile şerhi", "Bina"]);

        for (const row of [
          ...lessonOf(course, sessionId).resources,
          ...sample.resources,
          ...session.resources,
        ]) {
          expect(row).not.toHaveProperty("url");
        }
        expect(JSON.stringify([course, session])).not.toContain(
          "drive.google.com"
        );
      }
    });
  });

  // The acceptance criterion: archiving and purging a lesson keeps working.
  describe("hiding and deleting the celse", () => {
    beforeEach(async () => {
      await seedResources();
    });

    it("keeps the links of a hidden celse, and brings them back with it", async () => {
      await http()
        .delete(`/lessons/${sessionId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      expect(await storedRows(sessionId)).toHaveLength(2);
      expect(
        (await read(CAST.MANAGER)).weeks
          .flatMap((w) => w.lessons)
          .some((l) => l.id === sessionId)
      ).toBe(false);

      await http()
        .post(`/archive/session/${sessionId}/restore`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      expect(
        lessonOf(await read(CAST.MANAGER), sessionId).resources.map(
          (r) => r.name
        )
      ).toEqual(["Emsile şerhi", "Bina"]);
    });

    it("deletes a hidden celse for real with its links, from the platform archive", async () => {
      await http()
        .delete(`/lessons/${sessionId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      await http()
        .delete(`/archive/session/${sessionId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(204);
      expect(
        await db().select().from(lessons).where(eq(lessons.id, sessionId))
      ).toHaveLength(0);
      expect(await storedRows(sessionId)).toHaveLength(0);
    });

    it("deletes a hidden week for real with its celses' links", async () => {
      await http()
        .post(`/courses/${ids.courseId}/weeks/${ids.weekId}/hide`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      await http()
        .delete(`/archive/week/${ids.weekId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(204);
      expect(await storedRows(sessionId)).toHaveLength(0);
    });

    it("deletes the course for real with every celse's links, hidden celses included", async () => {
      await http()
        .delete(`/lessons/${sessionId}`)
        .set("Authorization", bearerOf(CAST.MANAGER))
        .expect(200);
      await patch(CAST.MANAGER, sampleId, {
        version: await storedVersion(),
        resources: [{ name: "Örnek metin", url: DRIVE }],
      }).expect(200);
      await http()
        .delete(`/courses/${ids.courseId}`)
        .set("Authorization", bearerOf(CAST.ADMIN))
        .expect(200);
      expect(
        await db().select().from(courses).where(eq(courses.id, ids.courseId))
      ).toHaveLength(0);
      expect(await db().select().from(lessonResources)).toHaveLength(0);
    });
  });
});
