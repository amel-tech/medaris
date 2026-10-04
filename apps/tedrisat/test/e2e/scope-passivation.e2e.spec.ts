import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
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
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-227: passivating a köşk or a medrese shows what it takes along and
 * refuses until the caller confirms exactly that, against a real Postgres.
 */
const ADMIN = "f0000000-0000-4000-8000-000000000001";
const NAZIM = "f0000000-0000-4000-8000-000000000002";
const HEAD = "f0000000-0000-4000-8000-000000000003";
const MEDRESE_NAZIR = "f0000000-0000-4000-8000-000000000004";
const MEDARIS_KOSK = "f0000000-0000-4000-8000-000000000005";
const MEDARIS_KOSK_TWO = "f0000000-0000-4000-8000-000000000006";
const MEDARIS_MADRASAH = "f0000000-0000-4000-8000-000000000007";
const MEDARIS_BARE = "f0000000-0000-4000-8000-000000000008";
const OTHER_NAZIM = "f0000000-0000-4000-8000-000000000009";
const MUD1 = "f0000000-0000-4000-8000-000000000011";
const MUD2 = "f0000000-0000-4000-8000-000000000012";
const MUD3 = "f0000000-0000-4000-8000-000000000013";
const MUD_GONE = "f0000000-0000-4000-8000-000000000014";
const S1 = "f0000000-0000-4000-8000-000000000021";
const S2 = "f0000000-0000-4000-8000-000000000022";
const S3 = "f0000000-0000-4000-8000-000000000023";
const S4 = "f0000000-0000-4000-8000-000000000024";
const S5 = "f0000000-0000-4000-8000-000000000025";
const S6 = "f0000000-0000-4000-8000-000000000026";
const S7 = "f0000000-0000-4000-8000-000000000027";
const S8 = "f0000000-0000-4000-8000-000000000028";
const S9 = "f0000000-0000-4000-8000-000000000029";
const UNKNOWN = "f0000000-0000-4000-8000-0000000000ff";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const inDays = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);

