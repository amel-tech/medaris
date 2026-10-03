import { AuthzService, PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courses,
  enrollments,
} from "../../src/database/schema/course.schema";
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
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-135: the permission engine against a real Postgres and the real guard.
 * One köşk (Nûruosmaniye) hosts two medreses' courses and a course of its own;
 * the people are the roles of role model v2, and what each may do is read off
 * the HTTP answers, not off the engine's internals.
 *
 * "Allowed" is "the guard let the request through": a granted caller sending
 * an empty body is answered 400 by the DTO or 200 by the handler, never 401,
 * 403 or 404, and that is all these specs ask of them.
 */
const ADMIN_ID = "d6000000-0000-4000-8000-000000000001";
const NAZIM_ID = "d6000000-0000-4000-8000-000000000002";
const HEAD_ID = "d6000000-0000-4000-8000-000000000003";
const NAZIR_ID = "d6000000-0000-4000-8000-000000000004";
const OTHER_HEAD_ID = "d6000000-0000-4000-8000-000000000005";
const DERS_ID = "d6000000-0000-4000-8000-000000000006";
const MUDERRIS_ID = "d6000000-0000-4000-8000-000000000007";
const TALEBE_ID = "d6000000-0000-4000-8000-000000000008";
const MEDARIS_ID = "d6000000-0000-4000-8000-000000000009";
const NEWCOMER_ID = "d6000000-0000-4000-8000-00000000000a";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const inSeconds = (n: number) => new Date(Date.now() + n * 1000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("The permission engine (MDRS-135, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let authz: AuthzService;
  let koskId: string;
  let madrasahId: string;
  let otherMadrasahId: string;
  let medreseCourse: string;
  let otherMedreseCourse: string;
  let ownCourse: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const get = (sub: string, path: string) =>
    http().get(path).set("Authorization", auth(sub));
  const patch = (sub: string, path: string, body: object = {}) =>
    http().patch(path).set("Authorization", auth(sub)).send(body);
  const post = (sub: string, path: string, body: object = {}) =>
    http().post(path).set("Authorization", auth(sub)).send(body);
  const put = (sub: string, path: string, body: object = {}) =>
    http().put(path).set("Authorization", auth(sub)).send(body);
  const user = (sub: string) => ({ sub, realm_access: { roles: [] } });

  const grant = (
    userId: string,
    scope: { type: "platform" | "madrasah" | "course"; id: string | null },
    what: { permission: string } | { groupId: string },
    values: Partial<typeof permissionGrants.$inferInsert> = {}
  ) =>
    db()
      .insert(permissionGrants)
      .values({
        userId,
        scopeType: scope.type,
        scopeId: scope.id,
        grantedBy: HEAD_ID,
        permission: null,
        groupId: null,
        ...what,
        ...values,
      });

  const makeGroup = async (name: string, permissions: string[]) => {
    const [group] = await db()
      .insert(permissionGroups)
      .values({
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: madrasahId,
        name,
        createdBy: HEAD_ID,
      })
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
    authz = app.get(AuthzService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "permission_grants",
      "permission_group_items",
      "permission_groups",
      "platform_policies",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await db()
      .insert(users)
      .values(
        [
          ADMIN_ID,
          NAZIM_ID,
          HEAD_ID,
          NAZIR_ID,
          OTHER_HEAD_ID,
          DERS_ID,
          MUDERRIS_ID,
          TALEBE_ID,
          MEDARIS_ID,
          NEWCOMER_ID,
        ].map((id) => ({ id }))
      );
    const [madrasah, other] = await db()
      .insert(madrasahs)
      .values([
        { handle: "suleymaniye", name: "Süleymaniye", createdBy: ADMIN_ID },
        { handle: "fatih", name: "Fatih", createdBy: ADMIN_ID },
      ])
      .returning();
    madrasahId = madrasah.id;
    otherMadrasahId = other.id;
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    const [inMedrese, inOther, own] = await db()
      .insert(courses)
      .values([
        {
          koskId,
          authorId: NAZIM_ID,
          title: "Bina ve İzhar",
          madrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: NAZIM_ID,
          title: "Başka medresenin dersi",
          madrasahId: otherMadrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: NAZIM_ID,
          title: "Köşkün kendi dersi",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    medreseCourse = inMedrese.id;
    otherMedreseCourse = inOther.id;
    ownCourse = own.id;

    await assignRole(db(), {
      userId: NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
      grantedBy: ADMIN_ID,
    });
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
      userId: DERS_ID,
      role: ASSIGNED_ROLES.DERS_NAZIR,
      scopeId: ownCourse,
      grantedBy: NAZIM_ID,
    });
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: ownCourse,
      grantedBy: NAZIM_ID,
    });
    // The page's own list of the course's müderris, which the audit reads to
    // tell the people who teach a course from everyone else who reads it.
    await db()
      .insert(courseMuderris)
      .values({ courseId: ownCourse, userId: MUDERRIS_ID, name: "Müderris" });
    await db().insert(enrollments).values({
      userId: TALEBE_ID,
      courseId: ownCourse,
      status: EnrollmentStatus.ENROLLED,
    });
  });

  describe("a medrese nazırı (AC: no grants, then a group, in that medrese only)", () => {
    const refusedEverything = async (sub: string) => {
      const refused = [
        await get(sub, `/madrasahs/${madrasahId}/students`),
        await get(sub, `/madrasahs/${madrasahId}/settings`),
        await patch(sub, `/madrasahs/${madrasahId}/settings`),
        await post(sub, `/madrasahs/${madrasahId}/courses`),
        await get(sub, `/madrasahs/${madrasahId}/nazirs`),
        await get(sub, `/madrasahs/${madrasahId}/permission-groups`),
        await patch(sub, `/courses/${medreseCourse}`),
        await get(sub, `/courses/${medreseCourse}/enrollments`),
      ];
      expect(refused.map((r) => r.status)).toEqual(refused.map(() => 403));
    };

    it("is refused everything the medrese holds, with no grants", async () => {
      await refusedEverything(NAZIR_ID);
      // What any signed-in caller holds is still theirs: the public page.
      await get(NAZIR_ID, `/madrasahs/${madrasahId}`).expect(200);
    });

    it("after a group grant is allowed exactly the group's permissions, and in that medrese only", async () => {
      const groupId = await makeGroup("Kadro", [
        PERMISSIONS.MADRASAH_STUDENTS_VIEW,
        PERMISSIONS.MADRASAH_SETTINGS_EDIT,
      ]);
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { groupId }
      );

      // The two the group carries.
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(200);
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/settings`).expect(200);
      // Nothing beyond them: opening a course, naming nazırs, a course's work.
      await post(NAZIR_ID, `/madrasahs/${madrasahId}/courses`).expect(403);
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/nazirs`).expect(403);
      await patch(NAZIR_ID, `/courses/${medreseCourse}`).expect(403);
      // And not in another medrese.
      await get(NAZIR_ID, `/madrasahs/${otherMadrasahId}/students`).expect(403);
      await get(NAZIR_ID, `/madrasahs/${otherMadrasahId}/settings`).expect(403);
    });

    it("is told by the account screen exactly what the routes allow: one computation", async () => {
      const groupId = await makeGroup("Kadro", [
        PERMISSIONS.MADRASAH_STUDENTS_VIEW,
        PERMISSIONS.MADRASAH_SETTINGS_EDIT,
      ]);
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { groupId }
      );
      const shown = await get(NAZIR_ID, "/me/permissions").expect(200);
      expect([...shown.body.permissions].sort()).toEqual(
        [
          PERMISSIONS.MADRASAH_STUDENTS_VIEW,
          PERMISSIONS.MADRASAH_SETTINGS_EDIT,
        ].sort()
      );
      // Each line the screen prints opens its route, and the one it does not
      // print stays shut.
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(200);
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/settings`).expect(200);
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/nazirs`).expect(403);
      // A grant that lost its role is on neither side.
      await db()
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: HEAD_ID })
        .where(eq(roleAssignments.userId, NAZIR_ID));
      expect((await get(NAZIR_ID, "/me/permissions").expect(200)).body).toEqual(
        { permissions: [] }
      );
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(403);
    });

    it("holds a group's later change at once, because the group is read at decision time", async () => {
      const groupId = await makeGroup("Kadro", [
        PERMISSIONS.MADRASAH_STUDENTS_VIEW,
      ]);
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { groupId }
      );
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/settings`).expect(403);
      await db()
        .insert(permissionGroupItems)
        .values({ groupId, permission: PERMISSIONS.MADRASAH_SETTINGS_EDIT });
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/settings`).expect(200);
    });

    it("reaches the medrese's own courses with a course permission granted in the medrese, and no other course", async () => {
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { permission: PERMISSIONS.COURSE_EDIT }
      );
      expect(
        (await patch(NAZIR_ID, `/courses/${medreseCourse}`)).status
      ).not.toBe(403);
      await patch(NAZIR_ID, `/courses/${otherMedreseCourse}`).expect(403);
      await patch(NAZIR_ID, `/courses/${ownCourse}`).expect(403);
    });

    it("is refused again after expires_at passes, without a restart (AC)", async () => {
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { permission: PERMISSIONS.MADRASAH_STUDENTS_VIEW },
        { expiresAt: inSeconds(2) }
      );
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(200);
      await sleep(2600);
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(403);
    });

    it("loses a grant with its role: the permission never outlasts the appointment", async () => {
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { permission: PERMISSIONS.MADRASAH_STUDENTS_VIEW }
      );
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(200);
      await db()
        .update(roleAssignments)
        .set({ expiresAt: inSeconds(-1) })
        .where(
          and(
            eq(roleAssignments.userId, NAZIR_ID),
            eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_NAZIR)
          )
        );
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(403);
    });

    it("a revoked grant is gone on the next request", async () => {
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { permission: PERMISSIONS.MADRASAH_STUDENTS_VIEW }
      );
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(200);
      await db()
        .update(permissionGrants)
        .set({ revokedAt: new Date(), revokedBy: HEAD_ID })
        .where(eq(permissionGrants.userId, NAZIR_ID));
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(403);
    });
  });

  describe("role defaults on the routes", () => {
    it("a başmüderris runs their medrese and its courses, and nothing of another medrese", async () => {
      await get(HEAD_ID, `/madrasahs/${madrasahId}/students`).expect(200);
      await get(HEAD_ID, `/madrasahs/${madrasahId}/settings`).expect(200);
      expect(
        (await patch(HEAD_ID, `/courses/${medreseCourse}`)).status
      ).not.toBe(403);
      await get(HEAD_ID, `/madrasahs/${otherMadrasahId}/students`).expect(403);
      await patch(HEAD_ID, `/courses/${otherMedreseCourse}`).expect(403);
      await patch(HEAD_ID, `/courses/${ownCourse}`).expect(403);
    });

    it("a köşk nazımı runs the köşk's own course, but not the medrese's work in a medrese course", async () => {
      expect((await patch(NAZIM_ID, `/courses/${ownCourse}`)).status).not.toBe(
        403
      );
      // Choosing the müderrisler of a medrese course is the medrese's (owner, 1 October).
      await put(NAZIM_ID, `/courses/${medreseCourse}/muderris`, {
        muderris: [],
      }).expect(403);
      // Their own course: the guard lets the köşk nazımı through.
      expect(
        (
          await put(NAZIM_ID, `/courses/${ownCourse}/muderris`, {
            muderris: [],
          })
        ).status
      ).not.toBe(403);
      // And they still hide and read in the medrese's course.
      expect(
        (await post(NAZIM_ID, `/courses/${medreseCourse}/hide`)).status
      ).not.toBe(403);
    });

    it("a köşk nazımı reads a medrese course's content in their köşk, and the read is on the record", async () => {
      const res = await get(NAZIM_ID, `/courses/${medreseCourse}`).expect(200);
      expect(res.body.contentLocked).toBeFalsy();
      const rows = await db()
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "course.content_read"),
            eq(auditLog.entityId, medreseCourse)
          )
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorId: NAZIM_ID });
      expect(rows[0].details).toMatchObject({
        permission: PERMISSIONS.COURSE_VIEW_DETAILS,
        systemAdmin: false,
      });
    });

    it("a müderris stays in their own course", async () => {
      expect(
        (await patch(MUDERRIS_ID, `/courses/${ownCourse}`)).status
      ).not.toBe(403);
      await patch(MUDERRIS_ID, `/courses/${medreseCourse}`).expect(403);
      // No audit row for the people who teach it.
      await get(MUDERRIS_ID, `/courses/${ownCourse}`).expect(200);
      expect(
        await db()
          .select()
          .from(auditLog)
          .where(eq(auditLog.action, "course.content_read"))
      ).toHaveLength(0);
    });
  });

  describe("a ders nazırı cannot grant anything, whatever they hold (AC)", () => {
    it("is refused every route that gives permissions, even holding every grantable course permission", async () => {
      const everything = [
        PERMISSIONS.COURSE_EDIT,
        PERMISSIONS.SESSION_MANAGE,
        PERMISSIONS.ENROLLMENT_DECIDE,
        PERMISSIONS.ENROLLMENT_REMOVE,
        PERMISSIONS.COURSE_NAZIR_ASSIGN,
        PERMISSIONS.BAN_COURSE,
      ];
      for (const permission of everything) {
        await grant(
          DERS_ID,
          { type: SCOPE_TYPES.COURSE, id: ownCourse },
          { permission },
          { grantedBy: NAZIM_ID }
        );
      }
      // What they were given works…
      expect((await patch(DERS_ID, `/courses/${ownCourse}`)).status).not.toBe(
        403
      );
      // …and none of it lets them hand anything on.
      await post(DERS_ID, `/kosks/${koskId}/grants`, {
        userId: NEWCOMER_ID,
        courseId: ownCourse,
        permissions: [PERMISSIONS.COURSE_EDIT],
      }).expect(403);
      await put(
        DERS_ID,
        `/madrasahs/${madrasahId}/nazirs/${NAZIR_ID}/permissions`,
        { permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW] }
      ).expect(403);
      await post(DERS_ID, `/madrasahs/${madrasahId}/permission-groups`, {
        name: "Kadro",
        scope: "MADRASAH",
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
      }).expect(403);
      const effective = await authz.effective(user(DERS_ID), {
        entity: "course",
        id: ownCourse,
      });
      expect(effective?.codes.has(PERMISSIONS.PERMISSION_GRANT)).toBe(false);
    });

    it("a grant that carries the permission to grant is ignored, so it cannot be smuggled in", async () => {
      await grant(
        DERS_ID,
        { type: SCOPE_TYPES.COURSE, id: ownCourse },
        { permission: PERMISSIONS.PERMISSION_GRANT },
        { grantedBy: NAZIM_ID }
      );
      const effective = await authz.effective(user(DERS_ID), {
        entity: "course",
        id: ownCourse,
      });
      expect(effective?.codes.has(PERMISSIONS.PERMISSION_GRANT)).toBe(false);
    });
  });

  describe("platform permissions for a Medaris nazımı", () => {
    beforeEach(async () => {
      // The platform has no scope id, which `assignRole` takes for granted.
      await db().insert(roleAssignments).values({
        userId: MEDARIS_ID,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
    });

    it("holds nothing without a grant, and the permission a grant names with it", async () => {
      await patch(MEDARIS_ID, `/kosks/${koskId}`, { name: "Yeni" }).expect(403);
      await grant(
        MEDARIS_ID,
        { type: SCOPE_TYPES.PLATFORM, id: null },
        { permission: PERMISSIONS.PLATFORM_KOSK_EDIT },
        { grantedBy: ADMIN_ID }
      );
      expect(
        (await patch(MEDARIS_ID, `/kosks/${koskId}`, { name: "Yeni" })).status
      ).not.toBe(403);
    });

    it("may give a medrese nazırı permissions only with the permission to, and within their authority", async () => {
      await put(
        MEDARIS_ID,
        `/madrasahs/${madrasahId}/nazirs/${NAZIR_ID}/permissions`,
        { permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW] }
      ).expect(403);
      await grant(
        MEDARIS_ID,
        { type: SCOPE_TYPES.PLATFORM, id: null },
        { permission: PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT },
        { grantedBy: ADMIN_ID }
      );
      await put(
        MEDARIS_ID,
        `/madrasahs/${madrasahId}/nazirs/${NAZIR_ID}/permissions`,
        { permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW] }
      ).expect(200);
      // The nazır now holds exactly that, and the row says the platform gave it.
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(200);
      const [row] = await db()
        .select()
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.userId, NAZIR_ID),
            isNull(permissionGrants.revokedAt)
          )
        );
      expect(row).toMatchObject({
        permission: PERMISSIONS.MADRASAH_STUDENTS_VIEW,
        grantedBy: MEDARIS_ID,
        authorityScopeType: SCOPE_TYPES.PLATFORM,
      });
    });
  });

  describe("policies and passive scopes against the real database", () => {
    it("a köşk policy closes an ability for the müderris, and a grant from the platform keeps it for one person", async () => {
      const resource = { entity: "course" as const, id: ownCourse };
      const before = await authz.effective(user(MUDERRIS_ID), resource);
      expect(before?.codes.has(PERMISSIONS.SETTING_APPROVAL_OFF)).toBe(true);

      await db()
        .update(kosks)
        .set({ alwaysRequireApproval: true })
        .where(eq(kosks.id, koskId));
      const closed = await authz.effective(user(MUDERRIS_ID), resource);
      expect(closed?.codes.has(PERMISSIONS.SETTING_APPROVAL_OFF)).toBe(false);
      // Only that ability, not the settings it is part of.
      expect(closed?.codes.has(PERMISSIONS.COURSE_SETTINGS)).toBe(true);

      await grant(
        DERS_ID,
        { type: SCOPE_TYPES.COURSE, id: ownCourse },
        { permission: PERMISSIONS.COURSE_SETTINGS },
        { grantedBy: ADMIN_ID, authorityScopeType: SCOPE_TYPES.PLATFORM }
      );
      const widened = await authz.effective(user(DERS_ID), resource);
      expect(widened?.codes.has(PERMISSIONS.SETTING_APPROVAL_OFF)).toBe(true);

      await grant(
        NEWCOMER_ID,
        { type: SCOPE_TYPES.COURSE, id: ownCourse },
        { permission: PERMISSIONS.COURSE_SETTINGS },
        { grantedBy: NAZIM_ID, authorityScopeType: SCOPE_TYPES.KOSK }
      );
      await assignRole(db(), {
        userId: NEWCOMER_ID,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: ownCourse,
        grantedBy: NAZIM_ID,
      });
      const sameLevel = await authz.effective(user(NEWCOMER_ID), resource);
      // The köşk nazımı is not above the köşk's own policy.
      expect(sameLevel?.codes.has(PERMISSIONS.SETTING_APPROVAL_OFF)).toBe(
        false
      );
    });

    it("a course whose last müderris left is passive: its content is closed even to the enrolled", async () => {
      await get(TALEBE_ID, `/courses/${ownCourse}`)
        .expect(200)
        .expect((res) => expect(res.body.contentLocked).toBeFalsy());
      await db()
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: NAZIM_ID })
        .where(
          and(
            eq(roleAssignments.scopeId, ownCourse),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
          )
        );
      await get(TALEBE_ID, `/courses/${ownCourse}`)
        .expect(200)
        .expect((res) => expect(res.body.contentLocked).toBe(true));
    });

    it("a course that never had a müderris is new, not passive", async () => {
      await db()
        .delete(roleAssignments)
        .where(
          and(
            eq(roleAssignments.scopeId, ownCourse),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
          )
        );
      await get(TALEBE_ID, `/courses/${ownCourse}`)
        .expect(200)
        .expect((res) => expect(res.body.contentLocked).toBeFalsy());
    });
  });

  describe("the başnazım", () => {
    it("passes every guard, with no role and no grant", async () => {
      await get(ADMIN_ID, `/madrasahs/${madrasahId}/students`).expect(200);
      expect(
        (await patch(ADMIN_ID, `/courses/${medreseCourse}`)).status
      ).not.toBe(403);
    });
  });
});
