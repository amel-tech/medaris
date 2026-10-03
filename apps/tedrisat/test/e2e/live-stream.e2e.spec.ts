import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
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
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../../src/database/schema/permission.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-228 — `PUT /lessons/:id/live-stream` and `GET /courses/:id/live-streams`:
 * the course staff set a session's YouTube stream link, and the enrolled
 * talebe then gets it from the session page while the session is live
 * (MDRS-162). The parser itself is unit-tested in libs/utils
 * (`test/youtube-live.spec.ts`); this covers the guard, the permission
 * `session.live_link` for every way it is held, the lesson's state, the audit
 * row and the round trip to the talebe.
 */

const MANAGER_ID = "e2280000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "e2280000-0000-4000-8000-000000000002";
const NAZIR_ID = "e2280000-0000-4000-8000-000000000003";
const OTHER_NAZIR_ID = "e2280000-0000-4000-8000-000000000004";
const GROUP_NAZIR_ID = "e2280000-0000-4000-8000-000000000005";
const EXPIRED_NAZIR_ID = "e2280000-0000-4000-8000-000000000006";
const TALEBE_ID = "e2280000-0000-4000-8000-000000000007";
const STRANGER_ID = "e2280000-0000-4000-8000-000000000008";
const ADMIN_ID = "e2280000-0000-4000-8000-000000000009";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const VIDEO_ID = "dQw4w9WgXcQ";
const STUDIO_LINK = `https://studio.youtube.com/video/${VIDEO_ID}/livestreaming`;
const STORED = `https://www.youtube.com/live/${VIDEO_ID}`;
const OTHER_ID = "jNQXAC9IVRw";
const OTHER_STORED = `https://www.youtube.com/live/${OTHER_ID}`;

