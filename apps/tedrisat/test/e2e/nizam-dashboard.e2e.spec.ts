import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { bans } from "../../src/database/schema/ban.schema";
import {
  courseMuderris,
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { flashcards } from "../../src/database/schema/flashcard.schema";
import { decks } from "../../src/database/schema/flashcard-deck.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { koskApplications } from "../../src/database/schema/kosk-application.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { DeckPublishStatus } from "../../src/flashcard/domain/deck-publish-status.enum";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-182: the three home pages of the nizam against a real Postgres.
 * nizam/01 and 05 (`GET /nizam/dashboard` for the başnazım and a Medaris
 * nazımı), nizam/02 (`GET /kosks/:id/dashboard`) and the optional reason of a
 * refused enrollment request (`DELETE /courses/:id/enrollments/:userId`).
 */
const ADMIN = "f2000000-0000-4000-8000-000000000001";
const NAZIM_ALL = "f2000000-0000-4000-8000-000000000002";
const NAZIM_FEW = "f2000000-0000-4000-8000-000000000003";
const KOSK_NAZIM = "f2000000-0000-4000-8000-000000000004";
const OTHER_NAZIM = "f2000000-0000-4000-8000-000000000005";
const STRANGER = "f2000000-0000-4000-8000-000000000006";
const APPLICANT = "f2000000-0000-4000-8000-000000000007";
const AUTHOR = "f2000000-0000-4000-8000-000000000008";
const TALEBE_A = "f2000000-0000-4000-8000-000000000009";
const TALEBE_B = "f2000000-0000-4000-8000-00000000000a";
const PENDING_A = "f2000000-0000-4000-8000-00000000000b";
const PENDING_B = "f2000000-0000-4000-8000-00000000000c";
const MUDERRIS = "f2000000-0000-4000-8000-00000000000d";
const OLD_NAZIM = "f2000000-0000-4000-8000-00000000000e";

const HOUR = 3_600_000;
// Every request syncs the caller's profile from the token (MDRS-104), so a
// name seeded in `users` only survives if the token carries it too.
const GIVEN: Record<string, string> = {
  [ADMIN]: "Yusuf Ziya",
  [NAZIM_ALL]: "Hasan Basri",
  [KOSK_NAZIM]: "Abdülhamit",
};
const auth = (sub: string) =>
  bearerFor({
    sub,
    claims: {
      ...(GIVEN[sub] ? { given_name: GIVEN[sub] } : {}),
      ...(sub === ADMIN
        ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } }
        : {}),
    },
  });

