import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../../src/database/schema/permission.schema";
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
 * MDRS-172, nizam/22: changing a medrese's başmüderris and answering, one by
 * one, what the outgoing one handed on — against a real Postgres, with a
 * minted SYSTEM_ADMIN token.
 */
const ADMIN = "e2000000-0000-4000-8000-000000000001";
const HEAD_A = "e2000000-0000-4000-8000-000000000002";
const HEAD_B = "e2000000-0000-4000-8000-000000000003";
const FATMA = "e2000000-0000-4000-8000-000000000004";
const SEYYID = "e2000000-0000-4000-8000-000000000005";
const OUTSIDER = "e2000000-0000-4000-8000-000000000006";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Medrese başmüderris change (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;
  let suleymaniye: string;
  let zeyrek: string;
  let roleRow: string;
  let grantRow: string;
  let groupGrantRow: string;

  const http = () => request(app.getHttpServer());
  const path = (id: string) => `/madrasahs/${id}/head-muderris`;
  const put = (id: string, body: unknown, sub = ADMIN) =>
    http()
      .put(path(id))
      .set("Authorization", auth(sub))
      .send(body as object);
  const delegations = (id: string, sub = ADMIN) =>
    http()
      .get(`${path(id)}/delegations`)
      .set("Authorization", auth(sub));
  const heads = (id: string) =>
    db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.scopeId, id),
          eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_BASMUDERRIS)
        )
      );
  const grantById = async (id: string) =>
    (
      await db
        .select()
        .from(permissionGrants)
        .where(eq(permissionGrants.id, id))
    )[0];
  const roleById = async (id: string) =>
    (
      await db.select().from(roleAssignments).where(eq(roleAssignments.id, id))
    )[0];

  const clean = () =>
    dbUtils.cleanTables(
      "permission_grants",
      "permission_group_items",
      "permission_groups",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    db = databaseService.db;
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  beforeEach(async () => {
    await clean();
    await db.insert(users).values([
      {
        id: HEAD_A,
        email: "a@example.com",
        givenName: "Mehmet Emin",
        familyName: "Işıkoğlu",
      },
      {
        id: HEAD_B,
        email: "b@example.com",
        givenName: "Zehra Nur",
        familyName: "Akyürekli",
      },
      {
        id: FATMA,
        email: "fz@example.com",
        givenName: "Fatma Zehra",
        familyName: "Çelebioğlu",
      },
      {
        id: SEYYID,
        email: "sa@example.com",
        givenName: "Seyyid Ahmet",
        familyName: "Kocabeyoğlu",
      },
    ]);
    const rows = await db
      .insert(madrasahs)
      .values([
        {
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN,
        },
        { handle: "zeyrek", name: "Zeyrek Medresesi", createdBy: ADMIN },
      ])
      .returning();
    [suleymaniye, zeyrek] = rows.map((r) => r.id);
    await assignRole(db, {
      userId: HEAD_A,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: suleymaniye,
      grantedBy: ADMIN,
    });
    // what HEAD_A handed on: a nazır role to Fatma, a single permission to Fatma and a group to Seyyid
    await assignRole(db, {
      userId: FATMA,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: suleymaniye,
      grantedBy: HEAD_A,
    });
    roleRow = (
      await db
        .select()
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, FATMA),
            eq(roleAssignments.scopeId, suleymaniye)
          )
        )
    )[0].id;
    const [grant] = await db
      .insert(permissionGrants)
      .values({
        userId: FATMA,
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: suleymaniye,
        permission: "platform.madrasah_nazir_grant",
        grantedBy: HEAD_A,
      })
      .returning();
    grantRow = grant.id;
    const [group] = await db
      .insert(permissionGroups)
      .values({
        name: "Ders açma ve kadro",
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: suleymaniye,
        createdBy: HEAD_A,
      })
      .returning();
    await db
      .insert(permissionGroupItems)
      .values({ groupId: group.id, permission: "platform.madrasah_edit" });
    const [gg] = await db
      .insert(permissionGrants)
      .values({
        userId: SEYYID,
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: suleymaniye,
        groupId: group.id,
        grantedBy: HEAD_A,
      })
      .returning();
    groupGrantRow = gg.id;
    // something somebody else gave, which is no concern of HEAD_A's
    await db.insert(permissionGrants).values({
      userId: OUTSIDER,
      scopeType: SCOPE_TYPES.MADRASAH,
      scopeId: suleymaniye,
      permission: "platform.madrasah_edit",
      grantedBy: ADMIN,
    });
  });

  describe("GET /madrasahs/:id/head-muderris/delegations", () => {
    it("lists what the sitting başmüderris handed on, named, in the order given", async () => {
      const res = await delegations(suleymaniye).expect(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0]).toMatchObject({
        kind: "ROLE",
        id: roleRow,
        role: "MEDRESE_NAZIR",
        to: {
          id: FATMA,
          name: "Fatma Zehra Çelebioğlu",
          email: "fz@example.com",
        },
      });
      expect(
        res.body.find((r: { id: string }) => r.id === grantRow)
      ).toMatchObject({
        kind: "GRANT",
        permission: "platform.madrasah_nazir_grant",
        groupName: null,
      });
      expect(
        res.body.find((r: { id: string }) => r.id === groupGrantRow)
      ).toMatchObject({
        kind: "GRANT",
        permission: null,
        groupName: "Ders açma ve kadro",
        to: { id: SEYYID },
      });
    });

    it("is empty for a medrese without a başmüderris, 404 for a missing one, 403 for a başmüderris", async () => {
      expect((await delegations(zeyrek).expect(200)).body).toEqual([]);
      await delegations("e2000000-0000-4000-8000-0000000000ff").expect(404);
      await delegations(suleymaniye, HEAD_A).expect(403);
    });
  });

  describe("PUT /madrasahs/:id/head-muderris", () => {
    const answers = (action: (kind: string) => "TAKE_OVER" | "DROP") => [
      { kind: "ROLE", id: roleRow, action: action("ROLE") },
      { kind: "GRANT", id: grantRow, action: action("GRANT") },
      { kind: "GRANT", id: groupGrantRow, action: action("GRANT") },
    ];

    it("refuses to replace while a hand-on is unanswered, and changes nothing (criterion 2)", async () => {
      for (const body of [
        { userId: HEAD_B },
        { userId: HEAD_B, delegations: [] },
        {
          userId: HEAD_B,
          delegations: answers(() => "TAKE_OVER").slice(0, 2),
        },
        {
          userId: HEAD_B,
          delegations: [
            ...answers(() => "TAKE_OVER"),
            {
              kind: "GRANT",
              id: "e2000000-0000-4000-8000-0000000000fe",
              action: "DROP",
            },
          ],
        },
      ]) {
        const res = await put(suleymaniye, body).expect(400);
        expect(res.body.code).toBe("DISMISS_DECISIONS_INCOMPLETE");
      }
      const held = (await heads(suleymaniye)).filter(
        (r) => r.revokedAt === null
      );
      expect(held.map((r) => r.userId)).toEqual([HEAD_A]);
      expect((await grantById(grantRow)).revokedAt).toBeNull();
      expect(
        await db
          .select()
          .from(auditLog)
          .where(eq(auditLog.action, "madrasah.head_muderris.set"))
      ).toHaveLength(0);
    });

    it("replaces the başmüderris, takes over the ones answered Devral and drops the others (criteria 3, 4, 5)", async () => {
      const res = await put(suleymaniye, {
        userId: HEAD_B,
        delegations: [
          { kind: "ROLE", id: roleRow, action: "TAKE_OVER" },
          { kind: "GRANT", id: grantRow, action: "DROP" },
          { kind: "GRANT", id: groupGrantRow, action: "TAKE_OVER" },
        ],
      }).expect(200);
      expect(res.body.headMuderris).toMatchObject({ id: HEAD_B });

      const rows = await heads(suleymaniye);
      expect(rows.find((r) => r.userId === HEAD_A)?.revokedAt).not.toBeNull();
      expect(rows.find((r) => r.userId === HEAD_B)?.revokedAt).toBeNull();

      // Devral: the right stays, the caller is its giver
      const role = await roleById(roleRow);
      expect(role.revokedAt).toBeNull();
      expect(role.grantedBy).toBe(ADMIN);
      const group = await grantById(groupGrantRow);
      expect(group.revokedAt).toBeNull();
      expect(group.grantedBy).toBe(ADMIN);
      // Düşür: revoked at once, in the caller's name
      const dropped = await grantById(grantRow);
      expect(dropped.revokedAt).not.toBeNull();
      expect(dropped.revokedBy).toBe(ADMIN);

      // one audit row for all of it
      const entries = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "madrasah.head_muderris.set"));
      expect(entries).toHaveLength(1);
      expect(entries[0].details).toMatchObject({
        headMuderrisUserId: HEAD_B,
        previous: [HEAD_A],
        tookOver: 2,
        dropped: 1,
      });
    });

    it("sets the new başmüderris's end", async () => {
      const endsAt = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();
      await put(suleymaniye, {
        userId: HEAD_B,
        endsAt,
        delegations: answers(() => "DROP"),
      }).expect(200);
      const mine = (await heads(suleymaniye)).find((r) => r.userId === HEAD_B);
      expect(mine?.expiresAt?.toISOString()).toBe(endsAt);
    });

    it("refuses an end in the past", async () => {
      const res = await put(suleymaniye, {
        userId: HEAD_B,
        endsAt: new Date(Date.now() - 1000).toISOString(),
        delegations: answers(() => "DROP"),
      }).expect(400);
      expect(res.body.code).toBe("GRANT_EXPIRY_INVALID");
      expect(
        (await heads(suleymaniye)).filter((r) => r.revokedAt === null)[0].userId
      ).toBe(HEAD_A);
    });

    it("asks nothing of an atama: a medrese with no başmüderris needs no answers", async () => {
      await put(zeyrek, { userId: HEAD_B }).expect(200);
      expect(
        (await heads(zeyrek)).filter((r) => r.revokedAt === null)[0].userId
      ).toBe(HEAD_B);
    });

    it("asks nothing when the one who already heads it is named again", async () => {
      await put(suleymaniye, { userId: HEAD_A }).expect(200);
      expect((await grantById(grantRow)).revokedAt).toBeNull();
      expect((await roleById(roleRow)).grantedBy).toBe(HEAD_A);
    });

    it("asks about what the outgoing başmüderris gave the incoming one too, and their new seat covers what others gave them (review B-grants-R2-1)", async () => {
      // Fatma heads the medrese: what HEAD_A gave her is decided like anyone's.
      const res = await delegations(suleymaniye).expect(200);
      expect(
        res.body.filter((r: { to: { id: string } }) => r.to.id === FATMA)
      ).toHaveLength(2);
      const [fromAdmin] = await db
        .insert(permissionGrants)
        .values({
          userId: FATMA,
          scopeType: SCOPE_TYPES.MADRASAH,
          scopeId: suleymaniye,
          permission: "madrasah.students_view",
          grantedBy: ADMIN,
        })
        .returning();
      const refused = await put(suleymaniye, {
        userId: FATMA,
        delegations: [{ kind: "GRANT", id: groupGrantRow, action: "DROP" }],
      }).expect(400);
      expect(refused.body.code).toBe("DISMISS_DECISIONS_INCOMPLETE");
      expect((await roleById(roleRow)).revokedAt).toBeNull();

      await put(suleymaniye, {
        userId: FATMA,
        delegations: answers(() => "DROP"),
      }).expect(200);
      expect((await roleById(roleRow)).revokedAt).not.toBeNull();
      expect((await grantById(grantRow)).revokedAt).not.toBeNull();
      expect((await grantById(groupGrantRow)).revokedAt).not.toBeNull();
      // Her nazır seat went, her başmüderris seat came first: nothing someone
      // else gave her in the medrese went with it.
      expect((await grantById(fromAdmin.id)).revokedAt).toBeNull();
      expect(
        (await heads(suleymaniye))
          .filter((r) => r.revokedAt === null)
          .map((r) => r.userId)
      ).toEqual([FATMA]);
    });
  });
});
