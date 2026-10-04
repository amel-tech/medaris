import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "../../src/course/domain/recording";
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
 * MDRS-247 — `POST /lessons/:id/recordings` and `PATCH /recordings/:id`: the
 * course staff paste a recording link, then rename it, replace the link or
 * change who may watch. The read side is `GET /courses/:id/recordings`
 * (MDRS-162, `recordings.e2e.spec.ts`); the provider and the YouTube rule are
 * unit-tested (`test/unit/course/recording.spec.ts`). This covers the guard,
 * the permission `recording.manage` for every way it is held, the lesson's
 * state, the audit rows and the round trip to the talebe.
 */

const MANAGER_ID = "e2470000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "e2470000-0000-4000-8000-000000000002";
const NAZIR_ID = "e2470000-0000-4000-8000-000000000003";
const OTHER_NAZIR_ID = "e2470000-0000-4000-8000-000000000004";
const GROUP_NAZIR_ID = "e2470000-0000-4000-8000-000000000005";
const EXPIRED_NAZIR_ID = "e2470000-0000-4000-8000-000000000006";
const TALEBE_ID = "e2470000-0000-4000-8000-000000000007";
const STRANGER_ID = "e2470000-0000-4000-8000-000000000008";
const ADMIN_ID = "e2470000-0000-4000-8000-000000000009";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

