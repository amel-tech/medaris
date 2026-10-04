import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { UsersPolicyRequiredError } from "../../src/assignment/admin/errors";
import { PermissionAdminRepository } from "../../src/assignment/admin/permission-admin.repository";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
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
 * MDRS-135 review of PR #177, cluster B: what is given stays under its giver's
 * own holding (d-1004-27), a permission does not outlast the seat it hangs on
 * (d-1004 "A permission cannot outlast its role"), a nazır dismisses only the
 * nazırs they appointed (d-1004-28), every hand-on is decided and recorded,
 * and a group changed while it is being given is checked as it ends up.
 * Against a real Postgres and the real guard.
 */
const ADMIN = "d7000000-0000-4000-8000-000000000001";
const HEAD = "d7000000-0000-4000-8000-000000000002";
const HEAD2 = "d7000000-0000-4000-8000-000000000003";
const NAZIR_A = "d7000000-0000-4000-8000-000000000004";
const NAZIR_B = "d7000000-0000-4000-8000-000000000005";
const NAZIR_C = "d7000000-0000-4000-8000-000000000006";
const MEDARIS = "d7000000-0000-4000-8000-000000000007";
const PERSON = "d7000000-0000-4000-8000-000000000008";
const NAZIM = "d7000000-0000-4000-8000-000000000009";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 3600_000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Grant ceilings and seat cascades (MDRS-135 review, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let courseId: string;
  let koskId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const get = (sub: string, path: string) =>
    http().get(path).set("Authorization", auth(sub));
  const post = (sub: string, path: string, body: object = {}) =>
    http().post(path).set("Authorization", auth(sub)).send(body);
  const put = (sub: string, path: string, body: object = {}) =>
    http().put(path).set("Authorization", auth(sub)).send(body);
  const patch = (sub: string, path: string, body: object = {}) =>
    http().patch(path).set("Authorization", auth(sub)).send(body);
  const del = (sub: string, path: string, body: object = {}) =>
    http().delete(path).set("Authorization", auth(sub)).send(body);

  const nazirs = () => `/madrasahs/${madrasahId}/nazirs`;
  const permissionsOf = (userId: string) => `${nazirs()}/${userId}/permissions`;
  const students = () => `/madrasahs/${madrasahId}/students`;

  const grant = (
    userId: string,
    grantedBy: string,
    what: { permission: string } | { groupId: string },
    values: Partial<typeof permissionGrants.$inferInsert> = {}
  ) =>
    db()
      .insert(permissionGrants)
      .values({
        userId,
        scopeType: SCOPE_TYPES.MADRASAH,
        scopeId: madrasahId,
        grantedBy,
        permission: null,
        groupId: null,
        ...what,
        ...values,
      })
      .returning()
      .then(([row]) => row);
  const seat = (userId: string, grantedBy: string) =>
    assignRole(db(), {
      userId,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy,
    });
  /** A Medaris nazımı who may appoint nazırs and give permissions in any medrese. */
  const medarisNazim = async (userId: string) => {
    await db().insert(roleAssignments).values({
      userId,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN,
    });
    await db().insert(permissionGrants).values({
      userId,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      permission: PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
      grantedBy: ADMIN,
      authorityScopeType: SCOPE_TYPES.PLATFORM,
    });
  };
  const liveGrants = (userId: string) =>
    db()
      .select()
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.userId, userId),
          isNull(permissionGrants.revokedAt)
        )
      );
  const audits = (action: string, actorId?: string) =>
    db()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, action),
          actorId ? eq(auditLog.actorId, actorId) : undefined
        )
      );
  const seatOf = async (userId: string) =>
    (
      await db()
        .select()
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, userId),
            eq(roleAssignments.role, ASSIGNED_ROLES.MEDRESE_NAZIR),
            eq(roleAssignments.scopeId, madrasahId),
            isNull(roleAssignments.revokedAt)
          )
        )
    )[0];

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
      "madrasah_settings",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );

  afterAll(async () => {
    await clean();
    await app.close();
  });

  beforeEach(async () => {
    await clean();
    await db()
      .insert(users)
      .values(
        [
          ADMIN,
          HEAD,
          HEAD2,
          NAZIR_A,
          NAZIR_B,
          NAZIR_C,
          MEDARIS,
          PERSON,
          NAZIM,
        ].map((id) => ({ id }))
      );
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({ handle: "suleymaniye", name: "Süleymaniye", createdBy: ADMIN })
      .returning();
    madrasahId = madrasah.id;
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM, name: "Nûruosmaniye Köşkü" })
      .returning();
    const [course] = await db()
      .insert(courses)
      .values({
        koskId: kosk.id,
        authorId: NAZIM,
        title: "Bina ve İzhar",
        madrasahId,
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseId = course.id;
    koskId = kosk.id;
    await assignRole(db(), {
      userId: HEAD,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN,
    });
  });

  describe("a gift carries no authority the giver's own holding lacks (d-1004-27)", () => {
    const closeTheCourse = async () => {
      await db().insert(madrasahSettings).values({
        madrasahId,
        policyClosedCourseRequired: true,
        updatedBy: HEAD,
      });
      await db()
        .update(courses)
        .set({ isClosed: true })
        .where(eq(courses.id, courseId));
    };
    const twoCodes = [PERMISSIONS.COURSE_EDIT, PERMISSIONS.COURSE_SETTINGS];

    it("what a Medaris nazımı holds from the başmüderris passes on at the medrese's level, so the medrese's policy still binds the receiver", async () => {
      await closeTheCourse();
      await medarisNazim(MEDARIS);
      await post(HEAD, `${nazirs()}/${MEDARIS}`).expect(201);
      await put(HEAD, permissionsOf(MEDARIS), {
        permissions: twoCodes,
      }).expect(200);
      // The premise: the giver cannot open the closed course themselves.
      const own = await patch(MEDARIS, `/courses/${courseId}`, {
        isClosed: false,
      }).expect(409);
      expect(own.body.code).toBe("PLATFORM_POLICY_LOCKED");

      await seat(NAZIR_A, HEAD);
      await put(MEDARIS, permissionsOf(NAZIR_A), {
        permissions: twoCodes,
      }).expect(200);
      const rows = await liveGrants(NAZIR_A);
      expect(rows.map((r) => r.permission).sort()).toEqual(
        [...twoCodes].sort()
      );
      for (const row of rows) {
        expect(row).toMatchObject({
          grantedBy: MEDARIS,
          authorityScopeType: SCOPE_TYPES.MADRASAH,
        });
      }
      // So the receiver cannot either.
      const refused = await patch(NAZIR_A, `/courses/${courseId}`, {
        isClosed: false,
      }).expect(409);
      expect(refused.body.code).toBe("PLATFORM_POLICY_LOCKED");

      // The record keeps the level the giver acted at and the one each row got.
      const [audit] = await audits("permission.grant", MEDARIS);
      const details = audit.details as {
        authority: string;
        grants: Array<{ id: string; authority: string }>;
      };
      expect(details.authority).toBe(SCOPE_TYPES.PLATFORM);
      expect(details.grants.map((g) => g.authority)).toEqual([
        SCOPE_TYPES.MADRASAH,
        SCOPE_TYPES.MADRASAH,
      ]);
    });

    it("what the başnazım gave them passes on with the platform's authority, and opens the course for the receiver", async () => {
      await closeTheCourse();
      await medarisNazim(MEDARIS);
      await post(ADMIN, `${nazirs()}/${MEDARIS}`).expect(201);
      await put(ADMIN, permissionsOf(MEDARIS), {
        permissions: twoCodes,
      }).expect(200);
      await seat(NAZIR_A, HEAD);
      await put(MEDARIS, permissionsOf(NAZIR_A), {
        permissions: twoCodes,
      }).expect(200);
      for (const row of await liveGrants(NAZIR_A)) {
        expect(row.authorityScopeType).toBe(SCOPE_TYPES.PLATFORM);
      }
      await patch(NAZIR_A, `/courses/${courseId}`, {
        isClosed: false,
      }).expect(200);
    });
  });

  describe("a permission does not outlast its seat (decision 8)", () => {
    it("a seat dropped when its giver is dismissed takes with it what others gave its holder, and appointing them again brings nothing back", async () => {
      await seat(NAZIR_A, HEAD);
      await grant(NAZIR_A, HEAD, {
        permission: PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      });
      await post(NAZIR_A, `${nazirs()}/${NAZIR_B}`).expect(201);
      expect((await seatOf(NAZIR_B)).grantedBy).toBe(NAZIR_A);
      await put(HEAD, permissionsOf(NAZIR_B), {
        permissions: [
          PERMISSIONS.MADRASAH_STUDENTS_VIEW,
          PERMISSIONS.COURSE_EDIT,
        ],
      }).expect(200);
      await get(NAZIR_B, students()).expect(200);
      const given = (await liveGrants(NAZIR_B)).map((r) => r.id).sort();

      await del(HEAD, `${nazirs()}/${NAZIR_A}`, {
        decisions: [{ userId: NAZIR_B, action: "DROP" }],
      }).expect(204);

      expect(await seatOf(NAZIR_B)).toBeUndefined();
      expect(await liveGrants(NAZIR_B)).toEqual([]);
      const [dismissal] = await audits("madrasah_nazir.dismiss", HEAD);
      expect(
        [
          ...(dismissal.details as { droppedWithSeats: string[] })
            .droppedWithSeats,
        ].sort()
      ).toEqual(given);

      // "Appointed with no permissions" again means exactly that.
      const again = await post(HEAD, `${nazirs()}/${NAZIR_B}`).expect(201);
      expect(again.body).toMatchObject({ groups: [], permissions: [] });
      await get(NAZIR_B, students()).expect(403);
    });

    it("seating someone again revokes what they kept from an earlier seat, on the record, and leaves what another role of theirs covers", async () => {
      const leftover = await grant(PERSON, HEAD, {
        permission: PERMISSIONS.MADRASAH_STUDENTS_VIEW,
      });
      // A ders nazırı of the course, given work there by the köşk's nazımı:
      // that role still covers it.
      await assignRole(db(), {
        userId: PERSON,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
        grantedBy: NAZIM,
      });
      const covered = await grant(
        PERSON,
        NAZIM,
        { permission: PERMISSIONS.ENROLLMENT_DECIDE },
        { scopeType: SCOPE_TYPES.COURSE, scopeId: courseId }
      );

      await post(HEAD, `${nazirs()}/${PERSON}`).expect(201);

      expect((await liveGrants(PERSON)).map((r) => r.id)).toEqual([covered.id]);
      await get(PERSON, students()).expect(403);
      const [appoint] = await audits("madrasah_nazir.appoint", HEAD);
      expect(appoint.details).toMatchObject({
        revokedLeftovers: [leftover.id],
      });
    });

    it("making someone a Medaris nazımı does not bring back a lost seat's grants", async () => {
      const leftover = await grant(PERSON, HEAD, {
        permission: PERMISSIONS.MADRASAH_STUDENTS_VIEW,
      });
      await post(ADMIN, "/nizam/medaris-nazims", {
        userId: PERSON,
        permissions: [],
      }).expect(201);

      await get(PERSON, students()).expect(403);
      expect(await liveGrants(PERSON)).toEqual([]);
      const [appoint] = await audits("medaris_nazim.appoint", ADMIN);
      expect(appoint.details).toMatchObject({
        revokedLeftovers: [leftover.id],
      });
    });

    it("keeps, on that appointment, a course grant their medrese seat still covers, and revokes a köşk grant no role covers", async () => {
      await seat(PERSON, HEAD);
      const inCourse = await grant(
        PERSON,
        HEAD,
        { permission: PERMISSIONS.COURSE_EDIT },
        { scopeType: SCOPE_TYPES.COURSE, scopeId: courseId }
      );
      const inKosk = await grant(
        PERSON,
        NAZIM,
        { permission: PERMISSIONS.COURSE_EDIT },
        { scopeType: SCOPE_TYPES.KOSK, scopeId: koskId }
      );
      await post(ADMIN, "/nizam/medaris-nazims", {
        userId: PERSON,
        permissions: [],
      }).expect(201);

      expect((await liveGrants(PERSON)).map((r) => r.id)).toEqual([
        inCourse.id,
      ]);
      const [appoint] = await audits("medaris_nazim.appoint", ADMIN);
      expect(appoint.details).toMatchObject({ revokedLeftovers: [inKosk.id] });
    });

    it("replacing the başmüderris: a nazır seat answered Düşür takes its holder's other grants in the medrese along, a grant taken over stays", async () => {
      await seat(NAZIR_A, HEAD);
      const fromAdmin = await grant(NAZIR_A, ADMIN, {
        permission: PERMISSIONS.MADRASAH_STUDENTS_VIEW,
      });
      const fromHead = await grant(NAZIR_A, HEAD, {
        permission: PERMISSIONS.MADRASAH_BAN,
      });
      const seatRow = await seatOf(NAZIR_A);

      await put(ADMIN, `/madrasahs/${madrasahId}/head-muderris`, {
        userId: HEAD2,
        delegations: [
          { kind: "ROLE", id: seatRow.id, action: "DROP" },
          { kind: "GRANT", id: fromHead.id, action: "TAKE_OVER" },
        ],
      }).expect(200);

      expect((await liveGrants(NAZIR_A)).map((r) => r.id)).toEqual([
        fromHead.id,
      ]);
      const [set] = await audits("madrasah.head_muderris.set", ADMIN);
      expect(set.details).toMatchObject({ droppedWithSeats: [fromAdmin.id] });
    });

    it("dismissing a Medaris nazımı: a seat they gave, answered Düşür, takes its holder's other grants along", async () => {
      await medarisNazim(MEDARIS);
      await post(MEDARIS, `${nazirs()}/${NAZIR_A}`).expect(201);
      await put(HEAD, permissionsOf(NAZIR_A), {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
      }).expect(200);
      const given = (
        await get(ADMIN, `/nizam/medaris-nazims/${MEDARIS}/given`).expect(200)
      ).body as Array<{ kind: string; id: string }>;
      const seatItem = given.find((g) => g.kind === "ROLE");

      await del(ADMIN, `/nizam/medaris-nazims/${MEDARIS}`, {
        decisions: [{ kind: "ROLE", id: seatItem?.id, action: "DROP" }],
      }).expect(204);

      expect(await liveGrants(NAZIR_A)).toEqual([]);
      await get(NAZIR_A, students()).expect(403);
    });
  });

  describe("a nazır dismisses only the nazırs they appointed (d-1004-28)", () => {
    it("refuses another's nazır to a nazır holding 'appoint nazırs', and lets the başmüderris and the platform dismiss any", async () => {
      await seat(NAZIR_A, HEAD);
      await grant(NAZIR_A, HEAD, {
        permission: PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      });
      await post(NAZIR_A, `${nazirs()}/${NAZIR_B}`).expect(201);
      await seat(NAZIR_C, HEAD);
      await seat(PERSON, HEAD);

      const refused = await del(NAZIR_A, `${nazirs()}/${NAZIR_C}`, {
        decisions: [],
      }).expect(403);
      expect(refused.body.code).toBe("NAZIR_NOT_APPOINTED_BY_YOU");
      expect(await seatOf(NAZIR_C)).toBeDefined();
      expect(await audits("madrasah_nazir.dismiss")).toEqual([]);

      await del(NAZIR_A, `${nazirs()}/${NAZIR_B}`, { decisions: [] }).expect(
        204
      );
      await del(HEAD, `${nazirs()}/${NAZIR_C}`, { decisions: [] }).expect(204);
      await medarisNazim(MEDARIS);
      await del(MEDARIS, `${nazirs()}/${PERSON}`, { decisions: [] }).expect(
        204
      );
    });
  });

  describe("replacing the başmüderris asks about every gift, course-limited ones too", () => {
    it("lists a grant limited to one course and refuses the change until it is answered", async () => {
      await seat(NAZIR_A, HEAD);
      await put(HEAD, permissionsOf(NAZIR_A), {
        permissions: [PERMISSIONS.COURSE_EDIT],
        courseIds: [courseId],
      }).expect(200);
      const [courseGrant] = await liveGrants(NAZIR_A);
      expect(courseGrant).toMatchObject({
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: courseId,
      });
      const seatRow = await seatOf(NAZIR_A);

      const listed = (
        await get(
          ADMIN,
          `/madrasahs/${madrasahId}/head-muderris/delegations`
        ).expect(200)
      ).body as Array<{ kind: string; id: string; permission: string | null }>;
      expect(listed.map((d) => `${d.kind}:${d.id}`).sort()).toEqual(
        [`ROLE:${seatRow.id}`, `GRANT:${courseGrant.id}`].sort()
      );

      const path = `/madrasahs/${madrasahId}/head-muderris`;
      const seatOnly = [{ kind: "ROLE", id: seatRow.id, action: "TAKE_OVER" }];
      const incomplete = await put(ADMIN, path, {
        userId: HEAD2,
        delegations: seatOnly,
      }).expect(400);
      expect(incomplete.body.code).toBe("DISMISS_DECISIONS_INCOMPLETE");

      await put(ADMIN, path, {
        userId: HEAD2,
        delegations: [
          ...seatOnly,
          { kind: "GRANT", id: courseGrant.id, action: "DROP" },
        ],
      }).expect(200);
      expect(await liveGrants(NAZIR_A)).toEqual([]);
    });
  });

  describe("giving a kept grant more time is a grant by the one who gives it", () => {
    it("is attributed to them, audited and listed to the başnazım; shortening is audited as a re-time", async () => {
      await seat(NAZIR_A, HEAD);
      const tenDays = daysFromNow(10);
      await put(HEAD, permissionsOf(NAZIR_A), {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
        expiresAt: tenDays.toISOString(),
      }).expect(200);
      const [original] = await liveGrants(NAZIR_A);
      await medarisNazim(MEDARIS);
      await post(ADMIN, `${nazirs()}/${MEDARIS}`).expect(201);
      await put(ADMIN, permissionsOf(MEDARIS), {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
      }).expect(200);

      await put(MEDARIS, permissionsOf(NAZIR_A), {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
      }).expect(200);

      const [extended] = await liveGrants(NAZIR_A);
      expect(extended).toMatchObject({
        id: original.id,
        grantedBy: MEDARIS,
        expiresAt: null,
      });
      const [audit] = await audits("permission.grant", MEDARIS);
      expect(audit).toMatchObject({ entityId: NAZIR_A });
      expect(
        (audit.details as { grants: Array<Record<string, unknown>> }).grants
      ).toEqual([
        expect.objectContaining({
          id: original.id,
          permission: PERMISSIONS.MADRASAH_STUDENTS_VIEW,
          extendedFrom: tenDays.toISOString(),
          previouslyGrantedBy: HEAD,
        }),
      ]);
      const listed = (
        await get(ADMIN, `/nizam/medaris-nazims/${MEDARIS}/given`).expect(200)
      ).body as Array<{ kind: string; id: string }>;
      expect(listed.filter((g) => g.kind === "GRANT").map((g) => g.id)).toEqual(
        [original.id]
      );

      // A shorter end is not a gift: the giver stays, and the re-time is on
      // the record.
      const fiveDays = daysFromNow(5);
      await put(HEAD, permissionsOf(NAZIR_A), {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
        expiresAt: fiveDays.toISOString(),
      }).expect(200);
      const [shortened] = await liveGrants(NAZIR_A);
      expect(shortened.grantedBy).toBe(MEDARIS);
      const [retime] = await audits("permission.retime", HEAD);
      expect(retime.details).toMatchObject({
        expiresAt: fiveDays.toISOString(),
        grants: [
          expect.objectContaining({ id: original.id, previousExpiresAt: null }),
        ],
      });
    });
  });

  describe("a group changed while it is being given", () => {
    const makeGroup = async (permissions: string[]) => {
      const [group] = await db()
        .insert(permissionGroups)
        .values({
          scopeType: SCOPE_TYPES.MADRASAH,
          scopeId: madrasahId,
          name: "Kayıt işleri",
          createdBy: HEAD,
        })
        .returning();
      await db()
        .insert(permissionGroupItems)
        .values(
          permissions.map((permission) => ({ groupId: group.id, permission }))
        );
      return group.id;
    };

    it("a save that gives the group waits for the change and is checked against the codes it ends up carrying", async () => {
      await medarisNazim(MEDARIS);
      await post(ADMIN, `${nazirs()}/${MEDARIS}`).expect(201);
      await put(ADMIN, permissionsOf(MEDARIS), {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
      }).expect(200);
      await seat(NAZIR_A, HEAD);
      const groupId = await makeGroup([PERMISSIONS.MADRASAH_STUDENTS_VIEW]);

      // A change to the group is under way (its row locked, a code added, not
      // committed) when the Medaris nazımı gives it.
      let response: { status: number; body: { code?: string } } | undefined;
      await db().transaction(async (tx) => {
        await tx
          .select({ id: permissionGroups.id })
          .from(permissionGroups)
          .where(eq(permissionGroups.id, groupId))
          .for("update");
        await tx
          .insert(permissionGroupItems)
          .values({ groupId, permission: PERMISSIONS.MADRASAH_BAN });
        const pending = put(MEDARIS, permissionsOf(NAZIR_A), {
          groupId,
          permissions: [],
        }).then((res) => {
          response = res;
        });
        await sleep(750);
        expect(response).toBeUndefined();
        void pending;
      });
      for (let i = 0; i < 50 && !response; i++) await sleep(100);

      expect(response?.status).toBe(403);
      expect(response?.body.code).toBe("GRANT_EXCEEDS_GIVER");
      expect(await liveGrants(NAZIR_A)).toEqual([]);
    });

    it("a change counts the holders under the group's lock, so one who appeared meanwhile is still asked about", async () => {
      const groupId = await makeGroup([PERMISSIONS.MADRASAH_STUDENTS_VIEW]);
      await seat(NAZIR_A, HEAD);
      await grant(NAZIR_A, HEAD, { groupId });
      const repo = app.get(PermissionAdminRepository);

      await expect(
        repo.updateGroup(HEAD, groupId, {
          name: "Kayıt işleri",
          permissions: [
            PERMISSIONS.MADRASAH_STUDENTS_VIEW,
            PERMISSIONS.MADRASAH_BAN,
          ],
          usersPolicy: null,
          authority: SCOPE_TYPES.MADRASAH,
        })
      ).rejects.toBeInstanceOf(UsersPolicyRequiredError);
      await expect(
        repo.deleteGroup(HEAD, groupId, null, SCOPE_TYPES.MADRASAH)
      ).rejects.toBeInstanceOf(UsersPolicyRequiredError);

      const items = await db()
        .select()
        .from(permissionGroupItems)
        .where(eq(permissionGroupItems.groupId, groupId));
      expect(items.map((i) => i.permission)).toEqual([
        PERMISSIONS.MADRASAH_STUDENTS_VIEW,
      ]);
      const [group] = await db()
        .select()
        .from(permissionGroups)
        .where(eq(permissionGroups.id, groupId));
      expect(group.deletedAt).toBeNull();
    });
  });

  describe("one caller records one level in one medrese", () => {
    it("a başmüderris who is also a Medaris nazımı appoints and gives as the medrese", async () => {
      await medarisNazim(HEAD);
      await post(HEAD, `${nazirs()}/${NAZIR_A}`).expect(201);
      await put(HEAD, permissionsOf(NAZIR_A), {
        permissions: [PERMISSIONS.MADRASAH_STUDENTS_VIEW],
      }).expect(200);
      const [appoint] = await audits("madrasah_nazir.appoint", HEAD);
      const [given] = await audits("permission.grant", HEAD);
      expect(appoint.details).toMatchObject({
        authority: SCOPE_TYPES.MADRASAH,
      });
      expect(given.details).toMatchObject({ authority: SCOPE_TYPES.MADRASAH });
    });
  });

  describe("a Medaris nazımı's dismissal and the rows they made for themselves", () => {
    it("refuses a take-over of a self-made row instead of reversing it silently", async () => {
      await medarisNazim(MEDARIS);
      await seat(MEDARIS, MEDARIS);
      const own = await seatOf(MEDARIS);
      const path = `/nizam/medaris-nazims/${MEDARIS}`;

      const refused = await del(ADMIN, path, {
        decisions: [{ kind: "ROLE", id: own.id, action: "TAKE_OVER" }],
      }).expect(400);
      expect(refused.body.code).toBe("DISMISS_DECISIONS_INCOMPLETE");
      expect(await seatOf(MEDARIS)).toBeDefined();

      await del(ADMIN, path, { decisions: [] }).expect(204);
      expect(await seatOf(MEDARIS)).toBeUndefined();
    });
  });
});
