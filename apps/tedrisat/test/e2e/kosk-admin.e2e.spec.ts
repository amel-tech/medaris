import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import {
  KEYCLOAK_ADMIN_FETCH,
  KeycloakAdminService,
} from "../../src/keycloak-admin/keycloak-admin.service";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-174, nizam/09, 10, 21, 24 and 25: the başnazım's table of köşks, opening
 * a köşk with its nazımları, adding nazımları, hiding and bringing back, and
 * the köşk-wide approval policy — against a real Postgres. Only the realm's
 * directory is replaced.
 */
const ADMIN = "d0000000-0000-4000-8000-000000000001";
const AYSE = "d0000000-0000-4000-8000-000000000002";
const OMER = "d0000000-0000-4000-8000-000000000003";
const ABDULLAH = "d0000000-0000-4000-8000-000000000004";
const NEWCOMER = "d0000000-0000-4000-8000-000000000005";
const TALEBE = "d0000000-0000-4000-8000-000000000006";
const GHOST = "d0000000-0000-4000-8000-000000000007";

const claims: Record<string, Record<string, unknown>> = {
  [ADMIN]: {
    email: "basnazim@example.com",
    realm_access: { roles: [ROLES.SYSTEM_ADMIN] },
  },
};
const auth = (sub: string) => bearerFor({ sub, claims: claims[sub] ?? {} });

function fakeFetch(input: unknown): Promise<Response> {
  const url = String(input);
  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );
  if (url.endsWith("/protocol/openid-connect/token")) {
    return json({ access_token: "t", expires_in: 300 });
  }
  if (url.endsWith(`/admin/realms/r/users/${NEWCOMER}`)) {
    return json({
      id: NEWCOMER,
      email: "yeni@example.com",
      firstName: "Yeni",
      lastName: "Nazım",
      enabled: true,
    });
  }
  if (url.includes("/roles/SYSTEM_ADMIN/users")) {
    return json([{ id: ADMIN, email: "basnazim@example.com", enabled: true }]);
  }
  return json({}, 404);
}

