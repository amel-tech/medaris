import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import {
  BUNNY_VIDEO_STATUS,
  embedViewToken,
} from "../../src/bunny-stream/bunny-signature";
import {
  BUNNY_STREAM_CONFIG,
  BUNNY_STREAM_FETCH,
} from "../../src/bunny-stream/bunny-stream.client";
import type { IBunnyStreamConfig } from "../../src/config/bunny-stream-env";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "../../src/course/domain/recording";
import { RecordingEncodingPoller } from "../../src/course/recording-encoding.poller";
import { RecordingReleasePoller } from "../../src/course/recording-release.poller";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courses,
  courseWeeks,
  enrollments,
  lessonRecordings,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-288 — the course team sets, per celse, when talebe may watch its
 * recording. Every read that hands out a recording is checked on a fixed
 * clock (only `Date` is faked): before the time a talebe or a visitor gets
 * the recording with its `availableAt` and neither its link nor a signed
 * Bunny link; at the time, with nothing else saved, they get both. The
 * course team plays it before. "Kayıt eklendi" goes once, at the time, from
 * the release poll called with that clock. The rule itself is unit-tested
 * (test/unit/course/recording.spec.ts).
 */

const MANAGER_ID = "e2880000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "e2880000-0000-4000-8000-000000000002";
const TALEBE_ID = "e2880000-0000-4000-8000-000000000003";
const STRANGER_ID = "e2880000-0000-4000-8000-000000000004";
const ADMIN_ID = "e2880000-0000-4000-8000-000000000005";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const HOUR = 3_600_000;
/** The fixed clock: the next full hour, so the database's own clock is near it. */
const T0 = new Date(Math.ceil(Date.now() / HOUR) * HOUR);
/** The release time the course team set on two sessions. */
const RELEASE = new Date(T0.getTime() + 2 * HOUR);
const LATER = new Date(T0.getTime() + 4 * HOUR);

const LIBRARY: IBunnyStreamConfig = {
  libraryId: "424242",
  apiKey: "e2e-library-api-key",
  tokenKey: "e2e-token-key",
  embedLifetimeSeconds: 6 * 3600,
  collectionId: null,
};
const VIDEO = "b2880000-0000-4000-8000-000000000001";
const UPLOAD_VIDEO = "b2880000-0000-4000-8000-000000000002";
const PUBLIC_URL = "https://www.youtube.com/watch?v=public288";
const OPEN_URL = "https://drive.google.com/file/d/open288/view";
const STREAM = "https://www.youtube.com/live/stream288";
const DRIVE = "https://drive.google.com/file/d/new288/view";
const PLAYER = new RegExp(
  `^https://player\\.mediadelivery\\.net/embed/${LIBRARY.libraryId}/([0-9a-f-]{36})\\?token=([0-9a-f]{64})&expires=(\\d+)$`
);

/** A player link signed for `video` with the library's token key, on the faked clock. */
function expectSigned(url: unknown, video: string) {
  const match = PLAYER.exec(String(url));
  expect(match, `not a signed player link: ${url}`).not.toBeNull();
  const [, id, token, expires] = match as RegExpExecArray;
  expect(id).toBe(video);
  expect(Number(expires)).toBeGreaterThan(Date.now() / 1000);
  expect(token).toBe(
    embedViewToken(LIBRARY.tokenKey ?? "", video, Number(expires))
  );
}

/** No link of a held-back recording anywhere in a body, signed or pasted. */
function expectNoHeldLink(body: unknown) {
  const text = JSON.stringify(body);
  expect(text).not.toContain("mediadelivery.net");
  expect(text).not.toContain(VIDEO);
  expect(text).not.toContain(PUBLIC_URL);
}

interface IListed {
  lessonId: string;
  url: string | null;
  status: string;
  availableAt: string | null;
}

