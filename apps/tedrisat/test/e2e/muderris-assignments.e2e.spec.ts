import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-134: `course_muderris` stays what the course page shows, and the
 * accounts it is bound to hold MUDERRIS in `role_assignments`, which is what
 * authorization reads. Course create and the whole-course PUT keep the two in
 * step; the imam is the account listed first until MDRS-136 lets someone
 * choose.
 */
const AHMED = "d0000000-0000-4000-8000-000000000001";
const HASAN = "d0000000-0000-4000-8000-000000000002";
const ZEYD = "d0000000-0000-4000-8000-000000000003";

const muderris = (userId: string | undefined, name: string, id?: string) => ({
  ...(id ? { id } : {}),
  ...(userId ? { userId } : {}),
  name,
});

const payload = (list: ReturnType<typeof muderris>[]) => ({
  title: "Bina ve İzhar Şerhi",
  status: "PUBLISHED",
  muderris: list,
  weeks: [],
  resources: [],
});

describe("MUDERRIS role rows follow the course's müderris list (e2e)", () => {
  let app: INestApplication;
  let adminApp: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;

  const http = () => request(app.getHttpServer());

  /** The course's MUDERRIS rows, oldest first, revoked ones included. */
  const rows = (courseId: string) =>
    databaseService.db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.scopeId, courseId),
          eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS)
        )
      )
      .orderBy(roleAssignments.createdAt, roleAssignments.id);

  const held = async (courseId: string) =>
    (await rows(courseId))
      .filter((r) => r.revokedAt === null)
      .map((r) => ({ userId: r.userId, isImam: r.isImam }))
      .sort((a, b) => (a.userId < b.userId ? -1 : 1));

  const create = async (list: ReturnType<typeof muderris>[]) =>
    (
      await http()
        .post(`/kosks/${koskId}/courses`)
        .send(payload(list))
        .expect(201)
    ).body as { id: string; muderris: { id: string; userId: string | null }[] };

  const replace = (courseId: string, list: ReturnType<typeof muderris>[]) =>
    http().put(`/courses/${courseId}`).send(payload(list)).expect(200);

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    adminApp = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    // A müderris row links only an account that has signed in (MDRS-105).
    await databaseService.db
      .insert(users)
      .values([TEST_USER_ID, AHMED, HASAN, ZEYD].map((id) => ({ id })));
    // Opening a köşk is SYSTEM_ADMIN only (2026-10-02); signed with
    // TEST_USER_ID's own `sub`, the köşk is still that user's to manage.
    const kosk = await request(adminApp.getHttpServer())
      .post("/kosks")
      .set(
        "Authorization",
        bearerFor({
          sub: TEST_USER_ID,
          claims: { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } },
        })
      )
      .send({ name: "Süleymaniye Köşkü" })
      .expect(201);
    koskId = kosk.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    await app.close();
    await adminApp.close();
  });

  it("grants MUDERRIS to each bound account once, the first listed as imam", async () => {
    const course = await create([
      muderris(AHMED, "Ahmed"),
      muderris(undefined, "Hoca-i misafir"),
      muderris(HASAN, "Hasan"),
      // The same account listed twice is refused with a 400 since MDRS-105
      // (`course-team.e2e.spec.ts`), so it never reaches the role rows.
    ]);
    expect(await held(course.id)).toEqual([
      { userId: AHMED, isImam: true },
      { userId: HASAN, isImam: false },
    ]);
    const all = await rows(course.id);
    expect(all.every((r) => r.grantedBy === TEST_USER_ID)).toBe(true);
    expect(all.every((r) => r.scopeType === "course")).toBe(true);
  });

  it("grants nothing for a course whose müderris are bound to no account", async () => {
    const course = await create([muderris(undefined, "Hoca-i misafir")]);
    expect(await rows(course.id)).toEqual([]);
  });

  it("revokes a dropped account, grants an added one, and keeps the imam", async () => {
    const course = await create([
      muderris(AHMED, "Ahmed"),
      muderris(HASAN, "Hasan"),
    ]);
    const [ahmedRow, hasanRow] = course.muderris;

    // Hasan leaves, Zeyd joins in front of Ahmed: Ahmed stays imam.
    await replace(course.id, [
      muderris(ZEYD, "Zeyd"),
      muderris(AHMED, "Ahmed", ahmedRow.id),
    ]);
    expect(await held(course.id)).toEqual([
      { userId: AHMED, isImam: true },
      { userId: ZEYD, isImam: false },
    ]);
    const hasan = (await rows(course.id)).find((r) => r.userId === HASAN);
    expect(hasan?.revokedBy).toBe(TEST_USER_ID);
    expect(hasan?.revokedAt).toBeInstanceOf(Date);
    expect(hasanRow.userId).toBe(HASAN);
  });

  it("makes the first listed account imam when the imam is dropped", async () => {
    const course = await create([
      muderris(AHMED, "Ahmed"),
      muderris(HASAN, "Hasan"),
      muderris(ZEYD, "Zeyd"),
    ]);
    await replace(course.id, [
      muderris(ZEYD, "Zeyd"),
      muderris(HASAN, "Hasan"),
    ]);
    expect(await held(course.id)).toEqual([
      { userId: HASAN, isImam: false },
      { userId: ZEYD, isImam: true },
    ]);
  });

  // A lapsed imam is no imam: the next save closes the lapsed row and makes
  // the first listed account imam, without tripping the one-imam index.
  it("replaces an imam whose row lapsed by expires_at", async () => {
    const course = await create([
      muderris(HASAN, "Hasan"),
      muderris(AHMED, "Ahmed"),
    ]);
    await databaseService.db
      .update(roleAssignments)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(
        and(
          eq(roleAssignments.scopeId, course.id),
          eq(roleAssignments.userId, HASAN)
        )
      );
    await replace(course.id, [
      muderris(AHMED, "Ahmed"),
      muderris(HASAN, "Hasan"),
    ]);
    expect(await held(course.id)).toEqual([
      { userId: AHMED, isImam: true },
      { userId: HASAN, isImam: false },
    ]);
    const lapsed = (await rows(course.id)).filter(
      (r) => r.userId === HASAN && r.revokedAt !== null
    );
    expect(lapsed).toHaveLength(1);
    expect(lapsed[0].isImam).toBe(true);
  });

  it("revokes every MUDERRIS row when no account is left on the list", async () => {
    const course = await create([muderris(AHMED, "Ahmed")]);
    await replace(course.id, [muderris(undefined, "Hoca-i misafir")]);
    expect(await held(course.id)).toEqual([]);
    expect(await rows(course.id)).toHaveLength(1);
  });

  it("is what GET /me reports as taught", async () => {
    const course = await create([muderris(TEST_USER_ID, "Kendisi")]);
    const me = await http().get("/me").expect(200);
    expect(me.body.roles.teaches).toEqual([
      { id: course.id, title: "Bina ve İzhar Şerhi", koskId },
    ]);
  });

  it("goes with the course when SYSTEM_ADMIN deletes the köşk", async () => {
    const course = await create([muderris(AHMED, "Ahmed")]);
    await databaseService.db.transaction(async (tx) => {
      const { purgeCourses } = await import("../../src/course/course-purge");
      await purgeCourses(tx, [course.id]);
    });
    expect(await rows(course.id)).toEqual([]);
  });
});
