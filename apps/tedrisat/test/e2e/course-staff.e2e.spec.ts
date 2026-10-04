import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { openKosk } from "../helpers/open-scopes.helper";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";

/**
 * MDRS-176 (nizam/33, nizam/34, nizam/56): `PUT /courses/:id/muderris`
 * replaces the müderris list and picks the imam, `POST /lessons/:id/cancel`
 * cancels one session, and a closed course keeps its recordings from the public.
 */
const AHMED = "d0000000-0000-4000-8000-000000000001";
const HASAN = "d0000000-0000-4000-8000-000000000002";
const ZEYD = "d0000000-0000-4000-8000-000000000003";

const payload = (extra: Record<string, unknown> = {}) => ({
  title: "Bina ve İzhar Şerhi",
  status: "PUBLISHED",
  muderris: [
    { userId: AHMED, name: "Ahmed" },
    { userId: HASAN, name: "Hasan" },
  ],
  weeks: [
    {
      weekNumber: 1,
      title: "Hafta 1",
      lessons: [
        {
          title: "Birinci celse",
          type: "LIVE",
          durationMinutes: 60,
          scheduledAt: "2027-01-05T18:00:00.000Z",
        },
      ],
    },
  ],
  resources: [],
  ...extra,
});

describe("course müderris list, imam and session cancellation (e2e)", () => {
  let app: INestApplication;
  let adminApp: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;

  const http = () => request(app.getHttpServer());

  const create = async (extra: Record<string, unknown> = {}) =>
    (
      await http()
        .post(`/kosks/${koskId}/courses`)
        .send(payload(extra))
        .expect(201)
    ).body as {
      id: string;
      version: number;
      weeks: { lessons: { id: string }[] }[];
      muderris: { userId: string; isImam: boolean }[];
    };

  const imamOf = async (courseId: string) =>
    (
      await databaseService.db
        .select()
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.scopeId, courseId),
            eq(roleAssignments.role, ASSIGNED_ROLES.MUDERRIS),
            eq(roleAssignments.isImam, true)
          )
        )
    )
      .filter((r) => r.revokedAt === null)
      .map((r) => r.userId);

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    adminApp = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    await databaseService.db
      .insert(users)
      .values([TEST_USER_ID, AHMED, HASAN, ZEYD].map((id) => ({ id })));
    // Opening a köşk is SYSTEM_ADMIN only (2026-10-02). The admin signs with
    // TEST_USER_ID's own `sub`, so every request below runs as that manager.
    const kosk = await openKosk(adminApp);
    koskId = kosk.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "users");
    await app.close();
    await adminApp.close();
  });

  describe("PUT /courses/:id/muderris", () => {
    it("reports the imam on the course detail", async () => {
      const course = await create();
      const detail = await http().get(`/courses/${course.id}`).expect(200);
      expect(
        detail.body.muderris.map((m: { userId: string; isImam: boolean }) => [
          m.userId,
          m.isImam,
        ])
      ).toEqual([
        [AHMED, true],
        [HASAN, false],
      ]);
    });

    it("adds, drops and re-elects the imam in one write, and audits it", async () => {
      const course = await create();
      const res = await http()
        .put(`/courses/${course.id}/muderris`)
        .send({
          version: course.version,
          muderris: [
            { userId: HASAN, name: "Hasan" },
            { userId: ZEYD, name: "Zeyd" },
          ],
          imamUserId: ZEYD,
        })
        .expect(200);
      expect(res.body.courseVersion).toBe(course.version + 1);
      expect(
        res.body.muderris.map((m: { userId: string; isImam: boolean }) => [
          m.userId,
          m.isImam,
        ])
      ).toEqual([
        [HASAN, false],
        [ZEYD, true],
      ]);
      expect(await imamOf(course.id)).toEqual([ZEYD]);

      const detail = await http().get(`/courses/${course.id}`).expect(200);
      expect(detail.body.muderris).toHaveLength(2);

      const audit = await databaseService.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "course.muderris_update"));
      expect(audit).toHaveLength(1);
      expect(audit[0].entityId).toBe(course.id);
      expect(audit[0].details).toMatchObject({ imamUserId: ZEYD });
    });

    it("refuses an empty list, an imam outside the list and a duplicate", async () => {
      const course = await create();
      const put = (body: Record<string, unknown>) =>
        http()
          .put(`/courses/${course.id}/muderris`)
          .send({ version: course.version, ...body });
      await put({ muderris: [], imamUserId: AHMED }).expect(400);
      await put({
        muderris: [{ userId: AHMED, name: "Ahmed" }],
        imamUserId: HASAN,
      })
        .expect(400)
        .expect((res) => expect(res.body.code).toBe("MUDERRIS_LIST_INVALID"));
      await put({
        muderris: [
          { userId: AHMED, name: "Ahmed" },
          { userId: AHMED, name: "Ahmed" },
        ],
        imamUserId: AHMED,
      })
        .expect(400)
        .expect((res) => expect(res.body.code).toBe("MUDERRIS_DUPLICATE_USER"));
    });

    it("refuses a stale version with 409", async () => {
      const course = await create();
      await http()
        .put(`/courses/${course.id}/muderris`)
        .send({
          version: course.version + 5,
          muderris: [{ userId: AHMED, name: "Ahmed" }],
          imamUserId: AHMED,
        })
        .expect(409)
        .expect((res) => expect(res.body.code).toBe("COURSE_VERSION_CONFLICT"));
    });

    it("refuses an account that never signed in", async () => {
      const course = await create();
      await http()
        .put(`/courses/${course.id}/muderris`)
        .send({
          version: course.version,
          muderris: [
            { userId: AHMED, name: "Ahmed" },
            { userId: "d0000000-0000-4000-8000-0000000000ff", name: "Yok" },
          ],
          imamUserId: AHMED,
        })
        .expect(404)
        .expect((res) => expect(res.body.code).toBe("MUDERRIS_UNKNOWN_USER"));
    });
  });

  describe("POST /lessons/:id/cancel", () => {
    it("marks the session cancelled, keeps it in the programme and audits it", async () => {
      const course = await create();
      const lessonId = course.weeks[0].lessons[0].id;
      const res = await http()
        .post(`/lessons/${lessonId}/cancel`)
        .send({ version: course.version, reason: "Müderris hasta" })
        .expect(200);
      expect(res.body.cancelledAt).toEqual(expect.any(String));
      expect(res.body.cancelReason).toBe("Müderris hasta");
      expect(res.body.courseVersion).toBe(course.version + 1);

      const detail = await http().get(`/courses/${course.id}`).expect(200);
      expect(detail.body.weeks[0].lessons).toHaveLength(1);
      expect(detail.body.weeks[0].lessons[0].cancelledAt).toEqual(
        expect.any(String)
      );

      const audit = await databaseService.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "lesson.cancel"));
      expect(audit).toHaveLength(1);
      expect(audit[0].entityId).toBe(lessonId);
    });

    it("answers 409 for a session that is cancelled already", async () => {
      const course = await create();
      const lessonId = course.weeks[0].lessons[0].id;
      const first = await http()
        .post(`/lessons/${lessonId}/cancel`)
        .send({ version: course.version })
        .expect(200);
      await http()
        .post(`/lessons/${lessonId}/cancel`)
        .send({ version: first.body.courseVersion })
        .expect(409)
        .expect((res) =>
          expect(res.body.code).toBe("LESSON_ALREADY_CANCELLED")
        );
    });
  });

  describe("closed course", () => {
    it("is stored and read back, with the cover word, apart from the approval setting", async () => {
      const course = await create({ isClosed: true, coverLabel: "Sarf" });
      const detail = await http().get(`/courses/${course.id}`).expect(200);
      expect(detail.body).toMatchObject({
        isClosed: true,
        coverLabel: "Sarf",
        requiresApproval: false,
      });
    });

    it("is switched on and off by PATCH", async () => {
      const course = await create();
      await http()
        .patch(`/courses/${course.id}`)
        .send({ isClosed: true })
        .expect(200)
        .expect((res) => expect(res.body.isClosed).toBe(true));
      await http()
        .patch(`/courses/${course.id}`)
        .send({ isClosed: false })
        .expect(200)
        .expect((res) => expect(res.body.isClosed).toBe(false));
    });
  });
});
