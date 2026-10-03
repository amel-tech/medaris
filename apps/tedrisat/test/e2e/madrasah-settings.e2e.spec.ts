import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courses,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  madrasahSettings,
  madrasahs,
} from "../../src/database/schema/madrasah.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-184, nazir/04: a medrese's settings — the form, the three policies, the
 * "Son değişiklik" line, the audit row, "Kayıt her zaman onaylı" reaching
 * enrollment — and the course list under them, against a real Postgres. Real
 * `AuthGuard` with minted tokens; the medrese's başmüderris (MEDRESE_BASMUDERRIS)
 * is the only medrese-side role the matrix resolves.
 */
const ADMIN_ID = "d4000000-0000-4000-8000-000000000001";
const HEAD_ID = "d4000000-0000-4000-8000-000000000002";
const OTHER_HEAD_ID = "d4000000-0000-4000-8000-000000000003";
const NAZIR_ID = "d4000000-0000-4000-8000-000000000004";
const STRANGER_ID = "d4000000-0000-4000-8000-000000000005";
const MANAGER_ID = "d4000000-0000-4000-8000-000000000006";
const IMAM_ID = "d4000000-0000-4000-8000-000000000007";
const TALEBE_1 = "d4000000-0000-4000-8000-000000000008";
const TALEBE_2 = "d4000000-0000-4000-8000-000000000009";
const TALEBE_3 = "d4000000-0000-4000-8000-00000000000a";
const UNKNOWN_ID = "d4000000-0000-4000-8000-00000000ffff";

const HEAD = {
  email: "m.isikoglu@example.com",
  givenName: "Mehmet Emin",
  familyName: "Işıkoğlu",
};
const claims: Record<string, Record<string, unknown>> = {
  [ADMIN_ID]: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
  [HEAD_ID]: {
    email: HEAD.email,
    given_name: HEAD.givenName,
    family_name: HEAD.familyName,
  },
};
const auth = (sub: string) => bearerFor({ sub, claims: claims[sub] ?? {} });