const ZOOM = "https://us02web.zoom.us/rec/share/abc123";
const DRIVE = "https://drive.google.com/file/d/xyz/view";
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("a session's recording link (MDRS-247, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  let courseId: string;
  let otherCourseId: string;
  let lessonId: string;
  let secondLessonId: string;
  let thirdLessonId: string;
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

  const add = (id: string, sub: string, body: unknown) =>
    http()
      .post(`/lessons/${id}/recordings`)
      .set("Authorization", as(sub))
      .send(body as object);

  const change = (id: string, sub: string, body: unknown) =>
    http()
      .patch(`/recordings/${id}`)
      .set("Authorization", as(sub))
      .send(body as object);

  const stored = (id: string) =>
    db().select().from(lessonRecordings).where(eq(lessonRecordings.id, id));

  const recordingRows = () => db().select().from(lessonRecordings);

  const auditRows = (entityId?: string) =>
    db()
      .select()
      .from(auditLog)
      .where(
        entityId
          ? and(
              eq(auditLog.entity, "lesson_recording"),
              eq(auditLog.entityId, entityId)
            )
          : eq(auditLog.entity, "lesson_recording")
      )
      .orderBy(auditLog.seq);

  const courseVersion = async () =>
    (
      await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, courseId))
    )[0]?.version;

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
    const [course, other] = await db()
      .insert(courses)
      .values([
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Başka ders",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    courseId = course.id;
    otherCourseId = other.id;
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
      { id: lessonId },
      { id: secondLessonId },
      { id: thirdLessonId },
      { id: cancelledLessonId },
      { id: archivedLessonId },
    ] = await db()
      .insert(lessons)
      .values([
        {
          ...base,
          orderIndex: 0,
          title: "Bir",
          scheduledAt: new Date(Date.now() - 48 * 3_600_000),
        },
        {
          ...base,
          orderIndex: 1,
          title: "İki",
          scheduledAt: new Date(Date.now() - 24 * 3_600_000),
        },
        { ...base, orderIndex: 2, title: "Üç" },
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
          scheduledAt: new Date(Date.now() - 72 * 3_600_000),
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
        name: "Kayıtlar",
        createdBy: MUDERRIS_ID,
      })
      .returning();
    await db()
      .insert(permissionGroupItems)
      .values([
        { groupId: group.id, permission: "recording.manage" },
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
          permission: "recording.manage",
        },
        {
          ...grant,
          userId: OTHER_NAZIR_ID,
          scopeId: courseId,
          permission: "session.live_link",
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
          permission: "recording.manage",
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

  describe("POST /lessons/:id/recordings", () => {
    it("stores a pasted link READY, reads its provider off the host, and audits it", async () => {
      const before = await courseVersion();
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "Bir: celse kaydı",
        url: DRIVE,
      }).expect(201);
      expect(res.body).toMatchObject({
        lessonId,
        title: "Bir: celse kaydı",
        provider: RecordingProvider.DRIVE,
        url: DRIVE,
        // visibility is the closed one unless it is asked for
        visibility: RecordingVisibility.ENROLLED,
        status: RecordingStatus.READY,
        weekNumber: 1,
        weekTitle: "Emsile",
        durationMinutes: 60,
      });
      const [row] = await stored(res.body.id);
      expect(row).toMatchObject({
        lessonId,
        provider: RecordingProvider.DRIVE,
        status: RecordingStatus.READY,
      });
      expect(await courseVersion()).toBe(before);

      const [entry] = await auditRows(res.body.id);
      expect(entry).toMatchObject({
        actorId: MUDERRIS_ID,
        action: "recording.add",
        details: {
          courseId,
          lessonId,
          provider: RecordingProvider.DRIVE,
          visibility: RecordingVisibility.ENROLLED,
          url: DRIVE,
        },
      });
    });

    it("reads Zoom and every other host as OTHER, and trims the title and the link", async () => {
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "  Zoom kaydı  ",
        url: `  ${ZOOM}  `,
      }).expect(201);
      expect(res.body).toMatchObject({
        title: "Zoom kaydı",
        url: ZOOM,
        provider: RecordingProvider.OTHER,
      });
    });

    it("takes a YouTube link only as PUBLIC", async () => {
      const refused = await add(lessonId, MUDERRIS_ID, {
        title: "YouTube",
        url: YOUTUBE,
      }).expect(400);
      expect(refused.body.code).toBe("RECORDING_YOUTUBE_PUBLIC_ONLY");
      expect(await recordingRows()).toHaveLength(0);
      expect(await auditRows()).toHaveLength(0);

      const res = await add(lessonId, MUDERRIS_ID, {
        title: "YouTube",
        url: YOUTUBE,
        visibility: "PUBLIC",
      }).expect(201);
      expect(res.body).toMatchObject({
        provider: RecordingProvider.YOUTUBE,
        visibility: RecordingVisibility.PUBLIC,
      });
    });

    it("gives the enrolled talebe the link, and a stranger none while it is ENROLLED", async () => {
      await add(lessonId, MUDERRIS_ID, { title: "Kayıt", url: ZOOM }).expect(
        201
      );
      const talebe = await http()
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(TALEBE_ID))
        .expect(200);
      expect(talebe.body).toHaveLength(1);
      expect(talebe.body[0]).toMatchObject({ url: ZOOM, status: "READY" });

      const stranger = await http()
        .get(`/courses/${courseId}/recordings`)
        .set("Authorization", as(STRANGER_ID))
        .expect(200);
      expect(stranger.body).toEqual([]);
    });

    it.each([
      ["a missing title", { url: ZOOM }],
      ["an empty title", { title: "   ", url: ZOOM }],
      ["a title over 200 characters", { title: "a".repeat(201), url: ZOOM }],
      ["a missing link", { title: "Kayıt" }],
      ["a plain http link", { title: "Kayıt", url: "http://zoom.us/rec/1" }],
      ["not a link", { title: "Kayıt", url: "kayit" }],
      [
        "a link over 500 characters",
        { title: "Kayıt", url: `https://zoom.us/${"a".repeat(500)}` },
      ],
      ["another visibility", { title: "Kayıt", url: ZOOM, visibility: "ALL" }],
    ])("refuses %s with 400", async (_name, body) => {
      await add(lessonId, MUDERRIS_ID, body).expect(400);
      expect(await recordingRows()).toHaveLength(0);
    });

    it.each([
      ["a ders nazırı given recording.manage", NAZIR_ID],
      ["a ders nazırı given a group that names it", GROUP_NAZIR_ID],
      ["the köşk nazımı", MANAGER_ID],
      ["the başnazım", ADMIN_ID],
    ])("lets %s add one", async (_name, sub) => {
      await add(secondLessonId, sub, { title: "Kayıt", url: ZOOM }).expect(201);
      expect(await recordingRows()).toHaveLength(1);
    });

    it.each([
      ["an enrolled talebe", TALEBE_ID],
      ["a stranger", STRANGER_ID],
      ["a ders nazırı given only another permission", OTHER_NAZIR_ID],
      ["a ders nazırı whose grant has lapsed", EXPIRED_NAZIR_ID],
    ])("refuses %s with 403, before the YouTube rule", async (_name, sub) => {
      for (const body of [
        { title: "Kayıt", url: ZOOM },
        { title: "Kayıt", url: YOUTUBE },
      ]) {
        const res = await add(lessonId, sub, body).expect(403);
        expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      }
      expect(await recordingRows()).toHaveLength(0);
      expect(await auditRows()).toHaveLength(0);
    });

    it("keeps the one recording a session has: 409 RECORDING_EXISTS names it", async () => {
      const first = await add(lessonId, MUDERRIS_ID, {
        title: "Birinci",
        url: ZOOM,
      }).expect(201);
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "İkinci",
        url: DRIVE,
      }).expect(409);
      expect(res.body.code).toBe("RECORDING_EXISTS");
      expect(res.body.context).toEqual({
        lessonId,
        recordingId: first.body.id,
      });
      expect(await recordingRows()).toHaveLength(1);
    });

    it("refuses a cancelled session with 409 LESSON_CANCELLED", async () => {
      const res = await add(cancelledLessonId, MUDERRIS_ID, {
        title: "Kayıt",
        url: ZOOM,
      }).expect(409);
      expect(res.body.code).toBe("LESSON_CANCELLED");
      expect(await recordingRows()).toHaveLength(0);
    });

    it("answers 404 for a lesson that is archived or not there", async () => {
      for (const id of [archivedLessonId, ABSENT_ID, "not-a-uuid"]) {
        const res = await add(id, MUDERRIS_ID, {
          title: "Kayıt",
          url: ZOOM,
        }).expect(404);
        expect(res.body.code).toBe("LESSON_NOT_FOUND");
      }
    });

    it("takes a session with no time set, and dates the recording now", async () => {
      const res = await add(thirdLessonId, MUDERRIS_ID, {
        title: "Kayıt",
        url: ZOOM,
      }).expect(201);
      expect(res.body.recordedAt).not.toBeNull();
    });

    it("needs a token", async () => {
      await http()
        .post(`/lessons/${lessonId}/recordings`)
        .send({ title: "Kayıt", url: ZOOM })
        .expect(401);
    });
  });

  describe("PATCH /recordings/:id", () => {
    let recordingId: string;

    beforeEach(async () => {
      const res = await add(lessonId, MUDERRIS_ID, {
        title: "Kayıt",
        url: ZOOM,
      }).expect(201);
      recordingId = res.body.id;
    });

    it("renames a recording and leaves the rest alone", async () => {
      const res = await change(recordingId, MUDERRIS_ID, {
        title: "Birinci celse",
      }).expect(200);
      expect(res.body).toMatchObject({
        id: recordingId,
        title: "Birinci celse",
        url: ZOOM,
        visibility: RecordingVisibility.ENROLLED,
        provider: RecordingProvider.OTHER,
      });
    });

    it("opens a recording to everyone and closes it again, each change audited", async () => {
      await change(recordingId, MUDERRIS_ID, { visibility: "PUBLIC" }).expect(
        200
      );
      const visitor = await http()
        .get(`/courses/${courseId}/recordings`)
        .expect(200);
      expect(visitor.body.map((r: { id: string }) => r.id)).toEqual([
        recordingId,
      ]);

      await change(recordingId, MUDERRIS_ID, { visibility: "ENROLLED" }).expect(
        200
      );
      const closed = await http()
        .get(`/courses/${courseId}/recordings`)
        .expect(200);
      expect(closed.body).toEqual([]);

      const rows = await auditRows(recordingId);
      expect(rows.map((r) => r.action)).toEqual([
        "recording.add",
        "recording.update",
        "recording.update",
      ]);
      expect(rows[1]?.details).toMatchObject({
        courseId,
        previous: { visibility: "ENROLLED" },
        next: { visibility: "PUBLIC" },
      });
    });

    it("reads the provider again when the link is replaced", async () => {
      const res = await change(recordingId, MUDERRIS_ID, {
        url: DRIVE,
      }).expect(200);
      expect(res.body).toMatchObject({
        url: DRIVE,
        provider: RecordingProvider.DRIVE,
        status: RecordingStatus.READY,
      });
    });

    it("moves a recording to YouTube only together with PUBLIC, and never takes one back to ENROLLED", async () => {
      const refused = await change(recordingId, MUDERRIS_ID, {
        url: YOUTUBE,
      }).expect(400);
      expect(refused.body.code).toBe("RECORDING_YOUTUBE_PUBLIC_ONLY");
      expect((await stored(recordingId))[0]?.url).toBe(ZOOM);

      await change(recordingId, MUDERRIS_ID, {
        url: YOUTUBE,
        visibility: "PUBLIC",
      }).expect(200);
      const back = await change(recordingId, MUDERRIS_ID, {
        visibility: "ENROLLED",
      }).expect(400);
      expect(back.body.code).toBe("RECORDING_YOUTUBE_PUBLIC_ONLY");
      expect((await stored(recordingId))[0]?.visibility).toBe("PUBLIC");
    });

    it.each([
      ["a null title", { title: null }],
      ["an empty title", { title: "  " }],
      ["a null link", { url: null }],
      ["a plain http link", { url: "http://zoom.us/rec/1" }],
      ["a null visibility", { visibility: null }],
      ["another visibility", { visibility: "ALL" }],
    ])("refuses %s with 400", async (_name, body) => {
      await change(recordingId, MUDERRIS_ID, body).expect(400);
      const [row] = await stored(recordingId);
      expect(row).toMatchObject({ title: "Kayıt", url: ZOOM });
    });

    it.each([
      ["a ders nazırı given recording.manage", NAZIR_ID],
      ["a ders nazırı given a group that names it", GROUP_NAZIR_ID],
      ["the köşk nazımı", MANAGER_ID],
      ["the başnazım", ADMIN_ID],
    ])("lets %s change it", async (_name, sub) => {
      await change(recordingId, sub, { title: "Yeni" }).expect(200);
      expect((await stored(recordingId))[0]?.title).toBe("Yeni");
    });

    it.each([
      ["an enrolled talebe", TALEBE_ID],
      ["a stranger", STRANGER_ID],
      ["a ders nazırı given only another permission", OTHER_NAZIR_ID],
      ["a ders nazırı whose grant has lapsed", EXPIRED_NAZIR_ID],
    ])("refuses %s with 403", async (_name, sub) => {
      const res = await change(recordingId, sub, { title: "Yeni" }).expect(403);
      expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      expect((await stored(recordingId))[0]?.title).toBe("Kayıt");
    });

    it("answers 404 for a recording that is not there, or whose lesson is archived", async () => {
      for (const id of [ABSENT_ID, "not-a-uuid"]) {
        const res = await change(id, MUDERRIS_ID, { title: "Yeni" }).expect(
          404
        );
        expect(res.body.code).toBe("RECORDING_NOT_FOUND");
      }
      await db()
        .update(lessons)
        .set({ archivedAt: new Date() })
        .where(eq(lessons.id, lessonId));
      const res = await change(recordingId, MUDERRIS_ID, {
        title: "Yeni",
      }).expect(404);
      expect(res.body.code).toBe("RECORDING_NOT_FOUND");
    });

    it("does not let a müderris of another course reach it", async () => {
      await assignRole(db(), {
        userId: STRANGER_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: otherCourseId,
        grantedBy: MANAGER_ID,
      });
      await change(recordingId, STRANGER_ID, { title: "Yeni" }).expect(403);
    });

    it("needs a token", async () => {
      await http()
        .patch(`/recordings/${recordingId}`)
        .send({ title: "Yeni" })
        .expect(401);
    });
  });
});
