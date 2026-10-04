import { PERMISSIONS, ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../../src/database/schema/role-assignment.schema";
import { UserProfileRepository } from "../../src/user/user-profile.repository";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-143, "a hidden köşk closes its courses": the köşk nazımı hides the köşk,
 * and its courses leave every list and answer 404 to everyone but the people
 * above them (the köşk's nazımları, Medaris yönetimi holding
 * `platform.kosk_edit`, the başnazım), whether the talebe is enrolled or not.
 * Restoring the köşk reopens exactly that, and nothing is deleted on the way.
 * Real Postgres, real guard, minted tokens.
 */
const ADMIN_ID = "d1430000-0000-4000-8000-000000000001";
const NAZIM_ID = "d1430000-0000-4000-8000-000000000002";
const MEDARIS_YES_ID = "d1430000-0000-4000-8000-000000000003";
const MEDARIS_NO_ID = "d1430000-0000-4000-8000-000000000004";
const TALEBE_ID = "d1430000-0000-4000-8000-000000000005";
const STRANGER_ID = "d1430000-0000-4000-8000-000000000006";
const MUDERRIS_ID = "d1430000-0000-4000-8000-000000000007";
const HEAD_ID = "d1430000-0000-4000-8000-000000000008";
const HEAD_MUDERRIS_ID = "d1430000-0000-4000-8000-000000000009";
const WEB_URL = "https://tedris.example";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("A hidden köşk closes its courses (MDRS-143, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskId: string;
  let madrasahId: string;
  let courseId: string;
  let medreseCourseId: string;
  let sessionId: string;
  let weekId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const get = (sub: string | null, path: string) => {
    const req = http().get(path);
    return sub === null ? req : req.set("Authorization", auth(sub));
  };
  const post = (sub: string, path: string, body: object = {}) =>
    http().post(path).set("Authorization", auth(sub)).send(body);

  const counts = async () => {
    const count = async (table: string) =>
      Number(
        (await db().execute(sql.raw(`select count(*) as n from ${table}`)))
          .rows[0].n
      );
    return {
      kosks: await count("kosks"),
      courses: await count("courses"),
      weeks: await count("course_weeks"),
      lessons: await count("lessons"),
      enrollments: await count("enrollments"),
    };
  };

  const auditRows = async () =>
    Number(
      (await db().execute(sql`select count(*) as n from audit_log`)).rows[0].n
    );

  /** The first fetch of the feed by its public path, as a calendar app does. */
  const feedOf = async (sub: string) => {
    const issued = await post(sub, "/me/calendar-feed").expect(200);
    const res = await http()
      .get(new URL(issued.body.url).pathname)
      .buffer(true)
      .parse((r, done) => {
        let body = "";
        r.setEncoding("utf8");
        r.on("data", (chunk: string) => {
          body += chunk;
        });
        r.on("end", () => done(null, body));
      })
      .expect(200);
    return res.body as string;
  };

  beforeAll(async () => {
    process.env.TEDRIS_WEB_URL = WEB_URL;
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(
      "calendar_feed_tokens",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: ADMIN_ID,
      })
      .returning();
    madrasahId = madrasah.id;
    [{ id: koskId }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_ID, name: "Nûruosmaniye Köşkü" })
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: NAZIM_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskId,
    });
    await assignRole(db(), {
      userId: HEAD_ID,
      role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
      scopeId: madrasahId,
    });
    for (const sub of [MEDARIS_YES_ID, MEDARIS_NO_ID]) {
      await db().insert(roleAssignments).values({
        userId: sub,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
    }
    await db().insert(permissionGrants).values({
      userId: MEDARIS_YES_ID,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      permission: PERMISSIONS.PLATFORM_KOSK_EDIT,
      groupId: null,
      grantedBy: ADMIN_ID,
    });

    const addCourse = async (title: string, madrasah?: string) => {
      const [course] = await db()
        .insert(courses)
        .values({
          koskId,
          authorId: NAZIM_ID,
          title,
          status: CourseStatus.PUBLISHED,
          ...(madrasah ? { madrasahId: madrasah } : {}),
        })
        .returning({ id: courses.id });
      const [week] = await db()
        .insert(courseWeeks)
        .values({ courseId: course.id, weekNumber: 1, title: "Birinci Bab" })
        .returning({ id: courseWeeks.id });
      const [session] = await db()
        .insert(lessons)
        .values({
          weekId: week.id,
          title: "Açılış",
          type: LessonType.LIVE,
          durationMinutes: 60,
          scheduledAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          meetingUrl: "https://meet.google.com/abc-defg-hij",
        })
        .returning({ id: lessons.id });
      return {
        courseId: course.id,
        sessionId: session.id,
        weekId: week.id,
      };
    };
    ({ courseId, sessionId, weekId } = await addCourse("Bina ve İzhar Şerhi"));
    ({ courseId: medreseCourseId } = await addCourse(
      "Emsile ve Bina",
      madrasahId
    ));
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
    });
    await assignRole(db(), {
      userId: HEAD_MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: medreseCourseId,
    });
    await db()
      .insert(enrollments)
      .values([
        { userId: TALEBE_ID, courseId },
        { userId: TALEBE_ID, courseId: medreseCourseId },
      ]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      "calendar_feed_tokens",
      ...COURSE_TREE_TABLES,
      "madrasahs",
      "users",
      "audit_log"
    );
    await app.close();
    delete process.env.TEDRIS_WEB_URL;
  });

  const hide = (sub: string) => post(sub, `/kosks/${koskId}/hide`);
  const restore = (sub: string) => post(sub, `/kosks/${koskId}/restore`);

  /** Every way a closed köşk's courses are read, as the person it is read as. */
  const reads = (sub: string | null) => ({
    course: () => get(sub, `/courses/${courseId}`),
    medreseCourse: () => get(sub, `/courses/${medreseCourseId}`),
    kosk: () => get(sub, `/kosks/${koskId}`),
    shelf: () => get(sub, `/kosks/${koskId}/courses`),
  });

  const expectClosed = async (sub: string | null) => {
    const r = reads(sub);
    const course = await r.course().expect(404);
    expect(course.body.code).toBe("COURSE_NOT_FOUND");
    expect((await r.medreseCourse().expect(404)).body.code).toBe(
      "COURSE_NOT_FOUND"
    );
    expect((await r.kosk().expect(404)).body.code).toBe("KOSK_NOT_FOUND");
    expect((await r.shelf().expect(404)).body.code).toBe("KOSK_NOT_FOUND");
  };

  const expectOpen = async (sub: string | null) => {
    const r = reads(sub);
    await r.course().expect(200);
    await r.kosk().expect(200);
    const shelf = await r.shelf().expect(200);
    expect(shelf.body.map((c: { id: string }) => c.id)).toContain(courseId);
  };

  it("is open to everyone before it is hidden", async () => {
    for (const sub of [TALEBE_ID, STRANGER_ID, MUDERRIS_ID, null]) {
      await expectOpen(sub);
    }
  });

  it("closes the köşk's courses to the enrolled talebe, a stranger, a müderris and an anonymous visitor", async () => {
    await hide(NAZIM_ID).expect(200);
    for (const sub of [TALEBE_ID, STRANGER_ID, MUDERRIS_ID, null]) {
      await expectClosed(sub);
    }
  });

  it("refuses to enroll in a course of a hidden köşk, and writes no enrollment", async () => {
    await hide(NAZIM_ID).expect(200);
    const before = await counts();
    const res = await post(STRANGER_ID, `/courses/${courseId}/enroll`).expect(
      404
    );
    expect(res.body.code).toBe("COURSE_NOT_FOUND");
    expect(await counts()).toEqual(before);
  });

  it("closes a course opened after the köşk was hidden, as well", async () => {
    await hide(NAZIM_ID).expect(200);
    const opened = await post(NAZIM_ID, `/kosks/${koskId}/courses`, {
      title: "Sonradan açılan",
      level: "BEGINNER",
      durationWeeks: 4,
      status: "PUBLISHED",
      requiresApproval: false,
      weeks: [],
    }).expect(201);
    await get(STRANGER_ID, `/courses/${opened.body.id}`).expect(404);
    await get(NAZIM_ID, `/courses/${opened.body.id}`).expect(200);
    await restore(NAZIM_ID).expect(200);
    await get(STRANGER_ID, `/courses/${opened.body.id}`).expect(200);
  });

  describe("leaves every list", () => {
    const enrolledIds = async () =>
      (await get(TALEBE_ID, "/courses/enrolled").expect(200)).body.map(
        (c: { id: string }) => c.id
      );
    const upcoming = async () =>
      (await get(TALEBE_ID, "/me/upcoming-lessons").expect(200)).body.map(
        (s: { id?: string; lessonId?: string }) => s.id ?? s.lessonId
      );
    const teaches = async () =>
      (await get(MUDERRIS_ID, "/me").expect(200)).body.roles.teaches.map(
        (c: { id: string }) => c.id
      );
    const titles = () => app.get(UserProfileRepository).courseTitles(TALEBE_ID);

    it("the talebe's enrolled courses", async () => {
      expect(await enrolledIds()).toEqual(
        expect.arrayContaining([courseId, medreseCourseId])
      );
      await hide(NAZIM_ID).expect(200);
      expect(await enrolledIds()).toEqual([]);
      await restore(NAZIM_ID).expect(200);
      expect(await enrolledIds()).toEqual(
        expect.arrayContaining([courseId, medreseCourseId])
      );
    });

    it("the talebe's upcoming sessions", async () => {
      expect(await upcoming()).toContain(sessionId);
      await hide(NAZIM_ID).expect(200);
      expect(await upcoming()).toEqual([]);
      await restore(NAZIM_ID).expect(200);
      expect(await upcoming()).toContain(sessionId);
    });

    it("what the müderris teaches, on GET /me", async () => {
      expect(await teaches()).toContain(courseId);
      await hide(NAZIM_ID).expect(200);
      expect(await teaches()).toEqual([]);
      await restore(NAZIM_ID).expect(200);
      expect(await teaches()).toContain(courseId);
    });

    it("the course titles on the talebe's public profile", async () => {
      expect(await titles()).toContain("Bina ve İzhar Şerhi");
      await hide(NAZIM_ID).expect(200);
      expect(await titles()).toEqual([]);
      await restore(NAZIM_ID).expect(200);
      expect(await titles()).toContain("Bina ve İzhar Şerhi");
    });
  });

  it("drops the sessions from the feed of the talebe and the müderris, and keeps them for the köşk's own nazımı", async () => {
    const inFeed = (ics: string) => ics.includes(sessionId);
    await db()
      .insert(enrollments)
      .values({ userId: MUDERRIS_ID, courseId: medreseCourseId })
      .onConflictDoNothing();
    for (const sub of [TALEBE_ID, MUDERRIS_ID, NAZIM_ID]) {
      expect(inFeed(await feedOf(sub))).toBe(true);
    }
    await hide(NAZIM_ID).expect(200);
    expect(inFeed(await feedOf(TALEBE_ID))).toBe(false);
    expect(inFeed(await feedOf(MUDERRIS_ID))).toBe(false);
    // The people above keep running it: their own köşk's sessions stay.
    expect(inFeed(await feedOf(NAZIM_ID))).toBe(true);
    await restore(NAZIM_ID).expect(200);
    expect(inFeed(await feedOf(TALEBE_ID))).toBe(true);
  });

  it("stays open to the köşk's nazımı, the başnazım and Medaris yönetimi holding platform.kosk_edit", async () => {
    await hide(NAZIM_ID).expect(200);
    for (const sub of [NAZIM_ID, ADMIN_ID, MEDARIS_YES_ID]) {
      await expectOpen(sub);
      await reads(sub).medreseCourse().expect(200);
    }
  });

  it("stays closed to a Medaris nazımı without the code, and to the başmüderris of a medrese hosted there", async () => {
    await hide(NAZIM_ID).expect(200);
    await expectClosed(MEDARIS_NO_ID);
    // A medrese is not above the köşk that hosts it (nizam/24).
    await expectClosed(HEAD_ID);
    await expectClosed(HEAD_MUDERRIS_ID);
  });

  describe("closes the routes the course team and the medrese use, not only the page", () => {
    const patch = (sub: string, path: string, body: object = {}) =>
      http().patch(path).set("Authorization", auth(sub)).send(body);
    const lessonOf = async (id: string) =>
      (await db().select().from(lessons).where(eq(lessons.id, id)))[0];
    const weekOf = async () =>
      (
        await db().select().from(courseWeeks).where(eq(courseWeeks.id, weekId))
      )[0];
    const courseRow = async (id: string) =>
      (await db().select().from(courses).where(eq(courses.id, id)))[0];
    /** Every route of the course team, as the person it is called as. */
    const routes = (sub: string) => ({
      archive: () => get(sub, `/courses/${courseId}/archive`),
      roster: () => get(sub, `/courses/${courseId}/enrollments`),
      liveStreams: () => get(sub, `/courses/${courseId}/live-streams`),
      weekHide: () => post(sub, `/courses/${courseId}/weeks/${weekId}/hide`),
      addSession: () =>
        post(sub, `/courses/${courseId}/weeks/${weekId}/lessons`, {
          title: "Yeni ders",
          type: LessonType.LIVE,
          durationMinutes: 30,
          scheduledAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
          meetingUrl: "https://meet.google.com/abc-defg-hij",
        }),
      editSession: () =>
        patch(sub, `/lessons/${sessionId}`, { title: "Değişti" }),
      cancelSession: () => post(sub, `/lessons/${sessionId}/cancel`),
      dropSession: () =>
        http().delete(`/lessons/${sessionId}`).set("Authorization", auth(sub)),
    });

    it("answers a müderris of the course 404 on every one of them, and writes nothing", async () => {
      await hide(NAZIM_ID).expect(200);
      const version = (await courseRow(courseId)).version;
      const audit = await auditRows();
      const r = routes(MUDERRIS_ID);
      for (const call of Object.values(r)) {
        expect((await call().expect(404)).body.code).toBe("COURSE_NOT_FOUND");
      }
      expect((await weekOf()).archivedAt).toBeNull();
      expect((await lessonOf(sessionId)).archivedAt).toBeNull();
      expect((await lessonOf(sessionId)).title).toBe("Açılış");
      expect((await courseRow(courseId)).version).toBe(version);
      expect(await auditRows()).toBe(audit);
    });

    it("answers a talebe and a stranger 404 on the roster and the live streams", async () => {
      await hide(NAZIM_ID).expect(200);
      for (const sub of [TALEBE_ID, STRANGER_ID]) {
        await routes(sub).roster().expect(404);
        await routes(sub).liveStreams().expect(404);
      }
    });

    it("keeps them open to the köşk's nazımı and the başnazım, and does not hide from Medaris yönetimi holding platform.kosk_edit what its codes decide", async () => {
      await hide(NAZIM_ID).expect(200);
      for (const sub of [NAZIM_ID, ADMIN_ID]) {
        await routes(sub).archive().expect(200);
        await routes(sub).roster().expect(200);
        await routes(sub).liveStreams().expect(200);
      }
      // The code lets them past the closure; what the route asks of them
      // after that is the catalogue's answer, a 403, never the closure's 404.
      for (const call of Object.values(routes(MEDARIS_YES_ID))) {
        expect((await call()).status).not.toBe(404);
      }
      await routes(NAZIM_ID).weekHide().expect(200);
      expect((await weekOf()).archivedAt).not.toBeNull();
    });

    it("refuses to restore a week or a session of a hidden köşk's course to its müderris, and leaves it hidden", async () => {
      await post(
        MUDERRIS_ID,
        `/courses/${courseId}/weeks/${weekId}/hide`
      ).expect(200);
      await hide(NAZIM_ID).expect(200);
      const audit = await auditRows();
      const res = await post(
        MUDERRIS_ID,
        `/archive/week/${weekId}/restore`
      ).expect(404);
      expect(res.body.code).toBe("COURSE_NOT_FOUND");
      expect((await weekOf()).archivedAt).not.toBeNull();
      expect(await auditRows()).toBe(audit);
      await restore(NAZIM_ID).expect(200);
      await post(MUDERRIS_ID, `/archive/week/${weekId}/restore`).expect(200);
      expect((await weekOf()).archivedAt).toBeNull();
    });

    it("lets the köşk's nazımı restore the week while the köşk is hidden", async () => {
      await post(
        MUDERRIS_ID,
        `/courses/${courseId}/weeks/${weekId}/hide`
      ).expect(200);
      await hide(NAZIM_ID).expect(200);
      await post(NAZIM_ID, `/archive/week/${weekId}/restore`).expect(200);
      expect((await weekOf()).archivedAt).toBeNull();
    });

    it("answers the başmüderris 404 before it writes, on the archive and the restore of a hosted course", async () => {
      await hide(NAZIM_ID).expect(200);
      const audit = await auditRows();
      const hidden = await post(
        HEAD_ID,
        `/courses/${medreseCourseId}/archive`
      ).expect(404);
      expect(hidden.body.code).toBe("COURSE_NOT_FOUND");
      expect((await courseRow(medreseCourseId)).archivedAt).toBeNull();
      expect(await auditRows()).toBe(audit);

      // Hidden before the köşk was: the restore is refused the same way.
      await restore(NAZIM_ID).expect(200);
      await post(HEAD_ID, `/courses/${medreseCourseId}/archive`).expect(200);
      await hide(NAZIM_ID).expect(200);
      const before = await auditRows();
      const res = await post(
        HEAD_ID,
        `/courses/${medreseCourseId}/restore`
      ).expect(404);
      expect(res.body.code).toBe("COURSE_NOT_FOUND");
      expect((await courseRow(medreseCourseId)).archivedAt).not.toBeNull();
      expect(await auditRows()).toBe(before);
    });
  });

  describe("leaves the medrese's lists and routes, and the köşk's decks", () => {
    const put = (sub: string, path: string, body: object) =>
      http().put(path).set("Authorization", auth(sub)).send(body);
    const titlesOf = (body: { courses: { title: string }[] }) =>
      body.courses.map((c) => c.title);
    const muderrisOf = async (id: string) =>
      (
        await db().execute(
          sql`select user_id from course_muderris where course_id = ${id}`
        )
      ).rows.map((r) => r.user_id);

    it("the public medrese page lists a hidden köşk's courses to nobody, and lists them again after the restore", async () => {
      for (const sub of [null, TALEBE_ID, HEAD_ID]) {
        const page = await get(sub, `/madrasahs/${madrasahId}/overview`).expect(
          200
        );
        expect(titlesOf(page.body)).toEqual(["Emsile ve Bina"]);
      }
      await hide(NAZIM_ID).expect(200);
      for (const sub of [null, TALEBE_ID, HEAD_ID]) {
        const page = await get(sub, `/madrasahs/${madrasahId}/overview`).expect(
          200
        );
        expect(page.body.courses).toEqual([]);
        expect(page.body.kosks).toEqual([]);
      }
      await restore(NAZIM_ID).expect(200);
      const page = await get(null, `/madrasahs/${madrasahId}/overview`).expect(
        200
      );
      expect(titlesOf(page.body)).toEqual(["Emsile ve Bina"]);
    });

    it("the başmüderris's course list, and their dashboard's course count and upcoming sessions", async () => {
      // Inside the dashboard's seven days.
      await db()
        .update(lessons)
        .set({ scheduledAt: new Date(Date.now() + 2 * 24 * 3600 * 1000) });
      const list = () => get(HEAD_ID, `/madrasahs/${madrasahId}/courses`);
      const board = () => get(HEAD_ID, `/madrasahs/${madrasahId}/dashboard`);
      expect((await list().expect(200)).body).toHaveLength(1);
      expect((await board().expect(200)).body).toMatchObject({
        courseCount: 1,
        upcomingSessions: [
          expect.objectContaining({ courseId: medreseCourseId }),
        ],
      });
      await hide(NAZIM_ID).expect(200);
      expect((await list().expect(200)).body).toEqual([]);
      expect((await board().expect(200)).body).toMatchObject({
        courseCount: 0,
        upcomingSessions: [],
      });
      await restore(NAZIM_ID).expect(200);
      expect((await list().expect(200)).body).toHaveLength(1);
      expect((await board().expect(200)).body.courseCount).toBe(1);
    });

    it("refuses the başmüderris a hosted course's müderrisler and its hide with 404, and writes nothing", async () => {
      await hide(NAZIM_ID).expect(200);
      const before = await muderrisOf(medreseCourseId);
      const audit = await auditRows();
      const set = await put(
        HEAD_ID,
        `/madrasahs/${madrasahId}/courses/${medreseCourseId}/muderrises`,
        { muderrisUserIds: [HEAD_ID] }
      ).expect(404);
      expect(set.body.code).toBe("COURSE_NOT_FOUND");
      expect(await muderrisOf(medreseCourseId)).toEqual(before);
      const hidden = await post(
        HEAD_ID,
        `/madrasahs/${madrasahId}/courses/${medreseCourseId}/hide`
      ).expect(404);
      expect(hidden.body.code).toBe("COURSE_NOT_FOUND");
      expect(
        (
          await db()
            .select()
            .from(courses)
            .where(eq(courses.id, medreseCourseId))
        )[0].archivedAt
      ).toBeNull();
      expect(await auditRows()).toBe(audit);
    });

    it("answers GET /kosks/:id/decks 404 to the enrolled talebe, a müderris and a stranger, and opens it to the köşk's nazımı", async () => {
      const decks = (sub: string) => get(sub, `/kosks/${koskId}/decks`);
      expect((await decks(TALEBE_ID).expect(200)).body.accessible).toBe(true);
      await hide(NAZIM_ID).expect(200);
      for (const sub of [TALEBE_ID, MUDERRIS_ID, STRANGER_ID]) {
        expect((await decks(sub).expect(404)).body.code).toBe("KOSK_NOT_FOUND");
      }
      for (const sub of [NAZIM_ID, ADMIN_ID, MEDARIS_YES_ID]) {
        await decks(sub).expect(200);
      }
      await restore(NAZIM_ID).expect(200);
      expect((await decks(TALEBE_ID).expect(200)).body.accessible).toBe(true);
    });
  });

  it("deletes nothing: the same rows stand before the hide, while hidden and after the restore", async () => {
    const before = await counts();
    await hide(NAZIM_ID).expect(200);
    expect(await counts()).toEqual(before);
    await restore(NAZIM_ID).expect(200);
    expect(await counts()).toEqual(before);
    for (const sub of [TALEBE_ID, STRANGER_ID, MUDERRIS_ID, null]) {
      await expectOpen(sub);
    }
  });

  it("does not reopen a course that was hidden itself when the köşk is restored", async () => {
    await post(NAZIM_ID, `/courses/${courseId}/archive`).expect(200);
    await hide(NAZIM_ID).expect(200);
    await restore(NAZIM_ID).expect(200);
    await get(TALEBE_ID, `/courses/${courseId}`).expect(404);
    await get(TALEBE_ID, `/courses/${medreseCourseId}`).expect(200);
  });

  it("keeps the köşk closed to the nazımı when the başnazım hid it: they cannot restore, and the courses stay closed", async () => {
    await hide(ADMIN_ID).expect(200);
    const res = await restore(NAZIM_ID).expect(403);
    expect(res.body.code).toBe("ARCHIVE_RESTORE_LEVEL");
    await expectClosed(TALEBE_ID);
    expect(
      (await db().select().from(kosks).where(eq(kosks.id, koskId)))[0]
        .archivedLevel
    ).toBe("platform");
    await restore(ADMIN_ID).expect(200);
    await expectOpen(TALEBE_ID);
  });
});