describe("the recording release time (MDRS-288, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  /** Get Video answers of the stub library, by video id. */
  const videos = new Map<string, { status: number; length: number }>();

  let courseId: string;
  let heldLessonId: string;
  let publicLessonId: string;
  let openLessonId: string;
  let emptyLessonId: string;
  let uploadLessonId: string;

  const db = () => databaseService.db;
  const as = (sub: string) =>
    sub === ADMIN_ID
      ? bearerFor({
          sub,
          claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
        })
      : bearerFor({ sub });
  const get = (path: string, sub: string | null) => {
    const req = request(app.getHttpServer()).get(path);
    return sub ? req.set("Authorization", as(sub)) : req;
  };
  const list = async (sub: string | null): Promise<IListed[]> =>
    (await get(`/courses/${courseId}/recordings`, sub).expect(200)).body;
  const session = async (lessonId: string, sub: string | null) =>
    (await get(`/courses/${courseId}/sessions/${lessonId}`, sub).expect(200))
      .body;
  const of = (rows: IListed[], lessonId: string) => {
    const row = rows.find((r) => r.lessonId === lessonId);
    expect(row, `no recording of ${lessonId}`).toBeDefined();
    return row as IListed;
  };
  const setAvailability = (lessonId: string, sub: string, body: unknown) =>
    request(app.getHttpServer())
      .put(`/lessons/${lessonId}/recording-availability`)
      .set("Authorization", as(sub))
      .send(body as object);

  /** The "Kayıt eklendi" rows written so far, as their sessions, sorted. */
  const told = async () =>
    (
      await db()
        .select()
        .from(notifications)
        .where(eq(notifications.type, "RECORDING_ADDED"))
    )
      .map((n) => {
        expect(n.userId).toBe(TALEBE_ID);
        return n.targetId;
      })
      .sort();
  const release = () => app.get(RecordingReleasePoller);

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: BUNNY_STREAM_CONFIG, useValue: LIBRARY },
        {
          provide: BUNNY_STREAM_FETCH,
          useValue: async (input: string | URL | Request) => {
            const url = String(input);
            const video = videos.get(url.slice(url.lastIndexOf("/") + 1));
            return video
              ? new Response(JSON.stringify(video), { status: 200 })
              : new Response("{}", { status: 404 });
          },
        },
      ],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    videos.clear();
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "notifications",
      "audit_log",
      "users"
    );
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
    });
    const [course] = await db()
      .insert(courses)
      .values({
        koskId: kosk.id,
        authorId: MANAGER_ID,
        title: "Emsile ve Bina",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseId = course.id;
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: MANAGER_ID,
    });
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Emsile", orderIndex: 0 })
      .returning();
    const base = {
      weekId: week.id,
      type: LessonType.LIVE,
      durationMinutes: 60,
    };
    [
      { id: heldLessonId },
      { id: publicLessonId },
      { id: openLessonId },
      { id: emptyLessonId },
      { id: uploadLessonId },
    ] = await db()
      .insert(lessons)
      .values([
        {
          ...base,
          orderIndex: 0,
          title: "Bir",
          // Over two hours ago, streamed: the stream is still sent while
          // the recording waits (MDRS-285 on MDRS-288).
          scheduledAt: new Date(T0.getTime() - 3 * HOUR),
          liveStreamUrl: STREAM,
          recordingAvailableAt: RELEASE,
        },
        {
          ...base,
          orderIndex: 1,
          title: "İki",
          scheduledAt: new Date(T0.getTime() - 48 * HOUR),
          // A sample session: a visitor reads its PUBLIC recording on its page.
          isPreview: true,
          recordingAvailableAt: RELEASE,
        },
        {
          ...base,
          orderIndex: 2,
          title: "Üç",
          scheduledAt: new Date(T0.getTime() - 72 * HOUR),
        },
        {
          ...base,
          orderIndex: 3,
          title: "Dört",
          scheduledAt: new Date(T0.getTime() - HOUR),
        },
        {
          ...base,
          orderIndex: 4,
          title: "Beş",
          scheduledAt: new Date(T0.getTime() - 2 * HOUR),
          recordingAvailableAt: RELEASE,
        },
      ])
      .returning();
    await db()
      .insert(lessonRecordings)
      .values([
        {
          lessonId: heldLessonId,
          title: "Bir: celse kaydı",
          provider: RecordingProvider.BUNNY,
          url: null,
          bunnyVideoId: VIDEO,
          uploadExpiresAt: new Date(T0.getTime() - HOUR),
          visibility: RecordingVisibility.ENROLLED,
          status: RecordingStatus.READY,
        },
        {
          lessonId: publicLessonId,
          title: "İki: celse kaydı",
          provider: RecordingProvider.YOUTUBE,
          url: PUBLIC_URL,
          visibility: RecordingVisibility.PUBLIC,
          status: RecordingStatus.READY,
        },
        {
          lessonId: openLessonId,
          title: "Üç: celse kaydı",
          provider: RecordingProvider.DRIVE,
          url: OPEN_URL,
          visibility: RecordingVisibility.ENROLLED,
          status: RecordingStatus.READY,
        },
      ]);
    await db().insert(enrollments).values({
      userId: TALEBE_ID,
      courseId,
      status: EnrollmentStatus.ENROLLED,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "notifications",
      "audit_log",
      "users"
    );
    await app.close();
  });

  describe("every read, on a fixed clock", () => {
    it("GET /courses/:id/recordings gives a talebe neither link before the time, and both at it", async () => {
      const early = await list(TALEBE_ID);
      expect(of(early, heldLessonId)).toMatchObject({
        status: "READY",
        availableAt: RELEASE.toISOString(),
        url: null,
      });
      expect(of(early, publicLessonId)).toMatchObject({
        availableAt: RELEASE.toISOString(),
        url: null,
      });
      // "Hazır olunca hemen" is today's behaviour.
      expect(of(early, openLessonId)).toMatchObject({
        availableAt: null,
        url: OPEN_URL,
      });
      expectNoHeldLink(early);

      vi.setSystemTime(RELEASE);
      const due = await list(TALEBE_ID);
      expectSigned(of(due, heldLessonId).url, VIDEO);
      expect(of(due, publicLessonId).url).toBe(PUBLIC_URL);
    });

    it("the session page, which the watch page reads, gives a talebe neither link before the time and keeps the stream, then both at it and no stream", async () => {
      const early = await session(heldLessonId, TALEBE_ID);
      expect(early.recording).toMatchObject({
        status: "READY",
        availableAt: RELEASE.toISOString(),
        url: null,
      });
      expect(early.liveStreamUrl).toBe(STREAM);
      expectNoHeldLink(early);

      vi.setSystemTime(RELEASE);
      const due = await session(heldLessonId, TALEBE_ID);
      expectSigned(due.recording.url, VIDEO);
      expect(due.liveStreamUrl).toBeNull();
    });

    it("gives a visitor the same for a PUBLIC recording, on the list and on its sample session's page", async () => {
      const early = await list(null);
      expect(early.map((r) => r.lessonId)).toEqual([publicLessonId]);
      expect(early[0]).toMatchObject({
        availableAt: RELEASE.toISOString(),
        url: null,
      });
      const page = await session(publicLessonId, null);
      expect(page.contentLocked).toBe(true);
      expect(page.recording).toMatchObject({
        availableAt: RELEASE.toISOString(),
        url: null,
      });
      expectNoHeldLink([early, page]);

      vi.setSystemTime(RELEASE);
      expect((await list(null))[0].url).toBe(PUBLIC_URL);
      expect((await session(publicLessonId, null)).recording.url).toBe(
        PUBLIC_URL
      );
    });

    it("GET /courses/:id carries no recording link, and the release time to content readers only", async () => {
      const lessonOf = (body: {
        weeks: { lessons: Record<string, unknown>[] }[];
      }) =>
        new Map(body.weeks[0].lessons.map((l) => [l.id as string, l] as const));

      const talebe = (await get(`/courses/${courseId}`, TALEBE_ID).expect(200))
        .body;
      expect(lessonOf(talebe).get(heldLessonId)).toMatchObject({
        recordingAvailableAt: RELEASE.toISOString(),
      });
      expect(lessonOf(talebe).get(openLessonId)).toMatchObject({
        recordingAvailableAt: null,
      });
      expectNoHeldLink(talebe);

      const visitor = (await get(`/courses/${courseId}`, null).expect(200))
        .body;
      for (const lesson of lessonOf(visitor).values()) {
        expect(lesson).not.toHaveProperty("recordingAvailableAt");
      }
      expectNoHeldLink(visitor);
    });

    it.each([
      ["the müderris", MUDERRIS_ID],
      ["the köşk nazımı", MANAGER_ID],
      ["the başnazım", ADMIN_ID],
    ])("lets %s see and play it before the time", async (_name, sub) => {
      const rows = await list(sub);
      expect(of(rows, heldLessonId).availableAt).toBe(RELEASE.toISOString());
      expectSigned(of(rows, heldLessonId).url, VIDEO);
      expect(of(rows, publicLessonId).url).toBe(PUBLIC_URL);
      const page = await session(heldLessonId, sub);
      expectSigned(page.recording.url, VIDEO);
    });
  });

  describe('the setting and "Kayıt eklendi"', () => {
    it("PUT /lessons/:id/recording-availability sets the time under recording.manage, audited, the course version untouched", async () => {
      const version = async () =>
        (
          await db()
            .select({ version: courses.version })
            .from(courses)
            .where(eq(courses.id, courseId))
        )[0]?.version;
      const before = await version();

      await setAvailability(heldLessonId, TALEBE_ID, {
        availableAt: null,
      }).expect(403);
      await setAvailability(heldLessonId, STRANGER_ID, {
        availableAt: null,
      }).expect(403);
      await setAvailability(heldLessonId, MUDERRIS_ID, {}).expect(400);
      await setAvailability(heldLessonId, MUDERRIS_ID, {
        availableAt: "yarın",
      }).expect(400);
      await setAvailability(ABSENT_ID, ADMIN_ID, { availableAt: null }).expect(
        404
      );

      const res = await setAvailability(heldLessonId, MUDERRIS_ID, {
        availableAt: LATER.toISOString(),
      }).expect(200);
      expect(res.body).toEqual({
        lessonId: heldLessonId,
        recordingAvailableAt: LATER.toISOString(),
      });
      const [row] = await db()
        .select({ at: lessons.recordingAvailableAt })
        .from(lessons)
        .where(eq(lessons.id, heldLessonId));
      expect(row.at).toEqual(LATER);
      expect(await version()).toBe(before);
      const [entry] = await db()
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "lesson.recording_availability_set"),
            eq(auditLog.entityId, heldLessonId)
          )
        );
      expect(entry).toMatchObject({
        actorId: MUDERRIS_ID,
        details: {
          courseId,
          recordingAvailableAt: LATER.toISOString(),
          previous: RELEASE.toISOString(),
        },
      });

      // The köşk nazımı holds it too; null is "Hazır olunca hemen".
      const cleared = await setAvailability(emptyLessonId, MANAGER_ID, {
        availableAt: null,
      }).expect(200);
      expect(cleared.body.recordingAvailableAt).toBeNull();
    });

    it("tells the talebe once, at the time, of a recording added for later, and not at the write", async () => {
      const added = await request(app.getHttpServer())
        .post(`/lessons/${emptyLessonId}/recordings`)
        .set("Authorization", as(MUDERRIS_ID))
        .send({
          title: "Dört: celse kaydı",
          url: DRIVE,
          availableAt: RELEASE.toISOString(),
        })
        .expect(201);
      // The writer is the course team: answered with the link.
      expect(added.body).toMatchObject({
        url: DRIVE,
        availableAt: RELEASE.toISOString(),
      });
      expect(await told()).toEqual([]);
      expect(of(await list(TALEBE_ID), emptyLessonId).url).toBeNull();

      expect(await release().releaseDue(new Date(RELEASE.getTime() - 1))).toBe(
        0
      );
      expect(await told()).toEqual([]);

      expect(await release().releaseDue(RELEASE)).toBe(3);
      expect(await told()).toEqual(
        [heldLessonId, publicLessonId, emptyLessonId].sort()
      );

      // Once: a later pass, a time moved after it fired, or a write that
      // opens it again tells nobody.
      expect(await release().releaseDue(LATER)).toBe(0);
      await setAvailability(emptyLessonId, MUDERRIS_ID, {
        availableAt: new Date(LATER.getTime() + HOUR).toISOString(),
      }).expect(200);
      await setAvailability(emptyLessonId, MUDERRIS_ID, {
        availableAt: null,
      }).expect(200);
      expect(
        await release().releaseDue(new Date(LATER.getTime() + 2 * HOUR))
      ).toBe(0);
      expect(await told()).toHaveLength(3);
    });

    it("moves the announcement with a time moved before it fires", async () => {
      await setAvailability(heldLessonId, MUDERRIS_ID, {
        availableAt: LATER.toISOString(),
      }).expect(200);
      expect(await told()).toEqual([]);

      await release().releaseDue(RELEASE);
      expect(await told()).toEqual([publicLessonId]);

      await release().releaseDue(LATER);
      expect(await told()).toEqual([heldLessonId, publicLessonId].sort());
    });

    it("tells them at once when the time is cleared or moved into the past before it fires", async () => {
      await request(app.getHttpServer())
        .patch(
          `/recordings/${
            (
              await db()
                .select({ id: lessonRecordings.id })
                .from(lessonRecordings)
                .where(eq(lessonRecordings.lessonId, heldLessonId))
            )[0].id
          }`
        )
        .set("Authorization", as(MUDERRIS_ID))
        .send({ availableAt: null })
        .expect(200);
      expect(await told()).toEqual([heldLessonId]);

      await setAvailability(publicLessonId, MANAGER_ID, {
        availableAt: new Date(T0.getTime() - HOUR).toISOString(),
      }).expect(200);
      expect(await told()).toEqual([heldLessonId, publicLessonId].sort());

      expect(await release().releaseDue(LATER)).toBe(0);
      expect(await told()).toHaveLength(2);
    });

    it("tells them of a Bunny upload that turns READY before its time at the time, not at READY", async () => {
      await db()
        .insert(lessonRecordings)
        .values({
          lessonId: uploadLessonId,
          title: "Beş: yükleme",
          provider: RecordingProvider.BUNNY,
          url: null,
          bunnyVideoId: UPLOAD_VIDEO,
          uploadExpiresAt: new Date(T0.getTime() + 24 * HOUR),
          visibility: RecordingVisibility.ENROLLED,
          status: RecordingStatus.PROCESSING,
        });
      videos.set(UPLOAD_VIDEO, {
        status: BUNNY_VIDEO_STATUS.FINISHED,
        length: 1_800,
      });
      expect(await app.get(RecordingEncodingPoller).pollOnce(T0)).toMatchObject(
        { ready: 1 }
      );
      expect(await told()).toEqual([]);
      expect(of(await list(TALEBE_ID), uploadLessonId)).toMatchObject({
        status: "READY",
        url: null,
      });

      await release().releaseDue(RELEASE);
      expect(await told()).toContain(uploadLessonId);
    });
  });
});
