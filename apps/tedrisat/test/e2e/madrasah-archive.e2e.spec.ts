import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
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
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-185, nazir/12: a medrese's archive — what is hidden in it, who may bring
 * it back by kademe — and "Medreseyi gizle", against a real Postgres. Real
 * `AuthGuard` with minted tokens.
 *
 * Hidden things are inserted with the hider the screen prints and the level the
 * hider acted at (`archived_level`): the kademe rule reads that level (MDRS-135),
 * and a row with none counts as the lowest level that could have hidden it.
 */
const ADMIN_ID = "c8000000-0000-4000-8000-000000000001";
const HEAD_ID = "c8000000-0000-4000-8000-000000000002";
const OTHER_HEAD_ID = "c8000000-0000-4000-8000-000000000003";
const NAZIM_ID = "c8000000-0000-4000-8000-000000000004";
const MUDERRIS_ID = "c8000000-0000-4000-8000-000000000005";
const STRANGER_ID = "c8000000-0000-4000-8000-000000000006";
const UNKNOWN_ID = "c8000000-0000-4000-8000-00000000ffff";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const hours = (n: number) => new Date(Date.UTC(2026, 8, 30, n));

describe("Medrese archive (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let koskId: string;
  let byHead: string;
  let byNazim: string;
  let byAdmin: string;
  let foreignCourse: string;
  let unaffiliated: string;
  let liveCourse: string;
  let weekByMuderris: string;
  let sessionByNazim: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const archive = (sub: string, query = "", id = madrasahId) =>
    http()
      .get(`/madrasahs/${id}/archive${query}`)
      .set("Authorization", auth(sub));
  const restore = (sub: string, type: string, id: string) =>
    http()
      .post(`/archive/${type}/${id}/restore`)
      .set("Authorization", auth(sub));
  const hide = (sub: string, id = madrasahId) =>
    http().post(`/madrasahs/${id}/hide`).set("Authorization", auth(sub));
  const courseRow = async (id: string) =>
    (await db().select().from(courses).where(eq(courses.id, id)))[0];

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
        madrasahId,
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

  const clean = () =>
    dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );

  beforeEach(async () => {
    await clean();
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
    [{ id: koskId }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_ID, name: "Nûruosmaniye Köşkü" })
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });

    // Three hidden courses of the medrese, by three kademes, oldest first.
    byAdmin = await addCourse("Ders: Başnazım gizledi", {
      archivedAt: hours(8),
      archivedBy: ADMIN_ID,
      archivedLevel: "platform",
    });
    byNazim = await addCourse("Ders: Köşk nazımı gizledi", {
      archivedAt: hours(9),
      archivedBy: NAZIM_ID,
      archivedLevel: "kosk",
    });
    byHead = await addCourse("Ders: Başmüderris gizledi", {
      archivedAt: hours(10),
      archivedBy: HEAD_ID,
      archivedLevel: "madrasah",
    });

    // A shown course with a week a müderris hid and a session the nazım hid.
    liveCourse = await addCourse("Emsile ve Bina");
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: liveCourse,
    });
    [{ id: weekByMuderris }] = await db()
      .insert(courseWeeks)
      .values({
        courseId: liveCourse,
        weekNumber: 11,
        title: "Hafta 11: Tasrîf tekrarı",
        archivedAt: hours(11),
        archivedBy: MUDERRIS_ID,
        archivedLevel: "course",
      })
      .returning({ id: courseWeeks.id });
    const [liveWeek] = await db()
      .insert(courseWeeks)
      .values({ courseId: liveCourse, weekNumber: 5, title: "Hafta 5" })
      .returning({ id: courseWeeks.id });
    [{ id: sessionByNazim }] = await db()
      .insert(lessons)
      .values({
        weekId: liveWeek.id,
        title: "Mehmûz fiiller (mükerrer)",
        type: LessonType.LIVE,
        archivedAt: hours(12),
        archivedBy: NAZIM_ID,
        archivedLevel: "kosk",
      })
      .returning({ id: lessons.id });

    // Hidden, but not this medrese's.
    foreignCourse = await addCourse("Başka medresenin dersi", {
      madrasahId: otherMadrasahId,
      archivedAt: hours(13),
      archivedBy: OTHER_HEAD_ID,
    });
    unaffiliated = await addCourse("Medresesiz ders", {
      madrasahId: null,
      archivedAt: hours(14),
      archivedBy: NAZIM_ID,
      archivedLevel: "kosk",
    });
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("GET /madrasahs/:id/archive", () => {
    it("lists what is hidden in the medrese, newest first, with the tabs' numbers", async () => {
      const res = await archive(HEAD_ID).expect(200);

      expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
        sessionByNazim,
        weekByMuderris,
        byHead,
        byNazim,
        byAdmin,
      ]);
      expect(res.body).toMatchObject({
        total: 5,
        page: 1,
        limit: 10,
        counts: { all: 5, course: 3, week: 1, session: 1, recording: 0 },
      });
      const [session, week, course] = res.body.items;
      expect(session).toMatchObject({
        type: "session",
        title: "Mehmûz fiiller (mükerrer)",
        courseTitle: "Emsile ve Bina",
        weekNumber: 5,
        madrasahId,
        archivedBy: { id: NAZIM_ID, role: "KOSK_NAZIM" },
      });
      expect(week).toMatchObject({
        type: "week",
        weekNumber: 11,
        archivedBy: { id: MUDERRIS_ID, role: "MUDERRIS" },
      });
      expect(course).toMatchObject({
        type: "course",
        title: "Ders: Başmüderris gizledi",
        archivedBy: { id: HEAD_ID, role: "MEDRESE_BASMUDERRIS" },
      });
      const ids = res.body.items.map((i: { id: string }) => i.id);
      expect(ids).not.toContain(foreignCourse);
      expect(ids).not.toContain(unaffiliated);
    });

    it("says who may bring each item back: the kademe that hid it or a higher one", async () => {
      const canRestore = async (sub: string) =>
        Object.fromEntries(
          (await archive(sub).expect(200)).body.items.map(
            (i: { id: string; canRestore: boolean }) => [i.id, i.canRestore]
          )
        );

      expect(await canRestore(HEAD_ID)).toEqual({
        [sessionByNazim]: false,
        [weekByMuderris]: true,
        [byHead]: true,
        [byNazim]: false,
        [byAdmin]: false,
      });
      const admin = await canRestore(ADMIN_ID);
      expect(Object.values(admin).every(Boolean)).toBe(true);
    });

    it("narrows to the types asked for and pages, whatever the tabs count", async () => {
      const tab = await archive(HEAD_ID, "?types=week,session").expect(200);
      expect(tab.body.items.map((i: { type: string }) => i.type)).toEqual([
        "session",
        "week",
      ]);
      expect(tab.body.total).toBe(2);
      expect(tab.body.counts.all).toBe(5);

      const recordings = await archive(HEAD_ID, "?types=recording").expect(200);
      expect(recordings.body).toMatchObject({ items: [], total: 0 });

      // A deck or a köşk is no part of a medrese's archive.
      const deck = await archive(HEAD_ID, "?types=deck").expect(200);
      expect(deck.body).toMatchObject({ items: [], total: 0 });

      const second = await archive(HEAD_ID, "?limit=2&page=2").expect(200);
      expect(second.body.items.map((i: { id: string }) => i.id)).toEqual([
        byHead,
        byNazim,
      ]);
      expect(second.body.total).toBe(5);

      await archive(HEAD_ID, "?types=week,lesson").expect(400);
      await archive(HEAD_ID, "?limit=abc").expect(400);
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone", async () => {
      for (const sub of [STRANGER_ID, OTHER_HEAD_ID, NAZIM_ID, MUDERRIS_ID]) {
        await archive(sub).expect(403);
      }
      await http().get(`/madrasahs/${madrasahId}/archive`).expect(401);
      await archive(HEAD_ID, "", UNKNOWN_ID).expect(404);
      await archive(ADMIN_ID).expect(200);
      expect(
        (await archive(OTHER_HEAD_ID, "", otherMadrasahId).expect(200)).body
          .total
      ).toBe(1);
    });
  });

  describe("bringing an item back", () => {
    it("lets the başmüderris restore what they or a lower kademe hid, and the item is shown again", async () => {
      const res = await restore(HEAD_ID, "course", byHead).expect(200);
      expect(res.body).toMatchObject({ id: byHead, type: "course" });
      expect(await courseRow(byHead)).toMatchObject({
        archivedAt: null,
        archivedBy: null,
      });

      await restore(HEAD_ID, "week", weekByMuderris).expect(200);
      expect(
        (await archive(HEAD_ID).expect(200)).body.items.map(
          (i: { id: string }) => i.id
        )
      ).toEqual([sessionByNazim, byNazim, byAdmin]);
    });

    it("refuses what a higher kademe hid, and leaves it hidden", async () => {
      for (const [type, id, hiddenAt] of [
        ["course", byNazim, "kosk"],
        ["course", byAdmin, "platform"],
        ["session", sessionByNazim, "kosk"],
      ]) {
        const res = await restore(HEAD_ID, type, id).expect(403);
        // The refusal names the level that hid it and the one the caller acts at.
        expect(res.body.code).toBe("ARCHIVE_RESTORE_LEVEL");
        expect(res.body.message).toContain(`${hiddenAt} level`);
        expect(res.body.message).toContain("madrasah level");
      }
      expect((await courseRow(byNazim)).archivedAt).not.toBeNull();
      expect((await courseRow(byAdmin)).archivedAt).not.toBeNull();
    });

    it("lets the köşk nazımı restore what the medrese's levels or the köşk hid, not what the platform hid, and the başnazım anything", async () => {
      await restore(NAZIM_ID, "course", byNazim).expect(200);
      // A başmüderris' hide is below the köşk (the ban ladder: course < medrese < köşk < platform).
      await restore(NAZIM_ID, "course", byHead).expect(200);
      const refused = await restore(NAZIM_ID, "course", byAdmin).expect(403);
      expect(refused.body.code).toBe("ARCHIVE_RESTORE_LEVEL");
      expect((await courseRow(byAdmin)).archivedAt).not.toBeNull();
      await restore(ADMIN_ID, "course", byAdmin).expect(200);
      await restore(ADMIN_ID, "session", sessionByNazim).expect(200);
    });

    it("counts a row with no level as the lowest level that could have hidden it", async () => {
      // 0048 gave every hidden row that names its hider a level; one left with none
      // names nobody. A medrese's course could be hidden by the medrese: its
      // başmüderris may restore it.
      const legacy = await addCourse("Ders: Eski gizleme", {
        archivedAt: hours(7),
        archivedBy: null,
      });
      expect((await courseRow(legacy)).archivedLevel).toBeNull();
      await restore(HEAD_ID, "course", legacy).expect(200);
      // A week or a session by whoever runs the course; here the başmüderris is not one of them,
      // but the lowest level is the course's, so the başmüderris above it restores too.
      const [legacyWeek] = await db()
        .insert(courseWeeks)
        .values({
          courseId: liveCourse,
          weekNumber: 12,
          title: "Hafta 12",
          archivedAt: hours(7),
          archivedBy: null,
        })
        .returning({ id: courseWeeks.id });
      await restore(HEAD_ID, "week", legacyWeek.id).expect(200);
    });

    it("clears the level with the hide, so a later hide records its own", async () => {
      await restore(HEAD_ID, "course", byHead).expect(200);
      expect(await courseRow(byHead)).toMatchObject({
        archivedAt: null,
        archivedBy: null,
        archivedLevel: null,
      });
    });

    it("refuses the başmüderris of another medrese, a stranger and a müderris", async () => {
      for (const sub of [OTHER_HEAD_ID, STRANGER_ID, MUDERRIS_ID]) {
        await restore(sub, "course", byHead).expect(403);
      }
      await restore(HEAD_ID, "course", foreignCourse).expect(403);
      await restore(HEAD_ID, "course", unaffiliated).expect(403);
      expect((await courseRow(byHead)).archivedAt).not.toBeNull();
    });
  });

  describe("POST /madrasahs/:id/hide", () => {
    it("hides the medrese with its shown courses, audited, and deletes nothing", async () => {
      const res = await hide(HEAD_ID).expect(200);
      expect(res.body).toMatchObject({ id: madrasahId, status: "HIDDEN" });

      const [row] = await db()
        .select()
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId));
      expect(row.archivedAt).not.toBeNull();
      expect(row.archivedBy).toBe(HEAD_ID);
      expect(row.archivedLevel).toBe("madrasah");

      // Every course the medrese had is hidden now; an earlier hide keeps its own date.
      const mine = await db()
        .select()
        .from(courses)
        .where(eq(courses.madrasahId, madrasahId));
      expect(mine).toHaveLength(4);
      expect(mine.every((c) => c.archivedAt !== null)).toBe(true);
      expect((await courseRow(byNazim)).archivedAt).toEqual(hours(9));
      expect((await courseRow(byNazim)).archivedBy).toBe(NAZIM_ID);
      const together = mine.filter(
        (c) => c.archivedAt?.getTime() === row.archivedAt?.getTime()
      );
      expect(together.map((c) => c.id)).toEqual([liveCourse]);
      expect(together[0].archivedBy).toBe(HEAD_ID);
      // The course hidden together takes the level the medrese was hidden at; the others keep theirs.
      expect(together[0].archivedLevel).toBe("madrasah");
      expect((await courseRow(byNazim)).archivedLevel).toBe("kosk");
      expect((await courseRow(byAdmin)).archivedLevel).toBe("platform");

      // The other medrese and the medresesiz course are not touched.
      expect((await courseRow(unaffiliated)).archivedAt).toEqual(hours(14));
      const [audit] = await db()
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "madrasah.hide"),
            eq(auditLog.entityId, madrasahId)
          )
        );
      expect(audit).toMatchObject({
        actorId: HEAD_ID,
        details: { courses: 1 },
      });
    });

    it("closes the medrese's page and lists, and the level that hid it or a higher one brings it back with the courses hidden together", async () => {
      await http().get(`/madrasahs/${madrasahId}/overview`).expect(200);
      await hide(HEAD_ID).expect(200);
      await http().get(`/madrasahs/${madrasahId}/overview`).expect(404);
      const list = await http().get("/madrasahs").expect(200);
      expect(list.body.items.map((m: { id: string }) => m.id)).toEqual([
        otherMadrasahId,
      ]);

      // The head still has the archive, but a course cannot be restored under a hidden medrese.
      const shown = await archive(HEAD_ID).expect(200);
      expect(shown.body.counts.course).toBe(4);
      const conflict = await restore(HEAD_ID, "course", liveCourse).expect(409);
      expect(conflict.body.code).toBe("ARCHIVE_PARENT_HIDDEN");
      // Another medrese's head, a köşk nazımı and a stranger do not bring it back.
      for (const sub of [OTHER_HEAD_ID, NAZIM_ID, STRANGER_ID]) {
        await http()
          .post(`/madrasahs/${madrasahId}/restore`)
          .set("Authorization", auth(sub))
          .expect(403);
      }

      const version = (await courseRow(liveCourse)).version;
      await http()
        .post(`/madrasahs/${madrasahId}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(await courseRow(liveCourse)).toMatchObject({
        archivedAt: null,
        archivedBy: null,
      });
      expect((await courseRow(liveCourse)).version).toBeGreaterThan(version);
      // The three hidden before stay hidden.
      for (const id of [byHead, byNazim, byAdmin]) {
        expect((await courseRow(id)).archivedAt).not.toBeNull();
      }
      await http().get(`/madrasahs/${madrasahId}/overview`).expect(200);
    });

    it("lets the başmüderris bring back the medrese they hid, with the courses hidden together", async () => {
      await hide(HEAD_ID).expect(200);
      await http()
        .post(`/madrasahs/${madrasahId}/restore`)
        .set("Authorization", auth(HEAD_ID))
        .expect(200);
      const [row] = await db()
        .select()
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId));
      expect(row).toMatchObject({
        archivedAt: null,
        archivedBy: null,
        archivedLevel: null,
      });
      expect(await courseRow(liveCourse)).toMatchObject({
        archivedAt: null,
        archivedLevel: null,
      });
      expect((await courseRow(byNazim)).archivedLevel).toBe("kosk");
    });

    it("keeps what Medaris yönetimi hid from the başmüderris, and says the levels", async () => {
      await hide(ADMIN_ID).expect(200);
      const [row] = await db()
        .select()
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId));
      expect(row.archivedLevel).toBe("platform");
      expect((await courseRow(liveCourse)).archivedLevel).toBe("platform");

      const refused = await http()
        .post(`/madrasahs/${madrasahId}/restore`)
        .set("Authorization", auth(HEAD_ID))
        .expect(403);
      expect(refused.body.code).toBe("ARCHIVE_RESTORE_LEVEL");
      expect(refused.body.message).toContain("platform level");
      expect(refused.body.message).toContain("madrasah level");
      const [still] = await db()
        .select()
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId));
      expect(still.archivedAt).not.toBeNull();

      await http()
        .post(`/madrasahs/${madrasahId}/restore`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect((await courseRow(liveCourse)).archivedAt).toBeNull();
    });

    it("counts a medrese hidden before levels were recorded as the medrese's own", async () => {
      await db()
        .update(madrasahs)
        .set({ archivedAt: hours(15), archivedBy: HEAD_ID })
        .where(eq(madrasahs.id, madrasahId));
      await http()
        .post(`/madrasahs/${madrasahId}/restore`)
        .set("Authorization", auth(HEAD_ID))
        .expect(200);
    });

    it("answers a medrese that is hidden already with a conflict", async () => {
      await hide(HEAD_ID).expect(200);
      const res = await hide(ADMIN_ID).expect(409);
      expect(res.body.code).toBe("MADRASAH_ALREADY_HIDDEN");
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone, and writes nothing otherwise", async () => {
      for (const sub of [STRANGER_ID, OTHER_HEAD_ID, NAZIM_ID, MUDERRIS_ID]) {
        await hide(sub).expect(403);
      }
      await http().post(`/madrasahs/${madrasahId}/hide`).expect(401);
      await hide(HEAD_ID, UNKNOWN_ID).expect(404);
      const [row] = await db()
        .select()
        .from(madrasahs)
        .where(eq(madrasahs.id, madrasahId));
      expect(row.archivedAt).toBeNull();
      await hide(ADMIN_ID).expect(200);
    });
  });
});
