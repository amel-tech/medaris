import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses, enrollments } from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../../src/database/schema/permission.schema";
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
 * MDRS-169. The real AuthGuard verifies minted tokens; only the Keycloak
 * admin client is replaced, because the suite may not reach a network.
 */
const ADMIN_ID = "b0000000-0000-4000-8000-000000000001";
const NAZIM_ID = "b0000000-0000-4000-8000-000000000002";
const MUDERRIS_ID = "b0000000-0000-4000-8000-000000000003";
const TALEBE_ID = "b0000000-0000-4000-8000-000000000004";
const OTHER_ID = "b0000000-0000-4000-8000-000000000005";

const claimsFor: Record<string, Record<string, unknown>> = {
  [ADMIN_ID]: {
    email: "admin@example.com",
    given_name: "Ada",
    family_name: "Admin",
    realm_access: { roles: [ROLES.SYSTEM_ADMIN] },
  },
  [NAZIM_ID]: {
    email: "nazim@example.com",
    given_name: "Yusuf",
    family_name: "Nazım",
  },
  [MUDERRIS_ID]: {
    email: "muderris@example.com",
    given_name: "Musa",
    family_name: "Müderris",
  },
  [TALEBE_ID]: { email: "talebe@example.com" },
};

const auth = (sub: string) => bearerFor({ sub, claims: claimsFor[sub] ?? {} });

const directory = {
  users: [
    {
      id: OTHER_ID,
      email: "yeni@example.com",
      firstName: "Yeni",
      lastName: "Kişi",
      enabled: true,
    },
  ],
  chiefHolders: [{ id: ADMIN_ID, firstName: "Ada", lastName: "Admin" }] as
    | Array<Record<string, unknown>>
    | "missing",
  calls: [] as string[],
};

function fakeFetch(input: unknown): Promise<Response> {
  const url = String(input);
  directory.calls.push(url);
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
  if (url.includes("/admin/realms/r/users?")) {
    const email = new URL(url).searchParams.get("email")?.toLowerCase();
    return json(directory.users.filter((u) => u.email === email));
  }
  if (url.includes("/roles/SYSTEM_ADMIN/users")) {
    return directory.chiefHolders === "missing"
      ? json({ error: "Role not found" }, 404)
      : json(directory.chiefHolders);
  }
  return json({}, 404);
}