describe("Köşk administration (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;
  let beyazit: string;
  let fatih: string;
  let nuruosmaniye: string;
  let uskudar: string;

  const http = () => request(app.getHttpServer());
  const get = (path: string, sub = ADMIN) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (path: string, body: unknown = {}, sub = ADMIN) =>
    http()
      .post(path)
      .set("Authorization", auth(sub))
      .send(body as object);
  const auditActions = async () =>
    (await db.select({ action: auditLog.action }).from(auditLog)).map(
      (r) => r.action
    );
  const kosk = async (id: string) =>
    (await db.select().from(kosks).where(eq(kosks.id, id)))[0];
  const nazimsOf = async (id: string) =>
    (
      await db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.scopeId, id))
    ).filter((r) => r.revokedAt === null);

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: KEYCLOAK_ADMIN_FETCH, useValue: fakeFetch }],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
    db = databaseService.db;
    dbUtils = new TestDatabaseUtils(databaseService);
    const config = (
      app.get(KeycloakAdminService) as unknown as {
        config: { get: (k: string) => unknown };
      }
    ).config;
    const original = config.get.bind(config);
    config.get = (key: string) =>
      key === "keycloak.admin"
        ? {
            adminUrl: "http://kc.test/admin/realms/r",
            tokenUrl: "http://kc.test/realms/r/protocol/openid-connect/token",
            clientId: "tedrisat-admin",
            clientSecret: "s",
          }
        : original(key);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "audit_log", "users");
    await db.insert(users).values([
      {
        id: ADMIN,
        email: "basnazim@example.com",
        givenName: "Yusuf Ziya",
        familyName: "Ertuğrul",
      },
      {
        id: AYSE,
        email: "ayse@example.com",
        givenName: "Ayşe Nur",
        familyName: "Kılıçarslan",
      },
      {
        id: OMER,
        email: "omer@example.com",
        givenName: "Ömer Nasuhi",
        familyName: "Bilmenoğlu",
      },
      {
        id: ABDULLAH,
        email: "abdullah@example.com",
        givenName: "Abdullah Nuri",
        familyName: "Gezginoğlu",
      },
    ]);
    const rows = await db
      .insert(kosks)
      .values([
        {
          ownerId: AYSE,
          name: "Beyazıt Köşkü",
          handle: "beyazit",
          field: "Hadis",
          level: "BEGINNER",
        },
        {
          ownerId: OMER,
          name: "Fatih Köşkü",
          handle: "@fatih",
          field: "Fıkıh",
          level: "INTERMEDIATE",
        },
        {
          ownerId: ABDULLAH,
          name: "Nûruosmaniye Köşkü",
          handle: "nuruosmaniye",
          field: "Arapça dil ilimleri",
          level: "BEGINNER",
        },
        {
          ownerId: AYSE,
          name: "Üsküdar Köşkü",
          handle: "uskudar",
          field: "Kur'an ilimleri",
          level: "ALL",
          isPrivate: true,
        },
      ])
      .returning();
    [beyazit, fatih, nuruosmaniye, uskudar] = rows.map((r) => r.id);
    await assignRole(db, {
      userId: AYSE,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: beyazit,
      grantedBy: ADMIN,
    });
    await assignRole(db, {
      userId: OMER,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: fatih,
      grantedBy: ADMIN,
    });
    await assignRole(db, {
      userId: ABDULLAH,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: nuruosmaniye,
      grantedBy: ADMIN,
    });
    await assignRole(db, {
      userId: AYSE,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: uskudar,
      grantedBy: ADMIN,
    });
    // Fatih has a second nazım and a hidden köşk exists too.
    await assignRole(db, {
      userId: ABDULLAH,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: fatih,
      grantedBy: OMER,
    });
    const [hidden] = await db
      .insert(kosks)
      .values({
        ownerId: ABDULLAH,
        name: "Kalenderhane Köşkü",
        handle: "kalenderhane",
        field: "Belâgat",
        level: "ADVANCED",
        archivedAt: new Date("2026-09-24T09:00:00Z"),
        archivedBy: ADMIN,
      })
      .returning();
    await assignRole(db, {
      userId: ABDULLAH,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: hidden.id,
      grantedBy: ADMIN,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /kosks/directory (nizam/09)", () => {
    it("lists every köşk for the başnazım with nazımları, ders sayısı and the status counts", async () => {
      const res = await get("/kosks/directory").expect(200);
      expect(res.body.counts).toEqual({
        all: 5,
        active: 4,
        passive: 0,
        hidden: 1,
      });
      expect(res.body.total).toBe(5);
      const names = res.body.items.map((i: { name: string }) => i.name);
      expect(names).toEqual([
        "Beyazıt Köşkü",
        "Fatih Köşkü",
        "Kalenderhane Köşkü",
        "Nûruosmaniye Köşkü",
        "Üsküdar Köşkü",
      ]);
      const fatihRow = res.body.items[1];
      expect(fatihRow.handle).toBe("fatih");
      expect(fatihRow.nazims.map((n: { name: string }) => n.name)).toEqual([
        "Ömer Nasuhi Bilmenoğlu",
        "Abdullah Nuri Gezginoğlu",
      ]);
      const hidden = res.body.items[2];
      expect(hidden.status).toBe("HIDDEN");
      expect(hidden.since).toBe("2026-09-24T09:00:00.000Z");
      expect(res.body.items[4].isPrivate).toBe(true);
      expect(res.body.fields).toEqual([
        "Arapça dil ilimleri",
        "Belâgat",
        "Fıkıh",
        "Hadis",
        "Kur'an ilimleri",
      ]);
    });

    it("counts a course of any state in the köşk's ders sayısı", async () => {
      await db.insert(courses).values([
        {
          koskId: beyazit,
          authorId: AYSE,
          title: "Yayında",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: beyazit,
          authorId: AYSE,
          title: "Taslak",
          status: CourseStatus.DRAFT,
        },
        {
          koskId: beyazit,
          authorId: AYSE,
          title: "Gizli",
          status: CourseStatus.PUBLISHED,
          archivedAt: new Date(),
        },
      ]);
      const res = await get("/kosks/directory?q=Beyaz").expect(200);
      expect(res.body.items[0].courseCount).toBe(3);
    });

    it("filters by status, level, field and listing, alone and together", async () => {
      const names = (res: { body: { items: { name: string }[] } }) =>
        res.body.items.map((i) => i.name);
      expect(names(await get("/kosks/directory?status=HIDDEN"))).toEqual([
        "Kalenderhane Köşkü",
      ]);
      expect(names(await get("/kosks/directory?status=ACTIVE"))).toHaveLength(
        4
      );
      expect(names(await get("/kosks/directory?level=BEGINNER"))).toEqual([
        "Beyazıt Köşkü",
        "Nûruosmaniye Köşkü",
      ]);
      expect(
        names(
          await get(
            `/kosks/directory?field=${encodeURIComponent("Arapça dil ilimleri")}`
          )
        )
      ).toEqual(["Nûruosmaniye Köşkü"]);
      expect(names(await get("/kosks/directory?listing=UNLISTED"))).toEqual([
        "Üsküdar Köşkü",
      ]);
      expect(await get("/kosks/directory?listing=LISTED")).toHaveProperty(
        "body.total",
        4
      );
      expect(
        names(await get("/kosks/directory?level=BEGINNER&listing=LISTED&q=bey"))
      ).toEqual(["Beyazıt Köşkü"]);
      // The tabs' numbers do not move with the filters.
      const filtered = await get("/kosks/directory?level=ADVANCED");
      expect(filtered.body.total).toBe(1);
      expect(filtered.body.counts.all).toBe(5);
    });

    it("finds a köşk by a nazım's name and by its short name", async () => {
      const byNazim = await get("/kosks/directory?q=Nuri").expect(200);
      expect(byNazim.body.items.map((i: { name: string }) => i.name)).toEqual([
        "Fatih Köşkü",
        "Kalenderhane Köşkü",
        "Nûruosmaniye Köşkü",
      ]);
      const byHandle = await get("/kosks/directory?q=uskud").expect(200);
      expect(byHandle.body.total).toBe(1);
    });

    it("pages and never answers more than 50 rows", async () => {
      const page1 = await get("/kosks/directory?limit=2&page=1").expect(200);
      const page3 = await get("/kosks/directory?limit=2&page=3").expect(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.total).toBe(5);
      expect(page3.body.items).toHaveLength(1);
      const huge = await get("/kosks/directory?limit=500").expect(200);
      expect(huge.body.limit).toBe(50);
      const unset = await get("/kosks/directory").expect(200);
      expect(unset.body.limit).toBe(12);
    });

    it("names a nazım who never signed in from the realm's directory", async () => {
      await assignRole(db, {
        userId: NEWCOMER,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: beyazit,
        grantedBy: ADMIN,
      });
      const res = await get("/kosks/directory?q=Beyaz").expect(200);
      expect(
        res.body.items[0].nazims.map((n: { name: string }) => n.name)
      ).toEqual(["Ayşe Nur Kılıçarslan", "Yeni Nazım"]);
    });

    it("shows a köşk nazımı only the köşks they manage", async () => {
      const res = await get("/kosks/directory", OMER).expect(200);
      expect(res.body.items.map((i: { name: string }) => i.name)).toEqual([
        "Fatih Köşkü",
      ]);
      expect(res.body.counts.all).toBe(1);
      const abdullah = await get("/kosks/directory", ABDULLAH).expect(200);
      // His hidden köşk is in his table too: this is where he sees it.
      expect(abdullah.body.counts).toEqual({
        all: 3,
        active: 2,
        passive: 0,
        hidden: 1,
      });
    });

    it("refuses anyone who manages nothing, and callers with no token", async () => {
      await get("/kosks/directory", TALEBE).expect(403);
      await http().get("/kosks/directory").expect(401);
    });

    it("rejects a filter it does not know", async () => {
      await get("/kosks/directory?status=NOPE").expect(400);
      await get("/kosks/directory?level=EXPERT").expect(400);
      await get("/kosks/directory?listing=SOME").expect(400);
    });
  });

  describe("hide and restore (nizam/24, nizam/09)", () => {
    it("lets a köşk's nazımı hide it and writes an audit entry", async () => {
      const res = await post(`/kosks/${beyazit}/hide`, {}, AYSE).expect(200);
      expect(res.body).toMatchObject({ id: beyazit, status: "HIDDEN" });
      expect((await kosk(beyazit)).archivedBy).toBe(AYSE);
      expect(await auditActions()).toEqual(["kosk.hide"]);
    });

    it("lets the başnazım hide any köşk, but not another köşk's nazımı", async () => {
      await post(`/kosks/${beyazit}/hide`, {}, OMER).expect(403);
      expect((await kosk(beyazit)).archivedAt).toBeNull();
      await post(`/kosks/${beyazit}/hide`).expect(200);
      expect((await kosk(beyazit)).archivedBy).toBe(ADMIN);
    });

    it("answers 409 when it is hidden already and 404 for no köşk", async () => {
      await post(`/kosks/${beyazit}/hide`).expect(200);
      const again = await post(`/kosks/${beyazit}/hide`).expect(409);
      expect(again.body.code).toBe("KOSK_ALREADY_HIDDEN");
      await post("/kosks/d9999999-0000-4000-8000-000000000000/hide").expect(
        404
      );
    });

    it("takes a hidden köşk out of every list and away from everyone but its nazımları", async () => {
      await post(`/kosks/${beyazit}/hide`, {}, AYSE).expect(200);
      const open = await http().get("/kosks").expect(200);
      expect(
        open.body.items.map((i: { name: string }) => i.name)
      ).not.toContain("Beyazıt Köşkü");
      const mine = await get("/kosks?managedBy=me", AYSE).expect(200);
      expect(mine.body.items.map((i: { id: string }) => i.id)).toEqual([
        uskudar,
      ]);
      await http().get(`/kosks/${beyazit}`).expect(404);
      await get(`/kosks/${beyazit}`, TALEBE).expect(404);
      const own = await get(`/kosks/${beyazit}`, AYSE).expect(200);
      expect(own.body.archivedAt).not.toBeNull();
      await get(`/kosks/${beyazit}`).expect(200);
    });

    it("keeps the courses of a hidden köşk from anonymous callers", async () => {
      const [live] = await db
        .insert(courses)
        .values({
          koskId: beyazit,
          authorId: AYSE,
          title: "Yayında",
          status: CourseStatus.PUBLISHED,
        })
        .returning();
      await http().get(`/courses/${live.id}`).expect(200);
      await post(`/kosks/${beyazit}/hide`, {}, AYSE).expect(200);
      await http().get(`/courses/${live.id}`).expect(404);
    });

    it("brings a hidden köşk back for the başnazım alone", async () => {
      const [hidden] = await db
        .select()
        .from(kosks)
        .where(eq(kosks.handle, "kalenderhane"));
      await post(`/kosks/${hidden.id}/restore`, {}, ABDULLAH).expect(403);
      const res = await post(`/kosks/${hidden.id}/restore`).expect(200);
      expect(res.body.status).toBe("ACTIVE");
      expect((await kosk(hidden.id)).archivedAt).toBeNull();
      expect(await auditActions()).toEqual(["kosk.restore"]);
      const again = await post(`/kosks/${hidden.id}/restore`).expect(409);
      expect(again.body.code).toBe("KOSK_NOT_HIDDEN");
      await post("/kosks/d9999999-0000-4000-8000-000000000000/restore").expect(
        404
      );
    });
  });

  describe("GET /kosks/:id/nazims (nizam/25)", () => {
    it("lists the nazımları with who gave the post, in what capacity, and when", async () => {
      const res = await get(`/kosks/${fatih}/nazims`, OMER).expect(200);
      expect(res.body).toHaveLength(2);
      const [omer, abdullah] = res.body;
      expect(omer.user).toMatchObject({
        id: OMER,
        name: "Ömer Nasuhi Bilmenoğlu",
      });
      expect(omer.grantedBy.name).toBe("Yusuf Ziya Ertuğrul");
      expect(omer.grantedByRole).toBe("SYSTEM_ADMIN");
      expect(omer.endsAt).toBeNull();
      expect(abdullah.grantedBy.id).toBe(OMER);
      expect(abdullah.grantedByRole).toBe("KOSK_NAZIM");
    });

    it("is open to the başnazım and closed to everyone else", async () => {
      await get(`/kosks/${fatih}/nazims`).expect(200);
      await get(`/kosks/${fatih}/nazims`, AYSE).expect(403);
      await get(`/kosks/${fatih}/nazims`, TALEBE).expect(403);
      await get("/kosks/d9999999-0000-4000-8000-000000000000/nazims").expect(
        404
      );
    });
  });

  describe("POST /kosks/:id/nazims (nizam/21)", () => {
    it("adds nazımları with an end date, names them and writes one audit entry each", async () => {
      const endsAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
      const res = await post(`/kosks/${beyazit}/nazims`, {
        userIds: [OMER, NEWCOMER],
        endsAt,
      }).expect(201);
      expect(res.body.map((n: { user: { id: string } }) => n.user.id)).toEqual([
        AYSE,
        OMER,
        NEWCOMER,
      ]);
      const omer = res.body[1];
      expect(omer.endsAt).toBe(endsAt);
      expect(omer.grantedBy.id).toBe(ADMIN);
      expect(res.body[2].user.name).toBe("Yeni Nazım");
      expect(res.body[0].endsAt).toBeNull();
      expect(await auditActions()).toEqual([
        "kosk.nazim.add",
        "kosk.nazim.add",
      ]);
      // the new nazım can now hide the köşk
      await post(`/kosks/${beyazit}/hide`, {}, OMER).expect(200);
    });

    it("shows 'Süresiz' as no end and a nazım whose post lapsed is no longer listed", async () => {
      await post(`/kosks/${beyazit}/nazims`, { userIds: [OMER] }).expect(201);
      await db
        .update(roleAssignments)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(roleAssignments.userId, OMER));
      const res = await get(`/kosks/${beyazit}/nazims`).expect(200);
      expect(res.body.map((n: { user: { id: string } }) => n.user.id)).toEqual([
        AYSE,
      ]);
    });

    it("refuses the whole call when anyone is a nazım already", async () => {
      const res = await post(`/kosks/${beyazit}/nazims`, {
        userIds: [OMER, AYSE],
      }).expect(409);
      expect(res.body.code).toBe("KOSK_NAZIM_EXISTS");
      expect(await nazimsOf(beyazit)).toHaveLength(1);
      expect(await auditActions()).toEqual([]);
    });

    it("refuses a past end date, an unknown account and a bad body", async () => {
      await post(`/kosks/${beyazit}/nazims`, {
        userIds: [OMER],
        endsAt: new Date(Date.now() - 86_400_000).toISOString(),
      }).expect(400);
      const unknown = await post(`/kosks/${beyazit}/nazims`, {
        userIds: [GHOST],
      }).expect(404);
      expect(unknown.body.code).toBe("KOSK_NAZIM_UNKNOWN_ACCOUNT");
      await post(`/kosks/${beyazit}/nazims`, { userIds: [] }).expect(400);
      await post(`/kosks/${beyazit}/nazims`, { userIds: ["x"] }).expect(400);
      await post(`/kosks/${beyazit}/nazims`, { userIds: [OMER, OMER] }).expect(
        400
      );
      expect(await nazimsOf(beyazit)).toHaveLength(1);
    });

    it("is the başnazım's alone", async () => {
      await post(`/kosks/${beyazit}/nazims`, { userIds: [OMER] }, AYSE).expect(
        403
      );
      await post(
        `/kosks/${beyazit}/nazims`,
        { userIds: [OMER] },
        TALEBE
      ).expect(403);
      await post("/kosks/d9999999-0000-4000-8000-000000000000/nazims", {
        userIds: [OMER],
      }).expect(404);
    });

    it("makes a passive köşk active again", async () => {
      await db
        .update(kosks)
        .set({ passiveSince: new Date(), passiveReason: "no nazım" })
        .where(eq(kosks.id, beyazit));
      await db
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: ADMIN })
        .where(eq(roleAssignments.scopeId, beyazit));
      const before = await get("/kosks/directory?status=PASSIVE").expect(200);
      expect(before.body.items.map((i: { id: string }) => i.id)).toEqual([
        beyazit,
      ]);
      await post(`/kosks/${beyazit}/nazims`, { userIds: [OMER] }).expect(201);
      const after = await get("/kosks/directory?status=PASSIVE").expect(200);
      expect(after.body.total).toBe(0);
      expect((await kosk(beyazit)).passiveSince).toBeNull();
    });
  });

  describe("POST /kosks with managerUserIds (nizam/10)", () => {
    const body = (extra: Record<string, unknown> = {}) => ({
      name: "Davutpaşa Köşkü",
      handle: "davutpasa",
      field: "Akaid ve kelâm",
      level: "BEGINNER",
      tags: ["Akaid", "Kelâm"],
      coverHue: 215,
      isPrivate: false,
      managerUserIds: [AYSE, NEWCOMER],
      ...extra,
    });

    it("opens the köşk for the named nazımları, and the başnazım is not one", async () => {
      const res = await post("/kosks", body()).expect(201);
      expect(res.body.managerIds).toEqual([AYSE, NEWCOMER]);
      expect(res.body.ownerId).toBe(ADMIN);
      const held = await nazimsOf(res.body.id);
      expect(held.map((r) => r.grantedBy)).toEqual([ADMIN, ADMIN]);
      expect(await auditActions()).toEqual(["kosk.create"]);
      const list = await get("/kosks/directory?q=Davut").expect(200);
      expect(list.body.items[0].nazims).toHaveLength(2);
    });

    it("keeps the köşk unlisted when asked to", async () => {
      const res = await post("/kosks", body({ isPrivate: true })).expect(201);
      expect(res.body.isPrivate).toBe(true);
      const unlisted = await get("/kosks/directory?listing=UNLISTED").expect(
        200
      );
      expect(unlisted.body.total).toBe(2);
    });

    it("answers 409 for a short name another köşk has, with or without the @ and case", async () => {
      const taken = await post("/kosks", body({ handle: "Fatih" })).expect(409);
      expect(taken.body.code).toBe("KOSK_HANDLE_TAKEN");
      await post("/kosks", body({ handle: "@BEYAZIT" })).expect(409);
      expect(await kosk(beyazit)).toBeDefined();
    });

    it("leaves nothing behind when an account is unknown", async () => {
      await post("/kosks", body({ managerUserIds: [AYSE, GHOST] })).expect(404);
      const rows = await db.select().from(kosks);
      expect(rows.some((r) => r.name === "Davutpaşa Köşkü")).toBe(false);
    });

    it("refuses an empty, duplicated or malformed nazım list", async () => {
      await post("/kosks", body({ managerUserIds: [] })).expect(400);
      await post("/kosks", body({ managerUserIds: [AYSE, AYSE] })).expect(400);
      await post("/kosks", body({ managerUserIds: ["x"] })).expect(400);
    });

    it("lets only the başnazım name nazımları", async () => {
      await post("/kosks", body(), TALEBE).expect(403);
    });

    it("still lets anyone open a köşk of their own without managerUserIds", async () => {
      const res = await post("/kosks", { name: "Kendi Köşküm" }, TALEBE).expect(
        201
      );
      expect(res.body.managerIds).toEqual([TALEBE]);
    });
  });

  describe("köşk-wide policies (nizam/24)", () => {
    it("saves the two policies through PATCH and reads them back", async () => {
      const res = await http()
        .patch(`/kosks/${beyazit}`)
        .set("Authorization", auth(AYSE))
        .send({ alwaysRequireApproval: true, recordingsNeverPublic: true })
        .expect(200);
      expect(res.body).toMatchObject({
        alwaysRequireApproval: true,
        recordingsNeverPublic: true,
      });
      const read = await get(`/kosks/${beyazit}`, AYSE).expect(200);
      expect(read.body.alwaysRequireApproval).toBe(true);
    });

    it("answers 409 when a PATCH takes another köşk's short name", async () => {
      await http()
        .patch(`/kosks/${beyazit}`)
        .set("Authorization", auth(AYSE))
        .send({ handle: "fatih" })
        .expect(409);
      await http()
        .patch(`/kosks/${beyazit}`)
        .set("Authorization", auth(AYSE))
        .send({ handle: "beyazit", name: "Beyazıt Köşkü II" })
        .expect(200);
    });

    it("refuses nazımları in a PATCH body", async () => {
      await http()
        .patch(`/kosks/${beyazit}`)
        .set("Authorization", auth(AYSE))
        .send({ managerUserIds: [OMER] })
        .expect(400);
    });

    it("makes every course of the köşk wait for approval, whatever the course says", async () => {
      const [course] = await db
        .insert(courses)
        .values({
          koskId: beyazit,
          authorId: AYSE,
          title: "Açık kayıt",
          status: CourseStatus.PUBLISHED,
          requiresApproval: false,
        })
        .returning();
      await post(`/courses/${course.id}/enroll`, {}, TALEBE).expect(201);
      let [row] = await db.select().from(enrollments);
      expect(row.status).toBe(EnrollmentStatus.ENROLLED);

      await db.delete(enrollments);
      await db
        .update(kosks)
        .set({ alwaysRequireApproval: true })
        .where(eq(kosks.id, beyazit));
      await post(`/courses/${course.id}/enroll`, {}, TALEBE).expect(201);
      [row] = await db.select().from(enrollments);
      expect(row.status).toBe(EnrollmentStatus.PENDING);
    });
  });
});
