import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { BAN_SCOPES, bans } from "../../src/database/schema/ban.schema";
import { courses } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  type AssignedRole,
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
 * MDRS-205: bans are decided from the permission catalogue, not from the roles
 * held. Every ban action against every actor, with and without the grant, on the
 * real routes and the real guard.
 *
 * The owner's answers this proves:
 *  1. a başmüderris MAY ban in its medrese's courses (it holds `ban.course`
 *     there by role default; the course route used to refuse it);
 *  2. the permission to ban at a level also lifts bans at that level
 *     (`ban.course`, `ban.manage_kosk`, `madrasah.ban`, `platform.ban_scoped`);
 *     the kademe only orders WHO may lift WHOM;
 *  3. a Medaris nazımı holding only `platform.ban_scoped` bans and lifts at the
 *     köşk's and the medrese's level and NOT in a course; the başnazım may
 *     anywhere. ("Başnazım zaten atabilir ban ama medaris nazımı atamaz.")
 * and what the old role lists let through that the catalogue does not: a
 * Medaris nazımı, a ders nazırı or a medrese nazırı with no grant.
 */
const ADMIN = "cb000000-0000-4000-8000-000000000001";
const KOSK_NAZIM = "cb000000-0000-4000-8000-000000000002";
const HEAD = "cb000000-0000-4000-8000-000000000003";
const NAZIR = "cb000000-0000-4000-8000-000000000004";
const DERS_NAZIR = "cb000000-0000-4000-8000-000000000005";
const MUDERRIS = "cb000000-0000-4000-8000-000000000006";
const MUDERRIS_2 = "cb000000-0000-4000-8000-000000000007";
const MEDARIS = "cb000000-0000-4000-8000-000000000008";
const SCOPED = "cb000000-0000-4000-8000-000000000009";
const ACCOUNT = "cb000000-0000-4000-8000-00000000000a";
const OTHER_HEAD = "cb000000-0000-4000-8000-00000000000b";
const OTHER_NAZIM = "cb000000-0000-4000-8000-00000000000c";
const STRANGER = "cb000000-0000-4000-8000-00000000000d";
const TALEBE = "cb000000-0000-4000-8000-00000000000e";
const TALEBE_2 = "cb000000-0000-4000-8000-00000000000f";
const REASON = "Celselerde başka talebelere hakaret etti.";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Bans from the permission catalogue (MDRS-205, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let otherKoskId: string;
  let madrasahId: string;
  let otherMadrasahId: string;
  let medreseCourse: string;
  let otherMedreseCourse: string;
  let koskCourse: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const TABLES = [
    ...COURSE_TREE_TABLES,
    "bans",
    "ban_permanent_requests",
    "madrasahs",
    "audit_log",
    "users",
  ] as const;

  // ---- the routes -----------------------------------------------------------------
  const banInCourse = (
    sub: string,
    over: Record<string, unknown> = {},
    courseId = () => medreseCourse
  ) =>
    http()
      .post(`/courses/${courseId()}/bans`)
      .set("Authorization", auth(sub))
      .send({ userId: TALEBE, scope: "COURSE", reason: REASON, ...over });
  const banInMadrasah = (sub: string, over: Record<string, unknown> = {}) =>
    http()
      .post(`/madrasahs/${madrasahId}/bans`)
      .set("Authorization", auth(sub))
      .send({ userId: TALEBE, scope: "MADRASAH", reason: REASON, ...over });
  const act = (sub: string, banId: string, action: string, reason = "ok") =>
    http()
      .post(`/bans/${banId}/${action}`)
      .set("Authorization", auth(sub))
      .send({ reason });
  const lift = (sub: string, id: string) => act(sub, id, "lift");
  const extend = (sub: string, id: string) =>
    http()
      .post(`/bans/${id}/extend`)
      .set("Authorization", auth(sub))
      .send({ scope: "KOSK", reason: "Köşkün başka derslerine başvurdu." });
  const escalate = (sub: string, id: string) => act(sub, id, "escalate");
  const permanent = (sub: string, id: string) =>
    act(sub, id, "permanent-request");
  const get = (sub: string, path: string) =>
    http().get(path).set("Authorization", auth(sub));

  /** A ban row inserted as a given kademe placed it, for what the routes cannot make. */
  const seed = async (over: Partial<typeof bans.$inferInsert> = {}) =>
    (
      await db()
        .insert(bans)
        .values({
          userId: TALEBE,
          koskId,
          courseId: medreseCourse,
          scope: BAN_SCOPES.COURSE,
          reason: REASON,
          bannedBy: MUDERRIS,
          bannedRole: "MUDERRIS",
          bannedTier: 1,
          ...over,
        })
        .returning()
    )[0];
  const seedKosk = (over: Partial<typeof bans.$inferInsert> = {}) =>
    seed({
      scope: BAN_SCOPES.KOSK,
      courseId: null,
      bannedBy: KOSK_NAZIM,
      bannedRole: "KOSK_NAZIM",
      bannedTier: 3,
      ...over,
    });
  const seedMadrasah = (over: Partial<typeof bans.$inferInsert> = {}) =>
    seed({
      scope: BAN_SCOPES.MADRASAH,
      koskId: null,
      courseId: null,
      madrasahId,
      bannedBy: HEAD,
      bannedRole: "MEDRESE_BASMUDERRIS",
      bannedTier: 2,
      ...over,
    });

  // ---- what an actor is given -------------------------------------------------------
  type At = "platform" | "kosk" | "madrasah" | "course";
  const give = (userId: string, at: At, permission: string) =>
    db()
      .insert(permissionGrants)
      .values({
        userId,
        scopeType: at,
        scopeId:
          at === "platform"
            ? null
            : at === "kosk"
              ? koskId
              : at === "madrasah"
                ? madrasahId
                : medreseCourse,
        permission,
        groupId: null,
        grantedBy: ADMIN,
      });
  const seat = (userId: string, role: AssignedRole, scopeId: string) =>
    assignRole(db(), { userId, role, scopeId, grantedBy: ADMIN });
  const platformRole = (userId: string) =>
    db().insert(roleAssignments).values({
      userId,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN,
    });

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    const [madrasah, other] = await db()
      .insert(madrasahs)
      .values([
        {
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN,
        },
        { handle: "fatih", name: "Fatih Medresesi", createdBy: ADMIN },
      ])
      .returning();
    madrasahId = madrasah.id;
    otherMadrasahId = other.id;
    [{ id: koskId }, { id: otherKoskId }] = await db()
      .insert(kosks)
      .values([
        { ownerId: KOSK_NAZIM, name: "Nûruosmaniye Köşkü" },
        { ownerId: OTHER_NAZIM, name: "Fatih Köşkü" },
      ])
      .returning({ id: kosks.id });
    [{ id: medreseCourse }, { id: koskCourse }, { id: otherMedreseCourse }] =
      await db()
        .insert(courses)
        .values(
          [
            ["Bina ve İzhar Şerhi", madrasahId],
            ["Köşkün kendi dersi", null],
            ["Başka medresenin dersi", otherMadrasahId],
          ].map(([title, medrese]) => ({
            title: title as string,
            koskId,
            madrasahId: medrese,
            authorId: KOSK_NAZIM,
            status: CourseStatus.PUBLISHED,
          }))
        )
        .returning({ id: courses.id });

    await seat(KOSK_NAZIM, ASSIGNED_ROLES.KOSK_NAZIM, koskId);
    await seat(OTHER_NAZIM, ASSIGNED_ROLES.KOSK_NAZIM, otherKoskId);
    await seat(HEAD, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, madrasahId);
    await seat(OTHER_HEAD, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, otherMadrasahId);
    await seat(NAZIR, ASSIGNED_ROLES.MEDRESE_NAZIR, madrasahId);
    await seat(DERS_NAZIR, ASSIGNED_ROLES.DERS_NAZIR, medreseCourse);
    await seat(MUDERRIS, ASSIGNED_ROLES.MUDERRIS, medreseCourse);
    await seat(MUDERRIS_2, ASSIGNED_ROLES.MUDERRIS, medreseCourse);
    for (const sub of [MEDARIS, SCOPED, ACCOUNT]) await platformRole(sub);
    await give(SCOPED, "platform", "platform.ban_scoped");
    await give(ACCOUNT, "platform", "platform.ban_account");
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  const created = 201;
  const refused = 403;

  describe("a course ban in a medrese's course: POST /courses/:id/bans", () => {
    it.each([
      ["a müderris of the course", MUDERRIS, created],
      // The owner's first answer: the catalogue gives it `ban.course` there.
      ["the medrese's başmüderris", HEAD, created],
      ["the köşk's nazımı", KOSK_NAZIM, created],
      ["the başnazım", ADMIN, created],
      ["a ders nazırı with no grant", DERS_NAZIR, refused],
      ["a medrese nazırı with no grant", NAZIR, refused],
      ["a Medaris nazımı with no grant", MEDARIS, refused],
      // The owner's third answer.
      ["a Medaris nazımı with only platform.ban_scoped", SCOPED, refused],
      ["a Medaris nazımı with only platform.ban_account", ACCOUNT, refused],
      ["another medrese's başmüderris", OTHER_HEAD, refused],
      ["another köşk's nazımı", OTHER_NAZIM, refused],
      ["a stranger", STRANGER, refused],
    ])("%s: %i", async (_who, sub, status) => {
      const res = await banInCourse(sub);
      expect(res.status).toBe(status);
      if (status === refused) {
        expect(res.body.code).toBe("BAN_FORBIDDEN");
        // The refusal names the permission it asked for.
        expect(res.body.context.permission).toEqual([
          "ban.course",
          "ban.manage_kosk",
          "madrasah.ban",
        ]);
      }
      expect(await db().select().from(bans)).toHaveLength(
        status === created ? 1 : 0
      );
    });

    it("lets a ders nazırı, a medrese nazırı and a Medaris nazımı ban once the permission is given", async () => {
      await give(DERS_NAZIR, "course", "ban.course");
      const byDers = await banInCourse(DERS_NAZIR).expect(201);
      expect(byDers.body.bannedRole).toBe("DERS_NAZIR");

      // A course code given at the medrese reaches every course of it.
      await give(NAZIR, "madrasah", "ban.course");
      const byNazir = await banInCourse(NAZIR, {
        userId: TALEBE_2,
      }).expect(201);
      expect(byNazir.body.bannedRole).toBe("MEDRESE_NAZIR");

      await give(MEDARIS, "course", "ban.course");
      const byMedaris = await banInCourse(MEDARIS, {
        userId: "cb000000-0000-4000-8000-0000000000a1",
      }).expect(201);
      expect(byMedaris.body.bannedRole).toBe("MEDARIS_NAZIM");
      expect(byMedaris.body.bannedTier).toBeUndefined();
      const [row] = await db()
        .select()
        .from(bans)
        .where(eq(bans.id, byMedaris.body.id));
      expect(row.bannedTier).toBe(4);
    });

    it("records the role that conferred the permission, in the ban and in the audit row", async () => {
      await banInCourse(HEAD).expect(201);
      const [row] = await db().select().from(bans);
      expect(row).toMatchObject({
        bannedBy: HEAD,
        bannedRole: "MEDRESE_BASMUDERRIS",
        bannedTier: 2,
      });
      const [audit] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "ban.create"));
      expect(audit).toMatchObject({
        actorId: HEAD,
        details: { role: "MEDRESE_BASMUDERRIS", scope: "COURSE" },
      });
    });

    it("does not raise a müderris to the nazır's tier because the same person is both", async () => {
      await seat(NAZIR, ASSIGNED_ROLES.MUDERRIS, medreseCourse);
      await banInCourse(NAZIR).expect(201);
      const [row] = await db().select().from(bans);
      expect(row).toMatchObject({ bannedRole: "MUDERRIS", bannedTier: 1 });
    });

    it("lets a medrese nazırı holding only madrasah.ban bar in its medrese's courses, at the medrese's tier, and nowhere else (d-1004-06)", async () => {
      await give(NAZIR, "madrasah", "madrasah.ban");
      const placed = await banInCourse(NAZIR).expect(201);
      expect(placed.body.bannedRole).toBe("MEDRESE_NAZIR");
      const [row] = await db().select().from(bans);
      expect(row).toMatchObject({
        bannedBy: NAZIR,
        bannedRole: "MEDRESE_NAZIR",
        bannedTier: 2,
        scope: "COURSE",
      });
      // Not in a course of another medrese, nor one the köşk keeps for itself.
      for (const course of [otherMedreseCourse, koskCourse]) {
        const res = await banInCourse(
          NAZIR,
          { userId: TALEBE_2 },
          () => course
        ).expect(403);
        expect(res.body.code).toBe("BAN_FORBIDDEN");
      }
      // Nor a köşk-wide ban: that is ban.manage_kosk's or platform.ban_scoped's.
      await banInCourse(NAZIR, { scope: "KOSK", userId: TALEBE_2 }).expect(403);
      expect(await db().select().from(bans)).toHaveLength(1);
    });

    // A course the köşk keeps for itself has no medrese: its head is a stranger to it.
    it("keeps the başmüderris out of a course that belongs to no medrese", async () => {
      const res = await banInCourse(HEAD, {}, () => koskCourse).expect(403);
      expect(res.body.code).toBe("BAN_FORBIDDEN");
      await banInCourse(KOSK_NAZIM, {}, () => koskCourse).expect(201);
    });
  });

  describe("a whole-köşk ban: POST /courses/:id/bans scope KOSK, and POST /bans/:id/extend", () => {
    it.each([
      ["the köşk's nazımı", KOSK_NAZIM, created],
      ["the başnazım", ADMIN, created],
      // The owner's third answer: the köşk's level is the Medaris nazımı's.
      ["a Medaris nazımı with platform.ban_scoped", SCOPED, created],
      ["a müderris", MUDERRIS, refused],
      ["the medrese's başmüderris", HEAD, refused],
      ["a medrese nazırı with no grant", NAZIR, refused],
      ["a Medaris nazımı with no grant", MEDARIS, refused],
      ["a Medaris nazımı with only platform.ban_account", ACCOUNT, refused],
    ])("%s bars from the köşk: %i", async (_who, sub, status) => {
      expect((await banInCourse(sub, { scope: "KOSK" })).status).toBe(status);
    });

    it.each([
      ["the köşk's nazımı", KOSK_NAZIM, 200],
      ["a Medaris nazımı with platform.ban_scoped", SCOPED, 200],
      ["the başnazım", ADMIN, 200],
      ["a müderris", MUDERRIS, 403],
      ["the medrese's başmüderris", HEAD, 403],
      ["a Medaris nazımı with no grant", MEDARIS, 403],
    ])("%s widens a course ban to the köşk: %i", async (_who, sub, status) => {
      const course = await seed();
      expect((await extend(sub, course.id)).status).toBe(status);
    });

    it("records a Medaris nazımı's köşk ban at the platform's tier", async () => {
      await banInCourse(SCOPED, { scope: "KOSK" }).expect(201);
      const [row] = await db().select().from(bans);
      expect(row).toMatchObject({
        bannedRole: "MEDARIS_NAZIM",
        bannedTier: 4,
        scope: "KOSK",
      });
    });
  });

  describe("a medrese's bans: POST /madrasahs/:id/bans", () => {
    it.each([
      ["the başmüderris", HEAD, created],
      ["the başnazım", ADMIN, created],
      ["a Medaris nazımı with platform.ban_scoped", SCOPED, created],
    ])("%s bars from the whole medrese: %i", async (_who, sub, status) => {
      expect((await banInMadrasah(sub)).status).toBe(status);
    });

    it("lets a nazır in with madrasah.ban, and no one without a medrese-level permission", async () => {
      // The guard is the medrese's: a nazır with no grant, a Medaris nazımı with no grant
      // and a köşk's nazımı hold neither madrasah.ban nor platform.ban_scoped.
      for (const sub of [NAZIR, MEDARIS, ACCOUNT, KOSK_NAZIM, STRANGER]) {
        await banInMadrasah(sub).expect(403);
      }
      await give(NAZIR, "madrasah", "madrasah.ban");
      await banInMadrasah(NAZIR).expect(201);
    });

    it("bars from one course for the başmüderris, a nazır holding madrasah.ban (d-1004-06) and the başnazım, and not for a Medaris nazımı with only ban_scoped", async () => {
      const body = { scope: "COURSE", courseId: medreseCourse };
      await banInMadrasah(HEAD, body).expect(201);
      const byScoped = await banInMadrasah(SCOPED, {
        ...body,
        userId: TALEBE_2,
      }).expect(403);
      expect(byScoped.body.code).toBe("BAN_FORBIDDEN");
      // madrasah.ban reaches the medrese's courses: no ban.course needed.
      await give(NAZIR, "madrasah", "madrasah.ban");
      const byNazir = await banInMadrasah(NAZIR, {
        ...body,
        userId: TALEBE_2,
      }).expect(201);
      expect(byNazir.body).toMatchObject({
        scope: "COURSE",
        bannedRole: "MEDRESE_NAZIR",
      });
      const [row] = await db()
        .select()
        .from(bans)
        .where(eq(bans.id, byNazir.body.id));
      expect(row.bannedTier).toBe(2);
      // The başnazım may in any course.
      await banInMadrasah(ADMIN, {
        ...body,
        userId: "cb000000-0000-4000-8000-0000000000a2",
      }).expect(201);
    });

    it("keeps a nazır's madrasah.ban to its own medrese: not another's course, which is the medrese route's 404", async () => {
      await give(NAZIR, "madrasah", "madrasah.ban");
      // A course of another medrese is not this medrese's: the same answer as a missing one.
      await banInMadrasah(NAZIR, {
        scope: "COURSE",
        courseId: otherMedreseCourse,
      }).expect(404);
      await banInMadrasah(NAZIR, {
        scope: "COURSE",
        courseId: koskCourse,
      }).expect(404);
    });
  });

  describe("lifting: the permission for the ban's level, then the kademe", () => {
    it.each([
      // a course ban placed by a müderris (tier 1)
      ["a müderris, for a müderris's course ban", MUDERRIS_2, 200],
      ["the başmüderris, for a müderris's course ban", HEAD, 200],
      ["the köşk's nazımı, for a müderris's course ban", KOSK_NAZIM, 200],
      ["the başnazım, for a müderris's course ban", ADMIN, 200],
      ["a ders nazırı with no grant", DERS_NAZIR, 403],
      ["a medrese nazırı with no grant", NAZIR, 403],
      ["a Medaris nazımı with no grant", MEDARIS, 403],
      // The owner's third answer, for lifting.
      ["a Medaris nazımı with only platform.ban_scoped", SCOPED, 403],
      ["another medrese's başmüderris", OTHER_HEAD, 403],
      ["a stranger", STRANGER, 403],
    ])("%s lifts a course ban: %i", async (_who, sub, status) => {
      const course = await seed();
      const res = await lift(sub, course.id);
      expect(res.status).toBe(status);
      if (status === 403) expect(res.body.code).toBe("BAN_LIFT_FORBIDDEN");
    });

    it("lets ban.lift_course lift a course ban and ban.course lift one too, at their own tier", async () => {
      await give(DERS_NAZIR, "course", "ban.lift_course");
      const first = await seed();
      await lift(DERS_NAZIR, first.id).expect(200);
      // Tier 1: what the medrese's level placed is out of reach.
      const higher = await seed({
        bannedBy: HEAD,
        bannedRole: "MEDRESE_BASMUDERRIS",
        bannedTier: 2,
      });
      await lift(DERS_NAZIR, higher.id).expect(403);
      await give(NAZIR, "madrasah", "ban.course");
      await lift(NAZIR, higher.id).expect(200);
    });

    it("lets a nazır holding madrasah.ban lift a course ban of its medrese at the medrese's tier, and nothing above it or elsewhere (d-1004-06)", async () => {
      const byMuderris = await seed();
      const byHead = await seed({
        userId: TALEBE_2,
        bannedBy: HEAD,
        bannedRole: "MEDRESE_BASMUDERRIS",
        bannedTier: 2,
      });
      const byKosk = await seed({
        userId: "cb000000-0000-4000-8000-0000000000b3",
        bannedBy: KOSK_NAZIM,
        bannedRole: "KOSK_NAZIM",
        bannedTier: 3,
      });
      const byMedaris = await seed({
        userId: "cb000000-0000-4000-8000-0000000000b4",
        bannedBy: SCOPED,
        bannedRole: "MEDARIS_NAZIM",
        bannedTier: 4,
      });
      const elsewhere = await seed({
        userId: "cb000000-0000-4000-8000-0000000000b5",
        courseId: otherMedreseCourse,
      });
      const ownKosk = await seed({
        userId: "cb000000-0000-4000-8000-0000000000b6",
        courseId: koskCourse,
      });
      const kosk = await seedKosk({
        userId: "cb000000-0000-4000-8000-0000000000b7",
      });
      await lift(NAZIR, byMuderris.id).expect(403);
      await give(NAZIR, "madrasah", "madrasah.ban");
      await lift(NAZIR, byMuderris.id).expect(200);
      await lift(NAZIR, byHead.id).expect(200);
      // The köşk nazımı's and Medaris administration's bans are above the medrese's tier.
      for (const id of [byKosk.id, byMedaris.id]) {
        const res = await lift(NAZIR, id).expect(403);
        expect(res.body.code).toBe("BAN_LIFT_FORBIDDEN");
      }
      // Another medrese's course, a course the köşk keeps, and the köşk's own ban are not
      // its to lift: madrasah.ban is held only where its medrese is on the chain.
      for (const id of [elsewhere.id, ownKosk.id, kosk.id]) {
        await lift(NAZIR, id).expect(403);
      }
    });

    it("orders by the kademe: a müderris cannot lift what the başmüderris placed, the köşk's nazımı can", async () => {
      const byHead = await seed({
        bannedBy: HEAD,
        bannedRole: "MEDRESE_BASMUDERRIS",
        bannedTier: 2,
      });
      await lift(MUDERRIS, byHead.id).expect(403);
      await lift(KOSK_NAZIM, byHead.id).expect(200);
      const byKosk = await seed({ bannedTier: 3, bannedRole: "KOSK_NAZIM" });
      await lift(HEAD, byKosk.id).expect(403);
      await lift(KOSK_NAZIM, byKosk.id).expect(200);
    });

    it.each([
      ["the köşk's nazımı", KOSK_NAZIM, 200],
      ["a Medaris nazımı with platform.ban_scoped", SCOPED, 200],
      ["the başnazım", ADMIN, 200],
      ["a müderris", MUDERRIS, 403],
      ["the medrese's başmüderris", HEAD, 403],
      ["a Medaris nazımı with no grant", MEDARIS, 403],
      ["another köşk's nazımı", OTHER_NAZIM, 403],
    ])("%s lifts a köşk ban: %i", async (_who, sub, status) => {
      const kosk = await seedKosk();
      expect((await lift(sub, kosk.id)).status).toBe(status);
    });

    it("keeps a Medaris nazımı's köşk ban for Medaris administration: the köşk's nazımı is below it", async () => {
      const byMedaris = await seedKosk({
        bannedBy: SCOPED,
        bannedRole: "MEDARIS_NAZIM",
        bannedTier: 4,
      });
      const res = await lift(KOSK_NAZIM, byMedaris.id).expect(403);
      expect(res.body.code).toBe("BAN_LIFT_FORBIDDEN");
      await lift(SCOPED, byMedaris.id).expect(200);
    });

    it.each([
      ["the başmüderris", HEAD, 200],
      ["a Medaris nazımı with platform.ban_scoped", SCOPED, 200],
      ["the başnazım", ADMIN, 200],
      ["a nazır with no grant", NAZIR, 403],
      ["the köşk's nazımı", KOSK_NAZIM, 403],
      ["a müderris", MUDERRIS, 403],
      ["another medrese's başmüderris", OTHER_HEAD, 403],
    ])("%s lifts a medrese-wide ban: %i", async (_who, sub, status) => {
      const wide = await seedMadrasah();
      expect((await lift(sub, wide.id)).status).toBe(status);
    });

    it("lets a nazır holding madrasah.ban lift a medrese-wide ban at its own tier", async () => {
      const wide = await seedMadrasah();
      await lift(NAZIR, wide.id).expect(403);
      await give(NAZIR, "madrasah", "madrasah.ban");
      await lift(NAZIR, wide.id).expect(200);
    });
  });

  describe("widening to the medrese and asking for a permanent ban", () => {
    it.each([
      ["the başmüderris", HEAD, 201],
      ["a Medaris nazımı with platform.ban_scoped", SCOPED, 201],
      ["the başnazım", ADMIN, 201],
      ["a nazır with no grant", NAZIR, 403],
      ["a Medaris nazımı with no grant", MEDARIS, 403],
      ["the köşk's nazımı", KOSK_NAZIM, 403],
      ["a müderris", MUDERRIS, 403],
    ])("%s widens a course ban to the medrese: %i", async (_who, sub, status) => {
      const course = await seed();
      expect((await escalate(sub, course.id)).status).toBe(status);
    });

    it.each([
      ["the başmüderris", HEAD, 201],
      ["the başnazım", ADMIN, 201],
      // Only the medrese's own permission asks Medaris administration for it.
      ["a Medaris nazımı with platform.ban_scoped", SCOPED, 403],
      ["a nazır with no grant", NAZIR, 403],
      ["the köşk's nazımı", KOSK_NAZIM, 403],
      ["a müderris", MUDERRIS, 403],
    ])("%s asks for a permanent ban: %i", async (_who, sub, status) => {
      const course = await seed();
      expect((await permanent(sub, course.id)).status).toBe(status);
    });

    it("lets a nazır ask once madrasah.permanent_ban_request is given", async () => {
      const course = await seed();
      await permanent(NAZIR, course.id).expect(403);
      await give(NAZIR, "madrasah", "madrasah.permanent_ban_request");
      await permanent(NAZIR, course.id).expect(201);
    });
  });

  describe("reading: the köşk's bans, every ban, and the medrese's bans", () => {
    it.each([
      ["the köşk's nazımı", KOSK_NAZIM, 200],
      ["a Medaris nazımı with platform.ban_scoped", SCOPED, 200],
      ["a Medaris nazımı with platform.ban_account", ACCOUNT, 200],
      ["the başnazım", ADMIN, 200],
      ["a Medaris nazımı with no grant", MEDARIS, 403],
      ["a müderris", MUDERRIS, 403],
      ["the medrese's başmüderris", HEAD, 403],
      ["another köşk's nazımı", OTHER_NAZIM, 403],
    ])("%s reads the köşk's bans: %i", async (_who, sub, status) => {
      await seed();
      const res = await get(sub, `/kosks/${koskId}/bans`);
      expect(res.status).toBe(status);
      if (status === 200) expect(res.body.items).toHaveLength(1);
    });

    it.each([
      ["a Medaris nazımı with platform.ban_scoped", SCOPED, 200],
      ["a Medaris nazımı with platform.ban_account", ACCOUNT, 200],
      ["the başnazım", ADMIN, 200],
      // The review's probe: a Medaris nazımı with no grant listed every ban, reasons and all.
      ["a Medaris nazımı with no grant", MEDARIS, 403],
      ["the köşk's nazımı", KOSK_NAZIM, 403],
      ["the medrese's başmüderris", HEAD, 403],
      ["a stranger", STRANGER, 403],
    ])("%s reads every ban: %i", async (_who, sub, status) => {
      await seed();
      const res = await get(sub, "/bans");
      expect(res.status).toBe(status);
      if (status === 200) expect(res.body.total).toBe(1);
      if (status === 403) expect(res.body.items).toBeUndefined();
    });

    it("reads a medrese's bans for the başmüderris, a nazır holding madrasah.ban and a Medaris nazımı with ban_scoped, and not for a nazır with no grant", async () => {
      await seed();
      for (const sub of [HEAD, SCOPED, ADMIN]) {
        await get(sub, `/madrasahs/${madrasahId}/bans`).expect(200);
      }
      for (const sub of [NAZIR, MEDARIS, KOSK_NAZIM, OTHER_HEAD]) {
        await get(sub, `/madrasahs/${madrasahId}/bans`).expect(403);
      }
      await give(NAZIR, "madrasah", "madrasah.ban");
      await get(NAZIR, `/madrasahs/${madrasahId}/bans`).expect(200);
    });
  });

  describe("the flags a list gives are what the route then does", () => {
    type Row = {
      id: string;
      viewerMayLift: boolean;
      viewerMayExtend?: boolean;
      viewerMayEscalate?: boolean;
      viewerMayRequestPermanent?: boolean;
    };

    it("agrees for the köşk's list: viewerMayLift and viewerMayExtend are the answers lift and extend give", async () => {
      await give(DERS_NAZIR, "kosk", "ban.manage_kosk");
      for (const sub of [KOSK_NAZIM, SCOPED, ADMIN]) {
        const courseBan = await seed({ userId: TALEBE });
        const hers = await seed({
          userId: TALEBE_2,
          bannedBy: HEAD,
          bannedRole: "MEDRESE_BASMUDERRIS",
          bannedTier: 2,
        });
        const kosk = await seedKosk({
          userId: "cb000000-0000-4000-8000-0000000000b1",
        });
        const platform = await seedKosk({
          userId: "cb000000-0000-4000-8000-0000000000b2",
          bannedBy: ADMIN,
          bannedRole: "SYSTEM_ADMIN",
          bannedTier: 4,
        });
        const rows = (await get(sub, `/kosks/${koskId}/bans`).expect(200)).body
          .items as Row[];
        const flags = (id: string) => rows.find((r) => r.id === id) as Row;
        for (const id of [courseBan.id, hers.id, kosk.id, platform.id]) {
          const res = await lift(sub, id);
          expect(res.status === 200, `${sub} lift ${id}`).toBe(
            flags(id).viewerMayLift
          );
        }
        await db().delete(bans);
      }
    });

    it("agrees for the medrese's list, and gives a nazır only what the nazır holds", async () => {
      const wide = await seedMadrasah();
      const course = await seed({ userId: TALEBE_2 });
      const rowsFor = async (sub: string) =>
        (await get(sub, `/madrasahs/${madrasahId}/bans`).expect(200)).body
          .items as Row[];
      const flag = (rows: Row[], id: string) =>
        (rows.find((r) => r.id === id) as Row).viewerMayLift;

      // The başmüderris and a Medaris nazımı with ban_scoped: the medrese-wide ban, and the
      // course ban only for the başmüderris (it holds ban.course there).
      const head = await rowsFor(HEAD);
      expect([flag(head, wide.id), flag(head, course.id)]).toEqual([
        true,
        true,
      ]);
      const scoped = await rowsFor(SCOPED);
      expect([flag(scoped, wide.id), flag(scoped, course.id)]).toEqual([
        true,
        false,
      ]);

      // A nazır is given one permission at a time, and the list follows. madrasah.ban reaches
      // the medrese's courses (d-1004-06) at the medrese's tier: a müderris's and the
      // medrese's own course bans are liftable, the köşk nazımı's is not.
      const byKosk = await seed({
        userId: "cb000000-0000-4000-8000-0000000000b8",
        bannedBy: KOSK_NAZIM,
        bannedRole: "KOSK_NAZIM",
        bannedTier: 3,
      });
      await give(NAZIR, "madrasah", "madrasah.ban");
      let nazir = await rowsFor(NAZIR);
      expect([
        flag(nazir, wide.id),
        flag(nazir, course.id),
        flag(nazir, byKosk.id),
      ]).toEqual([true, true, false]);
      expect(nazir.find((r) => r.id === course.id)).toMatchObject({
        viewerMayEscalate: true,
        viewerMayRequestPermanent: false,
      });
      await give(NAZIR, "madrasah", "madrasah.permanent_ban_request");
      nazir = await rowsFor(NAZIR);
      expect(nazir.find((r) => r.id === course.id)).toMatchObject({
        viewerMayRequestPermanent: true,
      });

      // The flag is the route's answer.
      await lift(NAZIR, byKosk.id).expect(403);
      await lift(NAZIR, course.id).expect(200);
      await lift(NAZIR, wide.id).expect(200);
    });
  });

  describe("who cannot be barred, from either route", () => {
    it.each([
      ["a müderris of the course", MUDERRIS_2],
      ["a ders nazırı", DERS_NAZIR],
      ["the köşk's nazımı", KOSK_NAZIM],
      ["a Medaris nazımı", MEDARIS],
      // The course route now guards a medrese's own people as the medrese route does.
      ["the medrese's başmüderris", HEAD],
      ["a medrese nazırı", NAZIR],
    ])("%s is not barred from a medrese's course", async (_who, target) => {
      const res = await banInCourse(KOSK_NAZIM, { userId: target }).expect(400);
      expect(res.body.code).toBe("BAN_TARGET_INVALID");
      const viaMedrese = await banInMadrasah(HEAD, {
        scope: "COURSE",
        courseId: medreseCourse,
        userId: target,
      }).expect(400);
      expect(viaMedrese.body.code).toBe("BAN_TARGET_INVALID");
    });

    it("bars no one from oneself", async () => {
      const res = await banInCourse(HEAD, { userId: HEAD }).expect(400);
      expect(res.body.code).toBe("BAN_TARGET_INVALID");
    });
  });

  describe("nothing else changes", () => {
    it("still needs a reason to lift and to ban, and answers an unknown ban 404 and a lifted one 409", async () => {
      const course = await seed();
      await http()
        .post(`/bans/${course.id}/lift`)
        .set("Authorization", auth(HEAD))
        .send({ reason: "  " })
        .expect(400);
      await lift(HEAD, course.id).expect(200);
      await lift(HEAD, course.id).expect(409);
      await lift(HEAD, "cb000000-0000-4000-8000-0000000000ff").expect(404);
      await banInCourse(HEAD, { reason: "" }).expect(400);
    });

    it("writes the audit rows of a ban and its lift with the role that conferred the permission", async () => {
      const placed = await banInCourse(KOSK_NAZIM).expect(201);
      await lift(KOSK_NAZIM, placed.body.id).expect(200);
      const rows = await db().select().from(auditLog).orderBy(auditLog.seq);
      expect(rows.map((r) => [r.action, r.actorId])).toEqual([
        ["ban.create", KOSK_NAZIM],
        ["ban.lift", KOSK_NAZIM],
      ]);
      expect(rows[1].details).toMatchObject({ role: "KOSK_NAZIM" });
    });
  });
});
