import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courses,
  courseWeeks,
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
import { openKosk, seedAccounts } from "../helpers/open-scopes.helper";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-136 (part A): a köşk, a medrese and a course are opened together with
 * their admins, and only the right people open them and change those admins.
 *
 * - A köşk is opened with at least one nazım and the caller is never one of
 *   them (a Medaris nazımı holding `platform.kosk_create` used to become the
 *   köşk's nazımı by leaving the list out).
 * - A köşk nazımı opens neither a köşk nor a medrese; a Medaris nazımı does
 *   once granted the permission.
 * - The başnazım opens a non-medrese course (the service no longer asks who
 *   manages the köşk), with at least one müderris who has an account and one
 *   imam.
 * - Adding and removing a köşk's nazımları is `platform.kosk_nazim_manage`'s,
 *   not the köşk nazımı's (owner decision d-1004-12); the last one leaves only
 *   with a successor (d-1004-13).
 * - A whole-course save never empties the team, and one that hides a week or a
 *   session needs `week.hide` (d-1004-14, decided by default).
 *
 * Built on the real guard, one signed token per caller.
 */
const ADMIN_ID = "d7000000-0000-4000-8000-000000000001";
const NAZIM_ID = "d7000000-0000-4000-8000-000000000002";
const HEAD_ID = "d7000000-0000-4000-8000-000000000003";
const NAZIR_ID = "d7000000-0000-4000-8000-000000000004";
const MEDARIS_ID = "d7000000-0000-4000-8000-000000000005";
const OTHER_NAZIM_ID = "d7000000-0000-4000-8000-000000000006";
const AHMED = "d7000000-0000-4000-8000-000000000007";
const HASAN = "d7000000-0000-4000-8000-000000000008";
const ZEYD = "d7000000-0000-4000-8000-000000000009";
const EDITOR_ID = "d7000000-0000-4000-8000-00000000000a";
const GHOST_ID = "d7000000-0000-4000-8000-0000000000ff";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const platform = { type: SCOPE_TYPES.PLATFORM, id: null } as const;

describe("Opening scopes with their admins (MDRS-136, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let foreignKoskId: string;
  let madrasahId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const post = (sub: string, path: string, body: object = {}) =>
    http().post(path).set("Authorization", auth(sub)).send(body);
  const put = (sub: string, path: string, body: object = {}) =>
    http().put(path).set("Authorization", auth(sub)).send(body);
  const del = (sub: string, path: string) =>
    http().delete(path).set("Authorization", auth(sub));
  const get = (sub: string, path: string) =>
    http().get(path).set("Authorization", auth(sub));

  const grant = (
    userId: string,
    scope: { type: string; id: string | null },
    permission: string
  ) =>
    db()
      .insert(permissionGrants)
      .values({
        userId,
        scopeType: scope.type as "platform",
        scopeId: scope.id,
        grantedBy: ADMIN_ID,
        permission,
        groupId: null,
      });

  const medarisNazim = async (...permissions: string[]) => {
    await db().insert(roleAssignments).values({
      userId: MEDARIS_ID,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN_ID,
    });
    for (const permission of permissions) {
      await grant(MEDARIS_ID, platform, permission);
    }
  };

  /** What a refused opening must leave alone: every scope and every role row. */
  const counts = async () => ({
    kosks: (await db().select().from(kosks)).length,
    madrasahs: (await db().select().from(madrasahs)).length,
    courses: (await db().select().from(courses)).length,
    roles: (await db().select().from(roleAssignments)).length,
  });

  const auditRows = (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));

  const kioskBody = (
    managerUserIds: string[] | undefined,
    name = "Yeni Köşk"
  ) => ({
    name,
    ...(managerUserIds ? { managerUserIds } : {}),
  });

  const nazimsOf = async (id: string) =>
    (
      await db()
        .select({ userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.scopeId, id),
            eq(roleAssignments.role, ASSIGNED_ROLES.KOSK_NAZIM),
            isNull(roleAssignments.revokedAt)
          )
        )
    )
      .map((r) => r.userId)
      .sort();

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
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

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await seedAccounts(app, [
      ADMIN_ID,
      NAZIM_ID,
      HEAD_ID,
      NAZIR_ID,
      MEDARIS_ID,
      OTHER_NAZIM_ID,
      AHMED,
      HASAN,
      ZEYD,
      EDITOR_ID,
    ]);
    koskId = (
      await openKosk(app, { managerUserIds: [NAZIM_ID] }, { as: ADMIN_ID })
    ).body.id;
    // Inserted, not opened through the route: the route is rate-limited and
    // this runs before every test.
    const [foreign] = await db()
      .insert(kosks)
      .values({ ownerId: ADMIN_ID, name: "Yabancı Köşk" })
      .returning();
    foreignKoskId = foreign.id;
    await assignRole(db(), {
      userId: OTHER_NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: foreignKoskId,
      grantedBy: ADMIN_ID,
    });
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({ handle: "hadis", name: "Hadis Medresesi", createdBy: ADMIN_ID })
      .returning();
    madrasahId = madrasah.id;
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN_ID,
    });
    await assignRole(db(), {
      userId: NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD_ID,
    });
    await db()
      .insert(madrasahKoskHosting)
      .values({ madrasahId, koskId, grantedBy: ADMIN_ID });
    await db().delete(auditLog); // the fixtures' own rows are not under test
  });

  describe("a köşk, together with its nazımları (POST /kosks)", () => {
    it("is refused to a köşk nazımı, who holds no platform permission, and nothing is written", async () => {
      const before = await counts();
      await post(NAZIM_ID, "/kosks", kioskBody([AHMED])).expect(403);
      expect(await counts()).toEqual(before);
    });

    it("is refused to a Medaris nazımı who was not given platform.kosk_create", async () => {
      await medarisNazim();
      const before = await counts();
      await post(MEDARIS_ID, "/kosks", kioskBody([AHMED])).expect(403);
      expect(await counts()).toEqual(before);
    });

    it("lets a Medaris nazımı holding platform.kosk_create open it for the nazımları named, and they are not one", async () => {
      await medarisNazim(PERMISSIONS.PLATFORM_KOSK_CREATE);
      const res = await post(
        MEDARIS_ID,
        "/kosks",
        kioskBody([AHMED, HASAN])
      ).expect(201);
      expect(res.body.managerIds.sort()).toEqual([AHMED, HASAN]);
      expect(res.body.ownerId).toBe(MEDARIS_ID);
      expect(await nazimsOf(res.body.id)).toEqual([AHMED, HASAN]);
      const [row] = await auditRows("kosk.create");
      expect(row.actorId).toBe(MEDARIS_ID);
    });

    it("refuses a Medaris nazımı who names themselves, on the record, and opens nothing", async () => {
      await medarisNazim(PERMISSIONS.PLATFORM_KOSK_CREATE);
      const before = await counts();
      const res = await post(
        MEDARIS_ID,
        "/kosks",
        kioskBody([AHMED, MEDARIS_ID])
      ).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
      expect(await counts()).toEqual(before);
      expect(await auditRows("permission.self_grant_refused")).toHaveLength(1);
    });

    it.each([
      ["no list at all", undefined],
      ["an empty list", []],
    ])("refuses %s with 400 — a Medaris nazımı does not become the nazım by leaving it out", async (_what, list) => {
      await medarisNazim(PERMISSIONS.PLATFORM_KOSK_CREATE);
      const before = await counts();
      await post(MEDARIS_ID, "/kosks", kioskBody(list)).expect(400);
      await post(ADMIN_ID, "/kosks", kioskBody(list)).expect(400);
      expect(await counts()).toEqual(before);
    });

    it("refuses a nazım whose account the directory does not know, and opens nothing", async () => {
      const before = await counts();
      await post(ADMIN_ID, "/kosks", kioskBody([AHMED, GHOST_ID])).expect(404);
      expect(await counts()).toEqual(before);
    });
  });

  describe("a medrese, together with its başmüderris (POST /madrasahs)", () => {
    const medrese = (headMuderrisUserId: string) => ({
      handle: "siyer",
      name: "Siyer Medresesi",
      headMuderrisUserId,
    });

    it.each([
      ["a köşk nazımı", () => NAZIM_ID],
      ["a medrese nazırı", () => NAZIR_ID],
    ])("is refused to %s, and nothing is written", async (_who, sub) => {
      const before = await counts();
      await post(sub(), "/madrasahs", medrese(AHMED)).expect(403);
      expect(await counts()).toEqual(before);
    });

    it("is refused to a Medaris nazımı who was not given platform.madrasah_create", async () => {
      await medarisNazim(PERMISSIONS.PLATFORM_KOSK_CREATE);
      const before = await counts();
      await post(MEDARIS_ID, "/madrasahs", medrese(AHMED)).expect(403);
      expect(await counts()).toEqual(before);
    });

    it("lets a Medaris nazımı holding platform.madrasah_create open it headed by the account named", async () => {
      await medarisNazim(PERMISSIONS.PLATFORM_MADRASAH_CREATE);
      const res = await post(MEDARIS_ID, "/madrasahs", medrese(AHMED)).expect(
        201
      );
      expect(res.body.createdBy).toBe(MEDARIS_ID);
      const heads = await db()
        .select({ userId: roleAssignments.userId })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.scopeId, res.body.id),
            eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS)
          )
        );
      expect(heads.map((h) => h.userId)).toEqual([AHMED]);
    });

    it("refuses a Medaris nazımı who names themselves its başmüderris", async () => {
      await medarisNazim(PERMISSIONS.PLATFORM_MADRASAH_CREATE);
      const before = await counts();
      const res = await post(
        MEDARIS_ID,
        "/madrasahs",
        medrese(MEDARIS_ID)
      ).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
      expect(await counts()).toEqual(before);
    });

    it("lets a Medaris nazımı seat a başmüderris only with platform.head_muderris_manage, and not themselves", async () => {
      await medarisNazim();
      // What the sitting başmüderris handed on would need an answer each
      // (Devral / Düşür); this one handed nothing on.
      await db()
        .delete(roleAssignments)
        .where(eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_NAZIR));
      await put(MEDARIS_ID, `/madrasahs/${madrasahId}/head-muderris`, {
        userId: AHMED,
      }).expect(403);

      await grant(
        MEDARIS_ID,
        platform,
        PERMISSIONS.PLATFORM_HEAD_MUDERRIS_MANAGE
      );
      const self = await put(
        MEDARIS_ID,
        `/madrasahs/${madrasahId}/head-muderris`,
        { userId: MEDARIS_ID }
      ).expect(403);
      expect(self.body.code).toBe("SELF_GRANT_REFUSED");
      await put(MEDARIS_ID, `/madrasahs/${madrasahId}/head-muderris`, {
        userId: AHMED,
      }).expect(200);
    });
  });

  describe("a medrese's course (POST /madrasahs/:id/courses)", () => {
    const open = (sub: string, id = madrasahId, hostIn = koskId) =>
      post(sub, `/madrasahs/${id}/courses`, {
        koskId: hostIn,
        title: "Bina ve İzhar",
        muderrisUserIds: [AHMED],
      });

    it("is opened by the başmüderris in a köşk that gave the medrese a right, with the müderris named", async () => {
      const res = await open(HEAD_ID).expect(201);
      const held = await db()
        .select()
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.scopeId, res.body.id),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
          )
        );
      expect(held.map((r) => [r.userId, r.isImam])).toEqual([[AHMED, true]]);
    });

    it("is refused to a nazır with no grant, and opened by one holding madrasah.course_open", async () => {
      const before = await counts();
      await open(NAZIR_ID).expect(403);
      expect(await counts()).toEqual(before);

      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        PERMISSIONS.MADRASAH_COURSE_OPEN
      );
      await open(NAZIR_ID).expect(201);
    });

    it("is refused to a nazır holding it in a köşk that gave the medrese no right, with nothing written", async () => {
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        PERMISSIONS.MADRASAH_COURSE_OPEN
      );
      const before = await counts();
      const res = await open(NAZIR_ID, madrasahId, foreignKoskId).expect(403);
      expect(res.body.code).toBe("HOSTING_RIGHT_REQUIRED");
      expect(await counts()).toEqual(before);
    });

    it("is not opened, and its müderrisler not changed, by the köşk's nazımı", async () => {
      const course = (await open(HEAD_ID).expect(201)).body;
      const before = await counts();
      await open(NAZIM_ID).expect(403);
      await put(
        NAZIM_ID,
        `/madrasahs/${madrasahId}/courses/${course.id}/muderrises`,
        { muderrisUserIds: [HASAN] }
      ).expect(403);
      await put(NAZIM_ID, `/courses/${course.id}/muderris`, {
        version: course.version ?? 0,
        muderris: [{ userId: HASAN, name: "Hasan" }],
        imamUserId: HASAN,
      }).expect(403);
      expect(await counts()).toEqual(before);
    });
  });

  describe("a course of the köşk's own (POST /kosks/:koskId/courses)", () => {
    const team = (...ids: string[]) =>
      ids.map((userId, i) => ({ userId, name: `Müderris ${i + 1}` }));
    const create = (sub: string, body: Record<string, unknown>, id = koskId) =>
      post(sub, `/kosks/${id}/courses`, { title: "Emsile", ...body });
    const heldRows = (courseId: string) =>
      db()
        .select()
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.scopeId, courseId),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
            isNull(roleAssignments.revokedAt)
          )
        );

    it("is opened by the başnazım in any köşk — the service no longer asks who manages it", async () => {
      const res = await create(ADMIN_ID, { muderris: team(AHMED) }).expect(201);
      expect(res.body.muderris).toHaveLength(1);
      await create(ADMIN_ID, { muderris: team(AHMED) }, foreignKoskId).expect(
        201
      );
    });

    it("is opened by the köşk's nazımı, and by no nazım of another köşk", async () => {
      await create(NAZIM_ID, { muderris: team(AHMED) }).expect(201);
      const before = await counts();
      await create(OTHER_NAZIM_ID, { muderris: team(AHMED) }).expect(403);
      expect(await counts()).toEqual(before);
    });

    it("is opened by a grantee of course.open_standalone for someone else, but not for themselves", async () => {
      await medarisNazim();
      await grant(
        MEDARIS_ID,
        { type: SCOPE_TYPES.KOSK, id: koskId },
        PERMISSIONS.COURSE_OPEN_STANDALONE
      );
      await create(MEDARIS_ID, { muderris: team(AHMED) }).expect(201);
      const before = await counts();
      const res = await create(MEDARIS_ID, {
        muderris: team(MEDARIS_ID),
      }).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
      expect(await counts()).toEqual(before);
      expect(await auditRows("permission.self_grant_refused")).toHaveLength(1);
      await create(MEDARIS_ID, {
        muderris: team(AHMED),
        imamUserId: AHMED,
      }).expect(201);
    });

    it("lets the köşk's nazımı and the başnazım list themselves among the müderrisler", async () => {
      await create(NAZIM_ID, { muderris: team(NAZIM_ID, AHMED) }).expect(201);
      await create(ADMIN_ID, { muderris: team(ADMIN_ID) }).expect(201);
    });

    it("answers 404 for a köşk that does not exist", async () => {
      await create(
        ADMIN_ID,
        { muderris: team(AHMED) },
        "00000000-0000-4000-8000-000000000000"
      ).expect(404);
    });

    it("is not opened by a başmüderris, who files a request for the köşk's nazımı instead", async () => {
      const before = await counts();
      await create(HEAD_ID, { muderris: team(AHMED) }).expect(403);
      expect(await counts()).toEqual(before);
      await post(HEAD_ID, `/madrasahs/${madrasahId}/offsite-course-requests`, {
        koskId,
        title: "Dışarıda bir ders",
        reason: "Medresenin köşkte açmak istediği ders",
      }).expect(201);
    });

    it("makes the account listed first the imam when none is named", async () => {
      const res = await create(NAZIM_ID, {
        muderris: team(AHMED, HASAN),
      }).expect(201);
      const rows = await heldRows(res.body.id);
      expect(rows.filter((r) => r.isImam).map((r) => r.userId)).toEqual([
        AHMED,
      ]);
      expect(rows).toHaveLength(2);
    });

    it("makes the imam named the imam, and keeps exactly one", async () => {
      const res = await create(NAZIM_ID, {
        muderris: team(AHMED, HASAN),
        imamUserId: HASAN,
      }).expect(201);
      const rows = await heldRows(res.body.id);
      expect(rows.filter((r) => r.isImam).map((r) => r.userId)).toEqual([
        HASAN,
      ]);
      expect(
        res.body.muderris.map((m: { userId: string; isImam: boolean }) => [
          m.userId,
          m.isImam,
        ])
      ).toEqual([
        [AHMED, false],
        [HASAN, true],
      ]);
    });

    it("refuses an imam who is not listed, and opens nothing", async () => {
      const before = await counts();
      const res = await create(NAZIM_ID, {
        muderris: team(AHMED, HASAN),
        imamUserId: ZEYD,
      }).expect(400);
      expect(res.body.code).toBe("COURSE_IMAM_NOT_LISTED");
      expect(await counts()).toEqual(before);
    });

    it.each([
      ["no müderris", { muderris: [] }, undefined],
      ["no müderris key", {}, undefined],
      [
        "only müderris with no account",
        { muderris: [{ name: "Hoca-i misafir" }] },
        "MUDERRIS_LIST_INVALID",
      ],
    ])("refuses %s, and opens nothing", async (_what, body, code) => {
      const before = await counts();
      const res = await create(NAZIM_ID, body).expect(400);
      if (code) expect(res.body.code).toBe(code);
      expect(await counts()).toEqual(before);
    });
  });

  describe("the one imam of a course, before and after every change", () => {
    let courseId: string;
    let version: number;

    const held = async () =>
      (
        await db()
          .select()
          .from(roleAssignments)
          .where(
            and(
              eq(roleAssignments.scopeId, courseId),
              eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
              isNull(roleAssignments.revokedAt)
            )
          )
      ).filter((r) => r.expiresAt === null || r.expiresAt > new Date());
    const imams = async () =>
      (await held()).filter((r) => r.isImam).map((r) => r.userId);

    const detail = async () =>
      (await get(NAZIM_ID, `/courses/${courseId}`).expect(200)).body as {
        version: number;
        muderris: { id: string; userId: string; name: string }[];
      };
    const setTeam = async (ids: string[], imamUserId: string) => {
      const res = await put(NAZIM_ID, `/courses/${courseId}/muderris`, {
        version: (await detail()).version,
        muderris: ids.map((userId) => ({ userId, name: userId.slice(-2) })),
        imamUserId,
      }).expect(200);
      return res.body;
    };

    beforeEach(async () => {
      const res = await post(NAZIM_ID, `/kosks/${koskId}/courses`, {
        title: "Emsile",
        muderris: [
          { userId: AHMED, name: "Ahmed" },
          { userId: HASAN, name: "Hasan" },
        ],
      }).expect(201);
      courseId = res.body.id;
      version = res.body.version;
    });

    it("has exactly one after the course is opened", async () => {
      expect(version).toBeDefined();
      expect(await imams()).toEqual([AHMED]);
    });

    it("keeps exactly one when a müderris who is not the imam is added, then removed", async () => {
      await setTeam([AHMED, HASAN, ZEYD], AHMED);
      expect(await imams()).toEqual([AHMED]);
      expect(await held()).toHaveLength(3);
      await setTeam([AHMED, HASAN], AHMED);
      expect(await imams()).toEqual([AHMED]);
      expect(await held()).toHaveLength(2);
    });

    it("moves the imam, and there is still exactly one", async () => {
      await setTeam([AHMED, HASAN], HASAN);
      expect(await imams()).toEqual([HASAN]);
      await setTeam([AHMED, HASAN], AHMED);
      expect(await imams()).toEqual([AHMED]);
    });

    it("picks a new one when the imam is removed by a whole-course save", async () => {
      const before = await detail();
      const keep = before.muderris.find((m) => m.userId === HASAN);
      await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Emsile",
        version: before.version,
        muderris: [{ id: keep?.id, userId: HASAN, name: "Hasan" }],
      }).expect(200);
      expect(await imams()).toEqual([HASAN]);
      expect(await held()).toHaveLength(1);
    });

    it("repairs a lapsed imam on the next save: the one left holding the flag is held", async () => {
      await db()
        .update(roleAssignments)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(
          and(
            eq(roleAssignments.scopeId, courseId),
            eq(roleAssignments.userId, AHMED),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
          )
        );
      // Lapsed, so nobody holds the flag until a save repairs it.
      expect(await imams()).toEqual([]);

      const before = await detail();
      await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Emsile",
        version: before.version,
        muderris: before.muderris.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.name,
        })),
      }).expect(200);
      expect((await imams()).length).toBe(1);
    });
  });

  describe("a whole-course save (PUT /courses/:id)", () => {
    let courseId: string;

    const rows = () =>
      db()
        .select()
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.scopeId, courseId),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
            isNull(roleAssignments.revokedAt)
          )
        );
    const detail = async () =>
      (await get(NAZIM_ID, `/courses/${courseId}`).expect(200)).body as {
        version: number;
        weeks: { id: string; lessons: { id: string }[] }[];
        muderris: { id: string; userId: string | null; name: string }[];
      };

    beforeEach(async () => {
      const res = await post(NAZIM_ID, `/kosks/${koskId}/courses`, {
        title: "Emsile",
        muderris: [{ userId: AHMED, name: "Ahmed" }],
        weeks: [
          {
            weekNumber: 1,
            title: "Birinci Bab",
            lessons: [{ title: "Açılış", type: "VIDEO" }],
          },
          { weekNumber: 2, title: "İkinci Bab", lessons: [] },
        ],
      }).expect(201);
      courseId = res.body.id;
    });

    it("leaves the team as it is when the payload leaves the müderris out", async () => {
      const before = await detail();
      await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Yeni başlık",
        version: before.version,
        weeks: before.weeks.map((w, i) => ({
          id: w.id,
          weekNumber: i + 1,
          title: `Hafta ${i + 1}`,
          lessons: w.lessons.map((l) => ({
            id: l.id,
            title: "Açılış",
            type: "VIDEO",
          })),
        })),
      }).expect(200);
      const after = await detail();
      expect(after.muderris.map((m) => m.userId)).toEqual([AHMED]);
      expect((await rows()).map((r) => r.userId)).toEqual([AHMED]);
    });

    it("does not take an imam from a save or a patch: that is chosen when the course is opened or by PUT /courses/:id/muderris", async () => {
      const before = await detail();
      await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Emsile",
        version: before.version,
        imamUserId: AHMED,
      }).expect(400);
      await http()
        .patch(`/courses/${courseId}`)
        .set("Authorization", auth(NAZIM_ID))
        .send({ imamUserId: AHMED })
        .expect(400);
      expect((await detail()).version).toBe(before.version);
    });

    it("refuses an empty team with 400, and writes nothing", async () => {
      const before = await detail();
      const res = await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Boşaltılıyor",
        version: before.version,
        muderris: [],
      }).expect(400);
      expect(res.body.code).toBe("MUDERRIS_LIST_INVALID");
      const after = await detail();
      expect(after.version).toBe(before.version);
      expect(after.muderris).toHaveLength(1);
      expect((await rows()).map((r) => r.userId)).toEqual([AHMED]);
      expect(
        (await db().select().from(courseMuderris)).map((m) => m.userId)
      ).toEqual([AHMED]);
    });

    it("refuses a stored row saved with userId null, which would unbind the last account, and writes nothing", async () => {
      const before = await detail();
      const res = await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Çözülüyor",
        version: before.version,
        muderris: [{ id: before.muderris[0].id, userId: null, name: "Ahmed" }],
      }).expect(400);
      expect(res.body.code).toBe("MUDERRIS_LIST_INVALID");
      expect((await detail()).version).toBe(before.version);
      expect((await rows()).map((r) => r.userId)).toEqual([AHMED]);
      expect(
        (await db().select().from(courseMuderris)).map((m) => m.userId)
      ).toEqual([AHMED]);
    });

    it("still lets a save unbind one account while another stays bound", async () => {
      const before = await detail();
      const withTwo = await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Emsile",
        version: before.version,
        muderris: [
          { id: before.muderris[0].id, name: "Ahmed" },
          { userId: HASAN, name: "Hasan" },
        ],
      }).expect(200);
      await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Emsile",
        version: withTwo.body.version,
        muderris: [
          { id: withTwo.body.muderris[0].id, userId: null, name: "Ahmed" },
          { id: withTwo.body.muderris[1].id, name: "Hasan" },
        ],
      }).expect(200);
      expect((await rows()).map((r) => r.userId)).toEqual([HASAN]);
    });

    it("refuses a team left with no account, but keeps one whose row is named by id and carries no account", async () => {
      const before = await detail();
      const row = before.muderris[0];
      const refused = await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Hesapsız",
        version: before.version,
        muderris: [{ name: "Hoca-i misafir" }],
      }).expect(400);
      expect(refused.body.code).toBe("MUDERRIS_LIST_INVALID");

      // The stored row is named by id and its account is not repeated: the
      // save keeps the account, as it always did.
      await put(NAZIM_ID, `/courses/${courseId}`, {
        title: "Aynı ekip",
        version: before.version,
        muderris: [{ id: row.id, name: "Ahmed Hoca" }],
      }).expect(200);
      expect((await rows()).map((r) => r.userId)).toEqual([AHMED]);
    });
  });

  describe("hiding a week or a session by a whole-course save needs week.hide", () => {
    let courseId: string;
    let weeks: { id: string; lessons: { id: string }[] }[];
    let version: number;

    const weekRows = () =>
      db().select().from(courseWeeks).where(eq(courseWeeks.courseId, courseId));
    // Keeps the first `keep` weeks; `withLessons` false keeps each of them
    // with no lessons, which hides the sessions and no week.
    const save = (sub: string, keep: number, withLessons = true) =>
      put(sub, `/courses/${courseId}`, {
        title: "Emsile",
        version,
        weeks: weeks.slice(0, keep).map((w, i) => ({
          id: w.id,
          weekNumber: i + 1,
          title: `Hafta ${i + 1}`,
          lessons: (withLessons ? w.lessons : []).map((l) => ({
            id: l.id,
            title: "Açılış",
            type: "VIDEO",
          })),
        })),
      });

    beforeEach(async () => {
      const res = await post(NAZIM_ID, `/kosks/${koskId}/courses`, {
        title: "Emsile",
        muderris: [{ userId: AHMED, name: "Ahmed" }],
        weeks: [
          {
            weekNumber: 1,
            title: "Birinci Bab",
            lessons: [{ title: "Açılış", type: "VIDEO" }],
          },
          {
            weekNumber: 2,
            title: "İkinci Bab",
            lessons: [{ title: "Şerh", type: "VIDEO" }],
          },
          { weekNumber: 3, title: "Üçüncü Bab", lessons: [] },
        ],
      }).expect(201);
      courseId = res.body.id;
      weeks = res.body.weeks;
      version = res.body.version;
      // A grant counts only where its holder has a role on the course's chain.
      await assignRole(db(), {
        userId: EDITOR_ID,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
        grantedBy: NAZIM_ID,
      });
      await grant(
        EDITOR_ID,
        { type: SCOPE_TYPES.COURSE, id: courseId },
        PERMISSIONS.COURSE_EDIT
      );
    });

    it("refuses a saver holding course.edit without week.hide, with 403 and nothing written", async () => {
      const res = await save(EDITOR_ID, 1).expect(403);
      expect(res.body.code).toBe("WEEK_HIDE_FORBIDDEN");
      expect((await weekRows()).filter((w) => w.archivedAt)).toHaveLength(0);
      const after = (await get(NAZIM_ID, `/courses/${courseId}`).expect(200))
        .body;
      expect(after.version).toBe(version);
    });

    it("refuses a saver without week.hide who drops only a session of a week they keep", async () => {
      const res = await save(EDITOR_ID, 3, false).expect(403);
      expect(res.body.code).toBe("WEEK_HIDE_FORBIDDEN");
      expect((await weekRows()).filter((w) => w.archivedAt)).toHaveLength(0);
      const after = (await get(NAZIM_ID, `/courses/${courseId}`).expect(200))
        .body;
      expect(after.version).toBe(version);
      expect(after.weeks[0].lessons).toHaveLength(1);
    });

    it("refuses a saver without week.hide who drops only an empty week", async () => {
      const res = await save(EDITOR_ID, 2).expect(403);
      expect(res.body.code).toBe("WEEK_HIDE_FORBIDDEN");
      expect((await weekRows()).filter((w) => w.archivedAt)).toHaveLength(0);
      const after = (await get(NAZIM_ID, `/courses/${courseId}`).expect(200))
        .body;
      expect(after.version).toBe(version);
      expect(after.weeks).toHaveLength(3);
    });

    it("lets the same saver save everything they keep", async () => {
      await save(EDITOR_ID, 3).expect(200);
    });

    it("lets the same saver hide once week.hide is granted too", async () => {
      await grant(
        EDITOR_ID,
        { type: SCOPE_TYPES.COURSE, id: courseId },
        PERMISSIONS.WEEK_HIDE
      );
      await save(EDITOR_ID, 1).expect(200);
      expect((await weekRows()).filter((w) => w.archivedAt)).toHaveLength(2);
    });

    it("lets the köşk's nazımı hide, who holds it by role default", async () => {
      await save(NAZIM_ID, 1).expect(200);
      expect((await weekRows()).filter((w) => w.archivedAt)).toHaveLength(2);
    });
  });

  describe("a köşk's nazımları (POST|DELETE /kosks/:id/managers/:userId)", () => {
    const managers = (id = koskId) => `/kosks/${id}/managers`;

    it("is not for a köşk nazımı: adding a peer, removing one and resigning are all refused", async () => {
      await post(ADMIN_ID, `${managers()}/${AHMED}`).expect(201);
      const before = await nazimsOf(koskId);
      await post(NAZIM_ID, `${managers()}/${HASAN}`).expect(403);
      await del(NAZIM_ID, `${managers()}/${AHMED}`).expect(403);
      await del(NAZIM_ID, `${managers()}/${NAZIM_ID}`).expect(403);
      expect(await nazimsOf(koskId)).toEqual(before);
    });

    it("is for a Medaris nazımı holding platform.kosk_nazim_manage, and for no other", async () => {
      await medarisNazim();
      await post(MEDARIS_ID, `${managers()}/${AHMED}`).expect(403);
      await grant(MEDARIS_ID, platform, PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE);
      await post(MEDARIS_ID, `${managers()}/${AHMED}`).expect(201);
      await del(MEDARIS_ID, `${managers()}/${AHMED}`).expect(200);
      expect(await nazimsOf(koskId)).toEqual([NAZIM_ID]);
    });

    it("keeps the last nazım unless a successor is named", async () => {
      const res = await del(ADMIN_ID, `${managers()}/${NAZIM_ID}`).expect(409);
      expect(res.body.code).toBe("KOSK_LAST_MANAGER");
      expect(await nazimsOf(koskId)).toEqual([NAZIM_ID]);
    });

    it("seats the successor first, then removes the last nazım, and writes both down", async () => {
      await del(
        ADMIN_ID,
        `${managers()}/${NAZIM_ID}?successorUserId=${AHMED}`
      ).expect(200);
      expect(await nazimsOf(koskId)).toEqual([AHMED]);
      const [removal] = await auditRows("kosk.nazim.remove");
      expect(removal.details).toMatchObject({
        userId: NAZIM_ID,
        successorUserId: AHMED,
      });
      const added = await auditRows("kosk.nazim.add");
      expect(
        added.map((r) => (r.details as { userId: string }).userId)
      ).toEqual([AHMED]);
    });

    it("lets the başnazım take the seat themselves", async () => {
      await del(
        ADMIN_ID,
        `${managers()}/${NAZIM_ID}?successorUserId=${ADMIN_ID}`
      ).expect(200);
      expect(await nazimsOf(koskId)).toEqual([ADMIN_ID]);
    });

    it("does not let a Medaris nazımı take the seat themselves, and removes nobody", async () => {
      await medarisNazim(PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE);
      const res = await del(
        MEDARIS_ID,
        `${managers()}/${NAZIM_ID}?successorUserId=${MEDARIS_ID}`
      ).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
      expect(await nazimsOf(koskId)).toEqual([NAZIM_ID]);
    });

    it("refuses a successor who has never signed in or who is the nazım removed, and removes nobody", async () => {
      const unknown = await del(
        ADMIN_ID,
        `${managers()}/${NAZIM_ID}?successorUserId=${GHOST_ID}`
      ).expect(404);
      expect(unknown.body.code).toBe("KOSK_MANAGER_UNKNOWN_USER");
      const same = await del(
        ADMIN_ID,
        `${managers()}/${NAZIM_ID}?successorUserId=${NAZIM_ID}`
      ).expect(400);
      expect(same.body.code).toBe("KOSK_SUCCESSOR_INVALID");
      await del(
        ADMIN_ID,
        `${managers()}/${NAZIM_ID}?successorUserId=not-a-uuid`
      ).expect(400);
      expect(await nazimsOf(koskId)).toEqual([NAZIM_ID]);
    });
  });
});