describe("Nizam dashboards (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskA: string;
  let koskB: string;
  let course: string;
  let madrasah: string;
  let lessonNoLink: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const get = (path: string, sub: string) =>
    http().get(path).set("Authorization", auth(sub));
  const TABLES = [
    "permission_grants",
    "permission_group_items",
    "permission_groups",
    ...COURSE_TREE_TABLES,
    "madrasahs",
    "bans",
    "kosk_applications",
    "audit_log",
    "users",
  ] as const;

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  afterAll(async () => {
    await dbUtils.cleanTables("flashcards", "decks");
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("flashcards", "decks");
    await dbUtils.cleanTables(...TABLES);
    await db()
      .insert(users)
      .values([
        { id: ADMIN, email: "basnazim@example.com", givenName: "Yusuf Ziya" },
        { id: NAZIM_ALL, email: "hepsi@example.com", givenName: "Hasan Basri" },
        { id: NAZIM_FEW, email: "az@example.com", givenName: "Az" },
        {
          id: KOSK_NAZIM,
          email: "kosk@example.com",
          givenName: "Abdülhamit",
          familyName: "Karaosmanoğlu",
        },
        { id: OTHER_NAZIM, email: "baska@example.com" },
        { id: STRANGER, email: "yabanci@example.com" },
        {
          id: APPLICANT,
          email: "ba@example.com",
          givenName: "Ömer Nasuhi",
          familyName: "Bilmenoğlu",
        },
        {
          id: AUTHOR,
          email: "yazar@example.com",
          givenName: "Zeynep Betül",
          familyName: "Karahanlı",
        },
        {
          id: TALEBE_A,
          email: "a@example.com",
          givenName: "Ali",
          familyName: "Yıldız",
        },
        { id: TALEBE_B, email: "b@example.com", givenName: "Bahar" },
        {
          id: PENDING_A,
          email: "pa@example.com",
          givenName: "Selim",
          familyName: "Kaya",
        },
        { id: PENDING_B, email: "pb@example.com", givenName: "Meryem" },
        { id: MUDERRIS, email: "m@example.com", givenName: "Mehmet Emin" },
        { id: OLD_NAZIM, email: "eski@example.com" },
      ]);

    for (const sub of [NAZIM_ALL, NAZIM_FEW]) {
      await db().insert(roleAssignments).values({
        userId: sub,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN,
      });
    }
    await db()
      .insert(permissionGrants)
      .values(
        [
          "platform.kosk_create",
          "platform.kosk_application_decide",
          "platform.deck_publish",
          "platform.ban_account",
          "platform.ban_scoped",
          "platform.inactive_scopes_manage",
        ].map((permission) => ({
          userId: NAZIM_ALL,
          scopeType: SCOPE_TYPES.PLATFORM,
          scopeId: null,
          permission,
          grantedBy: ADMIN,
        }))
      );
    await db().insert(permissionGrants).values({
      userId: NAZIM_FEW,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      permission: "platform.kosk_application_decide",
      grantedBy: ADMIN,
    });

    [{ id: koskA }, { id: koskB }] = await db()
      .insert(kosks)
      .values([
        { ownerId: ADMIN, name: "Nûruosmaniye Köşkü" },
        { ownerId: ADMIN, name: "Fatih Köşkü", isPrivate: true },
      ])
      .returning({ id: kosks.id });
    await db().insert(kosks).values({
      ownerId: ADMIN,
      name: "Gizli Köşk",
      archivedAt: new Date(),
      archivedBy: ADMIN,
    });
    await assignRole(db(), {
      userId: KOSK_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskA,
      grantedBy: ADMIN,
    });
    await assignRole(db(), {
      userId: OTHER_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskB,
      grantedBy: ADMIN,
    });
    // A köşk whose only nazım left: it is passive.
    await assignRole(db(), {
      userId: OLD_NAZIM,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskB,
      grantedBy: ADMIN,
    });
    await db()
      .update(roleAssignments)
      .set({ revokedAt: new Date(Date.now() - 24 * HOUR), revokedBy: ADMIN })
      .where(eq(roleAssignments.userId, OLD_NAZIM));

    [{ id: madrasah }] = await db()
      .insert(madrasahs)
      .values({ handle: "zeyrek", name: "Zeyrek Medresesi", createdBy: ADMIN })
      .returning({ id: madrasahs.id });

    [{ id: course }] = await db()
      .insert(courses)
      .values({
        koskId: koskA,
        madrasahId: madrasah,
        authorId: KOSK_NAZIM,
        title: "Emsile ve Bina",
        status: CourseStatus.PUBLISHED,
      })
      .returning({ id: courses.id });
    await db().insert(courseMuderris).values({
      courseId: course,
      userId: MUDERRIS,
      name: "Mehmet Emin Işıkoğlu",
    });
    await assignRole(db(), {
      userId: MUDERRIS,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: course,
      grantedBy: ADMIN,
      isImam: true,
    });
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId: course, weekNumber: 5, title: "Mehmûz fiiller" })
      .returning({ id: courseWeeks.id });
    const now = Date.now();
    const live = (values: Partial<typeof lessons.$inferInsert>) =>
      db()
        .insert(lessons)
        .values({
          weekId: week.id,
          title: "Celse",
          type: LessonType.LIVE,
          durationMinutes: 60,
          ...values,
        })
        .returning({ id: lessons.id });
    await live({
      scheduledAt: new Date(now + 24 * HOUR),
      meetingUrl: "https://zoom.us/j/123",
    });
    [{ id: lessonNoLink }] = await live({
      scheduledAt: new Date(now + 48 * HOUR),
      meetingUrl: null,
    });
    await live({
      scheduledAt: new Date(now + 30 * 24 * HOUR),
      meetingUrl: "https://zoom.us/j/999",
    });
    await live({
      scheduledAt: new Date(now - 48 * HOUR),
      meetingUrl: "https://zoom.us/j/1",
    });
    await live({
      scheduledAt: new Date(now + 72 * HOUR),
      meetingUrl: "https://zoom.us/j/2",
      cancelledAt: new Date(now - HOUR),
    });
    await db()
      .insert(enrollments)
      .values([
        {
          userId: TALEBE_A,
          courseId: course,
          status: EnrollmentStatus.ENROLLED,
        },
        {
          userId: TALEBE_B,
          courseId: course,
          status: EnrollmentStatus.ENROLLED,
        },
        {
          userId: PENDING_A,
          courseId: course,
          status: EnrollmentStatus.PENDING,
        },
        {
          userId: PENDING_B,
          courseId: course,
          status: EnrollmentStatus.PENDING,
        },
      ]);

    await db()
      .insert(koskApplications)
      .values([
        {
          applicantId: APPLICANT,
          name: "Davutpaşa Köşkü",
          field: "AQEEDAH_KALAM",
          summary: "s",
          reason: "r",
          email: "ba@example.com",
        },
        {
          applicantId: APPLICANT,
          name: "Kapanmış Köşk",
          field: "SEERAH",
          summary: "s",
          reason: "r",
          email: "ba@example.com",
          status: "REJECTED",
        },
      ]);
    const [deck] = await db()
      .insert(decks)
      .values({
        authorId: AUTHOR,
        title: "Mehmûz fiiller",
        publishStatus: DeckPublishStatus.PENDING,
        publishRequestedAt: new Date(now - 2 * HOUR),
      })
      .returning({ id: decks.id });
    await db()
      .insert(flashcards)
      .values(
        [1, 2, 3].map((n) => ({
          deckId: deck.id,
          authorId: AUTHOR,
          type: FlashcardType.VOCABULARY,
          contentFront: `f${n}`,
          contentBack: `b${n}`,
        }))
      );
    await db().insert(bans).values({
      userId: TALEBE_B,
      koskId: koskA,
      courseId: course,
      scope: "COURSE",
      reason: "Düzeni bozdu.",
      bannedBy: KOSK_NAZIM,
      bannedRole: "KOSK_NAZIM",
      bannedTier: 2,
    });
  });

  describe("GET /nizam/dashboard", () => {
    it("gives the başnazım every count and card", async () => {
      const res = await get("/nizam/dashboard", ADMIN).expect(200);
      expect(res.body).toMatchObject({
        viewer: "CHIEF",
        greetingName: "Yusuf Ziya",
        can: { openKosk: true },
        pendingTotals: {
          koskApplications: 1,
          deckPublishRequests: 1,
          appeals: 0,
          permanentBanRequests: 0,
        },
        platformCounts: {
          kosk: 2,
          unlistedKosk: 1,
          madrasah: 1,
          inactiveMadrasah: 0,
          course: 1,
          inactiveCourse: 0,
          enrolledStudents: 2,
        },
      });
      expect(res.body.latestApplications).toHaveLength(1);
      expect(res.body.latestApplications[0]).toMatchObject({
        name: "Davutpaşa Köşkü",
        applicantName: "Ömer Nasuhi Bilmenoğlu",
      });
      expect(res.body.latestDeckRequests[0]).toMatchObject({
        title: "Mehmûz fiiller",
        ownerName: "Zeynep Betül Karahanlı",
        cardCount: 3,
      });
      expect(res.body.inactiveScopeCount).toBe(0);
      expect(res.body.latestBans).toHaveLength(1);
      expect(res.body.latestBans[0]).toMatchObject({
        userName: "Bahar",
        scope: "COURSE",
        courseTitle: "Emsile ve Bina",
      });
    });

    it("counts a köşk whose last nazım left as passive on the card", async () => {
      await db()
        .update(roleAssignments)
        .set({ revokedAt: new Date(Date.now() - 24 * HOUR), revokedBy: ADMIN })
        .where(eq(roleAssignments.userId, OTHER_NAZIM));
      const res = await get("/nizam/dashboard", ADMIN).expect(200);
      expect(res.body.inactiveScopeCount).toBe(1);
      expect(res.body.inactiveScopes[0]).toMatchObject({
        type: "KOSK",
        name: "Fatih Köşkü",
        reason: "REMOVED",
      });
    });

    it("cuts a Medaris nazımı's page down to what the permissions open", async () => {
      const all = await get("/nizam/dashboard", NAZIM_ALL).expect(200);
      expect(all.body.viewer).toBe("MEDARIS_NAZIM");
      expect(all.body.greetingName).toBe("Hasan Basri");
      expect(all.body.can.openKosk).toBe(false);
      // Ders and Kayıtlı talebe are the başnazım's alone
      expect(all.body.platformCounts).toMatchObject({
        kosk: 2,
        madrasah: 1,
        course: null,
        inactiveCourse: null,
        enrolledStudents: null,
      });
      expect(all.body.latestBans).toHaveLength(1);

      const few = await get("/nizam/dashboard", NAZIM_FEW).expect(200);
      expect(few.body.can.openKosk).toBe(false);
      expect(few.body.pendingTotals).toEqual({
        koskApplications: 1,
        deckPublishRequests: null,
        appeals: null,
        permanentBanRequests: null,
      });
      expect(few.body.latestDeckRequests).toBeNull();
      expect(few.body.inactiveScopes).toBeNull();
      expect(few.body.inactiveScopeCount).toBeNull();
    });

    it("refuses anyone who is neither the başnazım nor a Medaris nazımı", async () => {
      await get("/nizam/dashboard", KOSK_NAZIM).expect(403);
      await get("/nizam/dashboard", STRANGER).expect(403);
      await http().get("/nizam/dashboard").expect(401);
    });
  });

  describe("GET /kosks/:id/dashboard", () => {
    it("gives the köşk's nazım the numbers, the celse table, applications and müderrisler", async () => {
      const res = await get(`/kosks/${koskA}/dashboard`, KOSK_NAZIM).expect(
        200
      );
      expect(res.body).toMatchObject({
        koskId: koskA,
        koskName: "Nûruosmaniye Köşkü",
        greetingName: "Abdülhamit",
        counts: {
          courses: 1,
          students: 2,
          upcomingSessions: 2,
          pendingApplications: 2,
        },
        sessionCounts: { upcoming: 2, past: 1, cancelled: 1 },
        missingLinkCount: 1,
        tab: "UPCOMING",
      });
      expect(res.body.firstMissingLink.id).toBe(lessonNoLink);
      expect(res.body.sessions).toHaveLength(2);
      expect(res.body.sessions[0]).toMatchObject({
        courseTitle: "Emsile ve Bina",
        weekNumber: 5,
        studentCount: 2,
        madrasahName: "Zeyrek Medresesi",
        meetingUrl: "https://zoom.us/j/123",
        cancelled: false,
        isMakeup: false,
      });
      expect(res.body.sessions[0].muderris).toEqual([
        { name: "Mehmet Emin Işıkoğlu", isImam: true },
      ]);
      expect(res.body.sessions[1].meetingUrl).toBeNull();
      expect(res.body.latestApplications).toHaveLength(2);
      expect(res.body.muderris).toEqual([
        {
          userId: MUDERRIS,
          name: "Mehmet Emin Işıkoğlu",
          courseCount: 1,
          studentCount: 2,
          madrasahName: "Zeyrek Medresesi",
        },
      ]);
    });

    it("lists the past and the cancelled sessions on their tabs", async () => {
      const past = await get(
        `/kosks/${koskA}/dashboard?sessions=PAST`,
        KOSK_NAZIM
      ).expect(200);
      expect(past.body.tab).toBe("PAST");
      expect(past.body.sessions).toHaveLength(1);
      const cancelled = await get(
        `/kosks/${koskA}/dashboard?sessions=CANCELLED`,
        KOSK_NAZIM
      ).expect(200);
      expect(cancelled.body.sessions).toHaveLength(1);
      expect(cancelled.body.sessions[0].cancelled).toBe(true);
      await get(`/kosks/${koskA}/dashboard?sessions=NOPE`, KOSK_NAZIM).expect(
        400
      );
    });

    // The catalogue's words for "EDIT on the köşk" (MDRS-135): kosk.manage for the
    // köşk's nazımı, platform.kosk_edit for a Medaris nazımı.
    it("lets a Medaris nazımı read a köşk's page only with platform.kosk_edit", async () => {
      await get(`/kosks/${koskA}/dashboard`, NAZIM_ALL).expect(403);
      await get(`/kosks/${koskA}/dashboard`, NAZIM_FEW).expect(403);
      await db().insert(permissionGrants).values({
        userId: NAZIM_ALL,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        permission: "platform.kosk_edit",
        grantedBy: ADMIN,
      });
      await get(`/kosks/${koskA}/dashboard`, NAZIM_ALL).expect(200);
      await get(`/kosks/${koskA}/dashboard`, NAZIM_FEW).expect(403);
    });

    it("lets the başnazım read any köşk, and refuses a nazım of another", async () => {
      await get(`/kosks/${koskA}/dashboard`, ADMIN).expect(200);
      await get(`/kosks/${koskA}/dashboard`, OTHER_NAZIM).expect(403);
      await get(`/kosks/${koskA}/dashboard`, STRANGER).expect(403);
      await get(
        "/kosks/f2000000-0000-4000-8000-0000000000ff/dashboard",
        ADMIN
      ).expect(404);
    });
  });

  describe("DELETE /courses/:id/enrollments/:userId (reason)", () => {
    const reject = (userId: string, body?: object) => {
      const req = http()
        .delete(`/courses/${course}/enrollments/${userId}`)
        .set("Authorization", auth(KOSK_NAZIM));
      return body ? req.send(body) : req;
    };

    it("keeps the optional reason with the refusal in the audit log", async () => {
      await reject(PENDING_A, { reason: "  Ön koşul sağlanmıyor.  " }).expect(
        200
      );
      const rows = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "enrollment.reject"));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: KOSK_NAZIM,
        entityId: course,
        details: expect.objectContaining({
          userId: PENDING_A,
          reason: "Ön koşul sağlanmıyor.",
        }),
      });
      const left = await db()
        .select()
        .from(enrollments)
        .where(eq(enrollments.userId, PENDING_A));
      expect(left).toHaveLength(0);
    });

    it("still rejects without a body, writing no reason", async () => {
      await reject(PENDING_B).expect(200);
      const [row] = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "enrollment.reject"));
      expect((row.details as { reason: string | null }).reason).toBeNull();
    });

    it("refuses a reason that is too long, and a seat that is not a request", async () => {
      await reject(PENDING_A, { reason: "x".repeat(501) }).expect(400);
      await reject(TALEBE_A).expect(404);
    });
  });
});
