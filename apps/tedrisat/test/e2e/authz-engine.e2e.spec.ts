import { AuthzService, PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import {
  MADRASAH_CATALOG,
  MADRASAH_COURSE_CATALOG,
} from "../../src/assignment/permission-catalog";
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
import {
  madrasahSettings,
  madrasahs,
} from "../../src/database/schema/madrasah.schema";
import {
  permissionGrants,
  permissionGroupItems,
  permissionGroups,
} from "../../src/database/schema/permission.schema";
import { platformPolicies } from "../../src/database/schema/platform-policy.schema";
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

/**
 * "Let through the guard": the handler answered, or the DTO refused an empty
 * body with 400. A 401, 403, 404 or 5xx is none of those, which `not.toBe(403)`
 * let pass (review T7).
 */
const letThrough = (response: { status: number }) =>
  expect([200, 201, 400]).toContain(response.status);

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
      letThrough(await patch(NAZIR_ID, `/courses/${medreseCourse}`));
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
      letThrough(await patch(HEAD_ID, `/courses/${medreseCourse}`));
      await get(HEAD_ID, `/madrasahs/${otherMadrasahId}/students`).expect(403);
      await patch(HEAD_ID, `/courses/${otherMedreseCourse}`).expect(403);
      await patch(HEAD_ID, `/courses/${ownCourse}`).expect(403);
    });

    it("a köşk nazımı runs the köşk's own course, but not the medrese's work in a medrese course", async () => {
      letThrough(await patch(NAZIM_ID, `/courses/${ownCourse}`));
      // Choosing the müderrisler of a medrese course is the medrese's (owner, 1 October).
      await put(NAZIM_ID, `/courses/${medreseCourse}/muderris`, {
        muderris: [],
      }).expect(403);
      // Their own course: the guard lets the köşk nazımı through.
      letThrough(
        await put(NAZIM_ID, `/courses/${ownCourse}/muderris`, {
          muderris: [],
        })
      );
      // And they still hide and read in the medrese's course. The route is
      // `/archive`: the answer is the real one, 200, not a 404 that passes a
      // "not 403" (review T1).
      await post(NAZIM_ID, `/courses/${medreseCourse}/archive`).expect(200);
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
      letThrough(await patch(MUDERRIS_ID, `/courses/${ownCourse}`));
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
      letThrough(await patch(DERS_ID, `/courses/${ownCourse}`));
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
      letThrough(await patch(MEDARIS_ID, `/kosks/${koskId}`, { name: "Yeni" }));
    });

    // The Medaris nazımı's ceiling (MDRS-209). The owner first ticked "Hepsi,
    // her grant denetlenip başnazıma gösterilsin" and then said what he meant:
    // "Benim az önceki kararım 'kendi izinlerinin sınırını aşar' anlamında
    // değil, kendi izinleriyle sınırlı elbette." So a Medaris nazımı holding the
    // permission appoints a nazır and gives permissions ONLY FROM WHAT THEY HOLD
    // THEMSELVES in the medrese (their own default is empty, so the başnazım's
    // grants are all they have), and every grant, group change and appointment
    // is on the record and listed to the başnazım.
    describe("what a Medaris nazımı hands on: only what they hold, on the record, listed to the başnazım (MDRS-209)", () => {
      const allCodes = [
        ...MADRASAH_CATALOG,
        ...MADRASAH_COURSE_CATALOG,
      ] as string[];
      const asPlatform = { type: SCOPE_TYPES.PLATFORM, id: null } as const;
      const del = (sub: string, path: string, body: object = {}) =>
        http().delete(path).set("Authorization", auth(sub)).send(body);
      const permissionsOf = (userId: string) =>
        `/madrasahs/${madrasahId}/nazirs/${userId}/permissions`;
      const groupsPath = () => `/madrasahs/${madrasahId}/permission-groups`;
      const given = async () =>
        (
          await get(
            ADMIN_ID,
            `/nizam/medaris-nazims/${MEDARIS_ID}/given`
          ).expect(200)
        ).body as Array<{
          kind: string;
          id: string;
          role: string | null;
          permission: string | null;
          groupName: string | null;
          groupPermissions: string[] | null;
          groupAction: string | null;
          scopeType: string;
          scopeName: string | null;
          to: { id: string } | null;
        }>;
      const auditRows = (action: string, actorId = MEDARIS_ID) =>
        db()
          .select()
          .from(auditLog)
          .where(
            and(eq(auditLog.action, action), eq(auditLog.actorId, actorId))
          );
      const handedByMedaris = (userId: string) =>
        db()
          .select()
          .from(permissionGrants)
          .where(
            and(
              eq(permissionGrants.userId, userId),
              eq(permissionGrants.grantedBy, MEDARIS_ID),
              isNull(permissionGrants.revokedAt)
            )
          );
      /** The başnazım gives the Medaris nazımı these codes at the medrese: seats them as a nazır there, then gives. */
      const holdAtMedrese = async (codes: string[]) => {
        await post(
          ADMIN_ID,
          `/madrasahs/${madrasahId}/nazirs/${MEDARIS_ID}`
        ).expect(201);
        await put(ADMIN_ID, permissionsOf(MEDARIS_ID), {
          permissions: codes,
        }).expect(200);
      };
      const holdsOf = async () => {
        const mine = await authz.effective(
          user(MEDARIS_ID),
          { entity: "madrasah", id: madrasahId },
          { acrossCourses: true }
        );
        return allCodes.filter((code) => mine?.codes.has(code as never)).sort();
      };
      const refusedFor = (
        res: { status: number; body: { code: string; message: string } },
        codes: string[]
      ) => {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe("GRANT_EXCEEDS_GIVER");
        expect(res.body.message).toBe(
          `You do not hold: ${codes.sort().join(", ")}`
        );
      };

      beforeEach(async () => {
        await grant(
          MEDARIS_ID,
          asPlatform,
          { permission: PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT },
          { grantedBy: ADMIN_ID }
        );
      });

      it("with nothing of their own they appoint a nazır and give nothing: the gift is refused naming the codes, and nothing is written", async () => {
        expect(await holdsOf()).toEqual([]);
        // The editor lets them tick nothing.
        const catalog = await get(
          MEDARIS_ID,
          `/madrasahs/${madrasahId}/permissions`
        ).expect(200);
        expect(catalog.body.givable).toEqual([]);

        // Appointing needs no holdings: audited with the seat and the level, listed.
        await post(
          MEDARIS_ID,
          `/madrasahs/${madrasahId}/nazirs/${NEWCOMER_ID}`
        ).expect(201);
        const [seat] = await db()
          .select()
          .from(roleAssignments)
          .where(
            and(
              eq(roleAssignments.userId, NEWCOMER_ID),
              eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_NAZIR),
              isNull(roleAssignments.revokedAt)
            )
          );
        expect(seat.grantedBy).toBe(MEDARIS_ID);
        const [audit] = await auditRows("madrasah_nazir.appoint");
        expect(audit.details).toMatchObject({
          userId: NEWCOMER_ID,
          role: ASSIGNED_ROLES.MEDRESE_NAZIR,
          roleAssignmentId: seat.id,
          scopeType: SCOPE_TYPES.MADRASAH,
          scopeId: madrasahId,
          authority: SCOPE_TYPES.PLATFORM,
        });
        expect((await given()).filter((item) => item.kind === "ROLE")).toEqual([
          expect.objectContaining({
            id: seat.id,
            role: ASSIGNED_ROLES.MEDRESE_NAZIR,
            to: expect.objectContaining({ id: NEWCOMER_ID }),
          }),
        ]);

        // Giving anything is refused, a medrese code and a course code alike.
        refusedFor(
          await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
            permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
          }),
          [PERMISSIONS.MADRASAH_STUDENTS_VIEW]
        );
        refusedFor(
          await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
            permissions: [PERMISSIONS.COURSE_EDIT, PERMISSIONS.MADRASAH_BAN],
          }),
          [PERMISSIONS.COURSE_EDIT, PERMISSIONS.MADRASAH_BAN]
        );
        refusedFor(
          await post(MEDARIS_ID, groupsPath(), {
            name: "Kayıt işleri",
            scope: "MADRASAH",
            permissions: [PERMISSIONS.MADRASAH_BAN],
          }),
          [PERMISSIONS.MADRASAH_BAN]
        );
        // Giving nothing (saving an empty set) is not a gift.
        await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
          permissions: [],
        }).expect(200);

        expect(await handedByMedaris(NAZIR_ID)).toEqual([]);
        expect(await auditRows("permission.grant")).toEqual([]);
        expect(await auditRows("permission_group.create")).toEqual([]);
        expect((await given()).filter((item) => item.kind !== "ROLE")).toEqual(
          []
        );
      });

      it("after the başnazım gives them X at the medrese, exactly X can be handed on: allowed, audited with the grants, listed", async () => {
        const X = [
          PERMISSIONS.MADRASAH_STUDENTS_VIEW,
          PERMISSIONS.MADRASAH_SETTINGS_EDIT,
          PERMISSIONS.COURSE_EDIT,
        ];
        await holdAtMedrese(X);
        // The premise: they hold X and nothing else of the lists.
        expect(await holdsOf()).toEqual([...X].sort());
        // The editor's list of what they may tick is exactly X.
        const catalog = await get(
          MEDARIS_ID,
          `/madrasahs/${madrasahId}/permissions`
        ).expect(200);
        expect([...catalog.body.givable].sort()).toEqual([...X].sort());

        await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
          permissions: [
            PERMISSIONS.MADRASAH_STUDENTS_VIEW,
            PERMISSIONS.COURSE_EDIT,
          ],
        }).expect(200);
        // The nazır holds those two and not the third X had.
        await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(200);
        letThrough(await patch(NAZIR_ID, `/courses/${medreseCourse}`));
        await get(NAZIR_ID, `/madrasahs/${madrasahId}/settings`).expect(403);

        // (a) the rows say who gave them and at which level; the audit row names them.
        const rows = await handedByMedaris(NAZIR_ID);
        expect(rows.map((r) => r.permission).sort()).toEqual([
          PERMISSIONS.COURSE_EDIT,
          PERMISSIONS.MADRASAH_STUDENTS_VIEW,
        ]);
        for (const row of rows) {
          expect(row.authorityScopeType).toBe(SCOPE_TYPES.PLATFORM);
        }
        const [audit] = await auditRows("permission.grant");
        expect(audit).toMatchObject({
          actorId: MEDARIS_ID,
          entityId: NAZIR_ID,
        });
        const details = audit.details as {
          madrasahId: string;
          authority: string;
          grants: Array<{ id: string; permission: string }>;
        };
        expect(details).toMatchObject({
          madrasahId,
          authority: SCOPE_TYPES.PLATFORM,
        });
        expect(details.grants.map((g) => g.id).sort()).toEqual(
          rows.map((r) => r.id).sort()
        );
        // (b) the başnazım's list has each.
        const listed = (await given()).filter((item) => item.kind === "GRANT");
        expect(listed.map((item) => item.id).sort()).toEqual(
          rows.map((r) => r.id).sort()
        );
        expect(new Set(listed.map((item) => item.to?.id))).toEqual(
          new Set([NAZIR_ID])
        );

        // One code more than X is refused, naming only that code; nothing moves.
        refusedFor(
          await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
            permissions: [
              PERMISSIONS.MADRASAH_STUDENTS_VIEW,
              PERMISSIONS.COURSE_EDIT,
              PERMISSIONS.MADRASAH_BAN,
            ],
          }),
          [PERMISSIONS.MADRASAH_BAN]
        );
        expect(
          (await handedByMedaris(NAZIR_ID)).map((r) => r.id).sort()
        ).toEqual(rows.map((r) => r.id).sort());
        // A course code limited to one course rests on the same holding.
        await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
          permissions: [PERMISSIONS.COURSE_EDIT],
          courseIds: [medreseCourse],
        }).expect(200);
      });

      it("groups too: a group of codes within what they hold, a change that adds only held codes; anything beyond is refused", async () => {
        await holdAtMedrese([
          PERMISSIONS.MADRASAH_STUDENTS_VIEW,
          PERMISSIONS.COURSE_EDIT,
        ]);
        refusedFor(
          await post(MEDARIS_ID, groupsPath(), {
            name: "Fazla",
            scope: "MADRASAH",
            permissions: [
              PERMISSIONS.MADRASAH_STUDENTS_VIEW,
              PERMISSIONS.MADRASAH_BAN,
            ],
          }),
          [PERMISSIONS.MADRASAH_BAN]
        );
        const created = await post(MEDARIS_ID, groupsPath(), {
          name: "Kayıt işleri",
          scope: "MADRASAH",
          permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
        }).expect(201);
        const groupId = created.body.id as string;
        const [createAudit] = await auditRows("permission_group.create");
        expect(createAudit).toMatchObject({ entityId: groupId });
        expect(createAudit.details).toMatchObject({
          scopeType: SCOPE_TYPES.MADRASAH,
          scopeId: madrasahId,
          authority: SCOPE_TYPES.PLATFORM,
          permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
        });
        expect((await given()).filter((item) => item.kind === "GROUP")).toEqual(
          [
            expect.objectContaining({
              id: groupId,
              groupName: "Kayıt işleri",
              groupAction: "create",
              groupPermissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
              scopeName: "Süleymaniye",
              to: null,
            }),
          ]
        );

        // A nazır holds it, so a change reaches them and the record names them.
        await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
          groupId,
          permissions: [],
        }).expect(200);
        refusedFor(
          await patch(MEDARIS_ID, `${groupsPath()}/${groupId}`, {
            permissions: [
              PERMISSIONS.MADRASAH_STUDENTS_VIEW,
              PERMISSIONS.SESSION_MANAGE,
            ],
            usersPolicy: "keep",
          }),
          [PERMISSIONS.SESSION_MANAGE]
        );
        await patch(MEDARIS_ID, `${groupsPath()}/${groupId}`, {
          permissions: [
            PERMISSIONS.MADRASAH_STUDENTS_VIEW,
            PERMISSIONS.COURSE_EDIT,
          ],
          usersPolicy: "keep",
        }).expect(200);
        const [updateAudit] = await auditRows("permission_group.update");
        expect(updateAudit.details).toMatchObject({
          authority: SCOPE_TYPES.PLATFORM,
          scopeType: SCOPE_TYPES.MADRASAH,
          scopeId: madrasahId,
          previousPermissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
          holderIds: [NAZIR_ID],
        });
        expect((await given()).filter((item) => item.kind === "GROUP")).toEqual(
          [expect.objectContaining({ id: groupId, groupAction: "update" })]
        );
        // A group the başmüderris made, with a code they do not hold, cannot
        // be handed to a nazır by them.
        const others = await post(HEAD_ID, groupsPath(), {
          name: "Yasaklar",
          scope: "MADRASAH",
          permissions: [PERMISSIONS.MADRASAH_BAN],
        }).expect(201);
        refusedFor(
          await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
            groupId: others.body.id,
            permissions: [],
          }),
          [PERMISSIONS.MADRASAH_BAN]
        );
        await del(MEDARIS_ID, `${groupsPath()}/${groupId}`, {
          usersPolicy: "keep",
        }).expect(204);
        const [deleteAudit] = await auditRows("permission_group.delete");
        expect(deleteAudit.details).toMatchObject({
          authority: SCOPE_TYPES.PLATFORM,
        });
        expect((await given()).filter((item) => item.kind === "GROUP")).toEqual(
          []
        );
      });

      it("keeps what the nazır already holds from someone else: saving it as it is is no gift, giving it more time is", async () => {
        const end = new Date(Date.now() + 3600_000).toISOString();
        await put(HEAD_ID, permissionsOf(NAZIR_ID), {
          permissions: [PERMISSIONS.MADRASAH_BAN],
          expiresAt: end,
        }).expect(200);
        await holdAtMedrese([PERMISSIONS.MADRASAH_STUDENTS_VIEW]);
        // The başmüderris's grant stays as it is, a held code is added: allowed.
        await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
          permissions: [
            PERMISSIONS.MADRASAH_BAN,
            PERMISSIONS.MADRASAH_STUDENTS_VIEW,
          ],
          expiresAt: end,
        }).expect(200);
        const byHead = await db()
          .select()
          .from(permissionGrants)
          .where(
            and(
              eq(permissionGrants.userId, NAZIR_ID),
              eq(permissionGrants.grantedBy, HEAD_ID),
              isNull(permissionGrants.revokedAt)
            )
          );
        expect(byHead.map((r) => r.permission)).toEqual([
          PERMISSIONS.MADRASAH_BAN,
        ]);
        // Stretching the end of a code they do not hold is handing it on.
        refusedFor(
          await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
            permissions: [
              PERMISSIONS.MADRASAH_BAN,
              PERMISSIONS.MADRASAH_STUDENTS_VIEW,
            ],
            expiresAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
          }),
          [PERMISSIONS.MADRASAH_BAN]
        );
        // Shortening it is not.
        await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
          permissions: [
            PERMISSIONS.MADRASAH_BAN,
            PERMISSIONS.MADRASAH_STUDENTS_VIEW,
          ],
          expiresAt: new Date(Date.now() + 1800_000).toISOString(),
        }).expect(200);
      });

      it("a grant 'for every course' lifts the ceiling by exactly the course codes it carries, and no medrese code", async () => {
        await db().insert(permissionGrants).values({
          userId: MEDARIS_ID,
          scopeType: SCOPE_TYPES.COURSE,
          scopeId: null,
          permission: PERMISSIONS.ENROLLMENT_DECIDE,
          grantedBy: ADMIN_ID,
          authorityScopeType: SCOPE_TYPES.PLATFORM,
        });
        await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
          permissions: [PERMISSIONS.ENROLLMENT_DECIDE],
        }).expect(200);
        refusedFor(
          await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
            permissions: [
              PERMISSIONS.ENROLLMENT_DECIDE,
              PERMISSIONS.SESSION_MANAGE,
            ],
          }),
          [PERMISSIONS.SESSION_MANAGE]
        );
        // A medrese code is not a course code: the grant does not lift it.
        refusedFor(
          await put(MEDARIS_ID, permissionsOf(NAZIR_ID), {
            permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
          }),
          [PERMISSIONS.MADRASAH_STUDENTS_VIEW]
        );
      });

      it("keeps the other callers' limits: the codes are the lists', the medrese is theirs, a grantee cannot hand on, nobody names themselves", async () => {
        // A code outside the medrese and course lists is refused to the
        // Medaris nazımı and to the başmüderris alike, before any ceiling.
        for (const sub of [MEDARIS_ID, HEAD_ID]) {
          const res = await put(sub, permissionsOf(NAZIR_ID), {
            permissions: [PERMISSIONS.PLATFORM_AUDIT_READ],
          }).expect(400);
          expect(res.body.code).toBe("PERMISSION_UNKNOWN");
        }
        // The başmüderris holds every medrese and course code by role default,
        // so their ceiling asks nothing: all of it, at the medrese's level.
        await put(HEAD_ID, permissionsOf(NAZIR_ID), {
          permissions: allCodes,
        }).expect(200);
        const [byHead] = await auditRows("permission.grant", HEAD_ID);
        expect(byHead.details).toMatchObject({
          authority: SCOPE_TYPES.MADRASAH,
        });
        // The başnazım is not asked either.
        await put(ADMIN_ID, permissionsOf(NAZIR_ID), {
          permissions: allCodes,
        }).expect(200);
        // Another medrese's başmüderris is not one here.
        await put(OTHER_HEAD_ID, permissionsOf(NAZIR_ID), {
          permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
        }).expect(403);
        // Nobody names themselves.
        await post(
          MEDARIS_ID,
          `/madrasahs/${madrasahId}/nazirs/${MEDARIS_ID}`
        ).expect(403);
        // And the başnazım's list shows nothing of what the başmüderris did.
        expect((await given()).filter((item) => item.kind === "GRANT")).toEqual(
          []
        );
      });

      it("seats a köşk nazımı through the admin route: audited, and listed as a role", async () => {
        await grant(
          MEDARIS_ID,
          asPlatform,
          { permission: PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE },
          { grantedBy: ADMIN_ID }
        );
        await post(MEDARIS_ID, `/kosks/${koskId}/nazims`, {
          userIds: [NEWCOMER_ID],
        }).expect(201);
        const [audit] = await auditRows("kosk.nazim.add");
        expect(audit).toMatchObject({ entityId: koskId });
        expect(audit.details).toMatchObject({ userId: NEWCOMER_ID });
        expect((await given()).filter((item) => item.kind === "ROLE")).toEqual([
          expect.objectContaining({
            role: ASSIGNED_ROLES.KOSK_NAZIM,
            scopeType: SCOPE_TYPES.KOSK,
            to: expect.objectContaining({ id: NEWCOMER_ID }),
          }),
        ]);
      });
    });

    it("may give a medrese nazırı permissions only with the permission to, and then only from what they hold", async () => {
      const path = `/madrasahs/${madrasahId}/nazirs/${NAZIR_ID}/permissions`;
      // No permission to give: refused at the guard.
      await put(MEDARIS_ID, path, {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
      }).expect(403);
      await grant(
        MEDARIS_ID,
        { type: SCOPE_TYPES.PLATFORM, id: null },
        { permission: PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT },
        { grantedBy: ADMIN_ID }
      );
      // The permission to give, and nothing of their own to give from.
      const empty = await put(MEDARIS_ID, path, {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
      }).expect(403);
      expect(empty.body.code).toBe("GRANT_EXCEEDS_GIVER");
      // The başnazım gives them that code at the medrese (seating them there as
      // a nazır): now it, and only it, can be handed on.
      await post(
        ADMIN_ID,
        `/madrasahs/${madrasahId}/nazirs/${MEDARIS_ID}`
      ).expect(201);
      await put(
        ADMIN_ID,
        `/madrasahs/${madrasahId}/nazirs/${MEDARIS_ID}/permissions`,
        { permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW] }
      ).expect(200);
      await put(MEDARIS_ID, path, {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
      }).expect(200);
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

  describe("naming yourself into more than you hold (review B1, M4)", () => {
    const platform = { type: SCOPE_TYPES.PLATFORM, id: null } as const;
    const selfGrantAudits = () =>
      db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "permission.self_grant_refused"))
        .orderBy(auditLog.seq);

    beforeEach(async () => {
      await db().insert(roleAssignments).values({
        userId: MEDARIS_ID,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
    });

    it("a Medaris nazımı with the permission cannot make themselves a medrese nazır, nor give themselves permissions", async () => {
      await grant(
        MEDARIS_ID,
        platform,
        { permission: PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT },
        { grantedBy: ADMIN_ID }
      );

      const appoint = await post(
        MEDARIS_ID,
        `/madrasahs/${madrasahId}/nazirs/${MEDARIS_ID}`
      ).expect(403);
      expect(appoint.body.code).toBe("SELF_GRANT_REFUSED");
      // Someone else seated them as a nazır (the başmüderris, say): giving
      // themselves permissions is still refused.
      await assignRole(db(), {
        userId: MEDARIS_ID,
        role: ASSIGNED_ROLES.MEDRESE_NAZIR,
        scopeId: madrasahId,
        grantedBy: HEAD_ID,
      });
      const give = await put(
        MEDARIS_ID,
        `/madrasahs/${madrasahId}/nazirs/${MEDARIS_ID}/permissions`,
        { permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW] }
      ).expect(403);
      expect(give.body.code).toBe("SELF_GRANT_REFUSED");

      // Nothing was written, and both attempts are on the record.
      // The only nazır row is the one the başmüderris wrote, not the caller.
      expect(
        (
          await db()
            .select()
            .from(roleAssignments)
            .where(
              and(
                eq(roleAssignments.userId, MEDARIS_ID),
                eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_NAZIR)
              )
            )
        ).map((row) => row.grantedBy)
      ).toEqual([HEAD_ID]);
      expect(
        await db()
          .select()
          .from(permissionGrants)
          .where(
            and(
              eq(permissionGrants.userId, MEDARIS_ID),
              eq(permissionGrants.scopeType, SCOPE_TYPES.MADRASAH)
            )
          )
      ).toHaveLength(0);
      const audits = await selfGrantAudits();
      expect(audits.map((row) => row.actorId)).toEqual([
        MEDARIS_ID,
        MEDARIS_ID,
      ]);
      expect(audits.map((row) => row.details)).toMatchObject([
        { route: "madrasah.nazir.appoint" },
        { route: "madrasah.nazir.permissions" },
      ]);
    });

    it("the same Medaris nazımı appoints someone else, so the refusal is about the person named", async () => {
      await grant(
        MEDARIS_ID,
        platform,
        { permission: PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT },
        { grantedBy: ADMIN_ID }
      );
      await post(
        MEDARIS_ID,
        `/madrasahs/${madrasahId}/nazirs/${NEWCOMER_ID}`
      ).expect(201);
      expect(await selfGrantAudits()).toHaveLength(0);
    });

    it("a Medaris nazımı cannot seat themselves köşk nazımı or başmüderris, and can name another", async () => {
      await grant(
        MEDARIS_ID,
        platform,
        { permission: PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE },
        { grantedBy: ADMIN_ID }
      );
      await grant(
        MEDARIS_ID,
        platform,
        { permission: PERMISSIONS.PLATFORM_HEAD_MUDERRIS_MANAGE },
        { grantedBy: ADMIN_ID }
      );
      const kosk = await post(MEDARIS_ID, `/kosks/${koskId}/nazims`, {
        userIds: [MEDARIS_ID],
      }).expect(403);
      expect(kosk.body.code).toBe("SELF_GRANT_REFUSED");
      const head = await put(
        MEDARIS_ID,
        `/madrasahs/${madrasahId}/head-muderris`,
        { userId: MEDARIS_ID }
      ).expect(403);
      expect(head.body.code).toBe("SELF_GRANT_REFUSED");
      await post(MEDARIS_ID, `/kosks/${koskId}/nazims`, {
        userIds: [NEWCOMER_ID],
      }).expect(201);
      expect(await selfGrantAudits()).toHaveLength(2);
    });

    it("a köşk nazımı cannot seat themselves as ders nazırı", async () => {
      const res = await post(NAZIM_ID, `/kosks/${koskId}/grants`, {
        userId: NAZIM_ID,
        courseId: ownCourse,
        permissions: [PERMISSIONS.COURSE_EDIT],
      }).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
    });

    it("a nazır given only 'open a course' cannot name themselves müderris, a başmüderris can name themselves", async () => {
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { permission: PERMISSIONS.MADRASAH_COURSE_OPEN }
      );
      const open = await post(NAZIR_ID, `/madrasahs/${madrasahId}/courses`, {
        koskId,
        title: "Kendi dersim",
        muderrisUserIds: [NAZIR_ID],
      }).expect(403);
      expect(open.body.code).toBe("SELF_GRANT_REFUSED");

      // The başmüderris holds every course permission in the medrese already.
      await put(
        HEAD_ID,
        `/madrasahs/${madrasahId}/courses/${medreseCourse}/muderrises`,
        { muderrisUserIds: [HEAD_ID] }
      ).expect(200);
    });

    it("a nazır holding 'appoint nazırs' by a grant cannot hand permissions on", async () => {
      await assignRole(db(), {
        userId: NEWCOMER_ID,
        role: ASSIGNED_ROLES.MEDRESE_NAZIR,
        scopeId: madrasahId,
        grantedBy: HEAD_ID,
      });
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { permission: PERMISSIONS.MADRASAH_NAZIR_APPOINT }
      );
      const res = await put(
        NAZIR_ID,
        `/madrasahs/${madrasahId}/nazirs/${NEWCOMER_ID}/permissions`,
        { permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW] }
      ).expect(403);
      expect(res.body.code).toBe("PERMISSION_NOT_GIVABLE");
      expect(
        await db()
          .select()
          .from(permissionGrants)
          .where(eq(permissionGrants.userId, NEWCOMER_ID))
      ).toHaveLength(0);
    });
  });

  describe("an id spelled in upper case (review H1)", () => {
    const upper = (id: string) => id.toUpperCase();
    const passivate = () =>
      db()
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: NAZIM_ID })
        .where(
          and(
            eq(roleAssignments.scopeId, ownCourse),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
          )
        );

    it("the course's müderris keeps their access (main answered it from the database, the engine lost it)", async () => {
      await get(MUDERRIS_ID, `/courses/${ownCourse}/enrollments`).expect(200);
      await get(MUDERRIS_ID, `/courses/${upper(ownCourse)}/enrollments`).expect(
        200
      );
    });

    it("a başmüderris keeps their medrese and a köşk nazımı their köşk", async () => {
      await get(HEAD_ID, `/madrasahs/${upper(madrasahId)}/students`).expect(
        200
      );
      await patch(NAZIM_ID, `/kosks/${upper(koskId)}`, {
        name: "Yeni ad",
      }).expect(200);
    });

    it("a passive course stays closed to its köşk nazımı and its enrolled talebe whatever the case of its id", async () => {
      await passivate();
      for (const id of [ownCourse, upper(ownCourse)]) {
        await get(NAZIM_ID, `/courses/${id}/enrollments`).expect(403);
        await put(TALEBE_ID, `/courses/${id}/progress`, {}).expect(403);
      }
    });
  });

  describe("review fixes M1, M3, M6, M7, L1, L2, L3, L11", () => {
    const platform = { type: SCOPE_TYPES.PLATFORM, id: null } as const;
    const del = (sub: string, path: string) =>
      http().delete(path).set("Authorization", auth(sub));
    const auditRows = (action: string) =>
      db().select().from(auditLog).where(eq(auditLog.action, action));
    const medarisNazim = () =>
      db().insert(roleAssignments).values({
        userId: MEDARIS_ID,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });

    it("M1: a ders nazırı holding only an unrelated grant does not read the roster; enrollment work opens it", async () => {
      await grant(
        DERS_ID,
        { type: SCOPE_TYPES.COURSE, id: ownCourse },
        { permission: PERMISSIONS.WEEK_HIDE },
        { grantedBy: NAZIM_ID }
      );
      await get(DERS_ID, `/courses/${ownCourse}/enrollments`).expect(403);
      await grant(
        DERS_ID,
        { type: SCOPE_TYPES.COURSE, id: ownCourse },
        { permission: PERMISSIONS.ENROLLMENT_DECIDE },
        { grantedBy: NAZIM_ID }
      );
      await get(DERS_ID, `/courses/${ownCourse}/enrollments`).expect(200);
    });

    it("M3: a nazır given 'change the medrese settings' cannot hide the medrese, its başmüderris can", async () => {
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { permission: PERMISSIONS.MADRASAH_SETTINGS_EDIT }
      );
      await post(NAZIR_ID, `/madrasahs/${madrasahId}/hide`).expect(403);
      await post(HEAD_ID, `/madrasahs/${madrasahId}/hide`).expect(200);
    });

    it("M6: a köşk nazımı listing the recordings is on the record, the müderris and the talebe are not", async () => {
      await get(NAZIM_ID, `/courses/${ownCourse}/recordings`).expect(200);
      await get(MUDERRIS_ID, `/courses/${ownCourse}/recordings`).expect(200);
      await get(TALEBE_ID, `/courses/${ownCourse}/recordings`).expect(200);
      const rows = await auditRows("course.content_read");
      expect(rows.map((row) => row.actorId)).toEqual([NAZIM_ID]);
      expect(rows[0].details).toMatchObject({ via: "recordings" });
    });

    it("M7: a Medaris nazımı with 'manage köşk nazımları' adds and removes a nazım through the köşk's own routes, and not themselves", async () => {
      await medarisNazim();
      await grant(
        MEDARIS_ID,
        platform,
        { permission: PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE },
        { grantedBy: ADMIN_ID }
      );
      const self = await post(
        MEDARIS_ID,
        `/kosks/${koskId}/managers/${MEDARIS_ID}`
      ).expect(403);
      expect(self.body.code).toBe("SELF_GRANT_REFUSED");
      await post(MEDARIS_ID, `/kosks/${koskId}/managers/${NEWCOMER_ID}`).expect(
        201
      );
      await del(MEDARIS_ID, `/kosks/${koskId}/managers/${NEWCOMER_ID}`).expect(
        200
      );
      // Both are on the record, at the platform's level (MDRS-209): this route
      // wrote no audit row before.
      const rows = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.actorId, MEDARIS_ID))
        .orderBy(auditLog.seq);
      expect(
        rows
          .filter((row) => row.action.startsWith("kosk.nazim."))
          .map((row) => [row.action, row.entityId, row.details])
      ).toEqual([
        [
          "kosk.nazim.add",
          koskId,
          expect.objectContaining({
            userId: NEWCOMER_ID,
            authority: SCOPE_TYPES.PLATFORM,
          }),
        ],
        [
          "kosk.nazim.remove",
          koskId,
          expect.objectContaining({
            userId: NEWCOMER_ID,
            authority: SCOPE_TYPES.PLATFORM,
          }),
        ],
      ]);
    });

    it("L1: one page view of a passive course by platform management writes one passive-open row, not two", async () => {
      await medarisNazim();
      await grant(
        MEDARIS_ID,
        platform,
        { permission: PERMISSIONS.PLATFORM_INACTIVE_SCOPES_MANAGE },
        { grantedBy: ADMIN_ID }
      );
      await db()
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: NAZIM_ID })
        .where(
          and(
            eq(roleAssignments.scopeId, ownCourse),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
          )
        );
      await get(MEDARIS_ID, `/courses/${ownCourse}`).expect(200);
      expect(await auditRows("scope.passive_open")).toHaveLength(1);
    });

    it("L2: the başnazım reads another person's private deck, header included, on the record; writes stay refused", async () => {
      const deck = await post(TALEBE_ID, "/flashcard/decks", {
        title: "Özel deste",
        isPublic: false,
      }).expect(201);
      await get(ADMIN_ID, `/flashcard/decks/${deck.body.id}`).expect(200);
      const rows = await auditRows("deck.admin_read");
      expect(rows.map((row) => row.actorId)).toEqual([ADMIN_ID]);
      await patch(ADMIN_ID, `/flashcard/decks/${deck.body.id}`, {
        title: "Başka ad",
      }).expect(403);
      // Someone else still cannot read it.
      expect(
        (await get(NEWCOMER_ID, `/flashcard/decks/${deck.body.id}`)).status
      ).toBeGreaterThanOrEqual(403);
    });

    it("L3: a köşk nazımı who enrolled in the course is still on the record when they read it; the talebe is not", async () => {
      await db().insert(enrollments).values({
        userId: NAZIM_ID,
        courseId: ownCourse,
        status: EnrollmentStatus.ENROLLED,
      });
      await get(NAZIM_ID, `/courses/${ownCourse}`).expect(200);
      await get(TALEBE_ID, `/courses/${ownCourse}`).expect(200);
      expect(
        (await auditRows("course.content_read")).map((row) => row.actorId)
      ).toEqual([NAZIM_ID]);
    });

    it("L11: a hosting right given by a Medaris nazımı says so, the köşk nazımı's says KOSK_NAZIM", async () => {
      await medarisNazim();
      await grant(
        MEDARIS_ID,
        platform,
        { permission: PERMISSIONS.PLATFORM_HOSTING_GRANT },
        { grantedBy: ADMIN_ID }
      );
      const byMedaris = await post(
        MEDARIS_ID,
        `/kosks/${koskId}/hosting-rights`,
        { madrasahId }
      ).expect(201);
      expect(byMedaris.body.grantedBy.role).toBe("MEDARIS_NAZIM");
      const [hostingAudit] = await db()
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "hosting_right.grant"),
            eq(auditLog.actorId, MEDARIS_ID)
          )
        );
      expect(hostingAudit).toMatchObject({ entityId: koskId });
      expect(hostingAudit.details).toMatchObject({
        madrasahId,
        grantedByRole: "MEDARIS_NAZIM",
      });
      const byNazim = await post(NAZIM_ID, `/kosks/${koskId}/hosting-rights`, {
        madrasahId: otherMadrasahId,
      }).expect(201);
      expect(byNazim.body.grantedBy.role).toBe("KOSK_NAZIM");
    });
  });

  describe("what the loader reads from the database (review T4, T5, T10)", () => {
    const passivate = () =>
      db()
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: NAZIM_ID })
        .where(
          and(
            eq(roleAssignments.scopeId, ownCourse),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
          )
        );

    it("a deleted group stops carrying its permissions", async () => {
      const groupId = await makeGroup("Kadro", [
        PERMISSIONS.MADRASAH_STUDENTS_VIEW,
      ]);
      await grant(
        NAZIR_ID,
        { type: SCOPE_TYPES.MADRASAH, id: madrasahId },
        { groupId }
      );
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(200);
      await db()
        .update(permissionGroups)
        .set({ deletedAt: new Date() })
        .where(eq(permissionGroups.id, groupId));
      await get(NAZIR_ID, `/madrasahs/${madrasahId}/students`).expect(403);
    });

    it("an 'every course' grant counts in the courses where its holder has a role, and nowhere else", async () => {
      await grant(
        DERS_ID,
        { type: SCOPE_TYPES.COURSE, id: null },
        { permission: PERMISSIONS.COURSE_EDIT },
        { grantedBy: NAZIM_ID }
      );
      letThrough(await patch(DERS_ID, `/courses/${ownCourse}`));
      // No role of theirs is on that course's chain.
      await patch(DERS_ID, `/courses/${medreseCourse}`).expect(403);
      // And someone with no role at all holds nothing from it.
      await grant(
        NEWCOMER_ID,
        { type: SCOPE_TYPES.COURSE, id: null },
        { permission: PERMISSIONS.COURSE_EDIT },
        { grantedBy: NAZIM_ID }
      );
      await patch(NEWCOMER_ID, `/courses/${ownCourse}`).expect(403);
    });

    it("a platform policy that is on closes the ability for everyone below, and off leaves it", async () => {
      const resource = { entity: "course" as const, id: ownCourse };
      const open = async () =>
        (await authz.effective(user(MUDERRIS_ID), resource))?.codes.has(
          PERMISSIONS.SETTING_APPROVAL_OFF
        );
      expect(await open()).toBe(true);
      await db()
        .insert(platformPolicies)
        .values({ key: "ALWAYS_REQUIRE_APPROVAL", enabled: true });
      expect(await open()).toBe(false);
      await db()
        .update(platformPolicies)
        .set({ enabled: false })
        .where(eq(platformPolicies.key, "ALWAYS_REQUIRE_APPROVAL"));
      expect(await open()).toBe(true);
    });

    it("the başnazım opening a passive course's content is on the record", async () => {
      await passivate();
      await get(ADMIN_ID, `/courses/${ownCourse}/enrollments`).expect(200);
      const rows = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "scope.passive_open"));
      expect(rows.map((row) => row.actorId)).toEqual([ADMIN_ID]);
    });

    it("a Medaris nazımı without the grant cannot open a köşk", async () => {
      await db().insert(roleAssignments).values({
        userId: MEDARIS_ID,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
      await post(MEDARIS_ID, "/kosks", { name: "Yeni Köşk" }).expect(403);
    });

    it("a köşk nazımı holds nothing in a sibling köşk or in its courses", async () => {
      const [other] = await db()
        .insert(kosks)
        .values({ ownerId: OTHER_HEAD_ID, name: "İkinci Köşk" })
        .returning();
      const [otherCourse] = await db()
        .insert(courses)
        .values({
          koskId: other.id,
          authorId: OTHER_HEAD_ID,
          title: "Öteki köşkün dersi",
          status: CourseStatus.PUBLISHED,
        })
        .returning();
      await patch(NAZIM_ID, `/kosks/${other.id}`, {
        name: "Ele geçirildi",
      }).expect(403);
      await patch(NAZIM_ID, `/courses/${otherCourse.id}`).expect(403);
      await get(NAZIM_ID, `/courses/${otherCourse.id}/enrollments`).expect(403);
      letThrough(await patch(NAZIM_ID, `/courses/${ownCourse}`));
    });
  });

  describe("the abilities the engine knows are asked on a course save (review H3)", () => {
    const atOwnCourse = () => ({ type: SCOPE_TYPES.COURSE, id: ownCourse });

    it("publishing needs course.publish and the settings need course.settings, not just course.edit", async () => {
      await grant(
        DERS_ID,
        atOwnCourse(),
        { permission: PERMISSIONS.COURSE_EDIT },
        { grantedBy: NAZIM_ID }
      );
      letThrough(
        await patch(DERS_ID, `/courses/${ownCourse}`, { title: "Yeni ad" })
      );
      await patch(DERS_ID, `/courses/${ownCourse}`, { status: "DRAFT" }).expect(
        403
      );
      await patch(DERS_ID, `/courses/${ownCourse}`, {
        requiresApproval: true,
      }).expect(403);

      await grant(
        DERS_ID,
        atOwnCourse(),
        { permission: PERMISSIONS.COURSE_PUBLISH },
        { grantedBy: NAZIM_ID }
      );
      await patch(DERS_ID, `/courses/${ownCourse}`, { status: "DRAFT" }).expect(
        200
      );
      await grant(
        DERS_ID,
        atOwnCourse(),
        { permission: PERMISSIONS.COURSE_SETTINGS },
        { grantedBy: NAZIM_ID }
      );
      await patch(DERS_ID, `/courses/${ownCourse}`, {
        requiresApproval: true,
      }).expect(200);
    });

    it("a grant of course.view_unpublished shows a draft to its holder and to no one else", async () => {
      await db()
        .update(courses)
        .set({ status: CourseStatus.DRAFT })
        .where(eq(courses.id, ownCourse));
      await get(TALEBE_ID, `/courses/${ownCourse}`).expect(404);
      await get(DERS_ID, `/courses/${ownCourse}`).expect(404);
      await grant(
        DERS_ID,
        atOwnCourse(),
        { permission: PERMISSIONS.COURSE_VIEW_UNPUBLISHED },
        { grantedBy: NAZIM_ID }
      );
      await get(DERS_ID, `/courses/${ownCourse}`).expect(200);
      await get(TALEBE_ID, `/courses/${ownCourse}`).expect(404);
    });

    it("the medrese's 'closed course required' holds on an update, and a grant from the platform widens one person", async () => {
      await db().insert(madrasahSettings).values({
        madrasahId,
        policyClosedCourseRequired: true,
        updatedBy: HEAD_ID,
      });
      await db()
        .update(courses)
        .set({ isClosed: true })
        .where(eq(courses.id, medreseCourse));
      await assignRole(db(), {
        userId: NEWCOMER_ID,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: medreseCourse,
        grantedBy: HEAD_ID,
      });
      const atMedreseCourse = { type: SCOPE_TYPES.COURSE, id: medreseCourse };
      // Made at its own level: the policy above it still closes the ability.
      for (const permission of [
        PERMISSIONS.COURSE_EDIT,
        PERMISSIONS.COURSE_SETTINGS,
      ]) {
        await grant(
          NEWCOMER_ID,
          atMedreseCourse,
          { permission },
          { grantedBy: HEAD_ID }
        );
      }
      const refused = await patch(NEWCOMER_ID, `/courses/${medreseCourse}`, {
        isClosed: false,
      }).expect(409);
      expect(refused.body.code).toBe("PLATFORM_POLICY_LOCKED");
      // The same grant made by an authority above the medrese opens it.
      await db()
        .update(permissionGrants)
        .set({ authorityScopeType: SCOPE_TYPES.PLATFORM })
        .where(eq(permissionGrants.userId, NEWCOMER_ID));
      await patch(NEWCOMER_ID, `/courses/${medreseCourse}`, {
        isClosed: false,
      }).expect(200);
      // Nobody else is widened: the başmüderris still cannot open it again.
      await patch(HEAD_ID, `/courses/${medreseCourse}`, {
        isClosed: true,
      }).expect(200);
      await patch(HEAD_ID, `/courses/${medreseCourse}`, {
        isClosed: false,
      }).expect(409);
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
      letThrough(await patch(ADMIN_ID, `/courses/${medreseCourse}`));
    });
  });
});
