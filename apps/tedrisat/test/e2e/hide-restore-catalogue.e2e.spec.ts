import { PERMISSIONS, type PermissionCode, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
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
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
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
 * MDRS-143, hide and restore decided from the catalogue: who may not hide
 * (a başmüderris a köşk, a köşk's nazımı a medrese), who reads which Arşiv and
 * what each row says they may bring back, what a hidden medrese's page does,
 * the screens' `canRestore` and `hiddenLevel`, and the medrese's real delete.
 * Real Postgres, real guard, minted tokens.
 */
const ADMIN_ID = "d1432000-0000-4000-8000-000000000001";
const NAZIM_ID = "d1432000-0000-4000-8000-000000000002";
const HEAD_ID = "d1432000-0000-4000-8000-000000000003";
const MUDERRIS_ID = "d1432000-0000-4000-8000-000000000004";
const OTHER_MUDERRIS_ID = "d1432000-0000-4000-8000-000000000005";
const TALEBE_ID = "d1432000-0000-4000-8000-000000000006";
const STRANGER_ID = "d1432000-0000-4000-8000-000000000007";
const MEDARIS_KOSK_ID = "d1432000-0000-4000-8000-000000000008";
const MEDARIS_MADRASAH_ID = "d1432000-0000-4000-8000-000000000009";
const MEDARIS_NONE_ID = "d1432000-0000-4000-8000-00000000000a";
const NAZIR_ID = "d1432000-0000-4000-8000-00000000000b";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Hide and restore by catalogue code (MDRS-143, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let madrasahId: string;
  let courseId: string;
  let otherCourseId: string;
  let medreseCourseId: string;
  let weekId: string;
  let sessionId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const get = (sub: string | null, path: string) => {
    const req = http().get(path);
    return sub === null ? req : req.set("Authorization", auth(sub));
  };
  const post = (sub: string, path: string, body: object = {}) =>
    http().post(path).set("Authorization", auth(sub)).send(body);
  const del = (sub: string, path: string) =>
    http().delete(path).set("Authorization", auth(sub));
  const audits = async (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));

  const medarisNazim = async (sub: string, ...codes: PermissionCode[]) => {
    await db().insert(roleAssignments).values({
      userId: sub,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN_ID,
    });
    if (codes.length === 0) return;
    await db()
      .insert(permissionGrants)
      .values(
        codes.map((permission) => ({
          userId: sub,
          scopeType: SCOPE_TYPES.PLATFORM,
          scopeId: null,
          permission,
          groupId: null,
          grantedBy: ADMIN_ID,
        }))
      );
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "madrasah_kosk_hosting",
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
      userId: NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
    });
    await db().insert(permissionGrants).values({
      userId: NAZIR_ID,
      scopeType: SCOPE_TYPES.MADRASAH,
      scopeId: madrasahId,
      permission: PERMISSIONS.MADRASAH_COURSE_HIDE,
      groupId: null,
      grantedBy: HEAD_ID,
    });
    await medarisNazim(MEDARIS_KOSK_ID, PERMISSIONS.PLATFORM_KOSK_EDIT);
    await medarisNazim(MEDARIS_MADRASAH_ID, PERMISSIONS.PLATFORM_MADRASAH_EDIT);
    await medarisNazim(MEDARIS_NONE_ID);

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
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Hafta 1" })
      .returning({ id: courseWeeks.id });
    weekId = week.id;
    [{ id: sessionId }] = await db()
      .insert(lessons)
      .values({
        weekId,
        title: "Birinci celse",
        type: LessonType.LIVE,
        durationMinutes: 60,
        scheduledAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      })
      .returning({ id: lessons.id });
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
    });
    await assignRole(db(), {
      userId: OTHER_MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: otherCourseId,
    });
    await db().insert(enrollments).values({ userId: TALEBE_ID, courseId });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "madrasah_kosk_hosting",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await app.close();
  });

  describe("who may not hide", () => {
    it("a başmüderris hides their medrese and cannot hide or restore a köşk", async () => {
      await post(HEAD_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
      const hide = await post(HEAD_ID, `/kosks/${koskId}/hide`).expect(403);
      expect(hide.body.code).toBe("AUTHZ_FORBIDDEN");
      expect(
        (await db().select().from(kosks).where(eq(kosks.id, koskId)))[0]
          .archivedAt
      ).toBeNull();
      await post(NAZIM_ID, `/kosks/${koskId}/hide`).expect(200);
      // `POST /kosks/:id/restore` is `@AuthzExempt`: the service decides, and
      // a başmüderris holds no code of a köşk's ladder.
      const restore = await post(HEAD_ID, `/kosks/${koskId}/restore`).expect(
        403
      );
      expect(restore.body.code).toBe("AUTHZ_FORBIDDEN");
      expect(
        (await db().select().from(kosks).where(eq(kosks.id, koskId)))[0]
          .archivedAt
      ).not.toBeNull();
      expect(await audits("kosk.hide")).toHaveLength(1);
      expect(await audits("kosk.restore")).toHaveLength(0);
    });

    it("a köşk's nazımı cannot hide or restore a medrese, even one hosted in their köşk", async () => {
      await db().insert(madrasahKoskHosting).values({
        madrasahId,
        koskId,
        grantedBy: ADMIN_ID,
      });
      const hide = await post(NAZIM_ID, `/madrasahs/${madrasahId}/hide`).expect(
        403
      );
      expect(hide.body.code).toBe("AUTHZ_FORBIDDEN");
      await post(HEAD_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
      await post(NAZIM_ID, `/madrasahs/${madrasahId}/restore`).expect(403);
      expect(
        (
          await db()
            .select()
            .from(madrasahs)
            .where(eq(madrasahs.id, madrasahId))
        )[0].archivedAt
      ).not.toBeNull();
    });
  });

  describe("a köşk's Arşiv", () => {
    beforeEach(async () => {
      // The köşk's nazımı hid one course, Medaris yönetimi another.
      await post(NAZIM_ID, `/courses/${courseId}/archive`).expect(200);
      await post(ADMIN_ID, `/courses/${otherCourseId}/archive`).expect(200);
    });

    it("is read by the köşk's nazımı, the başnazım and a Medaris nazımı holding platform.kosk_edit, and by nobody else", async () => {
      for (const sub of [NAZIM_ID, ADMIN_ID, MEDARIS_KOSK_ID]) {
        const res = await get(sub, `/kosks/${koskId}/archive`).expect(200);
        expect(res.body.total).toBe(2);
      }
      for (const sub of [
        MEDARIS_NONE_ID,
        MEDARIS_MADRASAH_ID,
        HEAD_ID,
        MUDERRIS_ID,
        TALEBE_ID,
        STRANGER_ID,
      ]) {
        await get(sub, `/kosks/${koskId}/archive`).expect(403);
      }
      await get(null, `/kosks/${koskId}/archive`).expect(401);
    });

    it("says per row what the reader may bring back, and the level that hid it", async () => {
      const rows = async (sub: string) =>
        Object.fromEntries(
          (
            await get(sub, `/kosks/${koskId}/archive`).expect(200)
          ).body.items.map(
            (i: { id: string; canRestore: boolean; hiddenLevel: string }) => [
              i.id,
              [i.hiddenLevel, i.canRestore],
            ]
          )
        );
      expect(await rows(NAZIM_ID)).toEqual({
        [courseId]: ["kosk", true],
        [otherCourseId]: ["platform", false],
      });
      expect(await rows(ADMIN_ID)).toEqual({
        [courseId]: ["kosk", true],
        [otherCourseId]: ["platform", true],
      });
      // Holding only `platform.kosk_edit`: Medaris yönetimi reads; a course is
      // brought back by `platform.course_hide`, which this person was not given.
      expect(await rows(MEDARIS_KOSK_ID)).toEqual({
        [courseId]: ["kosk", false],
        [otherCourseId]: ["platform", false],
      });
    });

    it("restores nothing for a reader who holds no code of the item's ladder", async () => {
      const res = await post(
        MEDARIS_KOSK_ID,
        `/archive/course/${courseId}/restore`
      ).expect(403);
      expect(res.body.code).toBe("ARCHIVE_FORBIDDEN");
      const refused = await post(
        NAZIM_ID,
        `/archive/course/${otherCourseId}/restore`
      ).expect(403);
      expect(refused.body.code).toBe("ARCHIVE_RESTORE_LEVEL");
      expect(
        (await db().select().from(courses).where(eq(courses.id, courseId)))[0]
          .archivedAt
      ).not.toBeNull();
    });

    it("brings a hidden köşk back on its own route for a Medaris nazımı holding platform.kosk_edit, once, audited; the Arşiv leaves köşks to the başnazım", async () => {
      await post(NAZIM_ID, `/kosks/${koskId}/hide`).expect(200);
      const refused = await post(
        MEDARIS_KOSK_ID,
        `/archive/kosk/${koskId}/restore`
      ).expect(403);
      expect(refused.body.code).toBe("ARCHIVE_FORBIDDEN");
      expect(
        (await db().select().from(kosks).where(eq(kosks.id, koskId)))[0]
          .archivedAt
      ).not.toBeNull();
      await post(MEDARIS_KOSK_ID, `/kosks/${koskId}/restore`).expect(200);
      expect(
        (await db().select().from(kosks).where(eq(kosks.id, koskId)))[0]
          .archivedAt
      ).toBeNull();
      const rows = await audits("kosk.restore");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: MEDARIS_KOSK_ID,
        details: { level: "platform", hiddenLevel: "kosk", koskId },
      });
    });

    it("says on the köşk's own page the level that hid it and whether the reader may bring it back", async () => {
      const overview = async (sub: string) =>
        (await get(sub, `/kosks/${koskId}/overview`).expect(200)).body;
      expect(await overview(NAZIM_ID)).toMatchObject({
        status: "ACTIVE",
        hiddenLevel: null,
        canRestore: false,
      });
      await post(MEDARIS_KOSK_ID, `/kosks/${koskId}/hide`).expect(200);
      expect(await overview(NAZIM_ID)).toMatchObject({
        status: "HIDDEN",
        hiddenLevel: "platform",
        canRestore: false,
      });
      expect(await overview(MEDARIS_KOSK_ID)).toMatchObject({
        hiddenLevel: "platform",
        canRestore: true,
      });
      expect(await overview(ADMIN_ID)).toMatchObject({ canRestore: true });
    });

    it("says on the köşk table whether a hidden köşk may be restored by the reader", async () => {
      await post(ADMIN_ID, `/kosks/${koskId}/hide`).expect(200);
      const item = async (sub: string) =>
        (
          await get(sub, "/kosks/directory?status=HIDDEN").expect(200)
        ).body.items.find((i: { id: string }) => i.id === koskId);
      expect(await item(NAZIM_ID)).toMatchObject({
        status: "HIDDEN",
        hiddenLevel: "platform",
        canRestore: false,
      });
      expect(await item(ADMIN_ID)).toMatchObject({
        hiddenLevel: "platform",
        canRestore: true,
      });
      expect(await item(MEDARIS_KOSK_ID)).toMatchObject({
        canRestore: true,
      });
      // A shown köşk carries no level and nothing to restore.
      await post(ADMIN_ID, `/kosks/${koskId}/restore`).expect(200);
      const shown = (
        await get(NAZIM_ID, "/kosks/directory").expect(200)
      ).body.items.find((i: { id: string }) => i.id === koskId);
      expect(shown).toMatchObject({ hiddenLevel: null, canRestore: false });
      // The nazım's own hide is theirs to undo.
      await post(NAZIM_ID, `/kosks/${koskId}/hide`).expect(200);
      expect(await item(NAZIM_ID)).toMatchObject({
        hiddenLevel: "kosk",
        canRestore: true,
      });
    });
  });

  describe("a course's Arşiv", () => {
    beforeEach(async () => {
      await post(
        MUDERRIS_ID,
        `/courses/${courseId}/weeks/${weekId}/hide`
      ).expect(200);
    });

    it("is read by the course team and refused to a talebe, a stranger and another course's müderris", async () => {
      for (const sub of [MUDERRIS_ID, NAZIM_ID, ADMIN_ID]) {
        const res = await get(sub, `/courses/${courseId}/archive`).expect(200);
        expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
          weekId,
        ]);
      }
      for (const sub of [TALEBE_ID, STRANGER_ID, OTHER_MUDERRIS_ID]) {
        await get(sub, `/courses/${courseId}/archive`).expect(403);
      }
      await get(null, `/courses/${courseId}/archive`).expect(401);
      await get(
        MUDERRIS_ID,
        "/courses/d1432000-0000-4000-8000-0000000000ff/archive"
      ).expect(404);
    });

    it("lists the hidden weeks and sessions of that course alone, with canRestore by kademe", async () => {
      // A session hidden on its own by the köşk's nazımı, in a second week.
      const [second] = await db()
        .insert(courseWeeks)
        .values({ courseId, weekNumber: 2, title: "Hafta 2" })
        .returning({ id: courseWeeks.id });
      const [kept] = await db()
        .insert(lessons)
        .values({
          weekId: second.id,
          title: "İkinci hafta celsesi",
          type: LessonType.LIVE,
          durationMinutes: 60,
          scheduledAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        })
        .returning({ id: lessons.id });
      await del(NAZIM_ID, `/lessons/${kept.id}`).expect(200);
      // Another course's hidden item must not show up.
      await post(NAZIM_ID, `/courses/${otherCourseId}/archive`).expect(200);

      const res = await get(MUDERRIS_ID, `/courses/${courseId}/archive`).expect(
        200
      );
      expect(res.body.total).toBe(2);
      expect(res.body.counts).toEqual({ all: 2, week: 1, session: 1 });
      const byId = Object.fromEntries(
        res.body.items.map(
          (i: {
            id: string;
            type: string;
            canRestore: boolean;
            hiddenLevel: string;
            courseId: string;
          }) => [i.id, i]
        )
      );
      expect(byId[weekId]).toMatchObject({
        type: "week",
        hiddenLevel: "course",
        canRestore: true,
        courseId,
      });
      expect(byId[kept.id]).toMatchObject({
        type: "session",
        hiddenLevel: "kosk",
        canRestore: false,
      });
      // The session hidden with the week under it is not listed twice.
      expect(byId[sessionId]).toBeUndefined();
    });

    it("pages, and narrows to the types asked for while the tabs' numbers stay whole", async () => {
      const res = await get(
        MUDERRIS_ID,
        `/courses/${courseId}/archive?page=2&limit=1`
      ).expect(200);
      expect(res.body).toMatchObject({
        total: 1,
        page: 2,
        limit: 1,
        items: [],
      });

      const sessions = await get(
        MUDERRIS_ID,
        `/courses/${courseId}/archive?types=session`
      ).expect(200);
      expect(sessions.body).toMatchObject({
        total: 0,
        items: [],
        counts: { all: 1, week: 1, session: 0 },
      });
      // A type a course's archive does not hold lists nothing; an unknown one is a 400.
      const decks = await get(
        MUDERRIS_ID,
        `/courses/${courseId}/archive?types=deck`
      ).expect(200);
      expect(decks.body).toMatchObject({ total: 0, items: [] });
      await get(
        MUDERRIS_ID,
        `/courses/${courseId}/archive?types=nonsense`
      ).expect(400);
    });
  });

  describe("a medrese's Arşiv and its hidden page", () => {
    it("is read by whoever may hide in the medrese, Medaris yönetimi holding platform.madrasah_edit included, and by nobody else", async () => {
      for (const sub of [HEAD_ID, NAZIR_ID, ADMIN_ID, MEDARIS_MADRASAH_ID]) {
        await get(sub, `/madrasahs/${madrasahId}/archive`).expect(200);
      }
      for (const sub of [
        MEDARIS_NONE_ID,
        MEDARIS_KOSK_ID,
        NAZIM_ID,
        MUDERRIS_ID,
        TALEBE_ID,
        STRANGER_ID,
      ]) {
        await get(sub, `/madrasahs/${madrasahId}/archive`).expect(403);
      }
    });

    it("tells the page whether the medrese is hidden, who hid it, and whether the reader may bring it back", async () => {
      const state = async (sub: string) =>
        (await get(sub, `/madrasahs/${madrasahId}/archive`).expect(200)).body
          .madrasah;
      expect(await state(HEAD_ID)).toEqual({
        hidden: false,
        hiddenAt: null,
        hiddenLevel: null,
        hiddenBy: null,
        canRestore: false,
      });

      await post(HEAD_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
      expect(await state(HEAD_ID)).toMatchObject({
        hidden: true,
        hiddenLevel: "madrasah",
        hiddenBy: { id: HEAD_ID, role: "MEDRESE_BASMUDERRIS" },
        canRestore: true,
      });
      // The nazır holding only madrasah.course_hide reads the page; the medrese is not theirs to reopen.
      expect((await state(NAZIR_ID)).canRestore).toBe(false);
      expect((await state(MEDARIS_MADRASAH_ID)).canRestore).toBe(true);

      await post(HEAD_ID, `/madrasahs/${madrasahId}/restore`).expect(200);
      await post(ADMIN_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
      expect(await state(HEAD_ID)).toMatchObject({
        hidden: true,
        hiddenLevel: "platform",
        hiddenBy: { id: ADMIN_ID },
        canRestore: false,
      });
      expect((await state(ADMIN_ID)).canRestore).toBe(true);
    });

    it("keeps a hidden medrese's page open to its başmüderris and Medaris yönetimi, and closed to everyone else", async () => {
      await post(HEAD_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
      for (const path of [
        `/madrasahs/${madrasahId}`,
        `/madrasahs/${madrasahId}/overview`,
      ]) {
        for (const sub of [HEAD_ID, ADMIN_ID, MEDARIS_MADRASAH_ID]) {
          await get(sub, path).expect(200);
        }
        for (const sub of [
          TALEBE_ID,
          STRANGER_ID,
          NAZIR_ID,
          MEDARIS_NONE_ID,
          MEDARIS_KOSK_ID,
          NAZIM_ID,
          null,
        ]) {
          const res = await get(sub, path).expect(404);
          expect(res.body.code).toBe("MADRASAH_NOT_FOUND");
        }
      }
      await post(HEAD_ID, `/madrasahs/${madrasahId}/restore`).expect(200);
      await get(TALEBE_ID, `/madrasahs/${madrasahId}`).expect(200);
      await get(null, `/madrasahs/${madrasahId}/overview`).expect(200);
    });

    it("says on the medrese table whether a hidden medrese may be restored by the reader", async () => {
      await post(HEAD_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
      const item = async (sub: string) =>
        (
          await get(sub, "/madrasahs/directory?status=HIDDEN").expect(200)
        ).body.items.find((i: { id: string }) => i.id === madrasahId);
      expect(await item(ADMIN_ID)).toMatchObject({
        status: "HIDDEN",
        hiddenLevel: "madrasah",
        canRestore: true,
      });
      expect(await item(MEDARIS_MADRASAH_ID)).toMatchObject({
        canRestore: true,
      });
      await post(HEAD_ID, `/madrasahs/${madrasahId}/restore`).expect(200);
      await post(ADMIN_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
      const hidden = (
        await get(ADMIN_ID, "/madrasahs/directory").expect(200)
      ).body.items.find((i: { id: string }) => i.id === madrasahId);
      expect(hidden).toMatchObject({ hiddenLevel: "platform" });
      const shown = (
        await post(ADMIN_ID, `/madrasahs/${madrasahId}/restore`).expect(200)
      ).body;
      expect(shown).toMatchObject({ hiddenLevel: null, canRestore: false });
    });

    it("writes the hide and restore audit rows with the level", async () => {
      await post(HEAD_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
      await post(ADMIN_ID, `/madrasahs/${madrasahId}/restore`).expect(200);
      expect((await audits("madrasah.hide"))[0]).toMatchObject({
        actorId: HEAD_ID,
        details: { level: "madrasah", madrasahId, courses: 1 },
      });
      expect((await audits("madrasah.restore"))[0]).toMatchObject({
        actorId: ADMIN_ID,
        details: { level: "platform", hiddenLevel: "madrasah", courses: 1 },
      });
    });
  });

  describe("the medrese's real delete", () => {
    it("writes one madrasah.delete audit row naming the actor, and keeps the courses", async () => {
      await del(HEAD_ID, `/madrasahs/${madrasahId}`).expect(403);
      expect(await audits("madrasah.delete")).toHaveLength(0);
      await del(ADMIN_ID, `/madrasahs/${madrasahId}`).expect(200);
      const rows = await audits("madrasah.delete");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: ADMIN_ID,
        entity: "madrasah",
        entityId: madrasahId,
        details: {
          name: "Süleymaniye Medresesi",
          handle: "suleymaniye",
          coursesKept: 1,
        },
      });
      expect(
        (rows[0].details as { nazirIds: string[] }).nazirIds.sort()
      ).toEqual([HEAD_ID, NAZIR_ID].sort());
      expect(
        (
          await db()
            .select()
            .from(courses)
            .where(eq(courses.id, medreseCourseId))
        )[0].madrasahId
      ).toBeNull();
    });

    it("writes nothing for a medrese that is not there", async () => {
      await del(
        ADMIN_ID,
        "/madrasahs/d1432000-0000-4000-8000-0000000000ff"
      ).expect(404);
      expect(await audits("madrasah.delete")).toHaveLength(0);
    });
  });
});
