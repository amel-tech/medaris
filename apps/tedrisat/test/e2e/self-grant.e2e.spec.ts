import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
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
 * MDRS-135 review B1/M4 on the paths the first round missed: nobody but the
 * başnazım names themselves müderris through the course's own routes, seats
 * themselves köşk nazımı by opening a köşk, or rewrites their own ders nazırı
 * post; and a refusal on a create route is answered 403 and recorded, not
 * lost to a 500.
 */
const ADMIN = "d9500000-0000-4000-8000-000000000001";
const NAZIM = "d9500000-0000-4000-8000-000000000002";
const CO_NAZIM = "d9500000-0000-4000-8000-000000000003";
const HEAD = "d9500000-0000-4000-8000-000000000004";
const NAZIR = "d9500000-0000-4000-8000-000000000005";
const MEDARIS = "d9500000-0000-4000-8000-000000000006";
const OTHER = "d9500000-0000-4000-8000-000000000007";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Naming yourself on the remaining paths (MDRS-135 review, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let madrasahId: string;
  let medreseCourse: string;
  let ownCourse: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const send = (
    method: "post" | "put" | "patch",
    sub: string,
    path: string,
    body: object = {}
  ) => http()[method](path).set("Authorization", auth(sub)).send(body);

  const refusals = () =>
    db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "permission.self_grant_refused"))
      .orderBy(auditLog.seq);

  const heldRoles = (userId: string, scopeId: string) =>
    db()
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.scopeId, scopeId),
          isNull(roleAssignments.revokedAt)
        )
      );

  const versionOf = async (courseId: string) =>
    (
      await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, courseId))
    )[0].version;

  const grant = (userId: string, scopeId: string | null, permission: string) =>
    db()
      .insert(permissionGrants)
      .values({
        userId,
        scopeType: scopeId ? SCOPE_TYPES.MADRASAH : SCOPE_TYPES.PLATFORM,
        scopeId,
        permission,
        grantedBy: scopeId ? HEAD : ADMIN,
      });

  const medarisNazim = () =>
    db().insert(roleAssignments).values({
      userId: MEDARIS,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN,
    });

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  afterAll(async () => {
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
    await db()
      .insert(users)
      .values(
        [ADMIN, NAZIM, CO_NAZIM, HEAD, NAZIR, MEDARIS, OTHER].map((id) => ({
          id,
          email: `${id}@example.com`,
        }))
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
    koskId = kosk.id;
    const [inMedrese, own] = await db()
      .insert(courses)
      .values([
        {
          koskId,
          authorId: NAZIM,
          title: "Bina ve İzhar",
          madrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: NAZIM,
          title: "Köşkün kendi dersi",
          status: CourseStatus.PUBLISHED,
        },
      ])
      .returning();
    medreseCourse = inMedrese.id;
    ownCourse = own.id;
    for (const userId of [NAZIM, CO_NAZIM]) {
      await assignRole(db(), {
        userId,
        role: ASSIGNED_ROLES.KOSK_NAZIM,
        scopeId: koskId,
        grantedBy: ADMIN,
      });
    }
    await assignRole(db(), {
      userId: HEAD,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN,
    });
    await assignRole(db(), {
      userId: NAZIR,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD,
    });
  });

  describe("a nazır given only 'choose müderrisler'", () => {
    beforeEach(async () => {
      await grant(NAZIR, madrasahId, PERMISSIONS.MADRASAH_MUDERRIS_MANAGE);
    });

    it("cannot name themselves through PUT /courses/:id/muderris, and names someone else", async () => {
      const list = async (userId: string) => ({
        version: await versionOf(medreseCourse),
        muderris: [{ userId, name: "Müderris" }],
        imamUserId: userId,
      });
      const res = await send(
        "put",
        NAZIR,
        `/courses/${medreseCourse}/muderris`,
        await list(NAZIR)
      ).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
      expect(await heldRoles(NAZIR, medreseCourse)).toHaveLength(0);
      const [row] = await refusals();
      expect(row).toMatchObject({
        actorId: NAZIR,
        entity: "course",
        entityId: medreseCourse,
        details: { route: "course.muderris.set", role: "MUDERRIS" },
      });

      await send(
        "put",
        NAZIR,
        `/courses/${medreseCourse}/muderris`,
        await list(OTHER)
      ).expect(200);
      expect(await heldRoles(OTHER, medreseCourse)).toHaveLength(1);
    });

    it("cannot name themselves in the müderris list of PUT /courses/:id", async () => {
      await grant(NAZIR, madrasahId, PERMISSIONS.COURSE_EDIT);
      const res = await send("put", NAZIR, `/courses/${medreseCourse}`, {
        title: "Bina ve İzhar",
        status: CourseStatus.PUBLISHED,
        muderris: [{ userId: NAZIR, name: "Nazır" }],
      }).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
      expect(await heldRoles(NAZIR, medreseCourse)).toHaveLength(0);
      expect((await refusals()).map((r) => r.details)).toMatchObject([
        { route: "course.replace.muderris" },
      ]);
    });

    it("cannot name themselves through PUT /madrasahs/:id/courses/:courseId/muderrises", async () => {
      const path = `/madrasahs/${madrasahId}/courses/${medreseCourse}/muderrises`;
      const res = await send("put", NAZIR, path, {
        muderrisUserIds: [NAZIR],
      }).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
      expect(await heldRoles(NAZIR, medreseCourse)).toHaveLength(0);
      expect(await refusals()).toMatchObject([
        {
          actorId: NAZIR,
          entity: "madrasah",
          entityId: madrasahId,
          details: { route: "madrasah.course.muderris", role: "MUDERRIS" },
        },
      ]);
      await send("put", NAZIR, path, { muderrisUserIds: [OTHER] }).expect(200);
    });

    it("leaves the köşk nazımı and the başmüderris free to teach their own courses", async () => {
      await send("put", NAZIM, `/courses/${ownCourse}/muderris`, {
        version: await versionOf(ownCourse),
        muderris: [{ userId: NAZIM, name: "Nazım" }],
        imamUserId: NAZIM,
      }).expect(200);
      await send("put", HEAD, `/courses/${medreseCourse}/muderris`, {
        version: await versionOf(medreseCourse),
        muderris: [{ userId: HEAD, name: "Başmüderris" }],
        imamUserId: HEAD,
      }).expect(200);
      expect(await refusals()).toHaveLength(0);
    });

    it("leaves the köşk nazımı free to teach a passive course of their köşk", async () => {
      // A müderris who left makes the course passive (MDRS-136); its content
      // stays open to the köşk's nazımı (owner, 4 October), so naming
      // themselves into it is naming themselves into what they hold.
      await assignRole(db(), {
        userId: OTHER,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: ownCourse,
        grantedBy: NAZIM,
      });
      await db()
        .update(roleAssignments)
        .set({ revokedAt: new Date(), revokedBy: NAZIM })
        .where(eq(roleAssignments.scopeId, ownCourse));
      await send("put", NAZIM, `/courses/${ownCourse}/muderris`, {
        version: await versionOf(ownCourse),
        muderris: [{ userId: NAZIM, name: "Nazım" }],
        imamUserId: NAZIM,
      }).expect(200);
      expect(await heldRoles(NAZIM, ownCourse)).toHaveLength(1);
      expect(await refusals()).toHaveLength(0);
    });
  });

  describe("opening a köşk or a medrese", () => {
    beforeEach(async () => {
      await medarisNazim();
      await grant(MEDARIS, null, PERMISSIONS.PLATFORM_KOSK_CREATE);
      await grant(MEDARIS, null, PERMISSIONS.PLATFORM_MADRASAH_CREATE);
    });

    const kosksNamed = (name: string) =>
      db().select().from(kosks).where(eq(kosks.name, name));

    it("a Medaris nazımı leaving managerUserIds out is refused, not seated köşk nazımı, and it is on the record", async () => {
      const res = await send("post", MEDARIS, "/kosks", {
        name: "Kendi Köşküm",
      }).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
      expect(await kosksNamed("Kendi Köşküm")).toHaveLength(0);
      expect(await refusals()).toMatchObject([
        {
          actorId: MEDARIS,
          entity: "user",
          entityId: MEDARIS,
          details: {
            route: "kosk.create",
            role: "KOSK_NAZIM",
            about: { entity: "kosk", id: "new" },
          },
        },
      ]);

      // Naming the nazımları is what the permission is for.
      const opened = await send("post", MEDARIS, "/kosks", {
        name: "Başkasının Köşkü",
        managerUserIds: [OTHER],
      }).expect(201);
      expect(opened.body.managerIds).toEqual([OTHER]);
    });

    it("refuses naming oneself on either create route with 403 and a row, not a 500", async () => {
      const kosk = await send("post", MEDARIS, "/kosks", {
        name: "Kendi Köşküm",
        managerUserIds: [MEDARIS],
      }).expect(403);
      expect(kosk.body.code).toBe("SELF_GRANT_REFUSED");
      const madrasah = await send("post", MEDARIS, "/madrasahs", {
        name: "Kendi Medresem",
        headMuderrisUserId: MEDARIS,
      }).expect(403);
      expect(madrasah.body.code).toBe("SELF_GRANT_REFUSED");
      expect(
        (await refusals()).map((r) => [r.entity, r.entityId, r.details])
      ).toMatchObject([
        [
          "user",
          MEDARIS,
          { route: "kosk.create.nazims", about: { entity: "kosk" } },
        ],
        [
          "user",
          MEDARIS,
          { route: "madrasah.create.head", about: { entity: "madrasah" } },
        ],
      ]);
      expect(
        await db()
          .select()
          .from(madrasahs)
          .where(eq(madrasahs.name, "Kendi Medresem"))
      ).toHaveLength(0);
    });

    it("the başnazım still opens a köşk for himself, and the opening is recorded", async () => {
      const res = await send("post", ADMIN, "/kosks", {
        name: "Başnazımın Köşkü",
      }).expect(201);
      expect(res.body.managerIds).toEqual([ADMIN]);
      const rows = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "kosk.create"));
      expect(rows).toMatchObject([
        {
          actorId: ADMIN,
          entity: "kosk",
          entityId: res.body.id,
          details: { name: "Başnazımın Köşkü", nazimIds: [ADMIN] },
        },
      ]);
      expect(await refusals()).toHaveLength(0);
    });
  });

  describe("PATCH /kosks/:id/grants/:grantId", () => {
    let postId: string;

    beforeEach(async () => {
      // A co-nazım seated the nazım as ders nazırı of a course, with an end.
      const endsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const [row] = await db()
        .insert(roleAssignments)
        .values({
          userId: NAZIM,
          role: ASSIGNED_ROLES.DERS_NAZIR,
          scopeType: SCOPE_TYPES.COURSE,
          scopeId: ownCourse,
          grantedBy: CO_NAZIM,
          expiresAt: endsAt,
        })
        .returning();
      postId = row.id;
    });

    it("a köşk nazımı cannot widen or lengthen their own post; a co-nazım can", async () => {
      const path = `/kosks/${koskId}/grants/${postId}`;
      const body = {
        permissions: [PERMISSIONS.COURSE_EDIT, PERMISSIONS.SESSION_MANAGE],
        endsAt: null,
      };
      const res = await send("patch", NAZIM, path, body).expect(403);
      expect(res.body.code).toBe("SELF_GRANT_REFUSED");
      const [post] = await db()
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.id, postId));
      expect(post.expiresAt).not.toBeNull();
      expect(
        await db()
          .select()
          .from(permissionGrants)
          .where(eq(permissionGrants.userId, NAZIM))
      ).toHaveLength(0);
      expect(await refusals()).toMatchObject([
        {
          actorId: NAZIM,
          entity: "kosk",
          entityId: koskId,
          details: { route: "kosk.grants.update" },
        },
      ]);

      await send("patch", CO_NAZIM, path, body).expect(200);
    });

    it("an unknown post is still a 404", async () => {
      await send("patch", NAZIM, `/kosks/${koskId}/grants/${OTHER}`, {
        permissions: [PERMISSIONS.COURSE_EDIT],
      }).expect(404);
    });
  });
});