describe("Assignments (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let madrasahId: string;
  let publishedId: string;
  let draftId: string;

  const get = (path: string, sub: string) =>
    request(app.getHttpServer()).get(path).set("Authorization", auth(sub));

  beforeAll(async () => {
    // Settings the service reads; the fake fetch never leaves the process.
    app = await createTestApp({
      overrides: [{ provide: KEYCLOAK_ADMIN_FETCH, useValue: fakeFetch }],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
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
    directory.chiefHolders = [
      { id: ADMIN_ID, firstName: "Ada", lastName: "Admin" },
    ];
    directory.calls = [];
    await dbUtils.cleanTables(
      "permission_grants",
      "permission_group_items",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "audit_log",
      "users"
    );
    await databaseService.db.insert(users).values([
      {
        id: NAZIM_ID,
        email: "nazim@example.com",
        givenName: "Yusuf",
        familyName: "Nazım",
      },
      {
        id: MUDERRIS_ID,
        email: "muderris@example.com",
        givenName: "Musa",
        familyName: "Müderris",
      },
    ]);
    const [kosk] = await databaseService.db
      .insert(kosks)
      .values({ ownerId: NAZIM_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    const [madrasah] = await databaseService.db
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: ADMIN_ID,
      })
      .returning();
    madrasahId = madrasah.id;
    const [published] = await databaseService.db
      .insert(courses)
      .values({
        koskId,
        madrasahId,
        authorId: NAZIM_ID,
        title: "Bina ve İzhar Şerhi",
        status: "PUBLISHED",
      })
      .returning();
    publishedId = published.id;
    const [draft] = await databaseService.db
      .insert(courses)
      .values({ koskId, authorId: NAZIM_ID, title: "Kâfiye'ye giriş" })
      .returning();
    draftId = draft.id;
    await databaseService.db.insert(enrollments).values([
      { userId: TALEBE_ID, courseId: publishedId },
      { userId: OTHER_ID, courseId: publishedId, status: "PENDING" },
    ]);
    await assignRole(databaseService.db, {
      userId: NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
      grantedBy: ADMIN_ID,
    });
    await assignRole(databaseService.db, {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: publishedId,
      grantedBy: NAZIM_ID,
      isImam: true,
    });
    await assignRole(databaseService.db, {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: draftId,
      grantedBy: MUDERRIS_ID,
    });
    await assignRole(databaseService.db, {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN_ID,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "permission_group_items",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "audit_log",
      "users"
    );
    await app.close();
  });

  describe("GET /me/assignments", () => {
    it("lists the caller's held roles with scope, status, köşk, medrese and enrolled count", async () => {
      const res = await get("/me/assignments", MUDERRIS_ID).expect(200);
      const byScope = new Map(
        res.body.assignments.map((a: { scopeId: string }) => [a.scopeId, a])
      ) as Map<string, unknown>;

      expect(res.body.assignments).toHaveLength(3);
      const published = byScope.get(publishedId);
      expect(published).toMatchObject({
        role: "MUDERRIS",
        scopeName: "Bina ve İzhar Şerhi",
        isImam: true,
        grantedBySelf: false,
        grantedBy: { id: NAZIM_ID, displayName: "Yusuf Nazım" },
        course: {
          status: "PUBLISHED",
          hidden: false,
          koskId,
          koskName: "Nûruosmaniye Köşkü",
          madrasahId,
          madrasahName: "Süleymaniye Medresesi",
          studentCount: 1,
        },
      });
      expect(byScope.get(draftId)).toMatchObject({
        grantedBySelf: true,
        isImam: false,
        course: { status: "DRAFT", madrasahId: null, studentCount: 0 },
      });
      expect(byScope.get(madrasahId)).toMatchObject({
        role: "MEDRESE_BASMUDERRIS",
        scopeName: "Süleymaniye Medresesi",
      });
    });

    it("leaves out a revoked role and an expired one", async () => {
      await databaseService.db
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: ADMIN_ID })
        .where(eq(roleAssignments.scopeId, madrasahId));
      await databaseService.db
        .update(roleAssignments)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(roleAssignments.scopeId, draftId));

      const res = await get("/me/assignments", MUDERRIS_ID).expect(200);
      expect(
        res.body.assignments.map((a: { scopeId: string }) => a.scopeId)
      ).toEqual([publishedId]);
    });

    it("leaves out a role whose scope no longer exists", async () => {
      await databaseService.db.insert(roleAssignments).values({
        userId: MUDERRIS_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeType: "course",
        scopeId: "00000000-0000-4000-8000-0000000000aa",
        grantedBy: ADMIN_ID,
      });
      const res = await get("/me/assignments", MUDERRIS_ID).expect(200);
      expect(res.body.assignments).toHaveLength(3);
      const eff = await get("/me/effective-permissions", MUDERRIS_ID).expect(
        200
      );
      const muderris = eff.body.groups.find(
        (g: { role: string }) => g.role === "MUDERRIS"
      );
      expect(muderris.scopes).toHaveLength(2);
    });

    it("marks a hidden course", async () => {
      await databaseService.db
        .update(courses)
        .set({ archivedAt: new Date() })
        .where(eq(courses.id, draftId));
      const res = await get("/me/assignments", MUDERRIS_ID).expect(200);
      const draft = res.body.assignments.find(
        (a: { scopeId: string }) => a.scopeId === draftId
      );
      expect(draft.course.hidden).toBe(true);
    });

    it("is empty for someone with no role, and needs a token", async () => {
      const res = await get("/me/assignments", TALEBE_ID).expect(200);
      expect(res.body).toEqual({ assignments: [] });
      await request(app.getHttpServer()).get("/me/assignments").expect(401);
    });
  });

  describe("GET /me/roles", () => {
    it("counts scopes per role and reports the realm role", async () => {
      const muderris = await get("/me/roles", MUDERRIS_ID).expect(200);
      expect(muderris.body.systemAdmin).toBe(false);
      expect(muderris.body.roles).toEqual(
        expect.arrayContaining([
          { role: "MUDERRIS", scopeCount: 2 },
          { role: "MEDRESE_BASMUDERRIS", scopeCount: 1 },
        ])
      );
      const admin = await get("/me/roles", ADMIN_ID).expect(200);
      expect(admin.body).toEqual({ systemAdmin: true, roles: [] });
    });
  });

  describe("grants, permissions and effective permissions", () => {
    let groupId: string;

    beforeEach(async () => {
      const [group] = await databaseService.db
        .insert(permissionGroups)
        .values({
          scopeType: "course",
          scopeId: publishedId,
          name: "Yardımcılar",
          createdBy: MUDERRIS_ID,
        })
        .returning();
      groupId = group.id;
      await databaseService.db.insert(permissionGroupItems).values([
        { groupId, permission: "enrollment.decide" },
        { groupId, permission: "not.in.the.catalog" },
      ]);
    });

    it("GET /me/grants shows a direct grant and a group with its codes", async () => {
      await databaseService.db.insert(permissionGrants).values([
        {
          userId: TALEBE_ID,
          scopeType: "course",
          scopeId: publishedId,
          permission: "session.manage",
          grantedBy: MUDERRIS_ID,
        },
        {
          userId: TALEBE_ID,
          scopeType: "course",
          scopeId: publishedId,
          groupId,
          grantedBy: MUDERRIS_ID,
        },
        {
          userId: TALEBE_ID,
          scopeType: "course",
          scopeId: publishedId,
          permission: "course.edit",
          grantedBy: MUDERRIS_ID,
          revokedAt: new Date(),
          revokedBy: MUDERRIS_ID,
        },
      ]);
      const res = await get("/me/grants", TALEBE_ID).expect(200);
      expect(res.body.grants).toHaveLength(2);
      const direct = res.body.grants.find(
        (g: { permission?: string }) => g.permission
      );
      const grouped = res.body.grants.find((g: { group?: unknown }) => g.group);
      expect(direct).toMatchObject({
        permission: "session.manage",
        scopeName: "Bina ve İzhar Şerhi",
        grantedBy: { id: MUDERRIS_ID, displayName: "Musa Müderris" },
      });
      expect(grouped.group.name).toBe("Yardımcılar");
      expect(grouped.group.permissions).toContain("enrollment.decide");
    });

    it("effective permissions: role defaults, grouped by role, plus grants", async () => {
      await databaseService.db.insert(permissionGrants).values({
        userId: MUDERRIS_ID,
        scopeType: "kosk",
        scopeId: koskId,
        permission: "kosk.manage",
        grantedBy: NAZIM_ID,
      });
      const res = await get("/me/effective-permissions", MUDERRIS_ID).expect(
        200
      );
      const groups = res.body.groups as {
        role: string;
        scopes: { name: string }[];
        permissions: string[];
      }[];
      const muderris = groups.find((g) => g.role === "MUDERRIS");
      expect(muderris.scopes.map((s) => s.name).sort()).toEqual(
        ["Bina ve İzhar Şerhi", "Kâfiye'ye giriş"].sort()
      );
      expect(muderris.permissions).toContain("course.publish");
      expect(muderris.permissions).not.toContain("kosk.manage");
      // The permission to give permissions is a rule the screens state, not a
      // line they print (MDRS-135).
      expect(muderris.permissions).not.toContain("permission.grant");
      // A başmüderris holds the medrese's own defaults (MDRS-135 §3): they were
      // empty before the catalogue, so there was no group to show.
      const head = groups.find((g) => g.role === "MEDRESE_BASMUDERRIS");
      expect(head.permissions).toContain("madrasah.course_open");
      expect(head.permissions).not.toContain("permission.grant");
      expect(head.permissions).not.toContain("kosk.manage");
      // The köşk grant has no role of this person's in the köşk or above it, and
      // a permission never outlasts its role (MDRS-135): it counts for nothing,
      // here as in the engine, so it is no group and no line.
      expect(groups.find((g) => g.role === null)).toBeUndefined();
      expect(groups.flatMap((g) => g.permissions).includes("kosk.manage")).toBe(
        false
      );
    });

    it("effective permissions: a group's unknown code never reaches the answer", async () => {
      // A ders nazırı holds nothing but what is given (MDRS-135 §3), so the
      // group's one known code is the whole of the group.
      await assignRole(databaseService.db, {
        userId: TALEBE_ID,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: publishedId,
        grantedBy: MUDERRIS_ID,
      });
      await databaseService.db.insert(permissionGrants).values({
        userId: TALEBE_ID,
        scopeType: "course",
        scopeId: publishedId,
        groupId,
        grantedBy: MUDERRIS_ID,
      });
      const res = await get("/me/effective-permissions", TALEBE_ID).expect(200);
      expect(res.body.groups).toEqual([
        expect.objectContaining({
          role: "DERS_NAZIR",
          permissions: ["enrollment.decide"],
        }),
      ]);
    });

    it("GET /me/permissions is the flat union", async () => {
      const nazim = await get("/me/permissions", NAZIM_ID).expect(200);
      expect(nazim.body.permissions).toEqual(
        expect.arrayContaining(["kosk.manage", "user.lookup"])
      );
      expect(nazim.body.permissions).not.toContain("course.publish");
      const talebe = await get("/me/permissions", TALEBE_ID).expect(200);
      expect(talebe.body).toEqual({ permissions: [] });
    });

    it("the database refuses a grant that is both a permission and a group", async () => {
      await expect(
        databaseService.db.insert(permissionGrants).values({
          userId: TALEBE_ID,
          scopeType: "course",
          scopeId: publishedId,
          permission: "course.edit",
          groupId,
          grantedBy: MUDERRIS_ID,
        })
      ).rejects.toThrow();
    });
  });

  describe("GET /nizam/chief-nazim", () => {
    it("names whoever holds SYSTEM_ADMIN, for any signed-in caller", async () => {
      const res = await get("/nizam/chief-nazim", TALEBE_ID).expect(200);
      expect(res.body).toEqual({ displayName: "Ada Admin" });
      await request(app.getHttpServer()).get("/nizam/chief-nazim").expect(401);
    });
  });

  describe("GET /users/lookup", () => {
    it("finds a realm user by exact e-mail for a role holder, and writes the audit row", async () => {
      const res = await get(
        "/users/lookup?email=Yeni@example.com",
        MUDERRIS_ID
      ).expect(200);
      expect(res.body).toEqual([
        {
          id: OTHER_ID,
          givenName: "Yeni",
          familyName: "Kişi",
          email: "yeni@example.com",
        },
      ]);
      const rows = await databaseService.db.select().from(auditLog);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: MUDERRIS_ID,
        action: "user.lookup",
        entityId: OTHER_ID,
        details: { email: "yeni@example.com", found: true },
      });
    });

    it("answers [] for no match and still audits it", async () => {
      const res = await get(
        "/users/lookup?email=kimse@example.com",
        NAZIM_ID
      ).expect(200);
      expect(res.body).toEqual([]);
      const rows = await databaseService.db.select().from(auditLog);
      expect(rows[0].details).toMatchObject({ found: false });
    });

    it("refuses someone who holds no role, and does not ask the directory", async () => {
      await get("/users/lookup?email=yeni@example.com", TALEBE_ID).expect(403);
      expect(directory.calls).toEqual([]);
    });

    it("lets SYSTEM_ADMIN search without a role", async () => {
      await get("/users/lookup?email=yeni@example.com", ADMIN_ID).expect(200);
    });

    it("rejects a malformed address", async () => {
      await get("/users/lookup?email=not-an-email", NAZIM_ID).expect(400);
    });
  });
});
