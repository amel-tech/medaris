import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseRepository } from "../../src/course/course.repository";
import { CourseService } from "../../src/course/course.service";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { EnrollmentNotFoundError } from "../../src/course/errors/enrollment-not-found.error";
import { EnrollmentStateError } from "../../src/course/errors/enrollment-state.error";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
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
 * MDRS-105: the course team works from the matrix, not from köşk ownership.
 *
 * - `EDIT` (köşk manager, müderris): the course, its syllabus, its sessions.
 * - `ASSIGN_MUDERRIS` (köşk manager only): the müderris list inside a
 *   whole-course save — a müderris whose save changes it gets 403.
 * - `MANAGE_ENROLLMENTS` (köşk manager, müderris): the roster, approve,
 *   reject, complete or reopen, and take a talebe out with a reason.
 * - The talebe: progress only — never the status — and leaving the course or
 *   withdrawing a pending request.
 *
 * Real `AuthGuard` with minted tokens, one identity per role, as in the
 * MDRS-103 block of `course.e2e.spec.ts`. `UserSyncInterceptor` caches the
 * callers it has recorded per process, so the `users` rows these tests rely
 * on are inserted directly in `beforeEach` rather than left to it.
 */
const ADMIN_ID = "f0000000-0000-4000-8000-000000000001";
const MANAGER_ID = "f0000000-0000-4000-8000-000000000002";
const MUDERRIS_ID = "f0000000-0000-4000-8000-000000000003";
const TALEBE_ID = "f0000000-0000-4000-8000-000000000004";
const PENDING_ID = "f0000000-0000-4000-8000-000000000005";
const COMPLETED_ID = "f0000000-0000-4000-8000-000000000006";
const STRANGER_ID = "f0000000-0000-4000-8000-000000000007";
/** Has signed in once, teaches nothing yet. */
const NEW_MUDERRIS_ID = "f0000000-0000-4000-8000-000000000008";
/** Has never signed in: no `users` row. */
const GHOST_ID = "f0000000-0000-4000-8000-000000000009";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

type CourseBody = {
  title: string;
  status: string;
  version: number;
  weeks: {
    id: string;
    weekNumber: number;
    title: string;
    lessons: {
      id: string;
      title: string;
      type: string;
      durationMinutes: number | null;
    }[];
  }[];
  muderris: {
    id: string;
    userId: string | null;
    name: string;
    title: string | null;
  }[];
};

type MuderrisPayload = {
  id?: string;
  userId?: string;
  name: string;
  title?: string;
};

/** A `PUT /courses/:id` body that saves the course exactly as `body` shows it. */
const replacePayloadFrom = (body: CourseBody) => ({
  title: body.title,
  status: body.status,
  version: body.version,
  weeks: body.weeks.map((w) => ({
    id: w.id,
    weekNumber: w.weekNumber,
    title: w.title,
    lessons: w.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      type: l.type,
      ...(l.durationMinutes != null
        ? { durationMinutes: l.durationMinutes }
        : {}),
    })),
  })),
  muderris: body.muderris.map(
    (m): MuderrisPayload => ({
      id: m.id,
      ...(m.userId ? { userId: m.userId } : {}),
      name: m.name,
      ...(m.title ? { title: m.title } : {}),
    })
  ),
  resources: [],
});

