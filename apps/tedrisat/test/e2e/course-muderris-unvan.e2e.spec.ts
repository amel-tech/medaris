import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { decks } from "../../src/database/schema/flashcard-deck.schema";
import { koskFollowers, kosks } from "../../src/database/schema/kosk.schema";
import { lessonQuestions } from "../../src/database/schema/lesson-question.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  madrasahKoskHosting,
} from "../../src/database/schema/role-assignment.schema";
import { SCOPE_TYPES } from "../../src/database/schema/scope-type.schema";
import { users } from "../../src/database/schema/user.schema";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * The unvan a hoca carries in one course (owner, 2026-10-15): set in the
 * course's settings with `course.settings`, kept in `course_muderris.unvan`,
 * and sent with the hoca everywhere a response lists the course's hocas.
 *
 * One medrese course hosted in a köşk, so that the köşk's, the medrese's and
 * the course's own lists are all read off the same two hocas: Ahmet (the
 * imam) and Bekir.
 */
const ADMIN_ID = "a7000000-0000-4000-8000-000000000001";
const NAZIM = "a7000000-0000-4000-8000-000000000002";
const HEAD = "a7000000-0000-4000-8000-000000000003";
const AHMET = "a7000000-0000-4000-8000-000000000004";
const BEKIR = "a7000000-0000-4000-8000-000000000005";
const CEMAL = "a7000000-0000-4000-8000-000000000006";
const TALEBE = "a7000000-0000-4000-8000-000000000007";
const FOLLOWER = "a7000000-0000-4000-8000-000000000008";
/** A ders nazırı given `course.edit`, which is not the settings. */
const NAZIR_EDIT = "a7000000-0000-4000-8000-000000000009";
/** A ders nazırı given `course.settings`. */
const NAZIR_SETTINGS = "a7000000-0000-4000-8000-00000000000a";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

const TABLES = [
  "lesson_questions",
  "decks_users",
  "flashcards",
  "decks",
  ...COURSE_TREE_TABLES,
  "permission_grants",
  "madrasahs",
  "audit_log",
  "users",
] as const;

type Hoca = { userId: string | null; name: string; unvan: string | null };