describe("a session's live stream link (MDRS-228, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let liveLessonId: string;
  let laterLessonId: string;
  let videoLessonId: string;
  let cancelledLessonId: string;
  let archivedLessonId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) =>
    sub === ADMIN_ID
      ? bearerFor({
          sub,
          claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
        })
      : bearerFor({ sub });

  const put = (lessonId: string, sub: string, body: unknown) =>
    http()
      .put(`/lessons/${lessonId}/live-stream`)
      .set("Authorization", as(sub))
      .send(body as object);

  const storedUrl = async (lessonId: string) => {
    const [row] = await db()
      .select({ url: lessons.liveStreamUrl })
      .from(lessons)
      .where(eq(lessons.id, lessonId));
    return row?.url ?? null;
  };

  const auditRows = (lessonId: string) =>
    db()
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entity, "lesson"), eq(auditLog.entityId, lessonId))
      )
      .orderBy(auditLog.seq);

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
      title: "Celse",
      type: LessonType.LIVE,
      durationMinutes: 60,
    };
    [
      { id: liveLessonId },
      { id: laterLessonId },
      { id: videoLessonId },
      { id: cancelledLessonId },
      { id: archivedLessonId },
    ] = await db()
      .insert(lessons)
      .values([
        {
          ...base,
          orderIndex: 0,
          title: "Canlı",
          scheduledAt: new Date(Date.now() - 14 * 60_000),
        },
        {
          ...base,
          orderIndex: 1,
          title: "Yarın",
          scheduledAt: new Date(Date.now() + 24 * 3_600_000),
        },
        { ...base, orderIndex: 2, title: "Video", type: LessonType.VIDEO },
        {
          ...base,
          orderIndex: 3,
          title: "İptal",
          scheduledAt: new Date(Date.now() + 48 * 3_600_000),
          cancelledAt: new Date(),
        },
        {
          ...base,
          orderIndex: 4,
          title: "Arşiv",
          scheduledAt: new Date(Date.now() + 72 * 3_600_000),
          archivedAt: new Date(),
        },
      ])
      .returning();

    // Ders nazırları (MDRS-172): the post, and what they were given with it.
    for (const id of [
      NAZIR_ID,
      OTHER_NAZIR_ID,
      GROUP_NAZIR_ID,
      EXPIRED_NAZIR_ID,
    ]) {
      await assignRole(db(), {
        userId: id,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
        grantedBy: MANAGER_ID,
      });
    }
    const [group] = await db()
      .insert(permissionGroups)
      .values({
        scopeType: "course",
        scopeId: courseId,
        name: "Yayın",
        createdBy: MUDERRIS_ID,
      })
      .returning();
    await db()
      .insert(permissionGroupItems)
      .values([
        { groupId: group.id, permission: "session.live_link" },
        { groupId: group.id, permission: "session.manage" },
      ]);
    const grant = { scopeType: "course" as const, grantedBy: MANAGER_ID };
    await db()
      .insert(permissionGrants)
      .values([
        {
          ...grant,
          userId: NAZIR_ID,
          scopeId: courseId,
          permission: "session.live_link",
        },
        {
          ...grant,
          userId: OTHER_NAZIR_ID,
          scopeId: courseId,
          permission: "session.manage",
        },
        {
          ...grant,
          userId: GROUP_NAZIR_ID,
          scopeId: courseId,
          groupId: group.id,
        },
        {
          ...grant,
          userId: EXPIRED_NAZIR_ID,
          scopeId: courseId,
          permission: "session.live_link",
          expiresAt: new Date(Date.now() - 60_000),
        },
      ]);

    await db().insert(enrollments).values({
      userId: TALEBE_ID,
      courseId,
      status: EnrollmentStatus.ENROLLED,
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("PUT /lessons/:id/live-stream", () => {
    it("stores a YouTube Studio link as the /live/ link and audits it", async () => {
      const res = await put(liveLessonId, MUDERRIS_ID, {
        liveStreamUrl: STUDIO_LINK,
      }).expect(200);
      expect(res.body).toEqual({
        lessonId: liveLessonId,
        liveStreamUrl: STORED,
      });
      expect(await storedUrl(liveLessonId)).toBe(STORED);

      const [entry] = await auditRows(liveLessonId);
      expect(entry).toMatchObject({
        actorId: MUDERRIS_ID,
        action: "lesson.live_stream_set",
        details: { courseId, liveStreamUrl: STORED, previous: null },
      });
    });

    it("changes the link, then clears it with null, each change audited", async () => {
      await put(liveLessonId, MUDERRIS_ID, {
        liveStreamUrl: STUDIO_LINK,
      }).expect(200);
      const changed = await put(liveLessonId, MANAGER_ID, {
        liveStreamUrl: `https://youtu.be/${OTHER_ID}`,
      }).expect(200);
      expect(changed.body.liveStreamUrl).toBe(OTHER_STORED);
      expect(await storedUrl(liveLessonId)).toBe(OTHER_STORED);

      const cleared = await put(liveLessonId, MANAGER_ID, {
        liveStreamUrl: null,
      }).expect(200);
      expect(cleared.body).toEqual({
        lessonId: liveLessonId,
        liveStreamUrl: null,
      });
      expect(await storedUrl(liveLessonId)).toBeNull();

      const rows = await auditRows(liveLessonId);
      expect(rows.map((r) => [r.action, r.details])).toEqual([
        [
          "lesson.live_stream_set",
          { courseId, liveStreamUrl: STORED, previous: null },
        ],
        [
          "lesson.live_stream_set",
          { courseId, liveStreamUrl: OTHER_STORED, previous: STORED },
        ],
        [
          "lesson.live_stream_clear",
          { courseId, liveStreamUrl: null, previous: OTHER_STORED },
        ],
      ]);
    });

    it("does not change the course version", async () => {
      const read = async () =>
        (
          await db()
            .select({ version: courses.version })
            .from(courses)
            .where(eq(courses.id, courseId))
        )[0]?.version;
      const before = await read();
      await put(liveLessonId, MUDERRIS_ID, {
        liveStreamUrl: STUDIO_LINK,
      }).expect(200);
      expect(await read()).toBe(before);
    });

    it.each([
      [
        "a channel's live page",
        "https://www.youtube.com/@ismailaga/live",
        "channel",
      ],
      [
        "a channel id link",
        "https://www.youtube.com/channel/UC1234567890",
        "channel",
      ],
      ["another host", "https://vimeo.com/123456789", "not-youtube"],
      [
        "a plain http link",
        `http://www.youtube.com/watch?v=${VIDEO_ID}`,
        "not-https",
      ],
      [
        "a YouTube page with no video",
        "https://www.youtube.com/feed/subscriptions",
        "no-video",
      ],
    ])("refuses %s with 400 LIVE_STREAM_URL_INVALID", async (_name, url, problem) => {
      const res = await put(liveLessonId, MUDERRIS_ID, {
        liveStreamUrl: url,
      }).expect(400);
      expect(res.body.code).toBe("LIVE_STREAM_URL_INVALID");
      expect(res.body.context).toEqual({ problem });
      expect(await storedUrl(liveLessonId)).toBeNull();
      expect(await auditRows(liveLessonId)).toHaveLength(0);
    });

    it("says a channel link needs a video link instead", async () => {
      const res = await put(liveLessonId, MUDERRIS_ID, {
        liveStreamUrl: "https://www.youtube.com/@ismailaga/live",
      }).expect(400);
      expect(res.body.message).toContain("video link is needed");
    });

    it.each([
      ["a missing key", {}],
      ["a number", { liveStreamUrl: 42 }],
      [
        "a link over 500 characters",
        { liveStreamUrl: `https://youtu.be/${"a".repeat(500)}` },
      ],
    ])("refuses %s with 400", async (_name, body) => {
      await put(liveLessonId, MUDERRIS_ID, body).expect(400);
      expect(await storedUrl(liveLessonId)).toBeNull();
    });

    it.each([
      ["a ders nazırı given session.live_link", NAZIR_ID],
      ["a ders nazırı given a group that names it", GROUP_NAZIR_ID],
      ["the köşk nazımı", MANAGER_ID],
      ["the başnazım", ADMIN_ID],
    ])("lets %s set it", async (_name, sub) => {
      await put(laterLessonId, sub, { liveStreamUrl: STUDIO_LINK }).expect(200);
      expect(await storedUrl(laterLessonId)).toBe(STORED);
    });

    it.each([
      ["an enrolled talebe", TALEBE_ID],
      ["a stranger", STRANGER_ID],
      ["a ders nazırı given only another permission", OTHER_NAZIR_ID],
      ["a ders nazırı whose grant has lapsed", EXPIRED_NAZIR_ID],
    ])("refuses %s with 403, before reading the link", async (_name, sub) => {
      for (const liveStreamUrl of [STUDIO_LINK, "https://vimeo.com/1", null]) {
        const res = await put(liveLessonId, sub, { liveStreamUrl }).expect(403);
        expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      }
      expect(await storedUrl(liveLessonId)).toBeNull();
      expect(await auditRows(liveLessonId)).toHaveLength(0);
    });

    it("refuses a lesson that is not a live session with 409 LESSON_NOT_LIVE", async () => {
      const res = await put(videoLessonId, MUDERRIS_ID, {
        liveStreamUrl: STUDIO_LINK,
      }).expect(409);
      expect(res.body.code).toBe("LESSON_NOT_LIVE");
    });

    it("refuses a cancelled session with 409 LESSON_CANCELLED", async () => {
      const res = await put(cancelledLessonId, MUDERRIS_ID, {
        liveStreamUrl: STUDIO_LINK,
      }).expect(409);
      expect(res.body.code).toBe("LESSON_CANCELLED");
      expect(await storedUrl(cancelledLessonId)).toBeNull();
    });

    it("answers 404 for a lesson that is archived or not there", async () => {
      for (const id of [archivedLessonId, ABSENT_ID, "not-a-uuid"]) {
        const res = await put(id, MUDERRIS_ID, {
          liveStreamUrl: STUDIO_LINK,
        }).expect(404);
        expect(res.body.code).toBe("LESSON_NOT_FOUND");
      }
    });

    it("needs a token", async () => {
      await http()
        .put(`/lessons/${liveLessonId}/live-stream`)
        .send({ liveStreamUrl: STUDIO_LINK })
        .expect(401);
    });
  });

  describe("what the talebe then sees", () => {
    const session = (id: string) => `/courses/${courseId}/sessions/${id}`;

    it("gives the enrolled talebe the stored link while the session is LIVE, and nobody locked out", async () => {
      await put(liveLessonId, NAZIR_ID, { liveStreamUrl: STUDIO_LINK }).expect(
        200
      );

      const talebe = await http()
        .get(session(liveLessonId))
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(talebe.body.status).toBe("LIVE");
      expect(talebe.body.liveStreamUrl).toBe(STORED);

      for (const token of [undefined, as(STRANGER_ID)]) {
        const req = http().get(session(liveLessonId));
        const res = await (token
          ? req.set("Authorization", token)
          : req
        ).expect(200);
        expect(res.body).not.toHaveProperty("liveStreamUrl");
        expect(JSON.stringify(res.body)).not.toContain(VIDEO_ID);
      }
    });

    it("gives no link once it is cleared", async () => {
      await put(liveLessonId, MUDERRIS_ID, {
        liveStreamUrl: STUDIO_LINK,
      }).expect(200);
      await put(liveLessonId, MUDERRIS_ID, { liveStreamUrl: null }).expect(200);
      const res = await http()
        .get(session(liveLessonId))
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(res.body.liveStreamUrl).toBeNull();
    });
  });

  describe("GET /courses/:id/live-streams", () => {
    const list = (sub: string, id = courseId) =>
      http().get(`/courses/${id}/live-streams`).set("Authorization", as(sub));

    beforeEach(async () => {
      await put(laterLessonId, MUDERRIS_ID, {
        liveStreamUrl: `https://youtu.be/${OTHER_ID}`,
      }).expect(200);
      await put(liveLessonId, MUDERRIS_ID, {
        liveStreamUrl: STUDIO_LINK,
      }).expect(200);
    });

    it.each([
      ["the müderris", MUDERRIS_ID],
      ["the köşk nazımı", MANAGER_ID],
      ["a ders nazırı given session.live_link", NAZIR_ID],
      ["the başnazım", ADMIN_ID],
    ])("lists the links in programme order to %s", async (_name, sub) => {
      const res = await list(sub).expect(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.body).toEqual([
        { lessonId: liveLessonId, liveStreamUrl: STORED },
        { lessonId: laterLessonId, liveStreamUrl: OTHER_STORED },
      ]);
    });

    it.each([
      ["an enrolled talebe", TALEBE_ID],
      ["a stranger", STRANGER_ID],
      ["a ders nazırı given only another permission", OTHER_NAZIR_ID],
    ])("refuses %s with 403", async (_name, sub) => {
      const res = await list(sub).expect(403);
      expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      expect(JSON.stringify(res.body)).not.toContain(VIDEO_ID);
    });

    it("answers 404 for a course that is not there", async () => {
      await list(MUDERRIS_ID, ABSENT_ID).expect(404);
      await list(ADMIN_ID, ABSENT_ID).expect(404);
    });
  });
});
