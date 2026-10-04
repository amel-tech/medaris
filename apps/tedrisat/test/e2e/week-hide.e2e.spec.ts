import { PERMISSIONS, type PermissionCode, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  SCOPE_TYPES,
} from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-143, "a müderris hides a week": `week.hide` is wired. The course team
 * (the müderris by default, a ders nazırı once granted it) hides a week with
 * its sessions, brings back what they hid, and is refused what the köşk hid;
 * a whole-course save that drops a week or a session needs the same
 * permission; every hide and restore is audited. Real Postgres, real guard,
 * minted tokens.
 */
const ADMIN_ID = "d1431000-0000-4000-8000-000000000001";
const NAZIM_ID = "d1431000-0000-4000-8000-000000000002";
const MUDERRIS_ID = "d1431000-0000-4000-8000-000000000003";
const NAZIR_WEEK_ID = "d1431000-0000-4000-8000-000000000004";
const NAZIR_EDIT_ID = "d1431000-0000-4000-8000-000000000005";
const NAZIR_SESSION_ID = "d1431000-0000-4000-8000-000000000006";
const HEAD_ID = "d1431000-0000-4000-8000-000000000007";
const MEDRESE_NAZIR_ID = "d1431000-0000-4000-8000-000000000008";
const STRANGER_ID = "d1431000-0000-4000-8000-000000000009";
const TALEBE_ID = "d1431000-0000-4000-8000-00000000000a";
const OTHER_MUDERRIS_ID = "d1431000-0000-4000-8000-00000000000b";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Hiding a week and a session by week.hide (MDRS-143, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let madrasahId: string;
  let courseId: string;
  let otherCourseId: string;
  let medreseCourseId: string;
  let weekId: string;
  let secondWeekId: string;
  let sessionA: string;
  let sessionB: string;
  let earlierHidden: string;
  let secondWeekSession: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const get = (sub: string, path: string) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (sub: string, path: string, body: object = {}) =>
    http().post(path).set("Authorization", auth(sub)).send(body);
  const put = (sub: string, path: string, body: object) =>
    http().put(path).set("Authorization", auth(sub)).send(body);
  const del = (sub: string, path: string) =>
    http().delete(path).set("Authorization", auth(sub));

  const hideWeek = (sub: string, id = weekId, course = courseId) =>
    post(sub, `/courses/${course}/weeks/${id}/hide`);
  const restoreInArchive = (sub: string, type: string, id: string) =>
    post(sub, `/archive/${type}/${id}/restore`);

  const week = async (id = weekId) =>
    (await db().select().from(courseWeeks).where(eq(courseWeeks.id, id)))[0];
  const lesson = async (id: string) =>
    (await db().select().from(lessons).where(eq(lessons.id, id)))[0];
  const course = async (id = courseId) =>
    (await db().select().from(courses).where(eq(courses.id, id)))[0];
  const audits = async (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));
  /** Hide and restore rows only: a content read by the köşk's nazımı writes its own. */
  const allAudits = async () =>
    (await db().select().from(auditLog)).filter((r) =>
      /\.(hide|restore)$/.test(r.action)
    ).length;

  /** What a talebe reads of the course: its live weeks and sessions. */
  const talebeSees = async () => {
    const res = await get(TALEBE_ID, `/courses/${courseId}`).expect(200);
    return res.body.weeks.map(
      (w: { id: string; lessons: { id: string }[] }) => ({
        id: w.id,
        lessons: w.lessons.map((l) => l.id),
      })
    );
  };

  const grant = async (
    sub: string,
    permission: PermissionCode,
    scopeType: "course" | "madrasah" = SCOPE_TYPES.COURSE,
    scopeId: string = courseId
  ) =>
    db().insert(permissionGrants).values({
      userId: sub,
      scopeType,
      scopeId,
      permission,
      groupId: null,
      grantedBy: NAZIM_ID,
    });

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    [{ id: madrasahId }] = await db()
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: ADMIN_ID,
      })
      .returning({ id: madrasahs.id });
    [{ id: koskId }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_ID, name: "Nûruosmaniye Köşkü" })
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
    });
    await assignRole(db(), {
      userId: MEDRESE_NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
    });

    const addCourse = async (title: string, madrasah?: string) => {
      const [row] = await db()
        .insert(courses)
        .values({
          koskId,
          authorId: NAZIM_ID,
          title,
          status: CourseStatus.PUBLISHED,
          ...(madrasah ? { madrasahId: madrasah } : {}),
        })
        .returning({ id: courses.id });
      return row.id;
    };
    courseId = await addCourse("Bina ve İzhar Şerhi");
    otherCourseId = await addCourse("Başka ders");
    medreseCourseId = await addCourse("Emsile ve Bina", madrasahId);

    const addWeek = async (forCourse: string, n: number) => {
      const [row] = await db()
        .insert(courseWeeks)
        .values({ courseId: forCourse, weekNumber: n, title: `Hafta ${n}` })
        .returning({ id: courseWeeks.id });
      return row.id;
    };
    const addSession = async (forWeek: string, title: string, order = 0) => {
      const [row] = await db()
        .insert(lessons)
        .values({
          weekId: forWeek,
          title,
          type: LessonType.LIVE,
          durationMinutes: 60,
          scheduledAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          orderIndex: order,
        })
        .returning({ id: lessons.id });
      return row.id;
    };
    weekId = await addWeek(courseId, 1);
    secondWeekId = await addWeek(courseId, 2);
    sessionA = await addSession(weekId, "Birinci celse", 0);
    sessionB = await addSession(weekId, "İkinci celse", 1);
    earlierHidden = await addSession(weekId, "Önce gizlenen", 2);
    secondWeekSession = await addSession(secondWeekId, "Üçüncü celse");
    // A session hidden on its own, long before the week is.
    await db()
      .update(lessons)
      .set({
        archivedAt: new Date("2026-09-01T10:00:00Z"),
        archivedBy: NAZIM_ID,
        archivedLevel: "kosk",
      })
      .where(eq(lessons.id, earlierHidden));
    await addWeek(otherCourseId, 1);

    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
    });
    // The course's müderris list names the account, as a saved course's does:
    // a whole-course save keeps the role only for the accounts it lists.
    await db()
      .insert(courseMuderris)
      .values({ courseId, userId: MUDERRIS_ID, name: "Müderris Ahmed Hilmi" });
    await assignRole(db(), {
      userId: OTHER_MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: otherCourseId,
    });
    for (const sub of [NAZIR_WEEK_ID, NAZIR_EDIT_ID, NAZIR_SESSION_ID]) {
      await assignRole(db(), {
        userId: sub,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
      });
    }
    await grant(NAZIR_WEEK_ID, PERMISSIONS.WEEK_HIDE);
    await grant(NAZIR_EDIT_ID, PERMISSIONS.COURSE_EDIT);
    await grant(NAZIR_SESSION_ID, PERMISSIONS.SESSION_MANAGE);
    await db().insert(enrollments).values({ userId: TALEBE_ID, courseId });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await app.close();
  });

  describe("a müderris hides a week", () => {
    it("hides it with its live sessions at one instant, at the course level, and bumps the version", async () => {
      const before = await course();
      const res = await hideWeek(MUDERRIS_ID).expect(200);
      expect(res.body).toEqual({
        id: weekId,
        courseVersion: before.version + 1,
        hiddenSessions: 2,
      });

      const hidden = await week();
      expect(hidden).toMatchObject({
        archivedBy: MUDERRIS_ID,
        archivedLevel: "course",
      });
      expect(hidden.archivedAt).not.toBeNull();
      for (const id of [sessionA, sessionB]) {
        const row = await lesson(id);
        expect(row.archivedAt).toEqual(hidden.archivedAt);
        expect(row).toMatchObject({
          archivedBy: MUDERRIS_ID,
          archivedLevel: "course",
        });
      }
      // The one hidden on its own earlier keeps its own stamp.
      expect((await lesson(earlierHidden)).archivedAt).toEqual(
        new Date("2026-09-01T10:00:00Z")
      );
      // The other week is untouched.
      expect((await week(secondWeekId)).archivedAt).toBeNull();
      expect((await course()).version).toBe(before.version + 1);
    });

    it("takes the week out of what the talebe reads", async () => {
      expect(await talebeSees()).toEqual([
        { id: weekId, lessons: [sessionA, sessionB] },
        { id: secondWeekId, lessons: [secondWeekSession] },
      ]);
      await hideWeek(MUDERRIS_ID).expect(200);
      expect(await talebeSees()).toEqual([
        { id: secondWeekId, lessons: [secondWeekSession] },
      ]);
    });

    it("deletes no row", async () => {
      const count = async () => [
        (await db().select().from(courseWeeks)).length,
        (await db().select().from(lessons)).length,
      ];
      const before = await count();
      await hideWeek(MUDERRIS_ID).expect(200);
      expect(await count()).toEqual(before);
    });

    it("writes one week.hide audit row naming who, the level, and where it sat", async () => {
      await hideWeek(MUDERRIS_ID).expect(200);
      const rows = await audits("week.hide");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: MUDERRIS_ID,
        entity: "week",
        entityId: weekId,
        details: {
          title: "Hafta 1",
          level: "course",
          courseId,
          koskId,
          madrasahId: null,
          sessions: 2,
        },
      });
    });

    it("answers 404 WEEK_NOT_FOUND for a hidden week, another course's week and an unknown one, and writes nothing", async () => {
      const otherWeek = (
        await db()
          .select()
          .from(courseWeeks)
          .where(eq(courseWeeks.courseId, otherCourseId))
      )[0].id;
      await hideWeek(MUDERRIS_ID).expect(200);
      const version = (await course()).version;
      const audited = await allAudits();
      for (const id of [
        weekId,
        otherWeek,
        "d1431000-0000-4000-8000-0000000000ff",
      ]) {
        const res = await hideWeek(MUDERRIS_ID, id).expect(404);
        expect(res.body.code).toBe("WEEK_NOT_FOUND");
      }
      expect((await course()).version).toBe(version);
      expect(await allAudits()).toBe(audited);
    });

    it("answers 404 for a course that does not exist", async () => {
      await hideWeek(
        MUDERRIS_ID,
        weekId,
        "d1431000-0000-4000-8000-0000000000fe"
      ).expect(404);
    });
  });

  describe("who may hide a week", () => {
    it.each([
      ["a talebe", TALEBE_ID],
      ["a stranger", STRANGER_ID],
      ["another course's müderris", OTHER_MUDERRIS_ID],
      ["a ders nazırı granted only course.edit", NAZIR_EDIT_ID],
      ["a ders nazırı granted only session.manage", NAZIR_SESSION_ID],
      ["a medrese nazırı with no grant", MEDRESE_NAZIR_ID],
    ])("refuses %s with 403 and writes nothing", async (_who, sub) => {
      const before = await course();
      await hideWeek(sub).expect(403);
      expect((await week()).archivedAt).toBeNull();
      expect((await course()).version).toBe(before.version);
      expect(await allAudits()).toBe(0);
    });

    it("lets the köşk's nazımı, the başnazım and a ders nazırı granted week.hide hide one", async () => {
      await hideWeek(NAZIM_ID).expect(200);
      expect((await week()).archivedLevel).toBe("kosk");
      await restoreInArchive(NAZIM_ID, "week", weekId).expect(200);
      await hideWeek(ADMIN_ID).expect(200);
      expect((await week()).archivedLevel).toBe("platform");
      await restoreInArchive(ADMIN_ID, "week", weekId).expect(200);
      await hideWeek(NAZIR_WEEK_ID).expect(200);
      expect(await week()).toMatchObject({
        archivedBy: NAZIR_WEEK_ID,
        archivedLevel: "course",
      });
    });

    it("lets the başmüderris of a medrese hide a week of the medrese's course, at the medrese level", async () => {
      const [medreseWeek] = await db()
        .insert(courseWeeks)
        .values({ courseId: medreseCourseId, weekNumber: 1, title: "Hafta 1" })
        .returning({ id: courseWeeks.id });
      await hideWeek(HEAD_ID, medreseWeek.id, medreseCourseId).expect(200);
      expect((await week(medreseWeek.id)).archivedLevel).toBe("madrasah");
      // And the same head has no say over the köşk's own course.
      await hideWeek(HEAD_ID).expect(403);
    });
  });

  describe("bringing it back, by the level that hid it or above", () => {
    it("lets the müderris restore what they hid: the week and the sessions hidden with it, not the earlier one", async () => {
      await hideWeek(MUDERRIS_ID).expect(200);
      const before = await course();
      const res = await restoreInArchive(MUDERRIS_ID, "week", weekId).expect(
        200
      );
      expect(res.body).toEqual({ type: "week", id: weekId, title: "Hafta 1" });
      expect((await week()).archivedAt).toBeNull();
      expect((await lesson(sessionA)).archivedAt).toBeNull();
      expect((await lesson(sessionB)).archivedAt).toBeNull();
      expect((await lesson(earlierHidden)).archivedAt).not.toBeNull();
      expect((await course()).version).toBe(before.version + 1);
      expect(await talebeSees()).toEqual([
        { id: weekId, lessons: [sessionA, sessionB] },
        { id: secondWeekId, lessons: [secondWeekSession] },
      ]);
      const rows = await audits("week.restore");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: MUDERRIS_ID,
        entityId: weekId,
        details: { level: "course", hiddenLevel: "course", courseId, koskId },
      });
    });

    it("refuses the müderris what the köşk's nazımı hid, naming both levels, and the köşk's nazımı restores it", async () => {
      await hideWeek(NAZIM_ID).expect(200);
      const res = await restoreInArchive(MUDERRIS_ID, "week", weekId).expect(
        403
      );
      expect(res.body.code).toBe("ARCHIVE_RESTORE_LEVEL");
      expect(res.body.message).toContain("hidden at the kosk level");
      expect(res.body.message).toContain("act at the course level");
      expect((await week()).archivedAt).not.toBeNull();
      expect(await audits("week.restore")).toHaveLength(0);

      await restoreInArchive(NAZIM_ID, "week", weekId).expect(200);
      expect((await week()).archivedAt).toBeNull();
    });

    it("refuses a stranger and another course's müderris with 403 and leaves the week hidden", async () => {
      await hideWeek(MUDERRIS_ID).expect(200);
      for (const sub of [STRANGER_ID, OTHER_MUDERRIS_ID, TALEBE_ID]) {
        const res = await restoreInArchive(sub, "week", weekId).expect(403);
        expect(res.body.code).toBe("ARCHIVE_FORBIDDEN");
      }
      expect((await week()).archivedAt).not.toBeNull();
    });

    it("lets a ders nazırı granted week.hide hide and restore a week and a session", async () => {
      await hideWeek(NAZIR_WEEK_ID, secondWeekId).expect(200);
      await restoreInArchive(NAZIR_WEEK_ID, "week", secondWeekId).expect(200);
      expect((await week(secondWeekId)).archivedAt).toBeNull();

      await del(NAZIR_WEEK_ID, `/lessons/${sessionA}`).expect(200);
      expect(await lesson(sessionA)).toMatchObject({
        archivedBy: NAZIR_WEEK_ID,
        archivedLevel: "course",
      });
      await restoreInArchive(NAZIR_WEEK_ID, "session", sessionA).expect(200);
      expect((await lesson(sessionA)).archivedAt).toBeNull();
    });

    it("lets whoever hid a session with session.manage bring it back, and gives them no week", async () => {
      await del(NAZIR_SESSION_ID, `/lessons/${sessionA}`).expect(200);
      await restoreInArchive(NAZIR_SESSION_ID, "session", sessionA).expect(200);
      await hideWeek(MUDERRIS_ID).expect(200);
      const res = await restoreInArchive(
        NAZIR_SESSION_ID,
        "week",
        weekId
      ).expect(403);
      expect(res.body.code).toBe("ARCHIVE_FORBIDDEN");
    });

    it("answers 404 for a session hidden under a hidden week: the week comes back first", async () => {
      await del(MUDERRIS_ID, `/lessons/${sessionA}`).expect(200);
      await hideWeek(MUDERRIS_ID).expect(200);
      const res = await restoreInArchive(
        MUDERRIS_ID,
        "session",
        sessionA
      ).expect(404);
      expect(res.body.code).toBe("ARCHIVE_ITEM_NOT_FOUND");
      expect((await lesson(sessionA)).archivedAt).not.toBeNull();
    });
  });

  describe("the session route", () => {
    it("is open to week.hide alone, to session.manage alone, and to nobody holding only course.edit", async () => {
      await del(NAZIR_WEEK_ID, `/lessons/${sessionA}`).expect(200);
      await del(NAZIR_SESSION_ID, `/lessons/${sessionB}`).expect(200);
      const before = await course();
      await del(NAZIR_EDIT_ID, `/lessons/${secondWeekSession}`).expect(403);
      expect((await lesson(secondWeekSession)).archivedAt).toBeNull();
      expect((await course()).version).toBe(before.version);
    });

    it("writes one lesson.hide audit row with the week, the level and where it sat", async () => {
      await del(MUDERRIS_ID, `/lessons/${sessionA}`).expect(200);
      const rows = await audits("lesson.hide");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: MUDERRIS_ID,
        entity: "lesson",
        entityId: sessionA,
        details: {
          title: "Birinci celse",
          level: "course",
          courseId,
          weekId,
          koskId,
        },
      });
    });
  });

  describe("hiding the course itself", () => {
    it("is refused to a müderris, who holds no permission for it", async () => {
      const res = await post(
        MUDERRIS_ID,
        `/courses/${courseId}/archive`
      ).expect(403);
      expect(res.body.code).toBe("AUTHZ_FORBIDDEN");
      expect((await course()).archivedAt).toBeNull();
      expect(await allAudits()).toBe(0);
    });

    it("is open to a medrese nazırı granted madrasah.course_hide, who also brings it back", async () => {
      await db().insert(permissionGrants).values({
        userId: MEDRESE_NAZIR_ID,
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: madrasahId,
        permission: PERMISSIONS.MADRASAH_COURSE_HIDE,
        groupId: null,
        grantedBy: ADMIN_ID,
      });
      await post(
        MEDRESE_NAZIR_ID,
        `/courses/${medreseCourseId}/archive`
      ).expect(200);
      expect(await course(medreseCourseId)).toMatchObject({
        archivedBy: MEDRESE_NAZIR_ID,
        archivedLevel: "madrasah",
      });
      await restoreInArchive(
        MEDRESE_NAZIR_ID,
        "course",
        medreseCourseId
      ).expect(200);
      expect((await course(medreseCourseId)).archivedAt).toBeNull();
      // But not the köşk's own course.
      await post(MEDRESE_NAZIR_ID, `/courses/${courseId}/archive`).expect(403);
    });

    it("writes course.hide and course.restore audit rows for both routes", async () => {
      await post(NAZIM_ID, `/courses/${courseId}/archive`).expect(200);
      await post(NAZIM_ID, `/courses/${courseId}/restore`).expect(200);
      await post(NAZIM_ID, `/courses/${otherCourseId}/archive`).expect(200);
      await restoreInArchive(NAZIM_ID, "course", otherCourseId).expect(200);
      const hides = await audits("course.hide");
      const restores = await audits("course.restore");
      expect(hides.map((r) => r.entityId).sort()).toEqual(
        [courseId, otherCourseId].sort()
      );
      expect(restores.map((r) => r.entityId).sort()).toEqual(
        [courseId, otherCourseId].sort()
      );
      expect(hides[0]).toMatchObject({
        actorId: NAZIM_ID,
        details: { level: "kosk", koskId },
      });
      expect(restores[0]).toMatchObject({
        actorId: NAZIM_ID,
        details: { level: "kosk", hiddenLevel: "kosk", koskId },
      });
    });

    it("writes no restore row for a course that was not hidden", async () => {
      await post(NAZIM_ID, `/courses/${courseId}/restore`).expect(200);
      expect(await audits("course.restore")).toHaveLength(0);
    });
  });

  describe("a whole-course save that drops a week or a session", () => {
    const saved = async () => {
      const res = await get(NAZIM_ID, `/courses/${courseId}`).expect(200);
      return res.body as {
        title: string;
        version: number;
        muderris: { id: string; userId: string | null; name: string }[];
        weeks: {
          id: string;
          weekNumber: number;
          title: string;
          lessons: {
            id: string;
            title: string;
            type: string;
            durationMinutes: number;
            scheduledAt: string;
          }[];
        }[];
      };
    };
    const payload = (
      detail: Awaited<ReturnType<typeof saved>>,
      keep: (weekId: string, lessonId?: string) => boolean = () => true
    ) => ({
      title: detail.title,
      version: detail.version,
      muderris: detail.muderris.map(({ id, userId, name }) => ({
        id,
        userId: userId ?? undefined,
        name,
      })),
      weeks: detail.weeks
        .filter((w) => keep(w.id))
        .map((w) => ({
          id: w.id,
          weekNumber: w.weekNumber,
          title: w.title,
          lessons: w.lessons
            .filter((l) => keep(w.id, l.id))
            .map((l) => ({
              id: l.id,
              title: l.title,
              type: l.type,
              durationMinutes: l.durationMinutes,
              scheduledAt: l.scheduledAt,
            })),
        })),
    });

    it("is refused to a ders nazırı granted only course.edit: 403 COURSE_HIDE_FORBIDDEN, before anything is written", async () => {
      const detail = await saved();
      const body = payload(detail, (w) => w !== secondWeekId);
      const audited = await allAudits();
      const res = await put(NAZIR_EDIT_ID, `/courses/${courseId}`, body).expect(
        403
      );
      expect(res.body.code).toBe("COURSE_HIDE_FORBIDDEN");
      expect((await week(secondWeekId)).archivedAt).toBeNull();
      expect((await lesson(secondWeekSession)).archivedAt).toBeNull();
      expect((await course()).version).toBe(detail.version);
      expect(await allAudits()).toBe(audited);

      // Dropping one session is a hide as well.
      const dropSession = payload(detail, (_w, l) => l !== sessionA);
      const second = await put(
        NAZIR_EDIT_ID,
        `/courses/${courseId}`,
        dropSession
      ).expect(403);
      expect(second.body.code).toBe("COURSE_HIDE_FORBIDDEN");
      expect((await lesson(sessionA)).archivedAt).toBeNull();
      expect((await course()).version).toBe(detail.version);
    });

    it("lets the same person save a course that drops nothing", async () => {
      const detail = await saved();
      await put(NAZIR_EDIT_ID, `/courses/${courseId}`, payload(detail)).expect(
        200
      );
      expect((await course()).version).toBe(detail.version + 1);
      expect(await allAudits()).toBe(0);
    });

    it("lets the müderris drop a week and a session: hidden at the course level, one audit row each", async () => {
      const detail = await saved();
      await put(
        MUDERRIS_ID,
        `/courses/${courseId}`,
        payload(detail, (w, l) => w !== secondWeekId && l !== sessionA)
      ).expect(200);
      expect(await week(secondWeekId)).toMatchObject({
        archivedBy: MUDERRIS_ID,
        archivedLevel: "course",
      });
      expect(await lesson(secondWeekSession)).toMatchObject({
        archivedLevel: "course",
      });
      expect(await lesson(sessionA)).toMatchObject({
        archivedBy: MUDERRIS_ID,
        archivedLevel: "course",
      });
      const weekRows = await audits("week.hide");
      expect(weekRows).toHaveLength(1);
      expect(weekRows[0]).toMatchObject({
        entityId: secondWeekId,
        details: { level: "course", sessions: 1, via: "course.replace" },
      });
      const lessonRows = await audits("lesson.hide");
      expect(lessonRows.map((r) => r.entityId)).toEqual([sessionA]);
      // And what they hid they bring back.
      await restoreInArchive(MUDERRIS_ID, "week", secondWeekId).expect(200);
      await restoreInArchive(MUDERRIS_ID, "session", sessionA).expect(200);
    });

    it("lets a ders nazırı granted week.hide and course.edit drop a week", async () => {
      await grant(NAZIR_WEEK_ID, PERMISSIONS.COURSE_EDIT);
      const detail = await saved();
      await put(
        NAZIR_WEEK_ID,
        `/courses/${courseId}`,
        payload(detail, (w) => w !== secondWeekId)
      ).expect(200);
      expect((await week(secondWeekId)).archivedAt).not.toBeNull();
    });

    it("refuses a save made with an old version after a week was hidden: 409, and the hide stands", async () => {
      const detail = await saved();
      await hideWeek(MUDERRIS_ID, secondWeekId).expect(200);
      const res = await put(
        MUDERRIS_ID,
        `/courses/${courseId}`,
        payload(detail)
      ).expect(409);
      expect(res.body.code).toBe("COURSE_VERSION_CONFLICT");
      expect((await week(secondWeekId)).archivedAt).not.toBeNull();
    });
  });

  describe("every hide and restore leaves one row of the right action", () => {
    it("counts each act once", async () => {
      await post(NAZIM_ID, `/courses/${courseId}/archive`).expect(200);
      await post(NAZIM_ID, `/courses/${courseId}/restore`).expect(200);
      await del(MUDERRIS_ID, `/lessons/${sessionA}`).expect(200);
      await restoreInArchive(MUDERRIS_ID, "session", sessionA).expect(200);
      await hideWeek(MUDERRIS_ID).expect(200);
      await restoreInArchive(MUDERRIS_ID, "week", weekId).expect(200);
      const actions = (await db().select().from(auditLog))
        .map((r) => r.action)
        .sort();
      expect(actions).toEqual(
        [
          "course.hide",
          "course.restore",
          "lesson.hide",
          "lesson.restore",
          "week.hide",
          "week.restore",
        ].sort()
      );
      expect(
        (
          await db()
            .select()
            .from(auditLog)
            .where(
              and(
                eq(auditLog.action, "lesson.restore"),
                eq(auditLog.entityId, sessionA)
              )
            )
        )[0]
      ).toMatchObject({
        actorId: MUDERRIS_ID,
        details: { level: "course", hiddenLevel: "course", courseId },
      });
    });
  });
});
