import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
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
 * MDRS-185, nazir/06 and nazir/16: the medrese's permission dictionary, its
 * permission groups and what its başmüderris gives a nazır, against a real
 * Postgres. Real `AuthGuard` with minted tokens; no realm directory (every
 * person has no name here, and the specs do not read one).
 *
 * The medrese's başmüderris (MEDRESE_BASMUDERRIS) is the only medrese-side
 * role the matrix resolves; a MEDRESE_NAZIR is refused like a stranger.
 */
const ADMIN_ID = "c7000000-0000-4000-8000-000000000001";
const HEAD_ID = "c7000000-0000-4000-8000-000000000002";
const OTHER_HEAD_ID = "c7000000-0000-4000-8000-000000000003";
const NAZIR_ID = "c7000000-0000-4000-8000-000000000004";
const OTHER_NAZIR_ID = "c7000000-0000-4000-8000-000000000005";
const STRANGER_ID = "c7000000-0000-4000-8000-000000000006";
const MANAGER_ID = "c7000000-0000-4000-8000-000000000007";
const GIVEN_TO_ID = "c7000000-0000-4000-8000-000000000008";
const UNKNOWN_ID = "c7000000-0000-4000-8000-00000000ffff";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);

describe("Medrese permissions and groups (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let course1: string;
  let course2: string;
  let foreignCourse: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const at = (path: string, id = madrasahId) => `/madrasahs/${id}${path}`;
  const get = (sub: string, path: string) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (sub: string, path: string, body?: object) =>
    http().post(path).set("Authorization", auth(sub)).send(body);
  const put = (sub: string, path: string, body?: object) =>
    http().put(path).set("Authorization", auth(sub)).send(body);
  const patch = (sub: string, path: string, body?: object) =>
    http().patch(path).set("Authorization", auth(sub)).send(body);
  const del = (sub: string, path: string, body?: object) =>
    http().delete(path).set("Authorization", auth(sub)).send(body);

  const nazirPath = (userId = NAZIR_ID, id = madrasahId) =>
    at(`/nazirs/${userId}/permissions`, id);
  const audits = (action: string, entityId: string) =>
    db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)));
  const heldRows = (userId: string) =>
    db()
      .select()
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.userId, userId),
          isNull(permissionGrants.revokedAt)
        )
      );

  const makeGroup = async (
    name: string,
    permissions: string[],
    scopeId: string | null = madrasahId,
    scopeType: (typeof SCOPE_TYPES)[keyof typeof SCOPE_TYPES] = SCOPE_TYPES.MADRASAH
  ) => {
    const [group] = await db()
      .insert(permissionGroups)
      .values({ scopeType, scopeId, name, createdBy: HEAD_ID })
      .returning();
    await db()
      .insert(permissionGroupItems)
      .values(
        permissions.map((permission) => ({ groupId: group.id, permission }))
      );
    return group.id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

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
      grantedBy: ADMIN_ID,
    });
    await assignRole(db(), {
      userId: OTHER_HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: otherMadrasahId,
      grantedBy: ADMIN_ID,
    });
    await assignRole(db(), {
      userId: NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD_ID,
    });
    await assignRole(db(), {
      userId: OTHER_NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: otherMadrasahId,
      grantedBy: OTHER_HEAD_ID,
    });

    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    const [one, two, foreign] = await db()
      .insert(courses)
      .values([
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Bina ve İzhar Şerhi",
          madrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "İsâgûcî",
          madrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: kosk.id,
          authorId: MANAGER_ID,
          title: "Başka medresenin dersi",
          madrasahId: otherMadrasahId,
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    course1 = one.id;
    course2 = two.id;
    foreignCourse = foreign.id;
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("the dictionary", () => {
    // Ten medrese permissions and the twenty course permissions of nazir/06, and
    // one more of each from the owner's 1 October list: "request a non-medrese
    // course in a köşk" (medrese) and "propose a köşk deck" (course).
    it("lists the eleven medrese and the twenty-one course permissions and what the caller may give", async () => {
      const res = await get(HEAD_ID, at("/permissions")).expect(200);
      expect(res.body.madrasah).toHaveLength(11);
      expect(res.body.madrasah[0]).toBe("madrasah.course_open");
      expect(res.body.madrasah).toContain("madrasah.offsite_course_request");
      expect(res.body.course).toHaveLength(21);
      expect(res.body.course).toContain("deck.propose_kosk");
      expect(res.body.course[0]).toBe("course.edit");
      expect(res.body.givable).toEqual([
        ...res.body.madrasah,
        ...res.body.course,
      ]);
      expect(
        (await get(ADMIN_ID, at("/permissions")).expect(200)).body
      ).toEqual(res.body);
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone", async () => {
      // A medrese nazır is on no matrix row yet: refused like a stranger.
      for (const sub of [NAZIR_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await get(sub, at("/permissions")).expect(403);
      }
      await http().get(at("/permissions")).expect(401);
      await get(HEAD_ID, at("/permissions", UNKNOWN_ID)).expect(404);
    });
  });

  describe("the groups", () => {
    const create = (over: object = {}) => ({
      name: "Yasak ve itiraz",
      scope: "MADRASAH",
      permissions: ["madrasah.ban", "madrasah.appeal_open", "ban.course"],
      ...over,
    });

    it("defines a group in the medrese, audited, and lists it with how many people hold it", async () => {
      const res = await post(
        HEAD_ID,
        at("/permission-groups"),
        create()
      ).expect(201);
      expect(res.body).toMatchObject({
        name: "Yasak ve itiraz",
        scope: "MADRASAH",
        userCount: 0,
      });
      expect(res.body.permissions.sort()).toEqual([
        "ban.course",
        "madrasah.appeal_open",
        "madrasah.ban",
      ]);
      const [row] = await db()
        .select()
        .from(permissionGroups)
        .where(eq(permissionGroups.id, res.body.id));
      expect(row).toMatchObject({
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: madrasahId,
        createdBy: HEAD_ID,
        deletedAt: null,
      });
      expect(await audits("permission_group.create", res.body.id)).toHaveLength(
        1
      );

      const course = await post(
        ADMIN_ID,
        at("/permission-groups"),
        create({
          name: "Ders işleri",
          scope: "COURSE",
          permissions: ["course.edit"],
        })
      ).expect(201);
      expect(course.body.scope).toBe("COURSE");

      await put(HEAD_ID, nazirPath(), {
        groupId: res.body.id,
        permissions: [],
      }).expect(200);
      const list = await get(HEAD_ID, at("/permission-groups")).expect(200);
      expect(list.body.map((g: { name: string }) => g.name)).toEqual([
        "Yasak ve itiraz",
        "Ders işleri",
      ]);
      expect(list.body[0].userCount).toBe(1);
    });

    it("lists only this medrese's groups", async () => {
      await makeGroup("Bizim", ["course.edit"]);
      await makeGroup("Onların", ["course.edit"], otherMadrasahId);
      await makeGroup(
        "Platform",
        ["platform.audit_read"],
        null,
        SCOPE_TYPES.PLATFORM
      );
      const res = await get(HEAD_ID, at("/permission-groups")).expect(200);
      expect(res.body.map((g: { name: string }) => g.name)).toEqual(["Bizim"]);
    });

    it("refuses a name the medrese has, whatever its case, but not one another medrese has", async () => {
      await post(HEAD_ID, at("/permission-groups"), create()).expect(201);
      const taken = await post(
        HEAD_ID,
        at("/permission-groups"),
        create({ name: "YASAK VE ITIRAZ".replace("ITIRAZ", "itiraz") })
      ).expect(409);
      expect(taken.body.code).toBe("PERMISSION_GROUP_NAME_TAKEN");
      await post(
        OTHER_HEAD_ID,
        at("/permission-groups", otherMadrasahId),
        create()
      ).expect(201);
    });

    it("refuses an empty group, an unknown code, a blank name and a medrese permission in a course group", async () => {
      const bad = [
        create({ permissions: [] }),
        create({ permissions: ["kosk.nuke"] }),
        create({ permissions: ["platform.audit_read"] }),
        create({ name: "   " }),
        create({ scope: "COURSE" }),
        create({ scope: "SOMEWHERE" }),
      ];
      for (const body of bad) {
        await post(HEAD_ID, at("/permission-groups"), body).expect(400);
      }
      expect(await db().select().from(permissionGroups)).toHaveLength(0);
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone", async () => {
      const id = await makeGroup("Kadro", ["course.edit"]);
      for (const sub of [NAZIR_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await post(sub, at("/permission-groups"), create()).expect(403);
        await patch(sub, at(`/permission-groups/${id}`), { name: "x" }).expect(
          403
        );
        await del(sub, at(`/permission-groups/${id}`), {}).expect(403);
        await get(sub, at("/permission-groups")).expect(403);
      }
    });

    it("renames a group and changes an unused group's permissions", async () => {
      const id = await makeGroup("Kadro", ["course.edit"]);
      const res = await patch(HEAD_ID, at(`/permission-groups/${id}`), {
        name: " Kadro ve kayıt ",
        permissions: ["course.edit", "enrollment.decide"],
      }).expect(200);
      expect(res.body).toMatchObject({ id, name: "Kadro ve kayıt" });
      expect(res.body.permissions.sort()).toEqual([
        "course.edit",
        "enrollment.decide",
      ]);
      const [audit] = await audits("permission_group.update", id);
      expect(audit.actorId).toBe(HEAD_ID);

      await patch(HEAD_ID, at(`/permission-groups/${id}`), {}).expect(200);
      await patch(HEAD_ID, at(`/permission-groups/${id}`), {
        permissions: [],
      }).expect(400);
    });

    it("asks what becomes of the people who hold a group before changing its permissions", async () => {
      const id = await makeGroup("Kadro", ["course.edit", "madrasah.ban"]);
      await put(HEAD_ID, nazirPath(), { groupId: id, permissions: [] }).expect(
        200
      );
      const change = { permissions: ["course.edit"] };

      const asked = await patch(
        HEAD_ID,
        at(`/permission-groups/${id}`),
        change
      ).expect(400);
      expect(asked.body.code).toBe("USERS_POLICY_REQUIRED");

      // Renaming keeps the permissions, so it needs no answer.
      await patch(HEAD_ID, at(`/permission-groups/${id}`), {
        name: "Kadro 2",
      }).expect(200);

      await patch(HEAD_ID, at(`/permission-groups/${id}`), {
        ...change,
        usersPolicy: "keep",
      }).expect(200);
      const held = await heldRows(NAZIR_ID);
      expect(held.map((r) => r.groupId)).toEqual([null, null]);
      expect(held.map((r) => r.permission).sort()).toEqual([
        "course.edit",
        "madrasah.ban",
      ]);
      expect(held.every((r) => r.scopeId === madrasahId)).toBe(true);
      expect(
        (await get(HEAD_ID, at("/permission-groups")).expect(200)).body[0]
      ).toMatchObject({ userCount: 0, permissions: ["course.edit"] });
    });

    it("takes the permissions away from the people who hold a deleted group when asked to", async () => {
      const id = await makeGroup("Kadro", ["course.edit"]);
      await put(HEAD_ID, nazirPath(), { groupId: id, permissions: [] }).expect(
        200
      );

      const asked = await del(
        HEAD_ID,
        at(`/permission-groups/${id}`),
        {}
      ).expect(400);
      expect(asked.body.code).toBe("USERS_POLICY_REQUIRED");
      await del(HEAD_ID, at(`/permission-groups/${id}`), {
        usersPolicy: "revoke",
      }).expect(204);

      expect(await heldRows(NAZIR_ID)).toEqual([]);
      const [row] = await db()
        .select()
        .from(permissionGroups)
        .where(eq(permissionGroups.id, id));
      expect(row.deletedAt).not.toBeNull();
      expect(await audits("permission_group.delete", id)).toHaveLength(1);
      expect(
        (await get(HEAD_ID, at("/permission-groups")).expect(200)).body
      ).toEqual([]);
    });

    it("keeps the permissions of the people who hold a deleted group as single ones when asked to", async () => {
      const id = await makeGroup("Kadro", ["course.edit", "madrasah.ban"]);
      await put(HEAD_ID, nazirPath(), { groupId: id, permissions: [] }).expect(
        200
      );
      await del(HEAD_ID, at(`/permission-groups/${id}`), {
        usersPolicy: "keep",
      }).expect(204);
      expect(
        (await heldRows(NAZIR_ID)).map((r) => r.permission).sort()
      ).toEqual(["course.edit", "madrasah.ban"]);
    });

    it("deletes an unused group without a question", async () => {
      const id = await makeGroup("Kadro", ["course.edit"]);
      await del(HEAD_ID, at(`/permission-groups/${id}`), {}).expect(204);
      await del(HEAD_ID, at(`/permission-groups/${id}`), {}).expect(404);

      // A client that sends no body at all is as good as one that sends {}.
      const bare = await makeGroup("Ders işleri", ["course.edit"]);
      await http()
        .delete(at(`/permission-groups/${bare}`))
        .set("Authorization", auth(HEAD_ID))
        .expect(204);
    });

    it("does not know another medrese's group or the platform's, and the Nizam screens do not know the medrese's", async () => {
      const mine = await makeGroup("Bizim", ["course.edit"]);
      const theirs = await makeGroup(
        "Onların",
        ["course.edit"],
        otherMadrasahId
      );
      const platform = await makeGroup(
        "Platform",
        ["platform.audit_read"],
        null,
        SCOPE_TYPES.PLATFORM
      );
      for (const id of [theirs, platform, UNKNOWN_ID]) {
        await patch(HEAD_ID, at(`/permission-groups/${id}`), {
          name: "x",
        }).expect(404);
        await del(HEAD_ID, at(`/permission-groups/${id}`), {}).expect(404);
      }
      await put(ADMIN_ID, `/nizam/permission-groups/${mine}`, {
        name: "x",
        permissions: ["course.edit"],
      }).expect(404);
      await del(ADMIN_ID, `/nizam/permission-groups/${mine}`, {}).expect(404);
      const all = await get(ADMIN_ID, "/nizam/permission-groups").expect(200);
      expect(all.body.map((g: { name: string }) => g.name)).toEqual([
        "Platform",
      ]);
    });
  });

  describe("giving a nazır their permissions", () => {
    it("opens with nothing for a nazır who was given nothing", async () => {
      expect((await get(HEAD_ID, nazirPath()).expect(200)).body).toEqual({
        groupId: null,
        permissions: [],
        courseIds: null,
        expiresAt: null,
      });
    });

    it("gives a group and extra permissions for every course, audited, and answers the nazır's row", async () => {
      const group = await makeGroup("Kadro", ["course.edit", "madrasah.ban"]);
      const res = await put(HEAD_ID, nazirPath(), {
        groupId: group,
        permissions: [
          "madrasah.ban",
          "enrollment.decide",
          "madrasah.nazir_appoint",
        ],
      }).expect(200);

      expect(res.body).toMatchObject({
        user: { id: NAZIR_ID },
        groups: [{ id: group, name: "Kadro" }],
        courseGrants: [],
        grantedBy: { id: HEAD_ID },
      });
      expect(
        res.body.permissions.map((p: { code: string }) => p.code).sort()
      ).toEqual(["enrollment.decide", "madrasah.nazir_appoint"]);

      const rows = await heldRows(NAZIR_ID);
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.scopeType === SCOPE_TYPES.MADRASAH)).toBe(
        true
      );
      expect(rows.every((r) => r.scopeId === madrasahId)).toBe(true);
      expect(rows.every((r) => r.grantedBy === HEAD_ID)).toBe(true);
      expect(rows.every((r) => r.expiresAt === null)).toBe(true);
      const [audit] = await audits("permission.grant", NAZIR_ID);
      expect(audit).toMatchObject({
        actorId: HEAD_ID,
        details: { madrasahId },
      });

      expect((await get(HEAD_ID, nazirPath()).expect(200)).body).toMatchObject({
        groupId: group,
        courseIds: null,
        expiresAt: null,
      });
      const roster = await get(HEAD_ID, at("/nazirs")).expect(200);
      expect(roster.body[0].groups).toHaveLength(1);
    });

    it("saves the dialog unchanged without touching a row, and replaces what changed", async () => {
      const group = await makeGroup("Kadro", ["course.edit"]);
      const body = { groupId: group, permissions: ["madrasah.ban"] };
      await put(HEAD_ID, nazirPath(), body).expect(200);
      const before = await heldRows(NAZIR_ID);
      await put(ADMIN_ID, nazirPath(), body).expect(200);
      expect((await heldRows(NAZIR_ID)).map((r) => r.id).sort()).toEqual(
        before.map((r) => r.id).sort()
      );
      expect(await audits("permission.grant", NAZIR_ID)).toHaveLength(1);
      expect(await audits("permission.revoke", NAZIR_ID)).toHaveLength(0);

      await put(ADMIN_ID, nazirPath(), {
        groupId: null,
        permissions: ["madrasah.settings_edit"],
        courseIds: null,
        expiresAt: null,
      }).expect(200);
      const now = await heldRows(NAZIR_ID);
      expect(now.map((r) => r.permission)).toEqual(["madrasah.settings_edit"]);
      expect(now[0].grantedBy).toBe(ADMIN_ID);
      const revoked = await db()
        .select()
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.userId, NAZIR_ID),
            eq(permissionGrants.revokedBy, ADMIN_ID)
          )
        );
      expect(revoked).toHaveLength(2);
      expect(await audits("permission.revoke", NAZIR_ID)).toHaveLength(1);

      await put(HEAD_ID, nazirPath(), { permissions: [] }).expect(200);
      expect(await heldRows(NAZIR_ID)).toEqual([]);
    });

    it("limits the course permissions to the chosen courses and keeps the medrese ones in the medrese", async () => {
      const res = await put(HEAD_ID, nazirPath(), {
        permissions: ["course.edit", "session.manage", "madrasah.ban"],
        courseIds: [course1, course2.toUpperCase()],
      }).expect(200);

      expect(res.body.permissions.map((p: { code: string }) => p.code)).toEqual(
        ["madrasah.ban"]
      );
      expect(
        res.body.courseGrants
          .map(
            (g: {
              courseId: string;
              courseTitle: string;
              permission: string;
            }) => `${g.courseTitle}:${g.permission}`
          )
          .sort()
      ).toEqual([
        "Bina ve İzhar Şerhi:course.edit",
        "Bina ve İzhar Şerhi:session.manage",
        "İsâgûcî:course.edit",
        "İsâgûcî:session.manage",
      ]);
      expect(res.body.courseGrants[0].group).toBeNull();

      const rows = await heldRows(NAZIR_ID);
      expect(
        rows.filter((r) => r.scopeType === SCOPE_TYPES.COURSE)
      ).toHaveLength(4);
      const state = (await get(HEAD_ID, nazirPath()).expect(200)).body;
      expect(state.courseIds.sort()).toEqual([course1, course2].sort());
      expect(state.permissions.sort()).toEqual([
        "course.edit",
        "madrasah.ban",
        "session.manage",
      ]);

      // Back to every course: the course rows go, the medrese holds them.
      await put(HEAD_ID, nazirPath(), {
        permissions: ["course.edit", "madrasah.ban"],
      }).expect(200);
      const everywhere = await heldRows(NAZIR_ID);
      expect(
        everywhere.filter((r) => r.scopeType === SCOPE_TYPES.COURSE)
      ).toEqual([]);
      expect(everywhere.map((r) => r.permission).sort()).toEqual([
        "course.edit",
        "madrasah.ban",
      ]);
    });

    it("puts a course-only group in each chosen course", async () => {
      const group = await makeGroup("Ders işleri", [
        "course.edit",
        "session.manage",
      ]);
      const res = await put(HEAD_ID, nazirPath(), {
        groupId: group,
        permissions: [],
        courseIds: [course1],
      }).expect(200);
      expect(res.body.groups).toEqual([]);
      expect(res.body.courseGrants).toMatchObject([
        {
          courseId: course1,
          courseTitle: "Bina ve İzhar Şerhi",
          permission: null,
          group: { id: group, name: "Ders işleri" },
        },
      ]);
      expect((await get(HEAD_ID, nazirPath()).expect(200)).body).toMatchObject({
        groupId: group,
        courseIds: [course1],
      });
    });

    it("ends the permissions on the date given, and refuses a date in the past", async () => {
      const end = daysFromNow(30);
      const res = await put(HEAD_ID, nazirPath(), {
        permissions: ["madrasah.ban"],
        expiresAt: end.toISOString(),
      }).expect(200);
      expect(res.body.expiresAt).toBe(end.toISOString());
      expect((await heldRows(NAZIR_ID))[0].expiresAt?.toISOString()).toBe(
        end.toISOString()
      );
      expect((await get(HEAD_ID, nazirPath()).expect(200)).body.expiresAt).toBe(
        end.toISOString()
      );

      const past = await put(HEAD_ID, nazirPath(), {
        permissions: ["madrasah.ban"],
        expiresAt: daysFromNow(-1).toISOString(),
      }).expect(400);
      expect(past.body.code).toBe("GRANT_EXPIRY_INVALID");

      // Keeping the rows and moving the end moves it without a new row.
      const later = daysFromNow(60);
      await put(HEAD_ID, nazirPath(), {
        permissions: ["madrasah.ban"],
        expiresAt: later.toISOString(),
      }).expect(200);
      const rows = await heldRows(NAZIR_ID);
      expect(rows).toHaveLength(1);
      expect(rows[0].expiresAt?.toISOString()).toBe(later.toISOString());
    });

    it("refuses unknown codes and courses that do not fit, and writes nothing", async () => {
      const spanning = await makeGroup("Her şey", [
        "madrasah.ban",
        "course.edit",
      ]);
      const foreignGroup = await makeGroup(
        "Onların",
        ["course.edit"],
        otherMadrasahId
      );
      const cases: Array<[number, object, string?]> = [
        [400, { permissions: ["kosk.nuke"] }, "PERMISSION_UNKNOWN"],
        [400, { permissions: ["platform.audit_read"] }, "PERMISSION_UNKNOWN"],
        [
          400,
          { permissions: ["course.edit"], courseIds: [] },
          "NAZIR_COURSE_SCOPE_INVALID",
        ],
        [
          400,
          { permissions: ["course.edit"], courseIds: [foreignCourse] },
          "NAZIR_COURSE_SCOPE_INVALID",
        ],
        [
          400,
          { permissions: ["madrasah.ban"], courseIds: [course1] },
          "NAZIR_COURSE_SCOPE_INVALID",
        ],
        [
          400,
          { groupId: spanning, permissions: [], courseIds: [course1] },
          "NAZIR_COURSE_SCOPE_INVALID",
        ],
        [400, { permissions: ["madrasah.ban"], courseIds: ["not-a-uuid"] }],
        [400, { permissions: "madrasah.ban" }],
        [
          404,
          { groupId: foreignGroup, permissions: [] },
          "PERMISSION_GROUP_NOT_FOUND",
        ],
        [
          404,
          { groupId: UNKNOWN_ID, permissions: [] },
          "PERMISSION_GROUP_NOT_FOUND",
        ],
      ];
      for (const [status, body, code] of cases) {
        const res = await put(HEAD_ID, nazirPath(), body).expect(status);
        if (code) expect(res.body.code).toBe(code);
      }
      expect(await heldRows(NAZIR_ID)).toEqual([]);
      expect(await audits("permission.grant", NAZIR_ID)).toHaveLength(0);
    });

    it("answers a user who is no nazır of this medrese with not-found", async () => {
      for (const userId of [STRANGER_ID, OTHER_NAZIR_ID, HEAD_ID]) {
        await put(HEAD_ID, nazirPath(userId), { permissions: [] }).expect(404);
        await get(HEAD_ID, nazirPath(userId)).expect(404);
      }
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone", async () => {
      const body = { permissions: ["madrasah.ban"] };
      // A medrese nazır is on no matrix row yet, so a nazır cannot give either.
      for (const sub of [NAZIR_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await put(sub, nazirPath(), body).expect(403);
        await get(sub, nazirPath()).expect(403);
      }
      await http().put(nazirPath()).send(body).expect(401);
      await put(HEAD_ID, nazirPath(UNKNOWN_ID), body).expect(404);
      await put(HEAD_ID, nazirPath(NAZIR_ID, UNKNOWN_ID), body).expect(404);
      await put(HEAD_ID, nazirPath("not-a-uuid"), body).expect(400);
      expect(await heldRows(NAZIR_ID)).toEqual([]);
      await put(ADMIN_ID, nazirPath(), body).expect(200);
    });

    it("leaves the nazırs of other medreses and the nazır's permissions elsewhere alone", async () => {
      await db().insert(permissionGrants).values({
        userId: NAZIR_ID,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: foreignCourse,
        permission: "course.edit",
        grantedBy: OTHER_HEAD_ID,
      });
      await put(HEAD_ID, nazirPath(), { permissions: ["madrasah.ban"] }).expect(
        200
      );
      await put(HEAD_ID, nazirPath(), { permissions: [] }).expect(200);
      expect(
        (await heldRows(NAZIR_ID)).map((r) => [r.scopeId, r.permission])
      ).toEqual([[foreignCourse, "course.edit"]]);
    });

    it("takes the course permissions along when the nazır is dismissed", async () => {
      await put(HEAD_ID, nazirPath(), {
        permissions: ["madrasah.ban", "course.edit"],
        courseIds: [course1],
      }).expect(200);
      expect(await heldRows(NAZIR_ID)).toHaveLength(2);
      await del(HEAD_ID, at(`/nazirs/${NAZIR_ID}`), { decisions: [] }).expect(
        204
      );
      expect(await heldRows(NAZIR_ID)).toEqual([]);
      expect(
        await db()
          .select()
          .from(roleAssignments)
          .where(
            and(
              eq(roleAssignments.userId, NAZIR_ID),
              isNull(roleAssignments.revokedAt)
            )
          )
      ).toEqual([]);
    });

    it("shows what was given on the roster, and counts the people who hold a group", async () => {
      const group = await makeGroup("Kadro", ["course.edit"]);
      await assignRole(db(), {
        userId: GIVEN_TO_ID,
        role: ASSIGNED_ROLES.MEDRESE_NAZIR,
        scopeId: madrasahId,
        grantedBy: HEAD_ID,
      });
      await put(HEAD_ID, nazirPath(), {
        groupId: group,
        permissions: [],
      }).expect(200);
      await put(HEAD_ID, nazirPath(GIVEN_TO_ID), {
        groupId: group,
        permissions: ["madrasah.ban"],
      }).expect(200);
      const groups = await get(HEAD_ID, at("/permission-groups")).expect(200);
      expect(groups.body[0].userCount).toBe(2);
      const roster = await get(HEAD_ID, at("/nazirs")).expect(200);
      expect(
        roster.body.map((n: { groups: unknown[] }) => n.groups.length)
      ).toEqual([1, 1]);
    });
  });
});