describe("Course team (MDRS-105, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let courseId: string;
  let weekId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) => ({
    get: (url: string) => http().get(url).set("Authorization", auth(sub)),
    post: (url: string) => http().post(url).set("Authorization", auth(sub)),
    put: (url: string) => http().put(url).set("Authorization", auth(sub)),
    patch: (url: string) => http().patch(url).set("Authorization", auth(sub)),
    delete: (url: string) => http().delete(url).set("Authorization", auth(sub)),
  });
  const loadCourse = async (): Promise<CourseBody> =>
    (await as(MANAGER_ID).get(`/courses/${courseId}`).expect(200)).body;
  const enrollmentOf = async (userId: string) => {
    const [row] = await db()
      .select()
      .from(enrollments)
      .where(
        and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
      );
    return row ?? null;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "audit_log", "users");
    await db()
      .insert(users)
      .values(
        [
          MANAGER_ID,
          MUDERRIS_ID,
          TALEBE_ID,
          PENDING_ID,
          COMPLETED_ID,
          STRANGER_ID,
          NEW_MUDERRIS_ID,
        ].map((id) => ({ id }))
      );
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Süleymaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
      grantedBy: MANAGER_ID,
    });
    const [course] = await db()
      .insert(courses)
      .values({
        koskId,
        authorId: MANAGER_ID,
        title: "Bina ve İzhar Şerhi",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseId = course.id;
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Birinci Bab" })
      .returning();
    weekId = week.id;
    await db().insert(lessons).values({
      weekId,
      title: "Açılış",
      type: LessonType.VIDEO,
      durationMinutes: 30,
    });
    await db()
      .insert(courseMuderris)
      .values([
        {
          courseId,
          userId: MUDERRIS_ID,
          name: "Musa Müderris",
          orderIndex: 0,
        },
        // Typed in before MDRS-105: a name, no account.
        { courseId, userId: null, name: "Ahmed Hilmi", orderIndex: 1 },
      ]);
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
    });
    await db()
      .insert(enrollments)
      .values([
        {
          userId: TALEBE_ID,
          courseId,
          status: EnrollmentStatus.ENROLLED,
          progress: 40,
        },
        { userId: PENDING_ID, courseId, status: EnrollmentStatus.PENDING },
        {
          userId: COMPLETED_ID,
          courseId,
          status: EnrollmentStatus.COMPLETED,
          progress: 100,
        },
      ]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...COURSE_TREE_TABLES, "audit_log", "users");
    await app.close();
  });

  describe("content and sessions: EDIT", () => {
    it("lets the müderris edit the course's fields", async () => {
      await as(MUDERRIS_ID)
        .patch(`/courses/${courseId}`)
        .send({ subtitle: "Klasik sarf metni" })
        .expect(200)
        .expect((res) => expect(res.body.subtitle).toBe("Klasik sarf metni"));
    });

    it("lets the müderris save the whole course when the müderris list is unchanged", async () => {
      const payload = replacePayloadFrom(await loadCourse());
      payload.title = "Bina Şerhi";
      payload.weeks[0].lessons[0].title = "Açılış dersi";

      await as(MUDERRIS_ID)
        .put(`/courses/${courseId}`)
        .send(payload)
        .expect(200)
        .expect((res) => {
          expect(res.body.title).toBe("Bina Şerhi");
          expect(res.body.weeks[0].lessons[0].title).toBe("Açılış dersi");
          expect(res.body.muderris).toEqual([
            expect.objectContaining({
              userId: MUDERRIS_ID,
              name: "Musa Müderris",
            }),
            expect.objectContaining({ userId: null, name: "Ahmed Hilmi" }),
          ]);
        });
    });

    it("reads the list in one order everywhere, even when two rows share an index", async () => {
      // Rows written outside `replace` can share `order_index`; the detail
      // and the ASSIGN_MUDERRIS comparison must break the tie the same way,
      // or an untouched list would look reordered and be refused.
      await db()
        .update(courseMuderris)
        .set({ orderIndex: 0 })
        .where(eq(courseMuderris.courseId, courseId));

      await as(MUDERRIS_ID)
        .put(`/courses/${courseId}`)
        .send(replacePayloadFrom(await loadCourse()))
        .expect(200);
    });

    it("lets the müderris add a session", async () => {
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/weeks/${weekId}/lessons`)
        .send({ title: "Şerh", type: LessonType.VIDEO, durationMinutes: 20 })
        .expect(201);
    });

    it("lets the müderris open the course's draft, which talebe still cannot", async () => {
      await db()
        .update(courses)
        .set({ status: CourseStatus.DRAFT })
        .where(eq(courses.id, courseId));
      await as(MUDERRIS_ID).get(`/courses/${courseId}`).expect(200);
      await as(MUDERRIS_ID)
        .patch(`/courses/${courseId}`)
        .send({ subtitle: "Taslakta düzeltme" })
        .expect(200);
      await as(TALEBE_ID).get(`/courses/${courseId}`).expect(404);
    });

    it("refuses the müderris' write to a course the köşk manager has hidden", async () => {
      await db()
        .update(courses)
        .set({ archivedAt: new Date(), archivedBy: MANAGER_ID })
        .where(eq(courses.id, courseId));
      const [{ version }] = await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, courseId));

      await as(MUDERRIS_ID)
        .patch(`/courses/${courseId}`)
        .send({ title: "Gizliyken" })
        .expect(404);
      await as(MUDERRIS_ID)
        .put(`/courses/${courseId}`)
        .send({ title: "Gizliyken", muderris: [] })
        .expect(404);

      const [row] = await db()
        .select()
        .from(courses)
        .where(eq(courses.id, courseId));
      expect(row.title).toBe("Bina ve İzhar Şerhi");
      expect(row.version).toBe(version);
    });

    it("refuses a caller with no role on the course", async () => {
      await as(STRANGER_ID)
        .patch(`/courses/${courseId}`)
        .send({ subtitle: "Ele geçirildi" })
        .expect(403);
      await as(TALEBE_ID)
        .put(`/courses/${courseId}`)
        .send(replacePayloadFrom(await loadCourse()))
        .expect(403);
    });
  });

  describe("the müderris list: ASSIGN_MUDERRIS", () => {
    it.each<[string, (m: MuderrisPayload[]) => MuderrisPayload[]]>([
      [
        "adds a müderris",
        (m) => [...m, { userId: NEW_MUDERRIS_ID, name: "Yeni" }],
      ],
      ["drops a müderris", (m) => m.slice(0, 1)],
      ["reorders the list", (m) => [...m].reverse()],
      ["renames a müderris", (m) => [{ ...m[0], name: "Başka" }, m[1]]],
      [
        "links an account to the name-only row",
        (m) => [m[0], { ...m[1], userId: NEW_MUDERRIS_ID }],
      ],
    ])("refuses the müderris' save that %s, and writes nothing", async (_what, change) => {
      const payload = replacePayloadFrom(await loadCourse());
      payload.title = "Müderris değiştirdi";
      payload.muderris = change(payload.muderris);

      await as(MUDERRIS_ID)
        .put(`/courses/${courseId}`)
        .send(payload)
        .expect(403)
        .expect((res) =>
          expect(res.body.code).toBe("MUDERRIS_ASSIGNMENT_FORBIDDEN")
        );

      const after = await loadCourse();
      expect(after.title).toBe("Bina ve İzhar Şerhi");
      expect(after.muderris.map((m) => m.name)).toEqual([
        "Musa Müderris",
        "Ahmed Hilmi",
      ]);
    });

    it("lets the köşk manager link a signed-in account, which makes them müderris", async () => {
      const payload = replacePayloadFrom(await loadCourse());
      payload.muderris = [
        ...payload.muderris,
        { userId: NEW_MUDERRIS_ID, name: "Yusuf Efendi" },
      ];

      await as(MANAGER_ID)
        .put(`/courses/${courseId}`)
        .send(payload)
        .expect(200)
        .expect((res) => {
          expect(res.body.muderris).toEqual([
            expect.objectContaining({ userId: MUDERRIS_ID }),
            // The name-only row stays, and stays unlinked.
            expect.objectContaining({ userId: null, name: "Ahmed Hilmi" }),
            expect.objectContaining({
              userId: NEW_MUDERRIS_ID,
              name: "Yusuf Efendi",
            }),
          ]);
        });

      // The link is what the role resolver reads.
      await as(NEW_MUDERRIS_ID)
        .patch(`/courses/${courseId}`)
        .send({ subtitle: "Yeni müderrisin notu" })
        .expect(200);
      await as(NEW_MUDERRIS_ID)
        .get(`/courses/${courseId}/enrollments`)
        .expect(200);
    });

    it("takes the role away with the row", async () => {
      const payload = replacePayloadFrom(await loadCourse());
      payload.muderris = payload.muderris.slice(1);

      await as(MANAGER_ID)
        .put(`/courses/${courseId}`)
        .send(payload)
        .expect(200);
      await as(MUDERRIS_ID)
        .patch(`/courses/${courseId}`)
        .send({ subtitle: "Artık müderris değil" })
        .expect(403);
    });

    it("does not let the müderris strip a co-müderris' link by uppercasing the row id", async () => {
      // The ASSIGN_MUDERRIS check compares ids without case; the save must
      // match them the same way, or it deletes the row and re-inserts it
      // without the `userId` the payload left out.
      const [coMuderris] = await db()
        .insert(courseMuderris)
        .values({
          courseId,
          userId: NEW_MUDERRIS_ID,
          name: "Yusuf Efendi",
          orderIndex: 2,
        })
        .returning();
      const payload = replacePayloadFrom(await loadCourse());
      payload.muderris = payload.muderris.map((m) =>
        m.id === coMuderris.id
          ? { id: coMuderris.id.toUpperCase(), name: m.name }
          : m
      );

      await as(MUDERRIS_ID)
        .put(`/courses/${courseId}`)
        .send(payload)
        .expect(200);

      const after = await loadCourse();
      expect(after.muderris).toEqual([
        expect.objectContaining({ userId: MUDERRIS_ID }),
        expect.objectContaining({ userId: null, name: "Ahmed Hilmi" }),
        expect.objectContaining({
          id: coMuderris.id,
          userId: NEW_MUDERRIS_ID,
          name: "Yusuf Efendi",
        }),
      ]);
      await as(NEW_MUDERRIS_ID)
        .get(`/courses/${courseId}/enrollments`)
        .expect(200);
    });

    it("refuses to link an account that has never signed in", async () => {
      const payload = replacePayloadFrom(await loadCourse());
      payload.muderris = [...payload.muderris, { userId: GHOST_ID, name: "?" }];

      await as(MANAGER_ID)
        .put(`/courses/${courseId}`)
        .send(payload)
        .expect(404)
        .expect((res) => expect(res.body.code).toBe("MUDERRIS_UNKNOWN_USER"));
      expect(await loadCourse()).toHaveProperty("muderris.length", 2);
    });

    it("refuses the same account twice", async () => {
      const payload = replacePayloadFrom(await loadCourse());
      payload.muderris = [
        ...payload.muderris,
        { userId: MUDERRIS_ID.toUpperCase(), name: "Musa yine" },
      ];

      await as(MANAGER_ID)
        .put(`/courses/${courseId}`)
        .send(payload)
        .expect(400)
        .expect((res) => expect(res.body.code).toBe("MUDERRIS_DUPLICATE_USER"));
    });

    it("checks links on create as well", async () => {
      const base = {
        title: "Nahiv",
        weeks: [
          {
            weekNumber: 1,
            title: "Giriş",
            lessons: [{ title: "Açılış", type: LessonType.VIDEO }],
          },
        ],
      };
      await as(MANAGER_ID)
        .post(`/kosks/${koskId}/courses`)
        .send({ ...base, muderris: [{ userId: GHOST_ID, name: "?" }] })
        .expect(404);
      await as(MANAGER_ID)
        .post(`/kosks/${koskId}/courses`)
        .send({
          ...base,
          muderris: [
            { userId: NEW_MUDERRIS_ID, name: "Yusuf Efendi" },
            { name: "Yalnız isim" },
          ],
        })
        .expect(201)
        .expect((res) =>
          expect(res.body.muderris).toEqual([
            expect.objectContaining({ userId: NEW_MUDERRIS_ID }),
            expect.objectContaining({ userId: null, name: "Yalnız isim" }),
          ])
        );
    });
  });

  describe("enrollments: MANAGE_ENROLLMENTS", () => {
    it("shows the roster to the team — requests first — and to no one else", async () => {
      for (const sub of [MUDERRIS_ID, MANAGER_ID, ADMIN_ID]) {
        await as(sub)
          .get(`/courses/${courseId}/enrollments`)
          .expect(200)
          .expect((res) =>
            expect(
              res.body.map((e: { userId: string; status: string }) => [
                e.userId,
                e.status,
              ])
            ).toEqual([
              [PENDING_ID, "PENDING"],
              [TALEBE_ID, "ENROLLED"],
              [COMPLETED_ID, "COMPLETED"],
            ])
          );
      }
      for (const sub of [TALEBE_ID, PENDING_ID, STRANGER_ID]) {
        await as(sub).get(`/courses/${courseId}/enrollments`).expect(403);
      }
    });

    it("lets the müderris approve and reject requests", async () => {
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${PENDING_ID}/approve`)
        .expect(201)
        .expect((res) => expect(res.body.status).toBe("ENROLLED"));

      await db()
        .update(enrollments)
        .set({ status: EnrollmentStatus.PENDING })
        .where(eq(enrollments.userId, PENDING_ID));
      await as(MUDERRIS_ID)
        .delete(`/courses/${courseId}/enrollments/${PENDING_ID}`)
        .expect(200);
      expect(await enrollmentOf(PENDING_ID)).toBeNull();
    });

    it("does not turn a completion back into a seat through approve", async () => {
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${COMPLETED_ID}/approve`)
        .expect(409);
      expect(await enrollmentOf(COMPLETED_ID)).toHaveProperty(
        "status",
        EnrollmentStatus.COMPLETED
      );
    });

    it("lets the team complete a course for a talebe, and reopen it", async () => {
      await as(MUDERRIS_ID)
        .patch(`/courses/${courseId}/enrollments/${TALEBE_ID}`)
        .send({ status: "COMPLETED" })
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe("COMPLETED");
          expect(res.body.progress).toBe(40);
        });
      await as(MANAGER_ID)
        .patch(`/courses/${courseId}/enrollments/${TALEBE_ID}`)
        .send({ status: "ENROLLED" })
        .expect(200)
        .expect((res) => expect(res.body.status).toBe("ENROLLED"));
    });

    it("refuses completion for a request, a missing enrollment, a bad status and the talebe", async () => {
      await as(MUDERRIS_ID)
        .patch(`/courses/${courseId}/enrollments/${PENDING_ID}`)
        .send({ status: "COMPLETED" })
        .expect(409)
        .expect((res) =>
          expect(res.body.code).toBe("ENROLLMENT_STATE_CONFLICT")
        );
      await as(MUDERRIS_ID)
        .patch(`/courses/${courseId}/enrollments/${STRANGER_ID}`)
        .send({ status: "COMPLETED" })
        .expect(404);
      await as(MUDERRIS_ID)
        .patch(`/courses/${courseId}/enrollments/${TALEBE_ID}`)
        .send({ status: "PENDING" })
        .expect(400);
      await as(TALEBE_ID)
        .patch(`/courses/${courseId}/enrollments/${TALEBE_ID}`)
        .send({ status: "COMPLETED" })
        .expect(403);
      expect(await enrollmentOf(TALEBE_ID)).toHaveProperty(
        "status",
        EnrollmentStatus.ENROLLED
      );
    });

    it("takes a talebe out with a reason, audits it, and keeps the seat as REVOKED (MDRS-161)", async () => {
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/remove`)
        .send({ reason: "  Üç haftadır derslere katılmıyor.  " })
        .expect(200)
        .expect((res) => expect(res.text).toBe("true"));

      expect(await enrollmentOf(TALEBE_ID)).toMatchObject({
        status: EnrollmentStatus.REVOKED,
        progress: 40,
      });
      const audit = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "enrollment.remove"));
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: MUDERRIS_ID,
        entity: "course",
        entityId: courseId,
        details: {
          userId: TALEBE_ID,
          reason: "Üç haftadır derslere katılmıyor.",
          status: "ENROLLED",
          progress: 40,
        },
      });
    });

    it("shows a revoked talebe the public page with the content locked, and does not let them apply, leave or record progress", async () => {
      await db()
        .update(lessons)
        .set({ meetingUrl: "https://meet.example/secret" })
        .where(eq(lessons.weekId, weekId));
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/remove`)
        .send({ reason: "Gerekçe" })
        .expect(200);

      const page = await as(TALEBE_ID).get(`/courses/${courseId}`).expect(200);
      expect(page.body.enrollment.status).toBe("REVOKED");
      expect(page.body.contentLocked).toBe(true);
      expect(JSON.stringify(page.body)).not.toContain("meet.example");
      expect(page.body.weeks).toHaveLength(1);

      await as(TALEBE_ID)
        .post(`/courses/${courseId}/enroll`)
        .expect(409)
        .expect((res) =>
          expect(res.body.code).toBe("ENROLLMENT_STATE_CONFLICT")
        );
      await as(TALEBE_ID).delete(`/courses/${courseId}/enrollment`).expect(409);
      await as(TALEBE_ID)
        .put(`/courses/${courseId}/progress`)
        .send({ progress: 50 })
        .expect(403);
      await as(MUDERRIS_ID)
        .patch(`/courses/${courseId}/enrollments/${TALEBE_ID}`)
        .send({ status: "COMPLETED" })
        .expect(409);
      expect(await enrollmentOf(TALEBE_ID)).toHaveProperty(
        "status",
        EnrollmentStatus.REVOKED
      );
    });

    it("lets the team approve a revoked seat back in", async () => {
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/remove`)
        .send({ reason: "Gerekçe" })
        .expect(200);
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/approve`)
        .expect(201)
        .expect((res) => expect(res.body.status).toBe("ENROLLED"));
    });

    it("names the medrese that opened the course on the page, to a caller with no token", async () => {
      const [madrasah] = await db()
        .insert(madrasahs)
        .values({
          handle: "course-page-madrasah",
          name: "Süleymaniye Medresesi",
          createdBy: ADMIN_ID,
        })
        .returning();
      await db()
        .update(courses)
        .set({ madrasahId: madrasah.id })
        .where(eq(courses.id, courseId));
      try {
        const res = await http().get(`/courses/${courseId}`).expect(200);
        expect(res.body.madrasah).toEqual({
          id: madrasah.id,
          name: "Süleymaniye Medresesi",
        });
      } finally {
        await db()
          .update(courses)
          .set({ madrasahId: null })
          .where(eq(courses.id, courseId));
        await db().delete(madrasahs).where(eq(madrasahs.id, madrasah.id));
      }
    });

    it("does not list a revoked course among the talebe's own, and does not count it in the köşk", async () => {
      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/remove`)
        .send({ reason: "Gerekçe" })
        .expect(200);
      const mine = await as(TALEBE_ID).get("/courses/enrolled").expect(200);
      expect(mine.body).toEqual([]);
    });

    it("lists who was taken out with the reason, newest first, for the team only (MDRS-178)", async () => {
      await as(MUDERRIS_ID)
        .get(`/courses/${courseId}/enrollments/removed`)
        .expect(200)
        .expect((res) => expect(res.body).toEqual([]));

      await as(MUDERRIS_ID)
        .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/remove`)
        .send({ reason: "Dört celsedir haber vermeden katılmıyor." })
        .expect(200);

      const res = await as(MUDERRIS_ID)
        .get(`/courses/${courseId}/enrollments/removed`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        userId: TALEBE_ID,
        reason: "Dört celsedir haber vermeden katılmıyor.",
        progress: 40,
        removedBy: { id: MUDERRIS_ID },
      });
      expect(typeof res.body[0].removedAt).toBe("string");

      await as(TALEBE_ID)
        .get(`/courses/${courseId}/enrollments/removed`)
        .expect(403);
    });

    it("refuses a removal without a reason, of a request or a completion, and by the talebe", async () => {
      const remove = (sub: string, userId: string, body: object) =>
        as(sub)
          .post(`/courses/${courseId}/enrollments/${userId}/remove`)
          .send(body);

      await remove(MUDERRIS_ID, TALEBE_ID, {}).expect(400);
      await remove(MUDERRIS_ID, TALEBE_ID, { reason: "   " }).expect(400);
      await remove(MUDERRIS_ID, TALEBE_ID, { reason: "x".repeat(501) }).expect(
        400
      );
      await remove(MUDERRIS_ID, PENDING_ID, { reason: "Gerekçe" }).expect(409);
      await remove(MUDERRIS_ID, COMPLETED_ID, { reason: "Gerekçe" }).expect(
        409
      );
      await remove(MUDERRIS_ID, STRANGER_ID, { reason: "Gerekçe" }).expect(404);
      await remove(TALEBE_ID, TALEBE_ID, { reason: "Gerekçe" }).expect(403);

      expect(await enrollmentOf(TALEBE_ID)).not.toBeNull();
      expect(
        await db()
          .select()
          .from(auditLog)
          .where(eq(auditLog.action, "enrollment.remove"))
      ).toEqual([]);
    });
  });

  /**
   * A write that follows a read of the enrollment must not undo what landed
   * in between (MDRS-161). Each test below runs the service call directly and
   * lets `act` run right after the service has read the enrollment, before it
   * writes: the first `findEnrollment` hands back what it found, then `act`
   * happens, exactly the order of two requests that overlap.
   */
  describe("an enrollment that changes between the service's read and its write (MDRS-161)", () => {
    const duringTheWrite = async <T>(
      act: () => Promise<unknown>,
      call: () => Promise<T>
    ): Promise<T> => {
      const repo = app.get(CourseRepository);
      const read = repo.findEnrollment.bind(repo);
      const spy = vi
        .spyOn(repo, "findEnrollment")
        .mockImplementationOnce(async (userId, id) => {
          const row = await read(userId, id);
          await act();
          return row;
        });
      try {
        return await call();
      } finally {
        spy.mockRestore();
      }
    };
    const service = () => app.get(CourseService);
    const teamRemoves = (userId: string) => () =>
      service().removeEnrollment(courseId, MUDERRIS_ID, userId, "Gerekçe");

    it("does not turn a seat removed meanwhile back by recording progress", async () => {
      await expect(
        duringTheWrite(teamRemoves(TALEBE_ID), () =>
          service().updateProgress(TALEBE_ID, courseId, 90)
        )
      ).rejects.toBeInstanceOf(EnrollmentStateError);
      expect(await enrollmentOf(TALEBE_ID)).toMatchObject({
        status: EnrollmentStatus.REVOKED,
        progress: 40,
      });
    });

    it("does not let the talebe leave, and so drop the record of a seat removed meanwhile", async () => {
      await expect(
        duringTheWrite(teamRemoves(TALEBE_ID), () =>
          service().leave(TALEBE_ID, courseId)
        )
      ).rejects.toBeInstanceOf(EnrollmentStateError);
      expect(await enrollmentOf(TALEBE_ID)).toHaveProperty(
        "status",
        EnrollmentStatus.REVOKED
      );
    });

    it("does not complete a seat removed meanwhile", async () => {
      await expect(
        duringTheWrite(teamRemoves(TALEBE_ID), () =>
          service().setEnrollmentStatus(
            courseId,
            TALEBE_ID,
            EnrollmentStatus.COMPLETED
          )
        )
      ).rejects.toBeInstanceOf(EnrollmentStateError);
      expect(await enrollmentOf(TALEBE_ID)).toMatchObject({
        status: EnrollmentStatus.REVOKED,
        completedAt: null,
      });
    });

    it("does not reject a request the team approved meanwhile", async () => {
      await expect(
        duringTheWrite(
          () => service().approveEnrollment(courseId, PENDING_ID),
          () => service().rejectEnrollment(courseId, PENDING_ID)
        )
      ).rejects.toBeInstanceOf(EnrollmentNotFoundError);
      expect(await enrollmentOf(PENDING_ID)).toHaveProperty(
        "status",
        EnrollmentStatus.ENROLLED
      );
    });

    it("answers a second approval of the same request like approving an active seat again", async () => {
      const second = await duringTheWrite(
        () => service().approveEnrollment(courseId, PENDING_ID),
        () => service().approveEnrollment(courseId, PENDING_ID)
      );
      expect(second.status).toBe(EnrollmentStatus.ENROLLED);
    });

    it("still approves a revoked seat back in, while it is revoked", async () => {
      await teamRemoves(TALEBE_ID)();
      const back = await service().approveEnrollment(courseId, TALEBE_ID);
      expect(back).toMatchObject({
        status: EnrollmentStatus.ENROLLED,
        progress: 40,
      });
    });

    it("says the enrollment is gone when it was withdrawn meanwhile", async () => {
      await expect(
        duringTheWrite(
          () => service().withdraw(PENDING_ID, courseId),
          () => service().approveEnrollment(courseId, PENDING_ID)
        )
      ).rejects.toBeInstanceOf(EnrollmentNotFoundError);
      expect(await enrollmentOf(PENDING_ID)).toBeNull();
    });
  });

  describe("the talebe's own enrollment", () => {
    it("records progress but never completes the course", async () => {
      await as(TALEBE_ID)
        .put(`/courses/${courseId}/progress`)
        .send({ progress: 100 })
        .expect(200)
        .expect((res) => {
          expect(res.body.progress).toBe(100);
          expect(res.body.status).toBe("ENROLLED");
        });
      await as(TALEBE_ID)
        .put(`/courses/${courseId}/progress`)
        .send({ progress: 100, status: "COMPLETED" })
        .expect(403)
        .expect((res) =>
          expect(res.body.code).toBe("ENROLLMENT_STATUS_FORBIDDEN")
        );
      expect(await enrollmentOf(TALEBE_ID)).toHaveProperty(
        "status",
        EnrollmentStatus.ENROLLED
      );
    });

    it("keeps a completion the team set when the talebe records progress", async () => {
      await as(COMPLETED_ID)
        .put(`/courses/${courseId}/progress`)
        .send({ progress: 80 })
        .expect(200)
        .expect((res) => expect(res.body.status).toBe("COMPLETED"));
      await as(COMPLETED_ID)
        .put(`/courses/${courseId}/progress`)
        .send({ progress: 80, status: "ENROLLED" })
        .expect(403);
    });

    it("withdraws a pending request, and the talebe may apply again", async () => {
      await as(PENDING_ID)
        .delete(`/courses/${courseId}/enrollment`)
        .expect(200)
        .expect((res) => expect(res.text).toBe("true"));
      expect(await enrollmentOf(PENDING_ID)).toBeNull();
      await as(PENDING_ID).post(`/courses/${courseId}/enroll`).expect(201);
    });

    it("withdraws only a pending request: an approved seat is a 404 and stays", async () => {
      await as(TALEBE_ID)
        .delete(`/courses/${courseId}/enroll`)
        .expect(404)
        .expect((res) => expect(res.body.code).toBe("ENROLLMENT_NOT_FOUND"));
      expect(await enrollmentOf(TALEBE_ID)).toHaveProperty(
        "status",
        EnrollmentStatus.ENROLLED
      );
      await as(STRANGER_ID).delete(`/courses/${courseId}/enroll`).expect(404);
      await as(PENDING_ID)
        .delete(`/courses/${courseId}/enroll`)
        .expect(200)
        .expect((res) => expect(res.text).toBe("true"));
      expect(await enrollmentOf(PENDING_ID)).toBeNull();
      await as(PENDING_ID).post(`/courses/${courseId}/enroll`).expect(201);
    });

    it("leaves an active course", async () => {
      await as(TALEBE_ID).delete(`/courses/${courseId}/enrollment`).expect(200);
      expect(await enrollmentOf(TALEBE_ID)).toBeNull();
    });

    it("does not leave a completed course, and 404s without an enrollment", async () => {
      await as(COMPLETED_ID)
        .delete(`/courses/${courseId}/enrollment`)
        .expect(409)
        .expect((res) =>
          expect(res.body.code).toBe("ENROLLMENT_STATE_CONFLICT")
        );
      expect(await enrollmentOf(COMPLETED_ID)).not.toBeNull();
      await as(STRANGER_ID)
        .delete(`/courses/${courseId}/enrollment`)
        .expect(404);
    });
  });
});
