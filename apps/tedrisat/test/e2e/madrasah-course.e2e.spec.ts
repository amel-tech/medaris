import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
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
import {
  madrasahSettings,
  madrasahs,
} from "../../src/database/schema/madrasah.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
  roleAssignments,
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
 * MDRS-186, nazir/07, 08, 17 and 18: the medrese's course list, the köşks it
 * may open courses in, opening a course, replacing its müderrisler and hiding
 * it, against a real Postgres. Real `AuthGuard` with minted tokens; the
 * medrese's başmüderris (MEDRESE_BASMUDERRIS) is the only medrese-side role
 * the matrix resolves, so a MEDRESE_NAZIR is refused like a stranger.
 */
const ADMIN_ID = "e6000000-0000-4000-8000-000000000001";
const HEAD_ID = "e6000000-0000-4000-8000-000000000002";
const OTHER_HEAD_ID = "e6000000-0000-4000-8000-000000000003";
const NAZIR_ID = "e6000000-0000-4000-8000-000000000004";
const MANAGER_ID = "e6000000-0000-4000-8000-000000000005";
const STRANGER_ID = "e6000000-0000-4000-8000-000000000006";
const ISIKOGLU_ID = "e6000000-0000-4000-8000-000000000007";
const KILICARSLAN_ID = "e6000000-0000-4000-8000-000000000008";
const KARAOSMANOGLU_ID = "e6000000-0000-4000-8000-000000000009";
const NEWCOMER_ID = "e6000000-0000-4000-8000-00000000000a";
const GHOST_ID = "e6000000-0000-4000-8000-00000000000b";
const UNKNOWN_ID = "e6000000-0000-4000-8000-00000000ffff";
const TALEBE = [1, 2, 3, 4, 5].map(
  (n) => `e6000000-0000-4000-8000-0000000001${n.toString().padStart(2, "0")}`
);

