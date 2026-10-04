import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courses,
  courseWeeks,
  lessons,
} from "../../src/database/schema/course.schema";
import { decks } from "../../src/database/schema/flashcard-deck.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
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
 * MDRS-135, the owner's "Elbette kademe var" (d-1003-07): whatever two
 * authorities can hide, the level that hid it or any level above brings it back,
 * as the bans do. Real Postgres, real guard, minted tokens.
 *
 * The ladder is the ban ladder: course < medrese < köşk < platform. Who acts at
 * which level: a müderris at the course, a başmüderris at the medrese, a köşk
 * nazımı at the köşk, the başnazım and a Medaris nazımı holding the platform
 * permission for it (`platform.kosk_edit`, `platform.madrasah_edit`) at the
 * platform. A hide records that level in `archived_level`; a row with none counts
 * as the lowest level that could have hidden it.
 */
const ADMIN_ID = "c9000000-0000-4000-8000-000000000001";
const NAZIM_ID = "c9000000-0000-4000-8000-000000000002";
const HEAD_ID = "c9000000-0000-4000-8000-000000000003";
const OTHER_HEAD_ID = "c9000000-0000-4000-8000-000000000004";
const MUDERRIS_ID = "c9000000-0000-4000-8000-000000000005";
const MEDARIS_ID = "c9000000-0000-4000-8000-000000000006";
const STRANGER_ID = "c9000000-0000-4000-8000-000000000007";
const NAZIR_ID = "c9000000-0000-4000-8000-000000000008";
const PLATFORM_ID = "c9000000-0000-4000-8000-000000000009";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Hide and restore by kademe (MDRS-135, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let madrasahId: string;
  let otherMadrasahId: string;
  let medreseCourse: string;
  let koskCourse: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const post = (sub: string, path: string, body: object = {}) =>
    http().post(path).set("Authorization", auth(sub)).send(body);
  const del = (sub: string, path: string) =>
    http().delete(path).set("Authorization", auth(sub));
  const course = async (id: string) =>
    (await db().select().from(courses).where(eq(courses.id, id)))[0];
  const medrese = async (id = madrasahId) =>
    (await db().select().from(madrasahs).where(eq(madrasahs.id, id)))[0];
  const kosk = async () =>
    (await db().select().from(kosks).where(eq(kosks.id, koskId)))[0];

  const hideCourse = (sub: string, id: string) =>
    post(sub, `/courses/${id}/archive`);
  const restoreCourse = (sub: string, id: string) =>
    post(sub, `/courses/${id}/restore`);
  const restoreInArchive = (sub: string, type: string, id: string) =>
    post(sub, `/archive/${type}/${id}/restore`);

  /** The refusal every too-low restore gets: the code, and the two levels it names. */
  const expectLevelRefusal = (
    res: { status: number; body: { code: string; message: string } },
    hiddenAt: string,
    yourLevel: string
  ) => {
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ARCHIVE_RESTORE_LEVEL");
    expect(res.body.message).toContain(`hidden at the ${hiddenAt} level`);
    expect(res.body.message).toContain(`act at the ${yourLevel} level`);
  };

  const addCourse = async (
    title: string,
    over: Partial<typeof courses.$inferInsert> = {}
  ) => {
    const [row] = await db()
      .insert(courses)
      .values({
        koskId,
        authorId: NAZIM_ID,
        title,
        status: CourseStatus.PUBLISHED,
        ...over,
      })
      .returning({ id: courses.id });
    return row.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    const [madrasah, other] = await db()
      .insert(madrasahs)
      .values([
        {
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN_ID,
        },
        { handle: "fatih", name: "Fatih Medresesi", createdBy: ADMIN_ID },
      ])
      .returning();
    madrasahId = madrasah.id;
    otherMadrasahId = other.id;
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
      userId: OTHER_HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: otherMadrasahId,
    });
    // A Medaris nazımı holds nothing without a grant; these two are the platform's hands
    // over a köşk and over a medrese.
    await db().insert(roleAssignments).values({
      userId: MEDARIS_ID,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN_ID,
    });
    await db()
      .insert(permissionGrants)
      .values(
        [
          PERMISSIONS.PLATFORM_KOSK_EDIT,
          PERMISSIONS.PLATFORM_MADRASAH_EDIT,
          PERMISSIONS.PLATFORM_HOSTING_GRANT,
        ].map((permission) => ({
          userId: MEDARIS_ID,
          scopeType: SCOPE_TYPES.PLATFORM,
          scopeId: null,
          permission,
          groupId: null,
          grantedBy: ADMIN_ID,
        }))
      );
    medreseCourse = await addCourse("Emsile ve Bina", { madrasahId });
    koskCourse = await addCourse("Köşkün kendi dersi");
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: medreseCourse,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await app.close();
  });

  describe("a course, by POST /courses/:id/archive and /restore", () => {
    it("köşk nazımı hides a medrese's course: the başmüderris cannot restore it, the köşk nazımı and the platform can", async () => {
      await hideCourse(NAZIM_ID, medreseCourse).expect(200);
      expect((await course(medreseCourse)).archivedLevel).toBe("kosk");

      expectLevelRefusal(
        await restoreCourse(HEAD_ID, medreseCourse),
        "kosk",
        "madrasah"
      );
      expect((await course(medreseCourse)).archivedAt).not.toBeNull();
      await restoreCourse(STRANGER_ID, medreseCourse).expect(403);

      await restoreCourse(NAZIM_ID, medreseCourse).expect(200);
      expect(await course(medreseCourse)).toMatchObject({
        archivedAt: null,
        archivedBy: null,
        archivedLevel: null,
      });

      await hideCourse(NAZIM_ID, medreseCourse).expect(200);
      await restoreCourse(ADMIN_ID, medreseCourse).expect(200);
    });

    it("the başmüderris hides it at the medrese's level and restores it; the köşk, above, may too", async () => {
      await hideCourse(HEAD_ID, medreseCourse).expect(200);
      expect((await course(medreseCourse)).archivedLevel).toBe("madrasah");
      // Another medrese's head holds nothing here.
      await restoreCourse(OTHER_HEAD_ID, medreseCourse).expect(403);
      await restoreCourse(HEAD_ID, medreseCourse).expect(200);

      await hideCourse(HEAD_ID, medreseCourse).expect(200);
      // "Or any level above": the ban ladder puts the köşk over the medrese, so the köşk
      // nazımı brings back what a başmüderris hid.
      await restoreCourse(NAZIM_ID, medreseCourse).expect(200);
      expect((await course(medreseCourse)).archivedLevel).toBeNull();
    });

    it("the başnazım hides at the platform's level: neither the köşk nazımı nor the başmüderris can undo it", async () => {
      await hideCourse(ADMIN_ID, medreseCourse).expect(200);
      expect((await course(medreseCourse)).archivedLevel).toBe("platform");
      expectLevelRefusal(
        await restoreCourse(NAZIM_ID, medreseCourse),
        "platform",
        "kosk"
      );
      expectLevelRefusal(
        await restoreCourse(HEAD_ID, medreseCourse),
        "platform",
        "madrasah"
      );
      await restoreCourse(ADMIN_ID, medreseCourse).expect(200);
    });

    it("a köşk's own course: the köşk nazımı hides and restores it", async () => {
      await hideCourse(NAZIM_ID, koskCourse).expect(200);
      expect((await course(koskCourse)).archivedLevel).toBe("kosk");
      await restoreCourse(NAZIM_ID, koskCourse).expect(200);
      await hideCourse(ADMIN_ID, koskCourse).expect(200);
      expectLevelRefusal(
        await restoreCourse(NAZIM_ID, koskCourse),
        "platform",
        "kosk"
      );
    });

    it("counts a course with no level as the lowest level that could have hidden it", async () => {
      // 0048 gave every hidden row that names its hider a level from that hider's
      // role (archived-level-migration.e2e.spec.ts); what is left with none names
      // nobody. A medrese's course could be hidden by the medrese: its başmüderris
      // restores it.
      const legacyMedrese = await addCourse("Eski gizleme", {
        madrasahId,
        archivedAt: new Date("2026-09-01T10:00:00Z"),
        archivedBy: null,
      });
      expect((await course(legacyMedrese)).archivedLevel).toBeNull();
      await restoreCourse(HEAD_ID, legacyMedrese).expect(200);

      // A köşk's own course only by the köşk: the köşk nazımı restores it.
      const legacyKosk = await addCourse("Eski köşk gizlemesi", {
        archivedAt: new Date("2026-09-01T10:00:00Z"),
        archivedBy: null,
      });
      await restoreCourse(NAZIM_ID, legacyKosk).expect(200);
    });

    it("refuses to hide a hidden course or restore a shown one (409), writing nothing and echoing no content", async () => {
      const shown = await restoreCourse(NAZIM_ID, medreseCourse).expect(409);
      expect(shown.body.code).toBe("COURSE_NOT_HIDDEN");
      expect(shown.body.weeks).toBeUndefined();

      await hideCourse(NAZIM_ID, medreseCourse).expect(200);
      const first = await course(medreseCourse);
      const again = await hideCourse(ADMIN_ID, medreseCourse).expect(409);
      expect(again.body.code).toBe("COURSE_ALREADY_HIDDEN");
      expect(again.body.weeks).toBeUndefined();
      expect(await course(medreseCourse)).toMatchObject({
        archivedAt: first.archivedAt,
        archivedBy: NAZIM_ID,
        archivedLevel: "kosk",
        version: first.version,
      });
    });

    it("refuses a course whose medrese is still hidden (409 ARCHIVE_PARENT_HIDDEN), as the archive route does", async () => {
      await post(HEAD_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
      expect((await course(medreseCourse)).archivedLevel).toBe("madrasah");
      for (const sub of [HEAD_ID, NAZIM_ID]) {
        const res = await restoreCourse(sub, medreseCourse).expect(409);
        expect(res.body.code).toBe("ARCHIVE_PARENT_HIDDEN");
        await restoreInArchive(sub, "course", medreseCourse).expect(409);
      }
      expect((await course(medreseCourse)).archivedAt).not.toBeNull();
    });

    it("is refused to a stranger, who writes no level", async () => {
      await hideCourse(STRANGER_ID, medreseCourse).expect(403);
      expect((await course(medreseCourse)).archivedAt).toBeNull();
    });
  });

  describe("the same decision on POST /archive/:type/:id/restore", () => {
    it("refuses the başmüderris what the köşk nazımı hid, names both levels and leaves it hidden", async () => {
      await hideCourse(NAZIM_ID, medreseCourse).expect(200);
      expectLevelRefusal(
        await restoreInArchive(HEAD_ID, "course", medreseCourse),
        "kosk",
        "madrasah"
      );
      expect((await course(medreseCourse)).archivedAt).not.toBeNull();
      await restoreInArchive(NAZIM_ID, "course", medreseCourse).expect(200);
      expect((await course(medreseCourse)).archivedLevel).toBeNull();
    });

    it("both routes read the one recorded level: a hide by one can be undone through the other", async () => {
      await hideCourse(HEAD_ID, medreseCourse).expect(200);
      await restoreInArchive(HEAD_ID, "course", medreseCourse).expect(200);
      await hideCourse(ADMIN_ID, medreseCourse).expect(200);
      await restoreInArchive(NAZIM_ID, "course", medreseCourse).expect(403);
      await restoreInArchive(ADMIN_ID, "course", medreseCourse).expect(200);
    });
  });

  describe("platform management's course hide, platform.course_hide (MDRS-143)", () => {
    const grantPlatformHide = async () => {
      await db().insert(roleAssignments).values({
        userId: PLATFORM_ID,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
      await db().insert(permissionGrants).values({
        userId: PLATFORM_ID,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        permission: PERMISSIONS.PLATFORM_COURSE_HIDE,
        groupId: null,
        grantedBy: ADMIN_ID,
      });
    };
    afterEach(async () => {
      await db()
        .delete(permissionGrants)
        .where(eq(permissionGrants.userId, PLATFORM_ID));
    });

    it("hides at the platform's level: the köşk nazımı is refused and is not offered Geri al; the holder restores", async () => {
      await hideCourse(PLATFORM_ID, koskCourse).expect(403);
      await grantPlatformHide();
      await hideCourse(PLATFORM_ID, koskCourse).expect(200);
      expect((await course(koskCourse)).archivedLevel).toBe("platform");

      expectLevelRefusal(
        await restoreCourse(NAZIM_ID, koskCourse),
        "platform",
        "kosk"
      );
      // MDRS-108: neither of the köşk nazımı's screens offers what would be refused.
      const roster = await http()
        .get(`/kosks/${koskId}/course-roster`)
        .set("Authorization", auth(NAZIM_ID))
        .expect(200);
      const row = (
        roster.body.items as { id: string; canRestore: boolean }[]
      ).find((r) => r.id === koskCourse);
      expect(row?.canRestore).toBe(false);
      const archive = await http()
        .get(`/kosks/${koskId}/archive`)
        .set("Authorization", auth(NAZIM_ID))
        .expect(200);
      expect(archive.body.items).toEqual([
        expect.objectContaining({ id: koskCourse, canRestore: false }),
      ]);

      await restoreCourse(PLATFORM_ID, koskCourse).expect(200);
      await hideCourse(PLATFORM_ID, koskCourse).expect(200);
      await restoreInArchive(PLATFORM_ID, "course", koskCourse).expect(200);
    });

    it("answers the hide and the restore of a draft it may not read with the course, its content left out, instead of a 404 after the write (review C-archive-1)", async () => {
      await grantPlatformHide();
      const draft = await addCourse("Taslak ders", {
        status: CourseStatus.DRAFT,
      });
      const hidden = await hideCourse(PLATFORM_ID, draft).expect(200);
      expect(hidden.body).toMatchObject({ id: draft, contentLocked: true });
      expect((await course(draft)).archivedLevel).toBe("platform");
      const restored = await restoreCourse(PLATFORM_ID, draft).expect(200);
      expect(restored.body).toMatchObject({ id: draft, contentLocked: true });
      expect((await course(draft)).archivedAt).toBeNull();
    });

    it("lets the köşk nazımı's screens offer Geri al for what the köşk hid", async () => {
      await hideCourse(NAZIM_ID, koskCourse).expect(200);
      const roster = await http()
        .get(`/kosks/${koskId}/course-roster`)
        .set("Authorization", auth(NAZIM_ID))
        .expect(200);
      const rows = roster.body.items as { id: string; canRestore: boolean }[];
      expect(rows.find((r) => r.id === koskCourse)?.canRestore).toBe(true);
      // A shown course has nothing to bring back.
      expect(rows.find((r) => r.id === medreseCourse)?.canRestore).toBe(false);
      const archive = await http()
        .get(`/kosks/${koskId}/archive`)
        .set("Authorization", auth(NAZIM_ID))
        .expect(200);
      expect(archive.body.items).toEqual([
        expect.objectContaining({ id: koskCourse, canRestore: true }),
      ]);
    });
  });

  describe("a hide and a restore are on the record, the content they hand out too (review C-archive-4)", () => {
    it("writes course.hide, course.restore and a content read for each answer that carries the content", async () => {
      const actions = async () =>
        (
          await db()
            .select()
            .from(auditLog)
            .where(eq(auditLog.entityId, koskCourse))
            .orderBy(auditLog.seq)
        ).map((r) => [r.actorId, r.action, r.details]);
      const hidden = await hideCourse(NAZIM_ID, koskCourse).expect(200);
      expect(hidden.body.contentLocked).toBe(false);
      await restoreCourse(NAZIM_ID, koskCourse).expect(200);
      expect(await actions()).toEqual([
        [NAZIM_ID, "course.hide", expect.objectContaining({ level: "kosk" })],
        [
          NAZIM_ID,
          "course.content_read",
          expect.objectContaining({ via: "course.hide" }),
        ],
        [
          NAZIM_ID,
          "course.restore",
          expect.objectContaining({ level: "kosk" }),
        ],
        [
          NAZIM_ID,
          "course.content_read",
          expect.objectContaining({ via: "course.restore" }),
        ],
      ]);
    });
  });

  describe("a nazır given madrasah.course_hide (MDRS-135 review)", () => {
    afterEach(async () => {
      await db()
        .delete(permissionGrants)
        .where(eq(permissionGrants.userId, NAZIR_ID));
    });

    it("restores from the archive at the medrese's level, as they hide", async () => {
      await assignRole(db(), {
        userId: NAZIR_ID,
        role: ASSIGNED_ROLES.MEDRESE_NAZIR,
        scopeId: madrasahId,
        grantedBy: HEAD_ID,
      });
      await db().insert(permissionGrants).values({
        userId: NAZIR_ID,
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: madrasahId,
        permission: PERMISSIONS.MADRASAH_COURSE_HIDE,
        groupId: null,
        grantedBy: HEAD_ID,
      });
      await post(
        NAZIR_ID,
        `/madrasahs/${madrasahId}/courses/${medreseCourse}/hide`
      ).expect(204);
      expect((await course(medreseCourse)).archivedLevel).toBe("madrasah");
      const listed = await http()
        .get(`/madrasahs/${madrasahId}/archive`)
        .set("Authorization", auth(NAZIR_ID))
        .expect(200);
      expect(listed.body.items).toEqual([
        expect.objectContaining({ id: medreseCourse, canRestore: true }),
      ]);
      await restoreInArchive(NAZIR_ID, "course", medreseCourse).expect(200);
      expect((await course(medreseCourse)).archivedAt).toBeNull();
    });
  });

  describe("a higher re-hide while a lower restore is under way (MDRS-135 review)", () => {
    it.each([
      ["POST /courses/:id/restore", (id: string) => restoreCourse(HEAD_ID, id)],
      [
        "POST /archive/course/:id/restore",
        (id: string) => restoreInArchive(HEAD_ID, "course", id),
      ],
    ])("is not undone on %s: the level is read under the row lock", async (_route, send) => {
      await hideCourse(HEAD_ID, medreseCourse).expect(200);
      expect((await course(medreseCourse)).archivedLevel).toBe("madrasah");
      const holder = new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });
      await holder.connect();
      try {
        await holder.query("begin");
        await holder.query("select id from courses where id = $1 for update", [
          medreseCourse,
        ]);
        // The başmüderris's restore starts and waits for the row.
        const pending = send(medreseCourse).then((res) => res);
        const deadline = Date.now() + 10_000;
        for (;;) {
          const { rows } = await holder.query(
            "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'"
          );
          if (rows[0].n > 0) break;
          if (Date.now() > deadline)
            throw new Error("the restore never waited");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        // Meanwhile the köşk's nazımı brought it back and hid it again, at the köşk's level.
        await holder.query(
          "update courses set archived_at = now(), archived_by = $2, archived_level = 'kosk' where id = $1",
          [medreseCourse, NAZIM_ID]
        );
        await holder.query("commit");
        expectLevelRefusal(await pending, "kosk", "madrasah");
      } finally {
        await holder.end();
      }
      expect(await course(medreseCourse)).toMatchObject({
        archivedBy: NAZIM_ID,
        archivedLevel: "kosk",
      });
    });
  });

  describe("a medrese's own hide of a course, by POST /madrasahs/:id/courses/:courseId/hide", () => {
    const hide = (sub: string) =>
      post(sub, `/madrasahs/${madrasahId}/courses/${medreseCourse}/hide`);

    it("is the medrese's level for its başmüderris and the platform's for the başnazım", async () => {
      await hide(HEAD_ID).expect(204);
      expect((await course(medreseCourse)).archivedLevel).toBe("madrasah");
      await restoreCourse(HEAD_ID, medreseCourse).expect(200);

      await hide(ADMIN_ID).expect(204);
      expect((await course(medreseCourse)).archivedLevel).toBe("platform");
      expectLevelRefusal(
        await restoreInArchive(HEAD_ID, "course", medreseCourse),
        "platform",
        "madrasah"
      );
    });
  });

  describe("a lesson, by DELETE /lessons/:id", () => {
    let weekId: string;
    const addLesson = async (title: string) => {
      const [row] = await db()
        .insert(lessons)
        .values({ weekId, title, type: LessonType.LIVE })
        .returning({ id: lessons.id });
      return row.id;
    };
    const lesson = async (id: string) =>
      (await db().select().from(lessons).where(eq(lessons.id, id)))[0];

    beforeEach(async () => {
      [{ id: weekId }] = await db()
        .insert(courseWeeks)
        .values({ courseId: medreseCourse, weekNumber: 1, title: "Hafta 1" })
        .returning({ id: courseWeeks.id });
    });

    it("records the course's level for a müderris and the köşk's for a köşk nazımı, and the başmüderris restores only the first", async () => {
      const byMuderris = await addLesson("Müderris kaldırdı");
      const byNazim = await addLesson("Nazım kaldırdı");
      await del(MUDERRIS_ID, `/lessons/${byMuderris}`).expect(200);
      await del(NAZIM_ID, `/lessons/${byNazim}`).expect(200);
      expect((await lesson(byMuderris)).archivedLevel).toBe("course");
      expect((await lesson(byNazim)).archivedLevel).toBe("kosk");

      await restoreInArchive(HEAD_ID, "session", byMuderris).expect(200);
      expectLevelRefusal(
        await restoreInArchive(HEAD_ID, "session", byNazim),
        "kosk",
        "madrasah"
      );
      expect((await lesson(byNazim)).archivedAt).not.toBeNull();
      await restoreInArchive(NAZIM_ID, "session", byNazim).expect(200);
      expect((await lesson(byNazim)).archivedLevel).toBeNull();
    });
  });

  describe("a medrese, by POST /madrasahs/:id/hide and /restore", () => {
    const hide = (sub: string) => post(sub, `/madrasahs/${madrasahId}/hide`);
    const restore = (sub: string) =>
      post(sub, `/madrasahs/${madrasahId}/restore`);

    it("the başmüderris hides and restores it; the courses hidden with it take its level and lose it again", async () => {
      await hide(HEAD_ID).expect(200);
      expect((await medrese()).archivedLevel).toBe("madrasah");
      expect((await course(medreseCourse)).archivedLevel).toBe("madrasah");
      await restore(OTHER_HEAD_ID).expect(403);
      await restore(NAZIM_ID).expect(403);
      await restore(HEAD_ID).expect(200);
      expect(await medrese()).toMatchObject({
        archivedAt: null,
        archivedLevel: null,
      });
      expect(await course(medreseCourse)).toMatchObject({
        archivedAt: null,
        archivedLevel: null,
      });
    });

    it("a Medaris nazımı holding platform.madrasah_edit hides at the platform's level: the başmüderris cannot restore, the Medaris nazımı and the başnazım can", async () => {
      await hide(MEDARIS_ID).expect(200);
      expect((await medrese()).archivedLevel).toBe("platform");
      expectLevelRefusal(await restore(HEAD_ID), "platform", "madrasah");
      expect((await medrese()).archivedAt).not.toBeNull();
      await restore(MEDARIS_ID).expect(200);

      await hide(ADMIN_ID).expect(200);
      expect((await medrese()).archivedLevel).toBe("platform");
      await restore(ADMIN_ID).expect(200);
    });

    it("a Medaris nazımı without the platform permission can neither hide nor restore it", async () => {
      await db()
        .delete(permissionGrants)
        .where(eq(permissionGrants.userId, MEDARIS_ID));
      await hide(MEDARIS_ID).expect(403);
      await hide(HEAD_ID).expect(200);
      await restore(MEDARIS_ID).expect(403);
      expect((await medrese()).archivedAt).not.toBeNull();
    });

    it("counts a medrese with no level (its hider not on record) as the medrese's own", async () => {
      await db()
        .update(madrasahs)
        .set({
          archivedAt: new Date("2026-09-01T10:00:00Z"),
          archivedBy: null,
        })
        .where(eq(madrasahs.id, madrasahId));
      await restore(HEAD_ID).expect(200);
    });
  });

  describe("a köşk, by POST /kosks/:id/hide and /restore", () => {
    const hide = (sub: string) => post(sub, `/kosks/${koskId}/hide`);
    const restore = (sub: string) => post(sub, `/kosks/${koskId}/restore`);

    it("the köşk nazımı hides and restores it, and a Medaris nazımı holding platform.kosk_edit, above, may too", async () => {
      await hide(NAZIM_ID).expect(200);
      expect((await kosk()).archivedLevel).toBe("kosk");
      await restore(OTHER_HEAD_ID).expect(403);
      await restore(MEDARIS_ID).expect(200);
      expect(await kosk()).toMatchObject({
        archivedAt: null,
        archivedLevel: null,
      });
    });

    it("what the platform hid, the köşk nazımı cannot bring back; the Medaris nazımı with the permission and the başnazım can", async () => {
      await hide(MEDARIS_ID).expect(200);
      expect((await kosk()).archivedLevel).toBe("platform");
      expectLevelRefusal(await restore(NAZIM_ID), "platform", "kosk");
      expect((await kosk()).archivedAt).not.toBeNull();
      await restore(MEDARIS_ID).expect(200);

      await hide(ADMIN_ID).expect(200);
      expectLevelRefusal(await restore(NAZIM_ID), "platform", "kosk");
      await restore(ADMIN_ID).expect(200);
    });
  });

  describe("a deck, by POST /decks/:id/hide", () => {
    it("is the köşk's level for its nazımı and the platform's for the başnazım, and the köşk nazımı cannot bring back the second", async () => {
      const [first, second] = await db()
        .insert(decks)
        .values([
          { authorId: NAZIM_ID, koskId, title: "Nazım gizledi" },
          { authorId: NAZIM_ID, koskId, title: "Başnazım gizledi" },
        ])
        .returning({ id: decks.id });
      await post(NAZIM_ID, `/decks/${first.id}/hide`).expect(204);
      await post(ADMIN_ID, `/decks/${second.id}/hide`).expect(204);
      const level = async (id: string) =>
        (await db().select().from(decks).where(eq(decks.id, id)))[0]
          .archivedLevel;
      expect(await level(first.id)).toBe("kosk");
      expect(await level(second.id)).toBe("platform");

      await restoreInArchive(NAZIM_ID, "deck", first.id).expect(200);
      expectLevelRefusal(
        await restoreInArchive(NAZIM_ID, "deck", second.id),
        "platform",
        "kosk"
      );
      await restoreInArchive(ADMIN_ID, "deck", second.id).expect(200);
      expect(await level(second.id)).toBeNull();
    });
  });

  describe("the courses a hosting right's withdrawal hides", () => {
    it("are hidden at the köşk's level by its nazımı and at the platform's by a Medaris nazımı holding platform.hosting_grant", async () => {
      const right = `/kosks/${koskId}/hosting-rights`;
      await post(NAZIM_ID, right, { madrasahId }).expect(201);
      await del(NAZIM_ID, `${right}/${madrasahId}?coursesAction=HIDE`).expect(
        204
      );
      expect((await course(medreseCourse)).archivedLevel).toBe("kosk");
      // The medrese's own head cannot bring back what the köşk hid.
      expectLevelRefusal(
        await restoreCourse(HEAD_ID, medreseCourse),
        "kosk",
        "madrasah"
      );
      await restoreCourse(NAZIM_ID, medreseCourse).expect(200);

      await post(NAZIM_ID, right, { madrasahId }).expect(201);
      await del(MEDARIS_ID, `${right}/${madrasahId}?coursesAction=HIDE`).expect(
        204
      );
      expect((await course(medreseCourse)).archivedLevel).toBe("platform");
      expectLevelRefusal(
        await restoreCourse(NAZIM_ID, medreseCourse),
        "platform",
        "kosk"
      );
      // A Medaris nazımı holds no course permission, so the başnazım brings it back.
      await restoreCourse(ADMIN_ID, medreseCourse).expect(200);
    });
  });
});