describe("A hoca's unvan in a course (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let madrasahId: string;
  let courseId: string;
  let lessonId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string) => ({
    get: (url: string) => http().get(url).set("Authorization", auth(sub)),
    put: (url: string) => http().put(url).set("Authorization", auth(sub)),
    post: (url: string) => http().post(url).set("Authorization", auth(sub)),
  });
  const setUnvan = (sub: string, userId: string, body: object) =>
    as(sub).put(`/courses/${courseId}/muderris/${userId}/unvan`).send(body);
  const unvanOf = async (userId: string) => {
    const [row] = await db()
      .select({ unvan: courseMuderris.unvan })
      .from(courseMuderris)
      .where(
        and(
          eq(courseMuderris.courseId, courseId),
          eq(courseMuderris.userId, userId)
        )
      );
    return row?.unvan;
  };
  const unvanAudits = () =>
    db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "course.muderris_unvan_update"));
  const byName = (list: Hoca[]) =>
    Object.fromEntries(list.map((m) => [m.name, m.unvan]));
  const grant = (userId: string, permission: string) =>
    db().insert(permissionGrants).values({
      userId,
      scopeType: SCOPE_TYPES.COURSE,
      scopeId: courseId,
      permission,
      grantedBy: NAZIM,
    });

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    await db()
      .insert(users)
      .values([
        { id: NAZIM, givenName: "Nuri", familyName: "Nazım" },
        { id: HEAD, givenName: "Hasan", familyName: "Başmüderris" },
        { id: AHMET, givenName: "Ahmet", familyName: "Mehmet" },
        { id: BEKIR, givenName: "Bekir", familyName: "Sami" },
        { id: CEMAL, givenName: "Cemal", familyName: "Nur" },
        { id: TALEBE, givenName: "Talha", familyName: "Talebe" },
        { id: FOLLOWER },
        { id: NAZIR_EDIT },
        { id: NAZIR_SETTINGS },
      ]);
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM, name: "Nûruosmaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    await assignRole(db(), {
      userId: NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: ADMIN_ID,
      })
      .returning();
    madrasahId = madrasah.id;
    await assignRole(db(), {
      userId: HEAD,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
      grantedBy: ADMIN_ID,
    });
    await db().insert(madrasahKoskHosting).values({
      madrasahId,
      koskId,
      grantedBy: ADMIN_ID,
      grantedByRole: "SYSTEM_ADMIN",
    });
    const [course] = await db()
      .insert(courses)
      .values({
        koskId,
        madrasahId,
        authorId: HEAD,
        title: "Emsile",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseId = course.id;
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Birinci hafta" })
      .returning();
    const [lesson] = await db()
      .insert(lessons)
      .values({
        weekId: week.id,
        title: "Açılış",
        type: LessonType.LIVE,
        durationMinutes: 60,
        scheduledAt: new Date(Date.now() + 24 * 3600 * 1000),
      })
      .returning();
    lessonId = lesson.id;
    await db()
      .insert(courseMuderris)
      .values([
        { courseId, userId: AHMET, name: "Ahmet Mehmet", orderIndex: 0 },
        { courseId, userId: BEKIR, name: "Bekir Sami", orderIndex: 1 },
      ]);
    await assignRole(db(), {
      userId: AHMET,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: HEAD,
      isImam: true,
    });
    await assignRole(db(), {
      userId: BEKIR,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
      grantedBy: HEAD,
    });
    for (const nazir of [NAZIR_EDIT, NAZIR_SETTINGS]) {
      await assignRole(db(), {
        userId: nazir,
        role: ASSIGNED_ROLES.DERS_NAZIR,
        scopeId: courseId,
        grantedBy: NAZIM,
      });
    }
    await grant(NAZIR_EDIT, PERMISSIONS.COURSE_EDIT);
    await grant(NAZIR_SETTINGS, PERMISSIONS.COURSE_SETTINGS);
    await db().insert(enrollments).values({
      userId: TALEBE,
      courseId,
      status: EnrollmentStatus.ENROLLED,
    });
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  describe("PUT /courses/:id/muderris/:userId/unvan", () => {
    it("sets one hoca's unvan in this course, answers the hoca and writes one audit row", async () => {
      const res = await setUnvan(AHMET, BEKIR, { unvan: "PROF_DR" }).expect(
        200
      );
      expect(res.body).toMatchObject({
        userId: BEKIR,
        name: "Bekir Sami",
        unvan: "PROF_DR",
        isImam: false,
      });
      expect(await unvanOf(BEKIR)).toBe("PROF_DR");
      expect(await unvanOf(AHMET)).toBeNull();

      const audits = await unvanAudits();
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: AHMET,
        entity: "course",
        entityId: courseId,
        details: { userId: BEKIR, from: null, to: "PROF_DR" },
      });
    });

    it("takes the unvan off with null, and the same unvan again writes nothing", async () => {
      await setUnvan(AHMET, AHMET, { unvan: "MOLLA" }).expect(200);
      await setUnvan(AHMET, AHMET, { unvan: "MOLLA" }).expect(200);
      expect(await unvanAudits()).toHaveLength(1);

      const res = await setUnvan(AHMET, AHMET, { unvan: null }).expect(200);
      expect(res.body.unvan).toBeNull();
      expect(await unvanOf(AHMET)).toBeNull();
      const audits = await unvanAudits();
      expect(audits).toHaveLength(2);
      expect(audits.map((a) => a.details)).toContainEqual({
        userId: AHMET,
        from: "MOLLA",
        to: null,
      });
    });

    it("leaves the course's version where it is", async () => {
      const [before] = await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, courseId));
      await setUnvan(AHMET, BEKIR, { unvan: "HAFIZ" }).expect(200);
      const [after] = await db()
        .select({ version: courses.version })
        .from(courses)
        .where(eq(courses.id, courseId));
      expect(after.version).toBe(before.version);
    });

    it.each([
      ["the köşk nazımı", NAZIM],
      ["the başmüderris", HEAD],
      ["a ders nazırı given course.settings", NAZIR_SETTINGS],
      ["the başnazım", ADMIN_ID],
    ])("lets %s set it", async (_who, sub) => {
      await setUnvan(sub, AHMET, { unvan: "SEYH" }).expect(200);
      expect(await unvanOf(AHMET)).toBe("SEYH");
    });

    it.each([
      ["a ders nazırı given only course.edit", NAZIR_EDIT],
      ["an enrolled talebe", TALEBE],
      ["someone with no role here", FOLLOWER],
    ])("refuses %s with 403 and writes nothing", async (_who, sub) => {
      await setUnvan(sub, AHMET, { unvan: "SEYH" }).expect(403);
      expect(await unvanOf(AHMET)).toBeNull();
      expect(await unvanAudits()).toHaveLength(0);
    });

    it("answers 404 COURSE_MUDERRIS_NOT_FOUND for an account that is not a hoca of the course", async () => {
      for (const userId of [CEMAL, TALEBE]) {
        const res = await setUnvan(NAZIM, userId, { unvan: "DR" }).expect(404);
        expect(res.body.code).toBe("COURSE_MUDERRIS_NOT_FOUND");
      }
      expect(await unvanAudits()).toHaveLength(0);
    });

    it("answers 404 for a course that does not exist", async () => {
      await as(NAZIM)
        .put(
          `/courses/a7ffffff-0000-4000-8000-000000000000/muderris/${AHMET}/unvan`
        )
        .send({ unvan: "DR" })
        .expect(404);
    });

    it.each([
      ["a code that is not in the list", { unvan: "SULTAN" }],
      ["a code in the wrong case", { unvan: "prof_dr" }],
      ["no unvan key at all", {}],
      ["another key beside it", { unvan: "DR", name: "Başka" }],
    ])("refuses %s with 400", async (_what, body) => {
      await setUnvan(NAZIM, AHMET, body).expect(400);
      expect(await unvanOf(AHMET)).toBeNull();
      expect(await unvanAudits()).toHaveLength(0);
    });
  });

  describe("every list of the course's hocas carries the unvan", () => {
    beforeEach(async () => {
      await setUnvan(NAZIM, AHMET, { unvan: "PROF_DR" }).expect(200);
    });

    it("GET /courses/:id", async () => {
      const res = await as(TALEBE).get(`/courses/${courseId}`).expect(200);
      expect(byName(res.body.muderris)).toEqual({
        "Ahmet Mehmet": "PROF_DR",
        "Bekir Sami": null,
      });
    });

    it("GET /courses/:courseId/sessions/:sessionId", async () => {
      const res = await as(TALEBE)
        .get(`/courses/${courseId}/sessions/${lessonId}`)
        .expect(200);
      expect(byName(res.body.muderris)).toEqual({
        "Ahmet Mehmet": "PROF_DR",
        "Bekir Sami": null,
      });
    });

    it("GET /kosks/:koskId/courses", async () => {
      const res = await as(TALEBE).get(`/kosks/${koskId}/courses`).expect(200);
      const course = res.body.find((c: { id: string }) => c.id === courseId);
      expect(byName(course.muderris)).toEqual({
        "Ahmet Mehmet": "PROF_DR",
        "Bekir Sami": null,
      });
    });

    it("GET /courses/enrolled", async () => {
      const res = await as(TALEBE).get("/courses/enrolled").expect(200);
      const course = res.body.find((c: { id: string }) => c.id === courseId);
      expect(byName(course.muderris)).toEqual({
        "Ahmet Mehmet": "PROF_DR",
        "Bekir Sami": null,
      });
    });

    it("GET /madrasahs/:id/overview and GET /madrasahs/:id/courses", async () => {
      const overview = await as(TALEBE)
        .get(`/madrasahs/${madrasahId}/overview`)
        .expect(200);
      expect(byName(overview.body.courses[0].muderris)).toEqual({
        "Ahmet Mehmet": "PROF_DR",
        "Bekir Sami": null,
      });
      const list = await as(HEAD)
        .get(`/madrasahs/${madrasahId}/courses`)
        .expect(200);
      expect(byName(list.body[0].muderris)).toEqual({
        "Ahmet Mehmet": "PROF_DR",
        "Bekir Sami": null,
      });
    });

    it("GET /kosks/:id/course-roster and GET /kosks/:id/dashboard", async () => {
      const roster = await as(NAZIM)
        .get(`/kosks/${koskId}/course-roster`)
        .expect(200);
      expect(byName(roster.body.items[0].muderris)).toEqual({
        "Ahmet Mehmet": "PROF_DR",
        "Bekir Sami": null,
      });
      const dashboard = await as(NAZIM)
        .get(`/kosks/${koskId}/dashboard`)
        .expect(200);
      const session = dashboard.body.sessions.find(
        (s: { id: string }) => s.id === lessonId
      );
      expect(byName(session.muderris)).toEqual({
        "Ahmet Mehmet": "PROF_DR",
        "Bekir Sami": null,
      });
    });

    it("GET /kosks/:id/hosting-rights names the imam with theirs", async () => {
      const res = await as(NAZIM)
        .get(`/kosks/${koskId}/hosting-rights`)
        .expect(200);
      expect(res.body[0].openCourses[0]).toMatchObject({
        id: courseId,
        imamName: "Ahmet Mehmet",
        imamUnvan: "PROF_DR",
      });
    });

    it("GET /kosks/followed/courses names the first hoca with theirs", async () => {
      await db().insert(koskFollowers).values({ userId: FOLLOWER, koskId });
      const res = await as(FOLLOWER).get("/kosks/followed/courses").expect(200);
      expect(res.body[0]).toMatchObject({
        id: courseId,
        muderrisName: "Ahmet Mehmet",
        muderrisUnvan: "PROF_DR",
      });
    });

    it("GET /flashcard/decks/summary names the course's first hoca with theirs", async () => {
      await db()
        .insert(decks)
        .values({ authorId: AHMET, title: "Emsile kartları", courseId });
      const res = await as(AHMET).get("/flashcard/decks/summary").expect(200);
      const deck = res.body.find(
        (d: { title: string }) => d.title === "Emsile kartları"
      );
      expect(deck).toMatchObject({
        muderrisName: "Ahmet Mehmet",
        muderrisUnvan: "PROF_DR",
      });
    });

    it("GET /courses/:id/questions/mine and /questions: a hoca's answer carries the unvan, a köşk nazımı's does not", async () => {
      await db()
        .insert(lessonQuestions)
        .values([
          {
            lessonId,
            authorId: TALEBE,
            body: "Birinci soru",
            answer: "Hocanın cevabı",
            answeredBy: AHMET,
            answeredAt: new Date("2026-10-14T10:00:00Z"),
            createdAt: new Date("2026-10-14T09:00:00Z"),
          },
          {
            lessonId,
            authorId: TALEBE,
            body: "İkinci soru",
            answer: "Nazımın cevabı",
            answeredBy: NAZIM,
            answeredAt: new Date("2026-10-14T11:00:00Z"),
            createdAt: new Date("2026-10-14T09:30:00Z"),
          },
        ]);
      const answerers = (body: {
        items: { body: string; answer: { answeredBy: object } }[];
      }) =>
        Object.fromEntries(
          body.items.map((q) => [q.body, q.answer.answeredBy])
        );
      const expected = {
        "Birinci soru": {
          id: AHMET,
          name: "Ahmet Mehmet",
          isMuderris: true,
          unvan: "PROF_DR",
        },
        "İkinci soru": {
          id: NAZIM,
          name: "Nuri Nazım",
          isMuderris: false,
          unvan: null,
        },
      };
      const mine = await as(TALEBE)
        .get(`/courses/${courseId}/questions/mine`)
        .expect(200);
      expect(answerers(mine.body)).toEqual(expected);
      const staff = await as(BEKIR)
        .get(`/courses/${courseId}/questions`)
        .expect(200);
      expect(answerers(staff.body)).toEqual(expected);
    });
  });

  describe("changing the hoca list keeps the unvan of those who stay", () => {
    beforeEach(async () => {
      await setUnvan(NAZIM, AHMET, { unvan: "PROF_DR" }).expect(200);
      await setUnvan(NAZIM, BEKIR, { unvan: "MOLLA" }).expect(200);
    });

    const version = async () =>
      (await as(HEAD).get(`/courses/${courseId}`).expect(200)).body.version;

    it("PUT /courses/:id/muderris: drops Bekir, adds Cemal, Ahmet keeps his", async () => {
      await as(HEAD)
        .put(`/courses/${courseId}/muderris`)
        .send({
          version: await version(),
          muderris: [
            { userId: CEMAL, name: "Cemal Nur" },
            { userId: AHMET, name: "Ahmet Mehmet" },
          ],
          imamUserId: CEMAL,
        })
        .expect(200);
      expect(await unvanOf(AHMET)).toBe("PROF_DR");
      expect(await unvanOf(CEMAL)).toBeNull();
      expect(await unvanOf(BEKIR)).toBeUndefined();
    });

    it("PUT /madrasahs/:id/courses/:courseId/muderrises: the same through the medrese", async () => {
      await as(HEAD)
        .put(`/madrasahs/${madrasahId}/courses/${courseId}/muderrises`)
        .send({ muderrisUserIds: [BEKIR, CEMAL], imamUserId: BEKIR })
        .expect(200);
      expect(await unvanOf(BEKIR)).toBe("MOLLA");
      expect(await unvanOf(CEMAL)).toBeNull();
      expect(await unvanOf(AHMET)).toBeUndefined();
    });

    it("PUT /courses/:id: a hoca sent again without the row id keeps his, a row handed to another account does not hand it on", async () => {
      const course = (await as(HEAD).get(`/courses/${courseId}`).expect(200))
        .body;
      const ahmetRow = course.muderris.find(
        (m: Hoca) => m.userId === AHMET
      ) as { id: string };
      await as(HEAD)
        .put(`/courses/${courseId}`)
        .send({
          title: course.title,
          status: course.status,
          version: course.version,
          weeks: course.weeks.map(
            (w: {
              id: string;
              weekNumber: number;
              title: string;
              lessons: {
                id: string;
                title: string;
                type: string;
                durationMinutes: number | null;
              }[];
            }) => ({
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
            })
          ),
          muderris: [
            // Ahmet's row, now Cemal's.
            { id: ahmetRow.id, userId: CEMAL, name: "Cemal Nur" },
            // Bekir, without his row's id: a new row.
            { userId: BEKIR, name: "Bekir Sami" },
          ],
          resources: [],
        })
        .expect(200);
      expect(await unvanOf(CEMAL)).toBeNull();
      expect(await unvanOf(BEKIR)).toBe("MOLLA");
    });
  });

  describe("a course opened with its hocas' unvans (owner, 2026-10-15)", () => {
    const unvansOfCourse = async (id: string) =>
      Object.fromEntries(
        (
          await db()
            .select({
              userId: courseMuderris.userId,
              unvan: courseMuderris.unvan,
            })
            .from(courseMuderris)
            .where(eq(courseMuderris.courseId, id))
        ).map((r) => [r.userId, r.unvan])
      );

    describe("POST /kosks/:koskId/courses (the köşk's own course)", () => {
      const open = (muderris: object[]) =>
        as(NAZIM)
          .post(`/kosks/${koskId}/courses`)
          .send({ title: "Avâmil", muderris, imamUserId: AHMET });

      it("stores the unvan each hoca is given and answers the course with it", async () => {
        const res = await open([
          { userId: AHMET, name: "Ahmet Mehmet", unvan: "PROF_DR" },
          { userId: BEKIR, name: "Bekir Sami", unvan: null },
          { userId: CEMAL, name: "Cemal Nur" },
        ]).expect(201);
        expect(byName(res.body.muderris)).toEqual({
          "Ahmet Mehmet": "PROF_DR",
          "Bekir Sami": null,
          "Cemal Nur": null,
        });
        expect(await unvansOfCourse(res.body.id)).toEqual({
          [AHMET]: "PROF_DR",
          [BEKIR]: null,
          [CEMAL]: null,
        });
        // a new course is a draft: read by the köşk nazımı who opened it
        const read = await as(NAZIM).get(`/courses/${res.body.id}`).expect(200);
        expect(byName(read.body.muderris)["Ahmet Mehmet"]).toBe("PROF_DR");
      });

      it("refuses a code that is not in the list with 400, and opens nothing", async () => {
        const res = await open([
          { userId: AHMET, name: "Ahmet Mehmet", unvan: "SULTAN" },
        ]).expect(400);
        expect(res.body.code).toBe("VALIDATION_ERROR");
        const titles = await db()
          .select({ title: courses.title })
          .from(courses)
          .where(eq(courses.koskId, koskId));
        expect(titles.map((c) => c.title)).not.toContain("Avâmil");
      });

      it("refuses an unvan on a hoca with no account (MUDERRIS_LIST_INVALID)", async () => {
        const res = await open([
          { userId: AHMET, name: "Ahmet Mehmet" },
          { name: "Ahmed Hilmi", unvan: "MOLLA" },
        ]).expect(400);
        expect(res.body.code).toBe("MUDERRIS_LIST_INVALID");
      });

      it("leaves the whole-course save without an unvan: the key is refused there", async () => {
        const course = (await as(HEAD).get(`/courses/${courseId}`).expect(200))
          .body;
        await as(HEAD)
          .put(`/courses/${courseId}`)
          .send({
            title: course.title,
            version: course.version,
            muderris: course.muderris.map(
              (m: { id: string; userId: string; name: string }) => ({
                id: m.id,
                userId: m.userId,
                name: m.name,
                unvan: "DR",
              })
            ),
          })
          .expect(400);
        expect(await unvanOf(AHMET)).toBeNull();
      });
    });

    describe("POST /madrasahs/:id/courses (a medrese's course)", () => {
      const open = (body: object) =>
        as(HEAD)
          .post(`/madrasahs/${madrasahId}/courses`)
          .send({
            koskId,
            title: "Merâh",
            muderrisUserIds: [AHMET, BEKIR],
            imamUserId: AHMET,
            ...body,
          });

      it("stores the unvan each hoca is given, answers it and writes it to the audit row", async () => {
        const res = await open({
          muderrisUnvans: [
            { userId: BEKIR, unvan: "MOLLA" },
            { userId: AHMET, unvan: null },
          ],
        }).expect(201);
        expect(byName(res.body.muderris)).toEqual({
          "Ahmet Mehmet": null,
          "Bekir Sami": "MOLLA",
        });
        expect(await unvansOfCourse(res.body.id)).toEqual({
          [AHMET]: null,
          [BEKIR]: "MOLLA",
        });
        const read = await as(HEAD).get(`/courses/${res.body.id}`).expect(200);
        expect(byName(read.body.muderris)["Bekir Sami"]).toBe("MOLLA");
        const [opened] = await db()
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.action, "course.open"),
              eq(auditLog.entityId, res.body.id)
            )
          );
        expect(opened.details).toMatchObject({
          muderrisUnvans: { [BEKIR]: "MOLLA" },
        });
      });

      it("opens with no unvan when none is given", async () => {
        const res = await open({}).expect(201);
        expect(await unvansOfCourse(res.body.id)).toEqual({
          [AHMET]: null,
          [BEKIR]: null,
        });
      });

      it.each([
        [
          "a code that is not in the list",
          [{ userId: AHMET, unvan: "SULTAN" }],
          "VALIDATION_ERROR",
        ],
        ["a missing unvan key", [{ userId: AHMET }], "VALIDATION_ERROR"],
        [
          "an account that is not one of the hocas",
          [{ userId: CEMAL, unvan: "DR" }],
          "MUDERRIS_LIST_INVALID",
        ],
        [
          "one account twice",
          [
            { userId: AHMET, unvan: "DR" },
            { userId: AHMET, unvan: "MOLLA" },
          ],
          "MUDERRIS_LIST_INVALID",
        ],
      ])("refuses %s with 400 and opens nothing", async (_what, unvans, code) => {
        const res = await open({ muderrisUnvans: unvans }).expect(400);
        expect(res.body.code).toBe(code);
        const titles = await db()
          .select({ title: courses.title })
          .from(courses)
          .where(eq(courses.madrasahId, madrasahId));
        expect(titles.map((c) => c.title)).not.toContain("Merâh");
      });
    });
  });
});