describe("Medrese settings (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let koskId: string;
  let publishedCourse: string;
  let draftCourse: string;
  let looseCourse: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const path = (id = madrasahId) => `/madrasahs/${id}/settings`;
  const get = (sub: string, id = madrasahId) =>
    http().get(path(id)).set("Authorization", auth(sub));
  const patch = (sub: string, body: unknown, id = madrasahId) =>
    http()
      .patch(path(id))
      .set("Authorization", auth(sub))
      .send(body as object);
  const audits = () =>
    db()
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "madrasah.settings.update"),
          eq(auditLog.entityId, madrasahId)
        )
      );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    // Seeded, not left to the sign-in sync: its in-process cache outlives
    // `cleanTables`, so the row would be missing from the second test on.
    await db()
      .insert(users)
      .values({ id: HEAD_ID, ...HEAD });
    const [madrasah, other] = await db()
      .insert(madrasahs)
      .values([
        {
          handle: "suleymaniye",
          name: "Süleymaniye Medresesi",
          description: "Klasik medrese müfredatı.",
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

    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    const [draft, published, , loose] = await db()
      .insert(courses)
      .values([
        {
          koskId,
          authorId: MANAGER_ID,
          title: "Maksûd şerhi",
          madrasahId,
          status: CourseStatus.DRAFT,
        },
        {
          koskId,
          authorId: MANAGER_ID,
          title: "Bina ve İzhar Şerhi",
          madrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: MANAGER_ID,
          title: "Başka medresenin dersi",
          madrasahId: otherMadrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: MANAGER_ID,
          title: "Hiçbir medresenin değil",
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId,
          authorId: MANAGER_ID,
          title: "Gizlenmiş ders",
          madrasahId,
          status: CourseStatus.PUBLISHED,
          archivedAt: new Date(),
          archivedBy: MANAGER_ID,
        },
      ])
      .returning();
    draftCourse = draft.id;
    publishedCourse = published.id;
    looseCourse = loose.id;
    await db().insert(courseMuderris).values({
      courseId: publishedCourse,
      userId: IMAM_ID,
      name: "Mehmet Emin Işıkoğlu",
    });
    await assignRole(db(), {
      userId: IMAM_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: publishedCourse,
      isImam: true,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await app.close();
  });

  describe("reading", () => {
    it("shows a medrese that was never saved with every policy off and no last save", async () => {
      const res = await get(HEAD_ID).expect(200);
      expect(res.body).toEqual({
        name: "Süleymaniye Medresesi",
        description: "Klasik medrese müfredatı.",
        policies: {
          closedCourseRequired: false,
          alwaysApproval: false,
          noPublicRecordings: false,
        },
        updatedAt: null,
        updatedBy: null,
      });
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone", async () => {
      await get(ADMIN_ID).expect(200);
      // A medrese nazır is on no matrix row yet, so they are refused like
      // anyone else who is not the başmüderris.
      for (const sub of [NAZIR_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await get(sub).expect(403);
      }
      await http().get(path()).expect(401);
    });

    it("answers an unknown or malformed medrese with 404, not 403", async () => {
      await get(STRANGER_ID, UNKNOWN_ID).expect(404);
      await get(STRANGER_ID, "not-a-uuid").expect(404);
    });

    it("keeps the policies and the editor out of the public read", async () => {
      await patch(HEAD_ID, { policies: { alwaysApproval: true } }).expect(200);
      const res = await http().get(`/madrasahs/${madrasahId}`).expect(200);
      expect(Object.keys(res.body).sort()).not.toContain("policies");
      expect(JSON.stringify(res.body)).not.toContain(HEAD_ID);
    });
  });

  describe("saving", () => {
    it("saves the name, the description and the policies, stamps the editor and writes the audit row", async () => {
      const res = await patch(HEAD_ID, {
        name: "  Süleymaniye Medresesi (Fatih)  ",
        description: "Yeni açıklama",
        policies: { closedCourseRequired: true, alwaysApproval: true },
      }).expect(200);

      expect(res.body).toMatchObject({
        name: "Süleymaniye Medresesi (Fatih)",
        description: "Yeni açıklama",
        policies: {
          closedCourseRequired: true,
          alwaysApproval: true,
          noPublicRecordings: false,
        },
        updatedBy: {
          id: HEAD_ID,
          name: "Mehmet Emin Işıkoğlu",
          email: "m.isikoglu@example.com",
        },
      });
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
        Date.now() - 60_000
      );
      expect((await get(HEAD_ID).expect(200)).body).toEqual(res.body);

      // The public medrese carries the new name.
      const publicRead = await http()
        .get(`/madrasahs/${madrasahId}`)
        .expect(200);
      expect(publicRead.body.name).toBe("Süleymaniye Medresesi (Fatih)");

      const [audit, ...rest] = await audits();
      expect(rest).toEqual([]);
      expect(audit.actorId).toBe(HEAD_ID);
      expect(audit.details).toEqual({
        changes: {
          name: {
            from: "Süleymaniye Medresesi",
            to: "Süleymaniye Medresesi (Fatih)",
          },
          description: {
            from: "Klasik medrese müfredatı.",
            to: "Yeni açıklama",
          },
          "policies.closedCourseRequired": { from: false, to: true },
          "policies.alwaysApproval": { from: false, to: true },
        },
      });
    });

    it("changes only what is sent", async () => {
      await patch(HEAD_ID, {
        policies: { noPublicRecordings: true },
      }).expect(200);
      const res = await patch(HEAD_ID, {
        policies: { alwaysApproval: true },
      }).expect(200);
      expect(res.body.policies).toEqual({
        closedCourseRequired: false,
        alwaysApproval: true,
        noPublicRecordings: true,
      });
      expect(res.body.name).toBe("Süleymaniye Medresesi");
      expect(res.body.description).toBe("Klasik medrese müfredatı.");
    });

    it("leaves the last save and the audit log alone when nothing changes", async () => {
      const first = await patch(HEAD_ID, {
        policies: { alwaysApproval: true },
      }).expect(200);
      const again = await patch(ADMIN_ID, {
        name: "Süleymaniye Medresesi",
        policies: { alwaysApproval: true },
      }).expect(200);
      expect(again.body.updatedAt).toBe(first.body.updatedAt);
      expect(again.body.updatedBy.id).toBe(HEAD_ID);
      expect(await audits()).toHaveLength(1);
      await patch(HEAD_ID, {}).expect(200);
      expect(await audits()).toHaveLength(1);
    });

    it("clears the description with a blank or null one", async () => {
      const blank = await patch(HEAD_ID, { description: "   " }).expect(200);
      expect(blank.body.description).toBeNull();
      await patch(HEAD_ID, { description: "Geri geldi" }).expect(200);
      const cleared = await patch(HEAD_ID, { description: null }).expect(200);
      expect(cleared.body.description).toBeNull();
    });

    it.each([
      ["a blank name", { name: "   " }],
      ["a one-letter name", { name: "S" }],
      ["a name over 120 characters", { name: "S".repeat(121) }],
      ["a description over 1000 characters", { description: "a".repeat(1001) }],
      [
        "a policy that is not a boolean",
        { policies: { alwaysApproval: "evet" } },
      ],
      ["a policy that does not exist", { policies: { openToAll: true } }],
      ["a field the form does not have", { handle: "baska-ad" }],
    ])("rejects %s with 400 and writes nothing", async (_what, body) => {
      await patch(HEAD_ID, body).expect(400);
      expect(await audits()).toHaveLength(0);
      expect(await db().select().from(madrasahSettings)).toHaveLength(0);
      expect((await get(HEAD_ID).expect(200)).body.name).toBe(
        "Süleymaniye Medresesi"
      );
    });

    it("lets SYSTEM_ADMIN save and refuses everyone else with 403", async () => {
      await patch(ADMIN_ID, { name: "Başnazımın adı" }).expect(200);
      for (const sub of [NAZIR_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await patch(sub, { name: "Ele geçirildi" }).expect(403);
      }
      await http().patch(path()).send({ name: "x" }).expect(401);
      expect((await get(HEAD_ID).expect(200)).body.name).toBe("Başnazımın adı");
      await patch(HEAD_ID, { name: "x" }, UNKNOWN_ID).expect(404);
    });

    it("goes with the medrese when SYSTEM_ADMIN deletes it", async () => {
      await patch(HEAD_ID, { policies: { alwaysApproval: true } }).expect(200);
      await http()
        .delete(`/madrasahs/${madrasahId}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(await db().select().from(madrasahSettings)).toHaveLength(0);
    });
  });

  describe("Kayıt her zaman onaylı", () => {
    const enroll = (sub: string, courseId = publishedCourse) =>
      http()
        .post(`/courses/${courseId}/enroll`)
        .set("Authorization", auth(sub))
        .send({});

    it("makes every new enrollment in the medrese's courses wait, and only theirs", async () => {
      const before = await enroll(TALEBE_1).expect(201);
      expect(before.body.status).toBe("ENROLLED");

      await patch(HEAD_ID, { policies: { alwaysApproval: true } }).expect(200);
      const after = await enroll(TALEBE_2).expect(201);
      expect(after.body.status).toBe("PENDING");
      // The seat taken before stays.
      expect(
        (await enroll(TALEBE_2, looseCourse).expect(201)).body.status
      ).toBe("ENROLLED");

      await patch(HEAD_ID, { policies: { alwaysApproval: false } }).expect(200);
      expect((await enroll(TALEBE_3).expect(201)).body.status).toBe("ENROLLED");
    });
  });

  describe("the courses under the policies", () => {
    const list = (sub: string, id = madrasahId) =>
      http().get(`/madrasahs/${id}/courses`).set("Authorization", auth(sub));

    it("lists the medrese's drafts and published courses by title, with their köşk and müderrisler", async () => {
      const res = await list(HEAD_ID).expect(200);
      expect(res.body).toEqual([
        {
          id: publishedCourse,
          title: "Bina ve İzhar Şerhi",
          koskId,
          koskName: "Nûruosmaniye Köşkü",
          status: "PUBLISHED",
          muderris: [
            { name: "Mehmet Emin Işıkoğlu", title: null, isImam: true },
          ],
        },
        {
          id: draftCourse,
          title: "Maksûd şerhi",
          koskId,
          koskName: "Nûruosmaniye Köşkü",
          status: "DRAFT",
          muderris: [],
        },
      ]);
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone, and 404 for an unknown medrese", async () => {
      await list(ADMIN_ID).expect(200);
      for (const sub of [NAZIR_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await list(sub).expect(403);
      }
      await http().get(`/madrasahs/${madrasahId}/courses`).expect(401);
      await list(STRANGER_ID, UNKNOWN_ID).expect(404);
    });
  });
});