const PEOPLE = [
  {
    id: ISIKOGLU_ID,
    email: "m.isikoglu@example.com",
    givenName: "Mehmet Emin",
    familyName: "Işıkoğlu",
  },
  {
    id: KILICARSLAN_ID,
    email: "a.kilicarslan@example.com",
    givenName: "Ayşe Nur",
    familyName: "Kılıçarslan",
  },
  {
    id: KARAOSMANOGLU_ID,
    email: "a.karaosmanoglu@example.com",
    givenName: "Abdülhamit",
    familyName: "Karaosmanoğlu",
  },
];

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Medrese courses (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let madrasahId: string;
  let otherMadrasahId: string;
  let nuruId: string;
  let fatihId: string;
  let foreignKoskId: string;
  let hiddenKoskId: string;
  let revokedKoskId: string;
  let binaId: string;
  let maksudId: string;
  let foreignCourseId: string;
  let hiddenCourseId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const base = (id = madrasahId) => `/madrasahs/${id}`;
  const list = (sub: string, query = "", id = madrasahId) =>
    http()
      .get(`${base(id)}/courses${query}`)
      .set("Authorization", auth(sub));
  const open = (sub: string, body: unknown, id = madrasahId) =>
    http()
      .post(`${base(id)}/courses`)
      .set("Authorization", auth(sub))
      .send(body as object);
  const replace = (sub: string, courseId: string, body: unknown) =>
    http()
      .put(`${base()}/courses/${courseId}/muderrises`)
      .set("Authorization", auth(sub))
      .send(body as object);
  const hide = (sub: string, courseId: string) =>
    http()
      .post(`${base()}/courses/${courseId}/hide`)
      .set("Authorization", auth(sub));

  const courseRow = async (id: string) =>
    (await db().select().from(courses).where(eq(courses.id, id)))[0];
  const audits = (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));
  const heldMuderris = async (courseId: string) =>
    (
      await db()
        .select({
          userId: roleAssignments.userId,
          isImam: roleAssignments.isImam,
        })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
            eq(roleAssignments.scopeId, courseId),
            isNull(roleAssignments.revokedAt)
          )
        )
        .orderBy(asc(roleAssignments.userId))
    ).map((r) => `${r.userId}${r.isImam ? " imam" : ""}`);
  const names = (body: { muderris: { name: string; isImam: boolean }[] }) =>
    body.muderris.map((m) => `${m.name}${m.isImam ? " (imam)" : ""}`);

  const clean = () =>
    dbUtils.cleanTables(
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await clean();
    await db().insert(users).values(PEOPLE);
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
    });
    await assignRole(db(), {
      userId: OTHER_HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: otherMadrasahId,
    });
    await assignRole(db(), {
      userId: NAZIR_ID,
      role: ASSIGNED_ROLES.MEDRESE_NAZIR,
      scopeId: madrasahId,
      grantedBy: HEAD_ID,
    });

    const [nuru, fatih, foreign, hiddenKosk, revoked] = await db()
      .insert(kosks)
      .values([
        {
          ownerId: MANAGER_ID,
          name: "Nûruosmaniye Köşkü",
          field: "Arapça dil ilimleri",
        },
        { ownerId: MANAGER_ID, name: "Fatih Köşkü", field: "Fıkıh" },
        { ownerId: MANAGER_ID, name: "Hak vermeyen Köşk" },
        { ownerId: MANAGER_ID, name: "Gizli Köşk", archivedAt: new Date() },
        { ownerId: MANAGER_ID, name: "Hakkı geri alınan Köşk" },
      ])
      .returning();
    [nuruId, fatihId, foreignKoskId, hiddenKoskId, revokedKoskId] = [
      nuru,
      fatih,
      foreign,
      hiddenKosk,
      revoked,
    ].map((k) => k.id);
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: nuruId,
    });
    await db()
      .insert(madrasahKoskHosting)
      .values([
        { madrasahId, koskId: nuruId, grantedBy: ADMIN_ID },
        { madrasahId, koskId: fatihId, grantedBy: ADMIN_ID },
        { madrasahId, koskId: hiddenKoskId, grantedBy: ADMIN_ID },
        {
          madrasahId,
          koskId: revokedKoskId,
          grantedBy: ADMIN_ID,
          revokedAt: new Date(),
          revokedBy: ADMIN_ID,
        },
        {
          madrasahId: otherMadrasahId,
          koskId: foreignKoskId,
          grantedBy: ADMIN_ID,
        },
      ]);

    const seeded = await db()
      .insert(courses)
      .values([
        {
          koskId: nuruId,
          authorId: MANAGER_ID,
          title: "Bina ve İzhar Şerhi",
          madrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: nuruId,
          authorId: MANAGER_ID,
          title: "Maksûd şerhi",
          madrasahId,
          status: CourseStatus.DRAFT,
        },
        {
          koskId: fatihId,
          authorId: MANAGER_ID,
          title: "Mantığa giriş",
          madrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: nuruId,
          authorId: MANAGER_ID,
          title: "Başka medresenin dersi",
          madrasahId: otherMadrasahId,
          status: CourseStatus.PUBLISHED,
        },
        {
          koskId: nuruId,
          authorId: MANAGER_ID,
          title: "Gizlenmiş ders",
          madrasahId,
          status: CourseStatus.PUBLISHED,
          archivedAt: new Date(),
          archivedBy: MANAGER_ID,
        },
      ])
      .returning();
    [binaId, maksudId, , foreignCourseId, hiddenCourseId] = seeded.map(
      (c) => c.id
    );

    await db()
      .insert(courseMuderris)
      .values([
        {
          courseId: binaId,
          userId: ISIKOGLU_ID,
          name: "Mehmet Emin Işıkoğlu",
          orderIndex: 0,
        },
        {
          courseId: binaId,
          userId: KARAOSMANOGLU_ID,
          name: "Abdülhamit Karaosmanoğlu",
          orderIndex: 1,
        },
        // A müderris shown by name alone: no account behind the row.
        {
          courseId: maksudId,
          userId: null,
          name: "Konuk Müderris",
          orderIndex: 9,
        },
      ]);
    await assignRole(db(), {
      userId: ISIKOGLU_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: binaId,
      isImam: true,
    });
    await assignRole(db(), {
      userId: KARAOSMANOGLU_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: binaId,
    });
    await db()
      .insert(enrollments)
      .values([
        { userId: TALEBE[0], courseId: binaId },
        { userId: TALEBE[1], courseId: binaId },
        {
          userId: TALEBE[2],
          courseId: binaId,
          status: EnrollmentStatus.COMPLETED,
        },
        {
          userId: TALEBE[3],
          courseId: binaId,
          status: EnrollmentStatus.PENDING,
        },
        {
          userId: TALEBE[4],
          courseId: binaId,
          status: EnrollmentStatus.PENDING,
        },
      ]);
  });

  afterAll(async () => {
    await clean();
    await app.close();
  });

  describe("the köşks the medrese may open courses in", () => {
    const hostingKosks = (sub: string, id = madrasahId) =>
      http()
        .get(`${base(id)}/hosting-kosks`)
        .set("Authorization", auth(sub));

    it("lists the köşks that hold a right for it, with their field and the medrese's courses there", async () => {
      const res = await hostingKosks(HEAD_ID).expect(200);
      // Not the other medrese's köşk, not the one whose right was withdrawn,
      // not the hidden one. Nûruosmaniye holds two of the medrese's courses
      // (the hidden one is not counted), Fatih one.
      expect(res.body).toEqual([
        { id: fatihId, name: "Fatih Köşkü", field: "Fıkıh", courseCount: 1 },
        {
          id: nuruId,
          name: "Nûruosmaniye Köşkü",
          field: "Arapça dil ilimleri",
          courseCount: 2,
        },
      ]);
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone, and 404 for an unknown medrese", async () => {
      await hostingKosks(ADMIN_ID).expect(200);
      for (const sub of [NAZIR_ID, MANAGER_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await hostingKosks(sub).expect(403);
      }
      await http().get(`${base()}/hosting-kosks`).expect(401);
      await hostingKosks(STRANGER_ID, UNKNOWN_ID).expect(404);
    });
  });

  describe("the course list", () => {
    it("carries what nazir/07 shows: the talebe, the waiting applications, the opening date and the müderrisler with their accounts", async () => {
      const res = await list(HEAD_ID).expect(200);
      expect(res.body.map((c: { title: string }) => c.title)).toEqual([
        "Bina ve İzhar Şerhi",
        "Maksûd şerhi",
        "Mantığa giriş",
      ]);
      const [bina, maksud] = res.body;
      expect(bina).toMatchObject({
        id: binaId,
        koskId: nuruId,
        koskName: "Nûruosmaniye Köşkü",
        status: "PUBLISHED",
        requiresApproval: false,
        closed: false,
        studentCount: 2,
        pendingCount: 2,
        muderris: [
          {
            userId: ISIKOGLU_ID,
            name: "Mehmet Emin Işıkoğlu",
            email: "m.isikoglu@example.com",
            isImam: true,
          },
          {
            userId: KARAOSMANOGLU_ID,
            name: "Abdülhamit Karaosmanoğlu",
            email: "a.karaosmanoglu@example.com",
            isImam: false,
          },
        ],
      });
      expect(new Date(bina.createdAt).getTime()).toBeGreaterThan(
        Date.now() - 600_000
      );
      expect(maksud).toMatchObject({
        status: "DRAFT",
        studentCount: 0,
        pendingCount: 0,
        muderris: [
          { userId: null, name: "Konuk Müderris", email: null, isImam: false },
        ],
      });
    });

    it("narrows by köşk and by status, and refuses a filter it does not know", async () => {
      const titles = async (query: string) =>
        (await list(HEAD_ID, query).expect(200)).body.map(
          (c: { title: string }) => c.title
        );
      expect(await titles(`?koskId=${fatihId}`)).toEqual(["Mantığa giriş"]);
      expect(await titles("?status=DRAFT")).toEqual(["Maksûd şerhi"]);
      expect(await titles(`?koskId=${nuruId}&status=PUBLISHED`)).toEqual([
        "Bina ve İzhar Şerhi",
      ]);
      expect(await titles(`?koskId=${fatihId}&status=DRAFT`)).toEqual([]);
      await list(HEAD_ID, "?status=HIDDEN").expect(400);
      await list(HEAD_ID, "?koskId=not-a-uuid").expect(400);
    });
  });

  describe("opening a course", () => {
    const body = (over: Record<string, unknown> = {}) => ({
      koskId: nuruId,
      title: "  Maksûd okumaları ",
      muderrisUserIds: [KILICARSLAN_ID, KARAOSMANOGLU_ID],
      imamUserId: KARAOSMANOGLU_ID,
      ...over,
    });
    const courseCount = async () => (await db().select().from(courses)).length;

    it("opens a DRAFT course of the medrese with its müderrisler, imam and an audit row", async () => {
      const before = await courseCount();
      const res = await open(HEAD_ID, body()).expect(201);
      expect(res.body).toMatchObject({
        title: "Maksûd okumaları",
        koskId: nuruId,
        koskName: "Nûruosmaniye Köşkü",
        status: "DRAFT",
        requiresApproval: false,
        closed: false,
        studentCount: 0,
        pendingCount: 0,
      });
      expect(names(res.body)).toEqual([
        "Ayşe Nur Kılıçarslan",
        "Abdülhamit Karaosmanoğlu (imam)",
      ]);
      expect(await courseCount()).toBe(before + 1);

      const row = await courseRow(res.body.id);
      expect(row).toMatchObject({
        madrasahId,
        koskId: nuruId,
        authorId: HEAD_ID,
        status: CourseStatus.DRAFT,
      });
      expect(await heldMuderris(res.body.id)).toEqual(
        [KILICARSLAN_ID, `${KARAOSMANOGLU_ID} imam`].sort()
      );
      const [audit, ...rest] = await audits("course.open");
      expect(rest).toEqual([]);
      expect(audit).toMatchObject({
        actorId: HEAD_ID,
        entityId: res.body.id,
      });
      expect(audit.details).toMatchObject({
        madrasahId,
        koskId: nuruId,
        imamUserId: KARAOSMANOGLU_ID,
      });

      // The list shows it, and the müderris it names can open the draft that a
      // stranger cannot.
      expect(
        (await list(HEAD_ID).expect(200)).body.map((c: { id: string }) => c.id)
      ).toContain(res.body.id);
      await http()
        .get(`/courses/${res.body.id}`)
        .set("Authorization", auth(KILICARSLAN_ID))
        .expect(200);
      await http()
        .get(`/courses/${res.body.id}`)
        .set("Authorization", auth(STRANGER_ID))
        .expect(404);
    });

    it("makes a lone müderris the imam", async () => {
      const res = await open(
        HEAD_ID,
        body({ muderrisUserIds: [KILICARSLAN_ID], imamUserId: undefined })
      ).expect(201);
      expect(names(res.body)).toEqual(["Ayşe Nur Kılıçarslan (imam)"]);
      expect(await heldMuderris(res.body.id)).toEqual([
        `${KILICARSLAN_ID} imam`,
      ]);
    });

    it("keeps what was asked for the two switches, and lets the medrese's policies force them on", async () => {
      const asked = await open(
        HEAD_ID,
        body({ closedCourse: true, requiresApproval: true })
      ).expect(201);
      expect(asked.body).toMatchObject({
        closed: true,
        requiresApproval: true,
      });

      await db().insert(madrasahSettings).values({
        madrasahId,
        policyAlwaysApproval: true,
        policyClosedCourseRequired: true,
        updatedBy: HEAD_ID,
      });
      const forced = await open(
        HEAD_ID,
        body({ closedCourse: false, requiresApproval: false })
      ).expect(201);
      expect(forced.body).toMatchObject({
        closed: true,
        requiresApproval: true,
      });
      expect(await courseRow(forced.body.id)).toMatchObject({
        closed: true,
        requiresApproval: true,
      });
    });

    it.each([
      ["a köşk that gave the medrese no right", () => foreignKoskId],
      ["a köşk whose right was withdrawn", () => revokedKoskId],
      ["a köşk that is hidden", () => hiddenKoskId],
      ["a köşk that does not exist", () => UNKNOWN_ID],
    ])("refuses %s with 403 and writes nothing", async (_what, koskOf) => {
      const before = await courseCount();
      const res = await open(HEAD_ID, body({ koskId: koskOf() })).expect(403);
      expect(res.body.code).toBe("HOSTING_RIGHT_REQUIRED");
      expect(await courseCount()).toBe(before);
      expect(await audits("course.open")).toHaveLength(0);
    });

    it.each([
      [
        "several müderrisler and no imam",
        { imamUserId: undefined },
        "COURSE_IMAM_REQUIRED",
      ],
      [
        "an imam who is not listed",
        { imamUserId: ISIKOGLU_ID },
        "COURSE_IMAM_NOT_LISTED",
      ],
      [
        "an account listed twice",
        { muderrisUserIds: [KILICARSLAN_ID, KILICARSLAN_ID.toUpperCase()] },
        "MUDERRIS_DUPLICATE_USER",
      ],
      ["no müderris", { muderrisUserIds: [] }, undefined],
      ["a blank title", { title: "   " }, undefined],
      ["a title of one letter", { title: "M" }, undefined],
      ["a müderris that is no id", { muderrisUserIds: ["ali"] }, undefined],
      ["a field the form does not have", { status: "PUBLISHED" }, undefined],
    ])("rejects %s with 400 and writes nothing", async (_what, over, code) => {
      const before = await courseCount();
      const res = await open(HEAD_ID, body(over)).expect(400);
      if (code) expect(res.body.code).toBe(code);
      expect(await courseCount()).toBe(before);
      expect(await audits("course.open")).toHaveLength(0);
    });

    it("refuses a müderris neither the app nor the realm knows with 404 and writes nothing", async () => {
      const before = await courseCount();
      const res = await open(
        HEAD_ID,
        body({
          muderrisUserIds: [KILICARSLAN_ID, NEWCOMER_ID],
          imamUserId: KILICARSLAN_ID,
        })
      ).expect(404);
      expect(res.body.code).toBe("MUDERRIS_UNKNOWN_USER");
      expect(await courseCount()).toBe(before);
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone — a köşk's nazım gets 403 — and 404 for an unknown or hidden medrese", async () => {
      for (const sub of [NAZIR_ID, MANAGER_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await open(sub, body()).expect(403);
      }
      await http().post(`${base()}/courses`).send(body()).expect(401);
      expect(await courseCount()).toBe(5);
      await open(HEAD_ID, body(), UNKNOWN_ID).expect(404);
      await open(ADMIN_ID, body()).expect(201);

      await db()
        .update(madrasahs)
        .set({ archivedAt: new Date() })
        .where(eq(madrasahs.id, madrasahId));
      const res = await open(HEAD_ID, body()).expect(404);
      expect(res.body.code).toBe("MADRASAH_NOT_FOUND");
    });
  });

  describe("changing the müderrisler", () => {
    const versionOf = async (id: string) => (await courseRow(id)).version;

    it("replaces the list: who leaves loses the role, who joins gets it, the imam is the one named", async () => {
      await http()
        .get(`/courses/${binaId}/enrollments`)
        .set("Authorization", auth(ISIKOGLU_ID))
        .expect(200);
      const version = await versionOf(binaId);

      const res = await replace(HEAD_ID, binaId, {
        muderrisUserIds: [KARAOSMANOGLU_ID, KILICARSLAN_ID],
        imamUserId: KILICARSLAN_ID,
      }).expect(200);

      expect(names(res.body)).toEqual([
        "Abdülhamit Karaosmanoğlu",
        "Ayşe Nur Kılıçarslan (imam)",
      ]);
      expect(
        res.body.muderris.map((m: { userId: string }) => m.userId)
      ).toEqual([KARAOSMANOGLU_ID, KILICARSLAN_ID]);
      expect(res.body).toMatchObject({ studentCount: 2, pendingCount: 2 });
      expect(await heldMuderris(binaId)).toEqual(
        [KARAOSMANOGLU_ID, `${KILICARSLAN_ID} imam`].sort()
      );
      expect(await versionOf(binaId)).toBe(version + 1);
      // The role is what authorization reads.
      await http()
        .get(`/courses/${binaId}/enrollments`)
        .set("Authorization", auth(ISIKOGLU_ID))
        .expect(403);
      await http()
        .get(`/courses/${binaId}/enrollments`)
        .set("Authorization", auth(KILICARSLAN_ID))
        .expect(200);

      const [audit, ...rest] = await audits("course.muderris.update");
      expect(rest).toEqual([]);
      expect(audit).toMatchObject({ actorId: HEAD_ID, entityId: binaId });
      expect(audit.details).toEqual({
        madrasahId,
        from: {
          userIds: [ISIKOGLU_ID, KARAOSMANOGLU_ID],
          imamUserId: ISIKOGLU_ID,
        },
        to: {
          userIds: [KARAOSMANOGLU_ID, KILICARSLAN_ID],
          imamUserId: KILICARSLAN_ID,
        },
      });
    });

    it("moves the imam among the same müderrisler", async () => {
      const res = await replace(HEAD_ID, binaId, {
        muderrisUserIds: [ISIKOGLU_ID, KARAOSMANOGLU_ID],
        imamUserId: KARAOSMANOGLU_ID,
      }).expect(200);
      expect(names(res.body)).toEqual([
        "Mehmet Emin Işıkoğlu",
        "Abdülhamit Karaosmanoğlu (imam)",
      ]);
      expect(await heldMuderris(binaId)).toEqual(
        [ISIKOGLU_ID, `${KARAOSMANOGLU_ID} imam`].sort()
      );
    });

    it("makes the last müderris the imam without being told", async () => {
      const res = await replace(HEAD_ID, binaId, {
        muderrisUserIds: [KARAOSMANOGLU_ID],
      }).expect(200);
      expect(names(res.body)).toEqual(["Abdülhamit Karaosmanoğlu (imam)"]);
      expect(await heldMuderris(binaId)).toEqual([`${KARAOSMANOGLU_ID} imam`]);
    });

    it("writes nothing for a list and an imam the course already has", async () => {
      const version = await versionOf(binaId);
      await replace(HEAD_ID, binaId, {
        muderrisUserIds: [KARAOSMANOGLU_ID, ISIKOGLU_ID],
        imamUserId: ISIKOGLU_ID,
      }).expect(200);
      expect(await versionOf(binaId)).toBe(version);
      expect(await audits("course.muderris.update")).toHaveLength(0);
    });

    it("leaves a müderris shown by name alone, and saves a müderris who stays even if nobody knows the account any more", async () => {
      await db().insert(courseMuderris).values({
        courseId: maksudId,
        userId: GHOST_ID,
        name: "Eski Müderris",
        orderIndex: 0,
      });
      await assignRole(db(), {
        userId: GHOST_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeId: maksudId,
        isImam: true,
      });

      const res = await replace(HEAD_ID, maksudId, {
        muderrisUserIds: [GHOST_ID, KILICARSLAN_ID],
        imamUserId: GHOST_ID,
      }).expect(200);
      expect(names(res.body)).toEqual([
        "Eski Müderris (imam)",
        "Ayşe Nur Kılıçarslan",
        "Konuk Müderris",
      ]);
      // The same row, not a new one named after the account.
      expect(
        (
          await db()
            .select()
            .from(courseMuderris)
            .where(eq(courseMuderris.userId, GHOST_ID))
        ).length
      ).toBe(1);
    });

    it.each([
      [
        "several müderrisler and no imam",
        { muderrisUserIds: [ISIKOGLU_ID, KILICARSLAN_ID] },
        "COURSE_IMAM_REQUIRED",
      ],
      [
        "an imam who is not listed",
        { muderrisUserIds: [KILICARSLAN_ID], imamUserId: ISIKOGLU_ID },
        "COURSE_IMAM_NOT_LISTED",
      ],
      [
        "an account listed twice",
        { muderrisUserIds: [ISIKOGLU_ID, ISIKOGLU_ID.toUpperCase()] },
        "MUDERRIS_DUPLICATE_USER",
      ],
      ["no müderris at all", { muderrisUserIds: [] }, undefined],
      ["a field the dialog does not have", { muderrises: [] }, undefined],
    ])("rejects %s with 400 and changes nothing", async (_what, payload, code) => {
      const version = await versionOf(binaId);
      const res = await replace(HEAD_ID, binaId, payload).expect(400);
      if (code) expect(res.body.code).toBe(code);
      expect(await versionOf(binaId)).toBe(version);
      expect(await heldMuderris(binaId)).toEqual(
        [KARAOSMANOGLU_ID, `${ISIKOGLU_ID} imam`].sort()
      );
      expect(await audits("course.muderris.update")).toHaveLength(0);
    });

    it("refuses a new müderris neither the app nor the realm knows with 404", async () => {
      const res = await replace(HEAD_ID, binaId, {
        muderrisUserIds: [ISIKOGLU_ID, NEWCOMER_ID],
        imamUserId: ISIKOGLU_ID,
      }).expect(404);
      expect(res.body.code).toBe("MUDERRIS_UNKNOWN_USER");
    });

    it("answers 404 for a course that is not the medrese's, is hidden, or does not exist", async () => {
      for (const courseId of [foreignCourseId, hiddenCourseId, UNKNOWN_ID]) {
        const res = await replace(HEAD_ID, courseId, {
          muderrisUserIds: [KILICARSLAN_ID],
        }).expect(404);
        expect(res.body.code).toBe("MADRASAH_COURSE_NOT_FOUND");
      }
      expect(await heldMuderris(foreignCourseId)).toEqual([]);
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone — a köşk's nazım gets 403", async () => {
      const payload = { muderrisUserIds: [KILICARSLAN_ID] };
      for (const sub of [NAZIR_ID, MANAGER_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await replace(sub, binaId, payload).expect(403);
      }
      await http()
        .put(`${base()}/courses/${binaId}/muderrises`)
        .send(payload)
        .expect(401);
      expect(await heldMuderris(binaId)).toEqual(
        [KARAOSMANOGLU_ID, `${ISIKOGLU_ID} imam`].sort()
      );
      await replace(ADMIN_ID, binaId, payload).expect(200);
    });
  });

  describe("hiding a course", () => {
    const koskShelf = async () =>
      (
        await http()
          .get(`/kosks/${nuruId}/courses`)
          .set("Authorization", auth(TALEBE[0]))
          .expect(200)
      ).body.map((c: { id: string }) => c.id);

    it("hides it, stamps the hider, and leaves it in the medrese's archive for them to bring back", async () => {
      const version = (await courseRow(binaId)).version;
      expect(await koskShelf()).toContain(binaId);

      await hide(HEAD_ID, binaId).expect(204);

      expect(await courseRow(binaId)).toMatchObject({
        archivedBy: HEAD_ID,
        version: version + 1,
      });
      expect((await courseRow(binaId)).archivedAt).not.toBeNull();
      expect(
        (await list(HEAD_ID).expect(200)).body.map((c: { id: string }) => c.id)
      ).not.toContain(binaId);
      expect(await koskShelf()).not.toContain(binaId);
      // Nothing is deleted: the talebe and the müderrisler are still there.
      expect(await db().select().from(enrollments)).toHaveLength(5);
      expect(await heldMuderris(binaId)).toHaveLength(2);
      const [audit, ...rest] = await audits("course.hide");
      expect(rest).toEqual([]);
      expect(audit).toMatchObject({ actorId: HEAD_ID, entityId: binaId });

      const archive = await http()
        .get(`${base()}/archive?types=course`)
        .set("Authorization", auth(HEAD_ID))
        .expect(200);
      expect(
        archive.body.items.find((i: { id: string }) => i.id === binaId)
      ).toMatchObject({ type: "course", canRestore: true, studentCount: 2 });
      await http()
        .post(`/archive/course/${binaId}/restore`)
        .set("Authorization", auth(HEAD_ID))
        .expect(200);
      expect(
        (await list(HEAD_ID).expect(200)).body.map((c: { id: string }) => c.id)
      ).toContain(binaId);
    });

    it("keeps the first hider's stamp: hiding a hidden course is 409", async () => {
      await hide(HEAD_ID, binaId).expect(204);
      const res = await hide(ADMIN_ID, binaId).expect(409);
      expect(res.body.code).toBe("MADRASAH_COURSE_ALREADY_HIDDEN");
      expect((await courseRow(binaId)).archivedBy).toBe(HEAD_ID);
      expect(await audits("course.hide")).toHaveLength(1);
      // A course hidden before this call, by anyone, answers the same.
      await hide(HEAD_ID, hiddenCourseId).expect(409);
    });

    it("answers 404 for a course that is not the medrese's or does not exist, and does not touch it", async () => {
      for (const courseId of [foreignCourseId, UNKNOWN_ID]) {
        const res = await hide(HEAD_ID, courseId).expect(404);
        expect(res.body.code).toBe("MADRASAH_COURSE_NOT_FOUND");
      }
      expect((await courseRow(foreignCourseId)).archivedAt).toBeNull();
      expect(await audits("course.hide")).toHaveLength(0);
    });

    it("is the başmüderris' and SYSTEM_ADMIN's alone — a köşk's nazım gets 403", async () => {
      for (const sub of [NAZIR_ID, MANAGER_ID, STRANGER_ID, OTHER_HEAD_ID]) {
        await hide(sub, binaId).expect(403);
      }
      await http().post(`${base()}/courses/${binaId}/hide`).expect(401);
      expect((await courseRow(binaId)).archivedAt).toBeNull();
      await hide(ADMIN_ID, binaId).expect(204);
      expect(await courseRow(binaId)).toMatchObject({ archivedBy: ADMIN_ID });
    });
  });
});
