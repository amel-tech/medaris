import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  BAN_SCOPES,
  banPermanentRequests,
  bans,
} from "../../src/database/schema/ban.schema";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
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
 * MDRS-194, nizam/45: Medaris administration decides the requests for a
 * permanent ban — the list with both counts, refusing with a note, approving
 * into a platform ban, and what that ban does in a köşk the lower ban never
 * reached — against a real Postgres, with the real `AuthGuard` and minted
 * tokens. The başnazım decides, and a Medaris nazımı only with
 * `platform.ban_account`.
 */
const ADMIN_ID = "e9400000-0000-4000-8000-000000000001";
const HEAD_ID = "e9400000-0000-4000-8000-000000000002";
const NAZIM_ID = "e9400000-0000-4000-8000-000000000003";
const NAZIM_BARE_ID = "e9400000-0000-4000-8000-000000000004";
const KOSK_NAZIM_ID = "e9400000-0000-4000-8000-000000000005";
const TALEBE_ID = "e9400000-0000-4000-8000-000000000008";
const TALEBE_2_ID = "e9400000-0000-4000-8000-000000000009";
const MISSING_ID = "e9400000-0000-4000-8000-00000000ffff";
const BAN_REASON = "Celselerde başka talebelere hakaret etti.";
const ASK_REASON = "Başka köşklerde de aynı davranışı sürdürüyor.";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Permanent ban requests (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let nuruId: string;
  let binaId: string;
  /** A course of another köşk and no medrese: nothing below the platform reaches it. */
  let elsewhereId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const TABLES = [
    ...COURSE_TREE_TABLES,
    "permission_grants",
    "bans",
    "ban_permanent_requests",
    "madrasahs",
    "audit_log",
    "users",
  ] as const;

  const list = (sub: string, query = "") =>
    http()
      .get(`/permanent-ban-requests${query}`)
      .set("Authorization", auth(sub));
  const approve = (sub: string, id: string) =>
    http()
      .post(`/permanent-ban-requests/${id}/approve`)
      .set("Authorization", auth(sub));
  const reject = (sub: string, id: string, note: unknown = "Yeterli değil.") =>
    http()
      .post(`/permanent-ban-requests/${id}/reject`)
      .set("Authorization", auth(sub))
      .send({ note });
  const enroll = (sub: string, courseId: string) =>
    http().post(`/courses/${courseId}/enroll`).set("Authorization", auth(sub));
  const audits = (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));

  /** A course ban a müderris placed, and the medrese's request to make it permanent. */
  const seedRequest = async (
    userId = TALEBE_ID,
    over: Partial<typeof bans.$inferInsert> = {}
  ) => {
    const [ban] = await db()
      .insert(bans)
      .values({
        userId,
        koskId: nuruId,
        courseId: binaId,
        scope: BAN_SCOPES.COURSE,
        reason: BAN_REASON,
        bannedBy: HEAD_ID,
        bannedRole: "MEDRESE_BASMUDERRIS",
        bannedTier: 2,
        ...over,
      })
      .returning();
    const [asked] = await db()
      .insert(banPermanentRequests)
      .values({ banId: ban.id, reason: ASK_REASON, requestedBy: HEAD_ID })
      .returning();
    return { ban, request: asked };
  };

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
        { id: TALEBE_ID, givenName: "Kerem Ali", familyName: "Yazıcı" },
        { id: HEAD_ID, givenName: "Mehmet Emin", familyName: "Işıkoğlu" },
        { id: ADMIN_ID, givenName: "Yusuf Ziya", familyName: "Ertuğrul" },
      ]);
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: ADMIN_ID,
      })
      .returning();
    madrasahId = madrasah.id;
    const [nuru, fatih] = await db()
      .insert(kosks)
      .values([
        { ownerId: KOSK_NAZIM_ID, name: "Nûruosmaniye Köşkü" },
        { ownerId: KOSK_NAZIM_ID, name: "Fatih Köşkü" },
      ])
      .returning();
    nuruId = nuru.id;
    const seeded = await db()
      .insert(courses)
      .values(
        [
          ["Emsile ve Bina", nuruId, madrasahId],
          ["Mantığa giriş", fatih.id, null],
        ].map(([title, koskId, medrese]) => ({
          title: title as string,
          koskId: koskId as string,
          madrasahId: medrese,
          authorId: KOSK_NAZIM_ID,
          status: CourseStatus.PUBLISHED,
        }))
      )
      .returning();
    [binaId, elsewhereId] = seeded.map((c) => c.id);
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
    });
    await assignRole(db(), {
      userId: KOSK_NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: nuruId,
    });
    for (const userId of [NAZIM_ID, NAZIM_BARE_ID]) {
      await db().insert(roleAssignments).values({
        userId,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
    }
    await db()
      .insert(permissionGrants)
      .values([
        {
          userId: NAZIM_ID,
          scopeType: SCOPE_TYPES.PLATFORM,
          scopeId: null,
          permission: "platform.ban_account",
          grantedBy: ADMIN_ID,
        },
        // Reads every ban, and still decides no request.
        {
          userId: NAZIM_BARE_ID,
          scopeType: SCOPE_TYPES.PLATFORM,
          scopeId: null,
          permission: "platform.ban_scoped",
          grantedBy: ADMIN_ID,
        },
      ]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  describe("GET /permanent-ban-requests", () => {
    it("lists the waiting requests with the ban each is about, and both counts", async () => {
      const { ban, request: asked } = await seedRequest();
      const res = await list(ADMIN_ID).expect(200);
      expect(res.body).toMatchObject({ pendingCount: 1, decidedCount: 0 });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({
        id: asked.id,
        status: "PENDING",
        reason: ASK_REASON,
        requestedBy: { id: HEAD_ID, name: "Mehmet Emin Işıkoğlu" },
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        platformBanId: null,
        ban: {
          id: ban.id,
          user: { id: TALEBE_ID, name: "Kerem Ali Yazıcı" },
          scope: "COURSE",
          courseTitle: "Emsile ve Bina",
          koskName: "Nûruosmaniye Köşkü",
          madrasahName: "Süleymaniye Medresesi",
          reason: BAN_REASON,
          bannedBy: { id: HEAD_ID },
          bannedRole: "MEDRESE_BASMUDERRIS",
          liftedAt: null,
        },
      });
      expect((await list(ADMIN_ID, "?status=DECIDED")).body.items).toEqual([]);
      await list(ADMIN_ID, "?status=NOPE").expect(400);
    });

    it("is Medaris administration's: platform.ban_account, or the başnazım", async () => {
      await seedRequest();
      await list(NAZIM_ID).expect(200);
      for (const sub of [NAZIM_BARE_ID, HEAD_ID, KOSK_NAZIM_ID, TALEBE_ID]) {
        const res = await list(sub).expect(403);
        expect(res.body.code).toBe("BAN_FORBIDDEN");
      }
      await http().get("/permanent-ban-requests").expect(401);
    });

    it("feeds the Medaris home page's number of waiting requests", async () => {
      const home = (sub: string) =>
        http().get("/nizam/dashboard").set("Authorization", auth(sub));
      expect(
        (await home(ADMIN_ID).expect(200)).body.pendingTotals
          .permanentBanRequests
      ).toBe(0);
      const { request: asked } = await seedRequest();
      await seedRequest(TALEBE_2_ID);
      for (const sub of [ADMIN_ID, NAZIM_ID]) {
        expect(
          (await home(sub).expect(200)).body.pendingTotals.permanentBanRequests
        ).toBe(2);
      }
      expect(
        (await home(NAZIM_BARE_ID).expect(200)).body.pendingTotals
          .permanentBanRequests
      ).toBeNull();
      await reject(ADMIN_ID, asked.id).expect(204);
      expect(
        (await home(ADMIN_ID).expect(200)).body.pendingTotals
          .permanentBanRequests
      ).toBe(1);
    });
  });

  describe("POST /permanent-ban-requests/:id/reject", () => {
    it("keeps the note, leaves the ban standing and shows the requester the decision", async () => {
      const { ban, request: asked } = await seedRequest();
      await reject(
        NAZIM_ID,
        asked.id,
        "  Tek olay; ders yasağı yeterli.  "
      ).expect(204);
      const [row] = await db().select().from(banPermanentRequests);
      expect(row).toMatchObject({
        status: "REJECTED",
        decidedBy: NAZIM_ID,
        decisionNote: "Tek olay; ders yasağı yeterli.",
        platformBanId: null,
      });
      expect(row.decidedAt).toBeInstanceOf(Date);
      const all = await db().select().from(bans);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ id: ban.id, liftedAt: null });
      const [audit] = await audits("permanent_ban.reject");
      expect(audit).toMatchObject({
        actorId: NAZIM_ID,
        entity: "permanent_ban_request",
        entityId: asked.id,
      });

      const decided = await list(ADMIN_ID, "?status=DECIDED").expect(200);
      expect(decided.body).toMatchObject({ pendingCount: 0, decidedCount: 1 });
      expect(decided.body.items[0]).toMatchObject({
        status: "REJECTED",
        decisionNote: "Tek olay; ders yasağı yeterli.",
        decidedBy: { id: NAZIM_ID },
      });

      // the medrese's own list carries the decision to whoever asked
      const mine = await http()
        .get(`/madrasahs/${madrasahId}/bans`)
        .set("Authorization", auth(HEAD_ID))
        .expect(200);
      expect(mine.body.items[0]).toMatchObject({
        id: ban.id,
        permanentRequestStatus: "REJECTED",
        permanentDecisionNote: "Tek olay; ders yasağı yeterli.",
        permanentDecidedAt: expect.any(String),
        viewerMayRequestPermanent: false,
      });
    });

    it("needs a note, a waiting request, and the permission", async () => {
      const { request: asked } = await seedRequest();
      await reject(ADMIN_ID, asked.id, "   ").expect(400);
      await reject(ADMIN_ID, asked.id, null).expect(400);
      await reject(NAZIM_BARE_ID, asked.id).expect(403);
      await reject(HEAD_ID, asked.id).expect(403);
      await reject(ADMIN_ID, MISSING_ID).expect(404);
      await reject(ADMIN_ID, asked.id).expect(204);
      const again = await reject(ADMIN_ID, asked.id).expect(409);
      expect(again.body.code).toBe("PERMANENT_BAN_REQUEST_NOT_PENDING");
      const late = await approve(ADMIN_ID, asked.id).expect(409);
      expect(late.body.code).toBe("PERMANENT_BAN_REQUEST_NOT_PENDING");
      expect(await db().select().from(bans)).toHaveLength(1);
    });
  });

  describe("POST /permanent-ban-requests/:id/approve", () => {
    it("opens a platform ban beside the lower one, with both audit rows", async () => {
      const { ban, request: asked } = await seedRequest();
      await approve(NAZIM_ID, asked.id).expect(204);

      const all = await db().select().from(bans);
      expect(all).toHaveLength(2);
      const platform = all.find((b) => b.scope === BAN_SCOPES.PLATFORM);
      expect(platform).toMatchObject({
        userId: TALEBE_ID,
        koskId: null,
        madrasahId: null,
        courseId: null,
        reason: ASK_REASON,
        bannedBy: NAZIM_ID,
        bannedRole: "MEDARIS_NAZIM",
        bannedTier: 4,
        liftedAt: null,
      });
      expect(all.find((b) => b.id === ban.id)?.liftedAt).toBeNull();

      const [row] = await db().select().from(banPermanentRequests);
      expect(row).toMatchObject({
        status: "APPROVED",
        decidedBy: NAZIM_ID,
        decisionNote: null,
        platformBanId: platform?.id,
      });
      const [decision] = await audits("permanent_ban.approve");
      expect(decision).toMatchObject({
        actorId: NAZIM_ID,
        entity: "permanent_ban_request",
        entityId: asked.id,
      });
      const created = await audits("ban.create");
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ entityId: platform?.id });
      expect(created[0].details).toMatchObject({
        scope: "PLATFORM",
        permanentRequestId: asked.id,
      });

      const mine = await http()
        .get(`/madrasahs/${madrasahId}/bans`)
        .set("Authorization", auth(HEAD_ID))
        .expect(200);
      expect(mine.body.items[0]).toMatchObject({
        id: ban.id,
        permanentRequestStatus: "APPROVED",
        permanentDecisionNote: null,
      });
    });

    it("bars the person from a course of another köşk, and lifting the platform ban lets them back", async () => {
      // before the decision the course ban reaches only its own course
      await enroll(TALEBE_2_ID, elsewhereId).expect(201);
      const { request: asked } = await seedRequest(TALEBE_2_ID);
      await enroll(TALEBE_ID, elsewhereId).expect(201);
      await db().delete(enrollments).where(eq(enrollments.userId, TALEBE_ID));

      const { request: mine } = await seedRequest(TALEBE_ID);
      await approve(ADMIN_ID, mine.id).expect(204);
      const refused = await enroll(TALEBE_ID, elsewhereId).expect(403);
      expect(refused.body.code).toBe("BAN_ACTIVE");
      // the other talebe's request still waits, and they are not touched
      expect(
        (await list(ADMIN_ID)).body.items.map((r: { id: string }) => r.id)
      ).toEqual([asked.id]);

      // the Medaris-wide list shows the platform ban, liftable by Medaris administration alone
      const everyBan = await http()
        .get("/bans?scope=PLATFORM")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(everyBan.body.items).toHaveLength(1);
      const platform = everyBan.body.items[0];
      expect(platform).toMatchObject({
        scope: "PLATFORM",
        koskId: null,
        viewerMayLift: true,
        viewerMayExtend: false,
      });
      const lift = (sub: string) =>
        http()
          .post(`/bans/${platform.id}/lift`)
          .set("Authorization", auth(sub))
          .send({ reason: "Görüşüldü." });
      await lift(KOSK_NAZIM_ID).expect(403);
      await lift(HEAD_ID).expect(403);
      await lift(NAZIM_BARE_ID).expect(403);
      await lift(NAZIM_ID).expect(200);
      await enroll(TALEBE_ID, elsewhereId).expect(201);
    });

    it("approves once: a second request for the same person keeps the standing platform ban", async () => {
      const first = await seedRequest();
      const second = await seedRequest(TALEBE_ID, {
        scope: BAN_SCOPES.MADRASAH,
        koskId: null,
        courseId: null,
        madrasahId,
      });
      await approve(ADMIN_ID, first.request.id).expect(204);
      const again = await approve(ADMIN_ID, first.request.id).expect(409);
      expect(again.body.code).toBe("PERMANENT_BAN_REQUEST_NOT_PENDING");
      await approve(ADMIN_ID, second.request.id).expect(204);

      const platformBans = (await db().select().from(bans)).filter(
        (b) => b.scope === BAN_SCOPES.PLATFORM
      );
      expect(platformBans).toHaveLength(1);
      const rows = await db().select().from(banPermanentRequests);
      expect(rows.map((r) => r.platformBanId)).toEqual([
        platformBans[0].id,
        platformBans[0].id,
      ]);
      expect(await audits("ban.create")).toHaveLength(1);
      expect(await audits("permanent_ban.approve")).toHaveLength(2);
    });

    it("refuses a lifted ban, a Medaris nazımı as the target, oneself, and anyone without the permission", async () => {
      const lifted = await seedRequest(TALEBE_ID, {
        liftedAt: new Date(),
        liftedBy: HEAD_ID,
        liftReason: "Görüşüldü.",
      });
      const gone = await approve(ADMIN_ID, lifted.request.id).expect(409);
      expect(gone.body.code).toBe("BAN_ALREADY_LIFTED");
      // such a request is refused instead
      await reject(ADMIN_ID, lifted.request.id).expect(204);

      const nazim = await seedRequest(NAZIM_BARE_ID);
      const protectedOne = await approve(ADMIN_ID, nazim.request.id).expect(
        400
      );
      expect(protectedOne.body.code).toBe("BAN_TARGET_INVALID");

      const self = await seedRequest(NAZIM_ID);
      await approve(NAZIM_ID, self.request.id).expect(400);

      const open = await seedRequest(TALEBE_2_ID);
      for (const sub of [NAZIM_BARE_ID, HEAD_ID, KOSK_NAZIM_ID]) {
        await approve(sub, open.request.id).expect(403);
      }
      await approve(ADMIN_ID, MISSING_ID).expect(404);
      expect(
        (await db().select().from(bans)).filter(
          (b) => b.scope === BAN_SCOPES.PLATFORM
        )
      ).toHaveLength(0);
    });
  });
});