describe("Passivating a köşk or medrese (e2e)", () => {
  let app: INestApplication;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let otherKoskId: string;
  let emptyKoskId: string;
  let madrasahId: string;
  let otherMadrasahId: string;
  let own: string;
  let hosted: string;
  let noMuderris: string;
  let draft: string;
  let hidden: string;
  let ownWeek: string;
  let abroad: string;
  let emptyCourse: string;

  const http = () => request(app.getHttpServer());
  const get = (path: string, sub = ADMIN) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (path: string, body: object, sub = ADMIN) =>
    http().post(path).set("Authorization", auth(sub)).send(body);

  const koskPreview = async (sub = ADMIN, id = koskId) =>
    (await get(`/kosks/${id}/deactivation-preview`, sub).expect(200)).body;
  const madrasahPreview = async (sub = ADMIN, id = madrasahId) =>
    (await get(`/madrasahs/${id}/deactivation-preview`, sub).expect(200)).body;
  const deactivateKosk = (confirmation: string, sub = ADMIN, id = koskId) =>
    post(`/kosks/${id}/deactivate`, { confirmation }, sub);
  const deactivateMadrasah = (
    confirmation: string,
    sub = ADMIN,
    id = madrasahId
  ) => post(`/madrasahs/${id}/deactivate`, { confirmation }, sub);

  const audits = (action: string) =>
    db.select().from(auditLog).where(eq(auditLog.action, action));
  const heldIn = async (scopeId: string) =>
    (
      await db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.scopeId, scopeId))
    ).filter((r) => r.revokedAt === null);
  const koskRow = async (id = koskId) =>
    (await db.select().from(kosks).where(eq(kosks.id, id)))[0];
  const madrasahRow = async (id = madrasahId) =>
    (await db.select().from(madrasahs).where(eq(madrasahs.id, id)))[0];

  /** A Medaris nazımı holds nothing without a grant; `codes` are what the başnazım gave. */
  const medarisNazim = async (userId: string, codes: string[]) => {
    await db.insert(roleAssignments).values({
      userId,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN,
    });
    if (codes.length === 0) return;
    await db.insert(permissionGrants).values(
      codes.map((permission) => ({
        userId,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        permission,
        groupId: null,
        grantedBy: ADMIN,
      }))
    );
  };

  const live = (weekId: string, title: string, at: Date, extra = {}) =>
    ({ weekId, title, type: "LIVE", scheduledAt: at, ...extra }) as const;

  beforeAll(async () => {
    app = await createTestApp();
    const databaseService = app.get<DatabaseService>(DatabaseService);
    db = databaseService.db;
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "audit_log",
      "permission_grants",
      ...COURSE_TREE_TABLES,
      "madrasah_kosk_hosting",
      "madrasahs",
      "users"
    );
    await db.insert(users).values([
      { id: ADMIN, email: "basnazim@example.com" },
      { id: NAZIM, email: "nazim@example.com" },
    ]);
    const [kosk, other, empty] = await db
      .insert(kosks)
      .values([
        { ownerId: ADMIN, name: "Nûruosmaniye Köşkü", handle: "nuruosmaniye" },
        { ownerId: ADMIN, name: "Fatih Köşkü", handle: "fatih" },
        { ownerId: ADMIN, name: "Yeni Köşk", handle: "yeni" },
      ])
      .returning();
    koskId = kosk.id;
    otherKoskId = other.id;
    emptyKoskId = empty.id;
    await assignRole(db, {
      userId: NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
      grantedBy: ADMIN,
    });
    await assignRole(db, {
      userId: OTHER_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: otherKoskId,
      grantedBy: ADMIN,
    });
    const [madrasah, otherMadrasah] = await db
      .insert(madrasahs)
      .values([
        { handle: "suleymaniye", name: "Süleymaniye", createdBy: ADMIN },
        { handle: "zeyrek", name: "Zeyrek", createdBy: ADMIN },
      ])
      .returning();
    madrasahId = madrasah.id;
    otherMadrasahId = otherMadrasah.id;
    await assignRole(db, {
      userId: HEAD,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN,
    });
    await assignRole(db, {
      userId: MEDRESE_NAZIR,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD,
    });
    await db.insert(permissionGrants).values({
      userId: MEDRESE_NAZIR,
      scopeType: SCOPE_TYPES.MADRASAH,
      scopeId: madrasahId,
      permission: PERMISSIONS.MADRASAH_SETTINGS_EDIT,
      groupId: null,
      grantedBy: HEAD,
    });
    await db.insert(madrasahKoskHosting).values([
      { madrasahId, koskId, grantedBy: ADMIN },
      { madrasahId, koskId: otherKoskId, grantedBy: ADMIN },
    ]);
    await medarisNazim(MEDARIS_BARE, []);
    await medarisNazim(MEDARIS_KOSK, [PERMISSIONS.PLATFORM_KOSK_EDIT]);
    await medarisNazim(MEDARIS_KOSK_TWO, [PERMISSIONS.PLATFORM_KOSK_EDIT]);
    await medarisNazim(MEDARIS_MADRASAH, [PERMISSIONS.PLATFORM_MADRASAH_EDIT]);

    const rows = await db
      .insert(courses)
      .values([
        // own: a müderris, S1 and S2 enrolled, S3 waiting, S4 taken out, S5 finished
        {
          koskId,
          authorId: NAZIM,
          title: "Emsile ve Bina",
          status: CourseStatus.PUBLISHED,
        },
        // hosted: a medrese's course in this köşk, S1 again
        {
          koskId,
          authorId: NAZIM,
          title: "Bina ve İzhar Şerhi",
          status: CourseStatus.PUBLISHED,
          madrasahId,
        },
        // noMuderris: closed already, its müderris was taken off the post
        {
          koskId,
          authorId: NAZIM,
          title: "Maksûd okumaları",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Kâfiye'ye giriş",
          status: CourseStatus.DRAFT,
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Gizli ders",
          status: CourseStatus.PUBLISHED,
          archivedAt: new Date(),
          archivedBy: NAZIM,
        },
        // the medrese's course in the other köşk, and another medrese's course there
        {
          koskId: otherKoskId,
          authorId: OTHER_NAZIM,
          title: "Fatih'te şerh",
          status: CourseStatus.PUBLISHED,
          madrasahId,
        },
        {
          koskId: otherKoskId,
          authorId: OTHER_NAZIM,
          title: "Zeyrek dersi",
          status: CourseStatus.PUBLISHED,
          madrasahId: otherMadrasahId,
        },
        // a köşk that never had a nazım
        {
          koskId: emptyKoskId,
          authorId: ADMIN,
          title: "Sahipsiz ders",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    [own, hosted, noMuderris, draft, hidden, abroad, , emptyCourse] = rows.map(
      (r) => r.id
    );
    const zeyrekCourse = rows[6].id;
    await assignRole(db, {
      userId: MUD1,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: own,
      grantedBy: NAZIM,
    });
    await assignRole(db, {
      userId: MUD2,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: hosted,
      grantedBy: NAZIM,
    });
    await assignRole(db, {
      userId: MUD3,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: abroad,
      grantedBy: OTHER_NAZIM,
    });
    await assignRole(db, {
      userId: MUD3,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: zeyrekCourse,
      grantedBy: OTHER_NAZIM,
    });
    await assignRole(db, {
      userId: MUD1,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: emptyCourse,
      grantedBy: ADMIN,
    });
    await db.insert(roleAssignments).values({
      userId: MUD_GONE,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeType: SCOPE_TYPES.COURSE,
      scopeId: noMuderris,
      grantedBy: NAZIM,
      revokedAt: new Date(),
      revokedBy: NAZIM,
    });
    await db.insert(enrollments).values([
      { userId: S1, courseId: own, status: EnrollmentStatus.ENROLLED },
      { userId: S2, courseId: own, status: EnrollmentStatus.ENROLLED },
      { userId: S3, courseId: own, status: EnrollmentStatus.PENDING },
      { userId: S4, courseId: own, status: EnrollmentStatus.REVOKED },
      { userId: S5, courseId: own, status: EnrollmentStatus.COMPLETED },
      { userId: S1, courseId: hosted, status: EnrollmentStatus.ENROLLED },
      { userId: S6, courseId: noMuderris, status: EnrollmentStatus.ENROLLED },
      { userId: S7, courseId: hidden, status: EnrollmentStatus.ENROLLED },
      { userId: S1, courseId: abroad, status: EnrollmentStatus.ENROLLED },
      { userId: S8, courseId: abroad, status: EnrollmentStatus.ENROLLED },
      { userId: S8, courseId: zeyrekCourse, status: EnrollmentStatus.ENROLLED },
      { userId: S1, courseId: emptyCourse, status: EnrollmentStatus.ENROLLED },
    ]);

    const weeks = await db
      .insert(courseWeeks)
      .values([
        { courseId: own, weekNumber: 1, title: "Hafta 1" },
        {
          courseId: own,
          weekNumber: 2,
          title: "Hafta 2",
          archivedAt: new Date(),
        },
        { courseId: hosted, weekNumber: 1, title: "Hafta 1" },
        { courseId: draft, weekNumber: 1, title: "Hafta 1" },
        { courseId: abroad, weekNumber: 1, title: "Hafta 1" },
        { courseId: zeyrekCourse, weekNumber: 1, title: "Hafta 1" },
      ])
      .returning();
    ownWeek = weeks[0].id;
    await db.insert(lessons).values([
      // counted in the köşk: a live session inside the window
      live(ownWeek, "Celse bu hafta", inDays(2)),
      // not counted: cancelled, past the window, already past, not live, hidden lesson
      live(ownWeek, "İptal edilen", inDays(2), { cancelledAt: new Date() }),
      live(ownWeek, "Çok sonra", inDays(20)),
      live(ownWeek, "Geçmiş", inDays(-1)),
      {
        weekId: ownWeek,
        title: "Video",
        type: "VIDEO",
        scheduledAt: inDays(2),
      },
      live(ownWeek, "Gizlenen celse", inDays(2), { archivedAt: new Date() }),
      // not counted: in a hidden week, in a draft course
      live(weeks[1].id, "Gizli haftada", inDays(3)),
      live(weeks[3].id, "Taslakta", inDays(3)),
      // counted in the köşk and in the medrese
      live(weeks[2].id, "Medrese celsesi", inDays(4)),
      // counted in the medrese only
      live(weeks[4].id, "Fatih'te celse", inDays(3)),
      live(weeks[5].id, "Zeyrek celsesi", inDays(3)),
    ]);
  });

  describe("GET /kosks/:id/deactivation-preview", () => {
    it("counts what the database holds below the köşk", async () => {
      const body = await koskPreview();
      expect(body).toMatchObject({
        scope: { type: "KOSK", id: koskId, name: "Nûruosmaniye Köşkü" },
        alreadyPassive: false,
        closesContent: true,
        staffLeaving: 1,
        // own, hosted, noMuderris and the draft; the hidden course is left out
        courses: {
          total: 4,
          published: 3,
          draft: 1,
          withLiveMuderris: 2,
          truncated: false,
        },
        // S1 is in two courses and counts once; S3 waits, S4 was taken out, S7 is in the hidden course
        students: { enrolled: 3, completed: 1 },
        sessions: { windowDays: 7, count: 2 },
      });
      expect(body.confirmation).toMatch(/^[0-9a-f]{64}$/);
      const items = body.courses.items;
      expect(items.map((c: { title: string }) => c.title)).toEqual([
        "Emsile ve Bina",
        "Bina ve İzhar Şerhi",
        "Maksûd okumaları",
        "Kâfiye'ye giriş",
      ]);
      expect(items[0]).toMatchObject({
        id: own,
        koskName: "Nûruosmaniye Köşkü",
        status: "PUBLISHED",
        liveMuderris: true,
        enrolled: 2,
        completed: 1,
      });
      expect(
        items.find((c: { id: string }) => c.id === noMuderris)
      ).toMatchObject({ liveMuderris: false, enrolled: 1 });
      expect(body.sessions.next.map((s: { title: string }) => s.title)).toEqual(
        ["Celse bu hafta", "Medrese celsesi"]
      );
    });

    it("says a never-attended köşk closes nothing", async () => {
      const body = await koskPreview(ADMIN, emptyKoskId);
      expect(body).toMatchObject({
        closesContent: false,
        staffLeaving: 0,
        courses: { total: 1 },
      });
    });

    it("answers 200 with alreadyPassive for a köşk that is passive", async () => {
      await deactivateKosk((await koskPreview()).confirmation).expect(200);
      const body = await koskPreview();
      expect(body.alreadyPassive).toBe(true);
    });

    it("is not an unauthenticated read and answers 404 for no köşk", async () => {
      await http().get(`/kosks/${koskId}/deactivation-preview`).expect(401);
      await get(`/kosks/${UNKNOWN}/deactivation-preview`).expect(404);
    });
  });

  describe("GET /madrasahs/:id/deactivation-preview", () => {
    it("counts the medrese's courses in both köşks and not another medrese's", async () => {
      const body = await madrasahPreview();
      expect(body).toMatchObject({
        scope: { type: "MADRASAH", id: madrasahId, name: "Süleymaniye" },
        alreadyPassive: false,
        closesContent: true,
        staffLeaving: 1,
        courses: {
          total: 2,
          published: 2,
          draft: 0,
          withLiveMuderris: 2,
        },
        // S1 is in both courses and counts once; S8's other course is another medrese's
        students: { enrolled: 2, completed: 0 },
        sessions: { windowDays: 7, count: 2 },
      });
      expect(
        body.courses.items.map((c: { koskName: string }) => c.koskName).sort()
      ).toEqual(["Fatih Köşkü", "Nûruosmaniye Köşkü"]);
    });

    it("answers 404 for no medrese", async () => {
      await get(`/madrasahs/${UNKNOWN}/deactivation-preview`).expect(404);
    });
  });

  describe("POST /kosks/:id/deactivate", () => {
    it("refuses a missing or malformed confirmation with 400 and writes nothing", async () => {
      await post(`/kosks/${koskId}/deactivate`, {}).expect(400);
      await deactivateKosk("not-a-token").expect(400);
      await post(`/kosks/${koskId}/deactivate`, { confirmation: 7 }).expect(
        400
      );
      expect((await koskRow()).passiveSince).toBeNull();
      expect(await heldIn(koskId)).toHaveLength(1);
      expect(await audits("kosk.deactivate")).toEqual([]);
    });

    it("passivates with the token of the preview and records the impact it confirmed", async () => {
      const preview = await koskPreview();
      const res = await deactivateKosk(preview.confirmation).expect(200);
      expect(res.body.status).toBe("PASSIVE");
      expect(await heldIn(koskId)).toEqual([]);
      expect((await koskRow()).passiveReason).toBe("DEACTIVATED_BY_ADMIN");
      const [row] = await audits("kosk.deactivate");
      expect(row.actorId).toBe(ADMIN);
      expect(row.entityId).toBe(koskId);
      expect(row.details).toEqual({
        name: "Nûruosmaniye Köşkü",
        removedNazimIds: [NAZIM],
        impact: {
          courses: preview.courses.total,
          withLiveMuderris: preview.courses.withLiveMuderris,
          enrolled: preview.students.enrolled,
          completed: preview.students.completed,
          closesContent: true,
          sessions: { windowDays: 7, count: preview.sessions.count },
          courseIds: [own, hosted, noMuderris, draft].sort(),
        },
        confirmation: preview.confirmation,
      });
    });

    it("refuses a token made before something changed, with the fresh preview, and writes nothing", async () => {
      const changes: Array<[string, () => Promise<unknown>]> = [
        [
          "a talebe enrols",
          () =>
            db.insert(enrollments).values({
              userId: S9,
              courseId: own,
              status: EnrollmentStatus.ENROLLED,
            }),
        ],
        [
          "a müderris leaves",
          () =>
            db
              .update(roleAssignments)
              .set({ revokedAt: new Date(), revokedBy: ADMIN })
              .where(
                and(
                  eq(roleAssignments.scopeId, own),
                  eq(roleAssignments.userId, MUD1)
                )
              ),
        ],
        [
          "a session is scheduled",
          () =>
            db.insert(lessons).values(live(ownWeek, "Yeni celse", inDays(1))),
        ],
        [
          "a nazım is added",
          () =>
            assignRole(db, {
              userId: S9,
              role: ASSIGNED_ROLES.KOSK_NAZIM,
              scopeId: koskId,
              grantedBy: ADMIN,
            }),
        ],
      ];
      for (const [, change] of changes) {
        const old = (await koskPreview()).confirmation;
        await change();
        const stale = await deactivateKosk(old).expect(409);
        expect(stale.body.code).toBe("PASSIVATION_IMPACT_CHANGED");
        const fresh = stale.body.context.impact;
        expect(fresh.confirmation).not.toBe(old);
        expect(fresh.confirmation).toBe((await koskPreview()).confirmation);
        expect((await koskRow()).passiveSince).toBeNull();
        expect((await heldIn(koskId)).length).toBeGreaterThan(0);
        expect(await audits("kosk.deactivate")).toEqual([]);
        // A call that reads the new numbers goes through; undo the köşk for the next change.
        const ok = await deactivateKosk(fresh.confirmation).expect(200);
        expect(ok.body.status).toBe("PASSIVE");
        await db
          .update(kosks)
          .set({ passiveSince: null, passiveReason: null })
          .where(eq(kosks.id, koskId));
        await db.delete(auditLog).where(eq(auditLog.action, "kosk.deactivate"));
        await assignRole(db, {
          userId: NAZIM,
          role: ASSIGNED_ROLES.KOSK_NAZIM,
          scopeId: koskId,
          grantedBy: ADMIN,
        }).catch(() => undefined);
      }
    });

    it("refuses a token another caller made, even one who may passivate too", async () => {
      const mine = await koskPreview(MEDARIS_KOSK);
      const theirs = await koskPreview(MEDARIS_KOSK_TWO);
      expect(mine.confirmation).not.toBe(theirs.confirmation);
      const res = await deactivateKosk(
        mine.confirmation,
        MEDARIS_KOSK_TWO
      ).expect(409);
      expect(res.body.code).toBe("PASSIVATION_IMPACT_CHANGED");
      expect((await koskRow()).passiveSince).toBeNull();
      await deactivateKosk(theirs.confirmation, MEDARIS_KOSK_TWO).expect(200);
      expect((await audits("kosk.deactivate"))[0].actorId).toBe(
        MEDARIS_KOSK_TWO
      );
    });

    it("answers 409 KOSK_ALREADY_PASSIVE on a second call with a token of the passive köşk", async () => {
      await deactivateKosk((await koskPreview()).confirmation).expect(200);
      const again = await deactivateKosk(
        (await koskPreview()).confirmation
      ).expect(409);
      expect(again.body.code).toBe("KOSK_ALREADY_PASSIVE");
      expect(await audits("kosk.deactivate")).toHaveLength(1);
    });

    it("passivates a köşk that never had a nazım, and closes nothing below it", async () => {
      const preview = await koskPreview(ADMIN, emptyKoskId);
      await deactivateKosk(preview.confirmation, ADMIN, emptyKoskId).expect(
        200
      );
      expect((await koskRow(emptyKoskId)).passiveSince).not.toBeNull();
      const course = await get(`/courses/${emptyCourse}`, S1).expect(200);
      expect(course.body.contentLocked).toBeFalsy();
    });

    it("answers 404 for no köşk", async () => {
      await deactivateKosk("0".repeat(64), ADMIN, UNKNOWN).expect(404);
    });
  });

  describe("POST /madrasahs/:id/deactivate", () => {
    it("refuses a missing or malformed confirmation with 400 and writes nothing", async () => {
      await post(`/madrasahs/${madrasahId}/deactivate`, {}).expect(400);
      await deactivateMadrasah("short").expect(400);
      expect((await madrasahRow()).passiveSince).toBeNull();
      expect(await audits("madrasah.deactivate")).toEqual([]);
    });

    it("takes the başmüderris off the post, leaves nazırlar and grants, and the directory says Pasif", async () => {
      const preview = await madrasahPreview();
      const res = await deactivateMadrasah(preview.confirmation).expect(200);
      expect(res.body.status).toBe("PASSIVE");
      const held = await heldIn(madrasahId);
      expect(held.map((r) => [r.userId, r.role])).toEqual([
        [MEDRESE_NAZIR, ASSIGNED_ROLES.MEDRESE_NAZIR],
      ]);
      const [revoked] = await db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, HEAD));
      expect(revoked.revokedBy).toBe(ADMIN);
      expect(
        await db
          .select()
          .from(permissionGrants)
          .where(eq(permissionGrants.userId, MEDRESE_NAZIR))
      ).toHaveLength(1);
      const row = await madrasahRow();
      expect(row.passiveReason).toBe("DEACTIVATED_BY_ADMIN");
      const directory = await get("/madrasahs/directory?status=PASSIVE").expect(
        200
      );
      expect(directory.body.items.map((i: { id: string }) => i.id)).toEqual([
        madrasahId,
      ]);
      const [audit] = await audits("madrasah.deactivate");
      expect(audit.entityId).toBe(madrasahId);
      expect(audit.details).toEqual({
        name: "Süleymaniye",
        removedHeadIds: [HEAD],
        impact: {
          courses: 2,
          withLiveMuderris: 2,
          enrolled: 2,
          completed: 0,
          closesContent: true,
          sessions: { windowDays: 7, count: 2 },
          courseIds: [hosted, abroad].sort(),
        },
        confirmation: preview.confirmation,
      });
    });

    it("refuses a stale token with the fresh preview and writes nothing", async () => {
      const old = (await madrasahPreview()).confirmation;
      await db.insert(enrollments).values({
        userId: S9,
        courseId: hosted,
        status: EnrollmentStatus.ENROLLED,
      });
      const stale = await deactivateMadrasah(old).expect(409);
      expect(stale.body.code).toBe("PASSIVATION_IMPACT_CHANGED");
      expect(stale.body.context.impact.students.enrolled).toBe(3);
      expect((await madrasahRow()).passiveSince).toBeNull();
      expect(await heldIn(madrasahId)).toHaveLength(2);
      expect(await audits("madrasah.deactivate")).toEqual([]);
      await deactivateMadrasah(stale.body.context.impact.confirmation).expect(
        200
      );
    });

    it("answers 409 MADRASAH_ALREADY_PASSIVE on a second call", async () => {
      await deactivateMadrasah((await madrasahPreview()).confirmation).expect(
        200
      );
      const again = await deactivateMadrasah(
        (await madrasahPreview()).confirmation
      ).expect(409);
      expect(again.body.code).toBe("MADRASAH_ALREADY_PASSIVE");
      expect(await audits("madrasah.deactivate")).toHaveLength(1);
    });

    it("answers 404 for no medrese", async () => {
      await deactivateMadrasah("0".repeat(64), ADMIN, UNKNOWN).expect(404);
    });
  });

  describe("who may preview and passivate", () => {
    const tokenOf = "0".repeat(64);

    it("lets the başnazım and a Medaris nazımı holding the permission in, nobody else, on the köşk", async () => {
      await get(`/kosks/${koskId}/deactivation-preview`, MEDARIS_KOSK).expect(
        200
      );
      for (const sub of [NAZIM, HEAD, MEDARIS_BARE, MEDARIS_MADRASAH, S1]) {
        await get(`/kosks/${koskId}/deactivation-preview`, sub).expect(403);
        await deactivateKosk(tokenOf, sub).expect(403);
      }
      expect((await koskRow()).passiveSince).toBeNull();
      expect(await heldIn(koskId)).toHaveLength(1);
      expect(await audits("kosk.deactivate")).toEqual([]);
      await deactivateKosk(
        (await koskPreview(MEDARIS_KOSK)).confirmation,
        MEDARIS_KOSK
      ).expect(200);
    });

    it("lets the başnazım and a Medaris nazımı holding the permission in, nobody else, on the medrese", async () => {
      await get(
        `/madrasahs/${madrasahId}/deactivation-preview`,
        MEDARIS_MADRASAH
      ).expect(200);
      for (const sub of [
        HEAD,
        MEDRESE_NAZIR,
        NAZIM,
        MEDARIS_BARE,
        MEDARIS_KOSK,
        S1,
      ]) {
        await get(`/madrasahs/${madrasahId}/deactivation-preview`, sub).expect(
          403
        );
        await deactivateMadrasah(tokenOf, sub).expect(403);
      }
      expect((await madrasahRow()).passiveSince).toBeNull();
      expect(await heldIn(madrasahId)).toHaveLength(2);
      expect(await audits("madrasah.deactivate")).toEqual([]);
      await deactivateMadrasah(
        (await madrasahPreview(MEDARIS_MADRASAH)).confirmation,
        MEDARIS_MADRASAH
      ).expect(200);
    });
  });

  describe("what passive closes (the point of the issue)", () => {
    it("closes a course below the köşk for its enrolled talebe, a hosted medrese course included, and the scope is listed and can be reopened", async () => {
      expect(
        (await get(`/courses/${own}`, S1).expect(200)).body.contentLocked
      ).toBeFalsy();
      expect(
        (await get(`/courses/${hosted}`, S1).expect(200)).body.contentLocked
      ).toBeFalsy();
      await deactivateKosk((await koskPreview()).confirmation).expect(200);
      expect(
        (await get(`/courses/${own}`, S1).expect(200)).body.contentLocked
      ).toBe(true);
      expect(
        (await get(`/courses/${hosted}`, S1).expect(200)).body.contentLocked
      ).toBe(true);
      // A course of the other köşk is untouched.
      expect(
        (await get(`/courses/${abroad}`, S1).expect(200)).body.contentLocked
      ).toBeFalsy();

      const listed = await get("/nizam/inactive-scopes?type=KOSK").expect(200);
      expect(listed.body.map((r: { id: string }) => r.id)).toContain(koskId);
      await post(`/nizam/inactive-scopes/KOSK/${koskId}/assign`, {
        userId: NAZIM,
      }).expect(204);
      expect((await koskRow()).passiveSince).toBeNull();
      expect(
        (await get(`/courses/${own}`, S1).expect(200)).body.contentLocked
      ).toBeFalsy();
    });

    it("closes the medrese's courses in every köşk and leaves the köşk's own courses open", async () => {
      await deactivateMadrasah((await madrasahPreview()).confirmation).expect(
        200
      );
      expect(
        (await get(`/courses/${hosted}`, S1).expect(200)).body.contentLocked
      ).toBe(true);
      expect(
        (await get(`/courses/${abroad}`, S1).expect(200)).body.contentLocked
      ).toBe(true);
      expect(
        (await get(`/courses/${own}`, S1).expect(200)).body.contentLocked
      ).toBeFalsy();
      const listed = await get("/nizam/inactive-scopes?type=MADRASAH").expect(
        200
      );
      expect(listed.body.map((r: { id: string }) => r.id)).toContain(
        madrasahId
      );
    });
  });
});
