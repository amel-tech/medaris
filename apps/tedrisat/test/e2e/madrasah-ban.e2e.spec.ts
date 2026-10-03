import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  BAN_SCOPES,
  banPermanentRequests,
  bans,
} from "../../src/database/schema/ban.schema";
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
 * MDRS-187, nazir/10 and nazir/11: a medrese's bans — barring a talebe from one
 * of its courses or from all of it, the list with what each row lets the
 * caller do, widening a course ban to the medrese, asking for a permanent ban,
 * and what a medrese-wide ban does to enrolling — against a real Postgres.
 * Real `AuthGuard` with minted tokens. The routes under `/madrasahs/:id` are the
 * başmüderris's, and a nazır's once the medrese gave `madrasah.ban`; the routes
 * by ban id are decided from the catalogue (MDRS-205), so a nazır acts on a ban
 * only with the permission for its level.
 */
const ADMIN_ID = "e7000000-0000-4000-8000-000000000001";
const HEAD_ID = "e7000000-0000-4000-8000-000000000002";
const NAZIR_ID = "e7000000-0000-4000-8000-000000000003";
const OTHER_HEAD_ID = "e7000000-0000-4000-8000-000000000004";
const KOSK_NAZIM_ID = "e7000000-0000-4000-8000-000000000005";
const MUDERRIS_ID = "e7000000-0000-4000-8000-000000000006";
const STRANGER_ID = "e7000000-0000-4000-8000-000000000007";
const TALEBE_ID = "e7000000-0000-4000-8000-000000000008";
const TALEBE_2_ID = "e7000000-0000-4000-8000-000000000009";
const MISSING_ID = "e7000000-0000-4000-8000-00000000ffff";
const REASON = "Celselerde başka talebelere hakaret etti.";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Medrese bans (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let nuruId: string;
  let fatihId: string;
  let binaId: string;
  let mantikId: string;
  let foreignCourseId: string;
  let koskCourseId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const base = (id = madrasahId) => `/madrasahs/${id}`;
  const TABLES = [
    ...COURSE_TREE_TABLES,
    "bans",
    "ban_permanent_requests",
    "madrasahs",
    "audit_log",
    "users",
  ] as const;

  const ban = (sub: string, body: Record<string, unknown>, id = madrasahId) =>
    http()
      .post(`${base(id)}/bans`)
      .set("Authorization", auth(sub))
      .send({ userId: TALEBE_ID, reason: REASON, ...body });
  const courseBan = (sub: string, over: Record<string, unknown> = {}) =>
    ban(sub, { scope: "COURSE", courseId: binaId, ...over });
  const list = (sub: string, query = "", id = madrasahId) =>
    http()
      .get(`${base(id)}/bans${query}`)
      .set("Authorization", auth(sub));
  const act = (sub: string, banId: string, action: string, body: object) =>
    http()
      .post(`/bans/${banId}/${action}`)
      .set("Authorization", auth(sub))
      .send(body);
  const escalate = (sub: string, banId: string, reason = "Aynı davranış.") =>
    act(sub, banId, "escalate", { reason });
  const permanent = (sub: string, banId: string, reason = "Tekrarlandı.") =>
    act(sub, banId, "permanent-request", { reason });
  const lift = (sub: string, banId: string) =>
    act(sub, banId, "lift", { reason: "Görüşüldü." });
  const enroll = (sub: string, courseId: string) =>
    http().post(`/courses/${courseId}/enroll`).set("Authorization", auth(sub));

  /** A ban row inserted as a given kademe placed it, for what the routes cannot make. */
  const seedBan = async (over: Partial<typeof bans.$inferInsert> = {}) =>
    (
      await db()
        .insert(bans)
        .values({
          userId: TALEBE_ID,
          koskId: nuruId,
          courseId: binaId,
          scope: BAN_SCOPES.COURSE,
          reason: REASON,
          bannedBy: KOSK_NAZIM_ID,
          bannedRole: "KOSK_NAZIM",
          bannedTier: 3,
          ...over,
        })
        .returning()
    )[0];
  const audits = (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));
  /** Gives the medrese nazır a permission at the medrese, as the başmüderris does from the nazır screens. */
  const giveNazir = (...permissions: string[]) =>
    db()
      .insert(permissionGrants)
      .values(
        permissions.map((permission) => ({
          userId: NAZIR_ID,
          scopeType: SCOPE_TYPES.MADRASAH,
          scopeId: madrasahId,
          permission,
          groupId: null,
          grantedBy: HEAD_ID,
        }))
      );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    await db()
      .insert(users)
      .values([
        { id: TALEBE_ID, givenName: "Ömer Faruk", familyName: "Demirkaya" },
      ]);
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
    const [nuru, fatih] = await db()
      .insert(kosks)
      .values([
        { ownerId: KOSK_NAZIM_ID, name: "Nûruosmaniye Köşkü" },
        { ownerId: KOSK_NAZIM_ID, name: "Fatih Köşkü" },
      ])
      .returning();
    nuruId = nuru.id;
    fatihId = fatih.id;
    const seeded = await db()
      .insert(courses)
      .values(
        [
          ["Bina ve İzhar Şerhi", nuruId, madrasahId],
          ["Mantığa giriş", fatihId, madrasahId],
          ["Başka medresenin dersi", nuruId, otherMadrasahId],
          ["Köşkün kendi dersi", nuruId, null],
        ].map(([title, koskId, medrese]) => ({
          title: title as string,
          koskId: koskId as string,
          madrasahId: medrese,
          authorId: KOSK_NAZIM_ID,
          status: CourseStatus.PUBLISHED,
        }))
      )
      .returning();
    [binaId, mantikId, foreignCourseId, koskCourseId] = seeded.map((c) => c.id);
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
    });
    await assignRole(db(), {
      userId: NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD_ID,
    });
    await assignRole(db(), {
      userId: OTHER_HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: otherMadrasahId,
    });
    await assignRole(db(), {
      userId: KOSK_NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: nuruId,
    });
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: binaId,
    });
    await db()
      .insert(enrollments)
      .values({ userId: TALEBE_ID, courseId: binaId });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  describe("POST /madrasahs/:id/bans", () => {
    it("lets the başmüderris bar a talebe from one course and records who, in which role, and why", async () => {
      const res = await courseBan(HEAD_ID).expect(201);
      expect(res.body).toMatchObject({
        scope: "COURSE",
        courseId: binaId,
        courseTitle: "Bina ve İzhar Şerhi",
        madrasahName: "Süleymaniye Medresesi",
        bannedRole: "MEDRESE_BASMUDERRIS",
        bannedBy: { id: HEAD_ID },
        user: { id: TALEBE_ID, name: "Ömer Faruk Demirkaya" },
        reason: REASON,
        liftedAt: null,
        viewerMayLift: true,
        viewerMayEscalate: true,
        viewerMayRequestPermanent: true,
        permanentRequestedAt: null,
      });
      expect(res.body).not.toHaveProperty("viewerMayExtend");
      const [row] = await db().select().from(bans);
      expect(row).toMatchObject({
        bannedBy: HEAD_ID,
        bannedTier: 2,
        koskId: nuruId,
        madrasahId: null,
      });
      expect(await audits("ban.create")).toHaveLength(1);
    });

    it("bars a talebe from the whole medrese, which belongs to no single köşk", async () => {
      const res = await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      expect(res.body).toMatchObject({
        scope: "MADRASAH",
        koskId: null,
        courseId: null,
        madrasahName: "Süleymaniye Medresesi",
        bannedRole: "MEDRESE_BASMUDERRIS",
        viewerMayLift: true,
        viewerMayEscalate: false,
        viewerMayRequestPermanent: true,
      });
      const [row] = await db().select().from(bans);
      expect(row).toMatchObject({ madrasahId, koskId: null, bannedTier: 2 });
    });

    it("answers a second request for the same bar with the first", async () => {
      const first = await courseBan(HEAD_ID).expect(201);
      expect((await courseBan(HEAD_ID).expect(201)).body.id).toBe(
        first.body.id
      );
      const wide = await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      expect(
        (await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201)).body.id
      ).toBe(wide.body.id);
      expect(await db().select().from(bans)).toHaveLength(2);
    });

    it("keeps the başnazım's ban at the top of the ladder", async () => {
      const res = await ban(ADMIN_ID, { scope: "MADRASAH" }).expect(201);
      expect(res.body.bannedRole).toBe("SYSTEM_ADMIN");
      const [row] = await db().select().from(bans);
      expect(row.bannedTier).toBe(4);
    });

    it("refuses a course that is not the medrese's, barring oneself, and a nazır of the medrese", async () => {
      await courseBan(HEAD_ID, { courseId: foreignCourseId }).expect(404);
      await courseBan(HEAD_ID, { courseId: koskCourseId }).expect(404);
      await courseBan(HEAD_ID, { courseId: MISSING_ID }).expect(404);
      await courseBan(HEAD_ID, { userId: HEAD_ID }).expect(400);
      await courseBan(HEAD_ID, { userId: NAZIR_ID }).expect(400);
      await ban(HEAD_ID, { scope: "MADRASAH", userId: NAZIR_ID }).expect(400);
      expect(await db().select().from(bans)).toHaveLength(0);
    });

    it("validates the body", async () => {
      await courseBan(HEAD_ID, { reason: "   " }).expect(400);
      await courseBan(HEAD_ID, { reason: "x".repeat(501) }).expect(400);
      await courseBan(HEAD_ID, { scope: "KOSK" }).expect(400);
      await courseBan(HEAD_ID, { scope: "WORLD" }).expect(400);
      await courseBan(HEAD_ID, { courseId: undefined }).expect(400);
      await courseBan(HEAD_ID, { courseId: "not-a-uuid" }).expect(400);
      await courseBan(HEAD_ID, { userId: "not-a-uuid" }).expect(400);
      // The course is not looked at for a medrese-wide ban.
      await ban(HEAD_ID, { scope: "MADRASAH", courseId: undefined }).expect(
        201
      );
    });

    it("is the başmüderris's alone: strangers, another medrese's head and a nazır get 403", async () => {
      for (const sub of [STRANGER_ID, OTHER_HEAD_ID, NAZIR_ID, MUDERRIS_ID]) {
        await courseBan(sub).expect(403);
      }
      await ban(HEAD_ID, { scope: "MADRASAH" }, MISSING_ID).expect(404);
      await http()
        .post(`${base()}/bans`)
        .send({ userId: TALEBE_ID, scope: "MADRASAH", reason: REASON })
        .expect(401);
      expect(await db().select().from(bans)).toHaveLength(0);
    });
  });

  describe("GET /madrasahs/:id/bans", () => {
    it("lists the medrese's bans, the course bans and the medrese-wide ones, with the counts", async () => {
      await courseBan(HEAD_ID).expect(201);
      await ban(HEAD_ID, { scope: "MADRASAH", userId: TALEBE_2_ID }).expect(
        201
      );
      // Not the medrese's: another medrese's course, a köşk's own course, a whole köşk.
      await seedBan({ courseId: foreignCourseId, userId: TALEBE_2_ID });
      await seedBan({ courseId: koskCourseId, userId: TALEBE_2_ID });
      await seedBan({
        scope: BAN_SCOPES.KOSK,
        courseId: null,
        userId: TALEBE_2_ID,
      });
      const res = await list(HEAD_ID).expect(200);
      expect(res.body).toMatchObject({
        activeCount: 2,
        liftedCount: 0,
        recentCount: 2,
      });
      expect(
        res.body.items.map((b: { scope: string }) => b.scope).sort()
      ).toEqual(["COURSE", "MADRASAH"]);
      expect(res.body.items[0]).toMatchObject({
        reason: REASON,
        bannedBy: { id: HEAD_ID },
      });
    });

    it("splits open and lifted bans and filters by scope and course", async () => {
      const course = await courseBan(HEAD_ID).expect(201);
      await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      await seedBan({
        courseId: mantikId,
        koskId: fatihId,
        userId: TALEBE_2_ID,
        bannedBy: MUDERRIS_ID,
        bannedRole: "MUDERRIS",
        bannedTier: 1,
      });
      await lift(HEAD_ID, course.body.id).expect(200);

      const active = await list(HEAD_ID).expect(200);
      expect(active.body).toMatchObject({ activeCount: 2, liftedCount: 1 });
      const lifted = await list(HEAD_ID, "?status=LIFTED").expect(200);
      expect(lifted.body.items).toHaveLength(1);
      expect(lifted.body.items[0]).toMatchObject({
        id: course.body.id,
        liftReason: "Görüşüldü.",
        liftedBy: { id: HEAD_ID },
        viewerMayLift: false,
        viewerMayEscalate: false,
        viewerMayRequestPermanent: false,
      });
      // Counts are the medrese's whatever the filter narrows the rows to.
      expect(
        (await list(HEAD_ID, "?scope=MADRASAH").expect(200)).body
      ).toMatchObject({ activeCount: 2, liftedCount: 1 });
      expect(
        (await list(HEAD_ID, "?scope=MADRASAH").expect(200)).body.items
      ).toHaveLength(1);
      expect(
        (await list(HEAD_ID, "?scope=COURSE").expect(200)).body.items
      ).toHaveLength(1);
      expect(
        (await list(HEAD_ID, `?courseId=${mantikId}`).expect(200)).body.items
      ).toHaveLength(1);
      expect(
        (await list(HEAD_ID, `?courseId=${foreignCourseId}`).expect(200)).body
          .items
      ).toHaveLength(0);
    });

    it("says per row what the caller's kademe lets them do", async () => {
      // A müderris's ban, a köşk nazımı's, and Medaris administration's.
      await seedBan({
        userId: TALEBE_2_ID,
        bannedBy: MUDERRIS_ID,
        bannedRole: "MUDERRIS",
        bannedTier: 1,
      });
      await seedBan({ bannedTier: 3 });
      await seedBan({
        courseId: mantikId,
        koskId: fatihId,
        bannedBy: ADMIN_ID,
        bannedRole: "SYSTEM_ADMIN",
        bannedTier: 4,
      });
      const items = (await list(HEAD_ID).expect(200)).body.items as {
        bannedRole: string;
        viewerMayLift: boolean;
        viewerMayEscalate: boolean;
        viewerMayRequestPermanent: boolean;
      }[];
      const by = (role: string) => items.find((i) => i.bannedRole === role);
      expect(by("MUDERRIS")).toMatchObject({
        viewerMayLift: true,
        viewerMayEscalate: true,
        viewerMayRequestPermanent: true,
      });
      // Above the medrese's own kademe: no lift, but it can be widened.
      expect(by("KOSK_NAZIM")).toMatchObject({
        viewerMayLift: false,
        viewerMayEscalate: true,
        viewerMayRequestPermanent: true,
      });
      // Medaris administration's own ban needs no request to be permanent.
      expect(by("SYSTEM_ADMIN")).toMatchObject({
        viewerMayLift: false,
        viewerMayEscalate: true,
        viewerMayRequestPermanent: false,
      });
    });

    it("no longer offers to widen a course ban once the medrese bars the talebe", async () => {
      const course = await courseBan(HEAD_ID).expect(201);
      await escalate(HEAD_ID, course.body.id).expect(201);
      const items = (await list(HEAD_ID).expect(200)).body.items as {
        id: string;
        viewerMayEscalate: boolean;
      }[];
      expect(items).toHaveLength(2);
      expect(items.find((i) => i.id === course.body.id)).toMatchObject({
        viewerMayEscalate: false,
      });
    });

    it("validates the query and answers only the başmüderris", async () => {
      await list(HEAD_ID, "?status=NOPE").expect(400);
      await list(HEAD_ID, "?scope=KOSK").expect(400);
      await list(HEAD_ID, "?courseId=nope").expect(400);
      await list(ADMIN_ID).expect(200);
      for (const sub of [STRANGER_ID, OTHER_HEAD_ID, NAZIR_ID, MUDERRIS_ID]) {
        await list(sub).expect(403);
      }
      await list(HEAD_ID, "", MISSING_ID).expect(404);
    });
  });

  describe("POST /bans/:id/escalate", () => {
    it("widens a course ban to the medrese and leaves the course ban standing", async () => {
      const course = await seedBan();
      const res = await escalate(
        HEAD_ID,
        course.id,
        "Başka derslerde de sürdü."
      ).expect(201);
      expect(res.body).toMatchObject({
        scope: "MADRASAH",
        koskId: null,
        courseId: null,
        extendedFromCourseId: binaId,
        extendedFromCourseTitle: "Bina ve İzhar Şerhi",
        madrasahName: "Süleymaniye Medresesi",
        reason: "Başka derslerde de sürdü.",
        bannedRole: "MEDRESE_BASMUDERRIS",
        bannedBy: { id: HEAD_ID },
        viewerMayLift: true,
      });
      const rows = await db().select().from(bans);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.id === course.id)?.liftedAt).toBeNull();
      expect(rows.find((r) => r.id === res.body.id)).toMatchObject({
        madrasahId,
        bannedTier: 2,
        extendedFromCourseId: binaId,
      });
      expect(await audits("ban.create")).toHaveLength(1);
    });

    it("answers a second widening with the ban the first made", async () => {
      const course = await seedBan();
      const first = await escalate(HEAD_ID, course.id).expect(201);
      const second = await escalate(HEAD_ID, course.id).expect(201);
      expect(second.body.id).toBe(first.body.id);
      expect(await db().select().from(bans)).toHaveLength(2);
    });

    it("is the medrese's: a köşk nazımı and a müderris cannot widen to the medrese", async () => {
      const course = await seedBan();
      for (const sub of [KOSK_NAZIM_ID, MUDERRIS_ID, STRANGER_ID]) {
        const res = await escalate(sub, course.id).expect(403);
        expect(res.body.code).toBe("BAN_FORBIDDEN");
      }
      await escalate(OTHER_HEAD_ID, course.id).expect(403);
      expect(await db().select().from(bans)).toHaveLength(1);
    });

    it("lets a medrese nazır holding madrasah.ban, and the başnazım, widen it too; with no grant the nazır cannot", async () => {
      const course = await seedBan();
      const refused = await escalate(NAZIR_ID, course.id).expect(403);
      expect(refused.body.code).toBe("BAN_FORBIDDEN");
      await giveNazir("madrasah.ban");
      const byNazir = await escalate(NAZIR_ID, course.id).expect(201);
      expect(byNazir.body.bannedRole).toBe("MEDRESE_NAZIR");
      const other = await seedBan({ userId: TALEBE_2_ID });
      const byAdmin = await escalate(ADMIN_ID, other.id).expect(201);
      expect(byAdmin.body.bannedRole).toBe("SYSTEM_ADMIN");
    });

    it("refuses what is not a course ban in a medrese's course, and a lifted ban", async () => {
      const wide = await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      const ownCourse = await seedBan({
        courseId: koskCourseId,
        userId: TALEBE_2_ID,
      });
      const kosk = await seedBan({
        scope: BAN_SCOPES.KOSK,
        courseId: null,
        userId: TALEBE_2_ID,
      });
      for (const id of [wide.body.id, ownCourse.id, kosk.id]) {
        const res = await escalate(HEAD_ID, id).expect(409);
        expect(res.body.code).toBe("BAN_NOT_ESCALATABLE");
      }
      const lifted = await seedBan({
        userId: TALEBE_2_ID,
        courseId: mantikId,
        koskId: fatihId,
        liftedAt: new Date(),
        liftedBy: HEAD_ID,
        liftReason: "Görüşüldü.",
      });
      const res = await escalate(HEAD_ID, lifted.id).expect(409);
      expect(res.body.code).toBe("BAN_ALREADY_LIFTED");
    });

    it("needs a reason, a known ban and a sign-in", async () => {
      const course = await seedBan();
      await act(HEAD_ID, course.id, "escalate", { reason: "  " }).expect(400);
      await act(HEAD_ID, course.id, "escalate", {}).expect(400);
      await escalate(HEAD_ID, MISSING_ID).expect(404);
      await http()
        .post(`/bans/${course.id}/escalate`)
        .send({ reason: "x" })
        .expect(401);
    });
  });

  describe("POST /bans/:id/lift for the medrese", () => {
    it("lets the başmüderris and a nazır holding the permission lift what the medrese or a müderris placed", async () => {
      const mine = await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      const muderrisBan = await seedBan({
        userId: TALEBE_2_ID,
        bannedBy: MUDERRIS_ID,
        bannedRole: "MUDERRIS",
        bannedTier: 1,
      });
      const res = await lift(HEAD_ID, mine.body.id).expect(200);
      expect(res.body).toMatchObject({
        scope: "MADRASAH",
        liftReason: "Görüşüldü.",
        liftedBy: { id: HEAD_ID },
      });
      // With no grant the nazır lifts nothing; madrasah.ban reaches the medrese's own
      // level and its courses' bans (d-1004-06), at the medrese's tier.
      const refused = await lift(NAZIR_ID, muderrisBan.id).expect(403);
      expect(refused.body.code).toBe("BAN_LIFT_FORBIDDEN");
      await giveNazir("madrasah.ban");
      await lift(NAZIR_ID, muderrisBan.id).expect(200);
      expect(await audits("ban.lift")).toHaveLength(2);
    });

    it("keeps a köşk nazımı's and Medaris administration's ban for them", async () => {
      const kosk = await seedBan({ bannedTier: 3 });
      const platform = await seedBan({
        userId: TALEBE_2_ID,
        courseId: mantikId,
        koskId: fatihId,
        bannedBy: ADMIN_ID,
        bannedRole: "SYSTEM_ADMIN",
        bannedTier: 4,
      });
      for (const id of [kosk.id, platform.id]) {
        const res = await lift(HEAD_ID, id).expect(403);
        expect(res.body.code).toBe("BAN_LIFT_FORBIDDEN");
      }
      await lift(KOSK_NAZIM_ID, kosk.id).expect(200);
    });

    it("keeps a medrese-wide ban for the medrese and Medaris administration", async () => {
      const wide = await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      // A köşk's nazım rules a köşk, not the medrese.
      await lift(KOSK_NAZIM_ID, wide.body.id).expect(403);
      await lift(OTHER_HEAD_ID, wide.body.id).expect(403);
      await lift(ADMIN_ID, wide.body.id).expect(200);
      await lift(ADMIN_ID, wide.body.id).expect(409);
    });
  });

  describe("POST /bans/:id/permanent-request", () => {
    it("records the medrese's request, keeps the ban standing and marks the list", async () => {
      const course = await seedBan({ bannedTier: 1, bannedRole: "MUDERRIS" });
      const res = await permanent(
        HEAD_ID,
        course.id,
        "Davranış tekrarlandı."
      ).expect(201);
      expect(res.body).toMatchObject({
        id: course.id,
        liftedAt: null,
        viewerMayRequestPermanent: false,
        permanentRequestedAt: expect.any(String),
      });
      const [request] = await db().select().from(banPermanentRequests);
      expect(request).toMatchObject({
        banId: course.id,
        reason: "Davranış tekrarlandı.",
        requestedBy: HEAD_ID,
      });
      expect(await audits("ban.permanent_request")).toHaveLength(1);
      const listed = (await list(HEAD_ID).expect(200)).body.items;
      expect(listed[0]).toMatchObject({
        id: course.id,
        permanentRequestedAt: res.body.permanentRequestedAt,
        viewerMayRequestPermanent: false,
      });
    });

    it("asks for a medrese-wide ban too, and only once for a ban", async () => {
      const wide = await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      await permanent(HEAD_ID, wide.body.id).expect(201);
      await permanent(NAZIR_ID, wide.body.id).expect(403);
      await giveNazir("madrasah.permanent_ban_request");
      const again = await permanent(NAZIR_ID, wide.body.id).expect(409);
      expect(again.body.code).toBe("BAN_PERMANENT_REQUEST_EXISTS");
      expect(await db().select().from(banPermanentRequests)).toHaveLength(1);
    });

    it("refuses Medaris administration's own ban, a köşk's, and a course outside any medrese", async () => {
      const platform = await seedBan({
        bannedBy: ADMIN_ID,
        bannedRole: "SYSTEM_ADMIN",
        bannedTier: 4,
      });
      const kosk = await seedBan({
        scope: BAN_SCOPES.KOSK,
        courseId: null,
        userId: TALEBE_2_ID,
      });
      const ownCourse = await seedBan({
        courseId: koskCourseId,
        userId: TALEBE_2_ID,
      });
      for (const id of [platform.id, kosk.id, ownCourse.id]) {
        const res = await permanent(HEAD_ID, id).expect(409);
        expect(res.body.code).toBe("BAN_PERMANENT_REQUEST_INVALID");
      }
      expect(await db().select().from(banPermanentRequests)).toHaveLength(0);
    });

    it("is the medrese's: a köşk nazımı, a müderris and a stranger get 403", async () => {
      const course = await seedBan();
      for (const sub of [KOSK_NAZIM_ID, MUDERRIS_ID, STRANGER_ID]) {
        await permanent(sub, course.id).expect(403);
      }
      await permanent(OTHER_HEAD_ID, course.id).expect(403);
      await permanent(ADMIN_ID, course.id).expect(201);
    });

    it("needs a reason and an open, known ban", async () => {
      const course = await seedBan();
      await act(HEAD_ID, course.id, "permanent-request", {
        reason: " ",
      }).expect(400);
      await permanent(HEAD_ID, MISSING_ID).expect(404);
      const lifted = await seedBan({
        userId: TALEBE_2_ID,
        courseId: mantikId,
        koskId: fatihId,
        liftedAt: new Date(),
        liftedBy: HEAD_ID,
        liftReason: "Görüşüldü.",
      });
      const res = await permanent(HEAD_ID, lifted.id).expect(409);
      expect(res.body.code).toBe("BAN_ALREADY_LIFTED");
    });

    it("never sends the reasons to the talebe", async () => {
      const course = await seedBan();
      await permanent(HEAD_ID, course.id, "Gizli talep gerekçesi.").expect(201);
      for (const path of ["/courses/enrolled", "/me", `/courses/${binaId}`]) {
        const res = await http()
          .get(path)
          .set("Authorization", auth(TALEBE_ID));
        const body = JSON.stringify(res.body);
        expect(body).not.toContain("Gizli talep gerekçesi");
        expect(body).not.toContain("hakaret");
      }
    });
  });

  describe("what a medrese-wide ban does", () => {
    it("bars the talebe from every course of the medrese, and from none outside it", async () => {
      await db().delete(enrollments).where(eq(enrollments.userId, TALEBE_ID));
      await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      for (const id of [binaId, mantikId]) {
        const res = await enroll(TALEBE_ID, id).expect(403);
        expect(res.body.code).toBe("BAN_ACTIVE");
      }
      await enroll(TALEBE_ID, foreignCourseId).expect(201);
      await enroll(TALEBE_ID, koskCourseId).expect(201);
    });

    it("keeps the seat of a barred talebe, marks the roster and refuses leaving", async () => {
      const wide = await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      const left = await http()
        .delete(`/courses/${binaId}/enrollment`)
        .set("Authorization", auth(TALEBE_ID))
        .expect(403);
      expect(left.body.code).toBe("BAN_ACTIVE");
      const roster = await http()
        .get(`/courses/${binaId}/enrollments`)
        .set("Authorization", auth(MUDERRIS_ID))
        .expect(200);
      expect(roster.body[0].ban).toEqual({
        id: wide.body.id,
        scope: "MADRASAH",
      });
      expect(JSON.stringify(roster.body)).not.toContain("hakaret");
    });

    it("loses the talebe the course's content, as a course ban does", async () => {
      const [week] = await db()
        .insert(courseWeeks)
        .values({ courseId: binaId, weekNumber: 1, title: "Birinci Bab" })
        .returning();
      await db()
        .insert(lessons)
        .values({
          weekId: week.id,
          title: "Açılış",
          type: LessonType.LIVE,
          scheduledAt: new Date(Date.now() + 86_400_000),
          meetingUrl: "https://meet.google.com/abc-defg-hij",
        });
      const meetingUrl = async () =>
        (
          await http()
            .get(`/courses/${binaId}`)
            .set("Authorization", auth(TALEBE_ID))
            .expect(200)
        ).body.weeks[0].lessons[0].meetingUrl;
      expect(await meetingUrl()).toBe("https://meet.google.com/abc-defg-hij");
      const wide = await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      expect(await meetingUrl()).toBeUndefined();
      await lift(HEAD_ID, wide.body.id).expect(200);
      expect(await meetingUrl()).toBe("https://meet.google.com/abc-defg-hij");
    });

    it("lets the talebe apply again once the ban is lifted", async () => {
      await db().delete(enrollments).where(eq(enrollments.userId, TALEBE_ID));
      const wide = await ban(HEAD_ID, { scope: "MADRASAH" }).expect(201);
      await enroll(TALEBE_ID, binaId).expect(403);
      await lift(HEAD_ID, wide.body.id).expect(200);
      await enroll(TALEBE_ID, binaId).expect(201);
      expect(
        await db()
          .select()
          .from(bans)
          .where(and(eq(bans.userId, TALEBE_ID), isNull(bans.liftedAt)))
      ).toHaveLength(0);
    });
  });
});
