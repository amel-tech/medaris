import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { SendMailOptions } from "nodemailer";
import request from "supertest";
import type { ISmtpConfig } from "../../src/config/smtp-env";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { LessonType } from "../../src/course/domain/lesson-type.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../../src/database/schema/course.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { lessonInvitations } from "../../src/database/schema/lesson-invitation.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { invitationUid } from "../../src/lesson-invitation/invitation-ics";
import { LessonInvitationService } from "../../src/lesson-invitation/lesson-invitation.service";
import { MAIL_CONFIG, MAIL_TRANSPORT } from "../../src/mail/mail.service";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-121: approved talebe are e-mailed calendar invitations for their
 * sessions; a moved session is sent again as an update, a cancelled one as a
 * cancellation, and a talebe who turned invitations off is sent nothing.
 *
 * The SMTP server is a stub (`MAIL_TRANSPORT`) that keeps every message it is
 * handed: the suite may not reach the network (MDRS-89). Each case makes the
 * change through the real route, as nizam does, waits for the sweep the write
 * kicked, and reads what was "sent". Whether Gmail and Apple Mail render the
 * message as an invitation is not something a test here can see.
 */
const MANAGER_ID = "f1210000-0000-4000-8000-000000000001";
const MUDERRIS_ID = "f1210000-0000-4000-8000-000000000002";
const TALEBE_ID = "f1210000-0000-4000-8000-000000000003";
const PENDING_ID = "f1210000-0000-4000-8000-000000000004";
const UNVERIFIED_ID = "f1210000-0000-4000-8000-000000000005";

const TALEBE_EMAIL = "talebe@example.org";
const PENDING_EMAIL = "pending@example.org";
const WEB_URL = "https://tedris.example";
const MEETING_URL = "https://meet.example.org/siyer-gizli";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const SMTP: ISmtpConfig = {
  host: "smtp.invalid",
  port: 587,
  security: "starttls",
  auth: null,
  from: "no-reply@medaris.test",
  fromName: "Medaris",
};

/** Undo RFC 5545 folding, then read one property. */
const icsProp = (ics: string, name: string): string | undefined =>
  ics
    .replace(/\r\n /g, "")
    .split("\r\n")
    .find((l) => l.startsWith(`${name}:`))
    ?.slice(name.length + 1);

describe("Lesson invitations by e-mail (MDRS-121, e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let invitations: LessonInvitationService;
  let courseId: string;
  let sessionId: string;
  let sessionAt: Date;
  const sent: SendMailOptions[] = [];
  let failNext: Error | null = null;
  /** Fails every message it returns an error for, until cleared. */
  let failWhen: ((options: SendMailOptions) => Error | null) | null = null;

  const transport = {
    sendMail: async (options: SendMailOptions) => {
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      const error = failWhen?.(options);
      if (error) throw error;
      sent.push(options);
      return {};
    },
  };
  /** An SMTP reply as nodemailer reports it (`_formatError`). */
  const smtpError = (command: string, response: string) =>
    Object.assign(new Error(`Command failed: ${response}`), {
      code: "EENVELOPE",
      command,
      response,
      responseCode: Number(response.slice(0, 3)),
    });

  const TABLES = [...COURSE_TREE_TABLES, "audit_log", "notifications", "users"];
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const as = (sub: string, claims?: Record<string, unknown>) => {
    const auth = bearerFor({ sub, claims });
    return {
      get: (url: string) => http().get(url).set("Authorization", auth),
      post: (url: string) => http().post(url).set("Authorization", auth),
      patch: (url: string) => http().patch(url).set("Authorization", auth),
      delete: (url: string) => http().delete(url).set("Authorization", auth),
    };
  };
  const asAdmin = () =>
    as(MANAGER_ID, { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } });
  /** The talebe's own token, carrying the address the sync keeps in `users`. */
  const asTalebe = () =>
    as(TALEBE_ID, { email: TALEBE_EMAIL, email_verified: true });
  const settle = () => invitations.whenIdle();
  const sweep = async () => {
    invitations.kick();
    await settle();
  };
  const calendarOf = (mail: SendMailOptions) => {
    const event = mail.icalEvent as { method: string; content: string };
    return { method: event.method, ics: event.content };
  };
  const courseVersion = async (): Promise<number> => {
    const [row] = await db()
      .select({ version: courses.version })
      .from(courses)
      .where(eq(courses.id, courseId));
    return row.version;
  };
  const invitationRow = async (userId: string, lessonId = sessionId) => {
    const [row] = await db()
      .select()
      .from(lessonInvitations)
      .where(
        and(
          eq(lessonInvitations.lessonId, lessonId),
          eq(lessonInvitations.userId, userId)
        )
      );
    return row ?? null;
  };
  const approve = (userId: string) =>
    as(MANAGER_ID)
      .post(`/courses/${courseId}/enrollments/${userId}/approve`)
      .expect(201);

  beforeAll(async () => {
    process.env.TEDRIS_WEB_URL = WEB_URL;
    app = await createTestApp({
      overrides: [
        { provide: MAIL_CONFIG, useValue: SMTP },
        { provide: MAIL_TRANSPORT, useValue: transport },
      ],
    });
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
    invitations = app.get(LessonInvitationService);
  });

  beforeEach(async () => {
    await settle();
    await dbUtils.cleanTables(...TABLES);
    await db()
      .insert(users)
      .values([
        { id: MANAGER_ID },
        { id: MUDERRIS_ID },
        {
          id: TALEBE_ID,
          email: TALEBE_EMAIL,
          emailVerified: true,
          locale: "en",
          timeZone: "Europe/London",
        },
        { id: PENDING_ID, email: PENDING_EMAIL, emailVerified: true },
        { id: UNVERIFIED_ID, email: "unverified@example.org" },
      ]);
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: MANAGER_ID, name: "Beyazıt Köşkü" })
      .returning();
    await assignRole(db(), {
      userId: MANAGER_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: kosk.id,
      grantedBy: MANAGER_ID,
    });
    const [course] = await db()
      .insert(courses)
      .values({
        koskId: kosk.id,
        authorId: MANAGER_ID,
        title: "Siyer okumaları",
        status: CourseStatus.PUBLISHED,
        requiresApproval: true,
      })
      .returning();
    courseId = course.id;
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseId,
    });
    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Birinci hafta" })
      .returning();
    sessionAt = new Date(Math.ceil((Date.now() + 2 * DAY) / 60_000) * 60_000);
    const [session] = await db()
      .insert(lessons)
      .values({
        weekId: week.id,
        title: "Mekke yılları",
        type: LessonType.LIVE,
        durationMinutes: 60,
        scheduledAt: sessionAt,
        meetingUrl: MEETING_URL,
      })
      .returning();
    sessionId = session.id;
    await db()
      .insert(lessons)
      .values([
        // Over: never invited.
        {
          weekId: week.id,
          title: "Geçen celse",
          type: LessonType.LIVE,
          scheduledAt: new Date(Date.now() - DAY),
          orderIndex: 1,
        },
        // Beyond the 30-day horizon: invited once it comes closer.
        {
          weekId: week.id,
          title: "Uzak celse",
          type: LessonType.LIVE,
          scheduledAt: new Date(Date.now() + 60 * DAY),
          orderIndex: 2,
        },
        // Cancelled already: never invited.
        {
          weekId: week.id,
          title: "İptal celse",
          type: LessonType.LIVE,
          scheduledAt: new Date(Date.now() + 3 * DAY),
          cancelledAt: new Date(),
          orderIndex: 3,
        },
      ]);
    await db()
      .insert(enrollments)
      .values([
        { userId: TALEBE_ID, courseId, status: EnrollmentStatus.PENDING },
        { userId: PENDING_ID, courseId, status: EnrollmentStatus.PENDING },
        {
          userId: UNVERIFIED_ID,
          courseId,
          status: EnrollmentStatus.ENROLLED,
        },
      ]);
    await settle();
    sent.length = 0;
    failNext = null;
    failWhen = null;
  });

  afterAll(async () => {
    await settle();
    await dbUtils.cleanTables(...TABLES);
    await app.close();
    delete process.env.TEDRIS_WEB_URL;
  });

  it("invites an approved talebe to the upcoming session, and nobody else", async () => {
    await approve(TALEBE_ID);
    await settle();

    expect(sent).toHaveLength(1);
    const [mail] = sent;
    expect(mail.to).toBe(TALEBE_EMAIL);
    expect(mail.from).toEqual({
      name: "Medaris",
      address: "no-reply@medaris.test",
    });
    expect(mail.subject).toBe("Invitation: Siyer okumaları — Mekke yılları");
    // In the talebe's own zone: 2 days ahead, read in London.
    expect(String(mail.text)).toContain(`${WEB_URL}/account`);

    const { method, ics } = calendarOf(mail);
    expect(method).toBe("REQUEST");
    expect(icsProp(ics, "METHOD")).toBe("REQUEST");
    expect(icsProp(ics, "UID")).toBe(invitationUid(sessionId));
    expect(icsProp(ics, "SEQUENCE")).toBe("0");
    expect(icsProp(ics, "URL")).toBe(
      `${WEB_URL}/courses/${courseId}/lessons/${sessionId}`
    );

    // The meeting link is in neither the mail nor the event.
    const everything = JSON.stringify(mail);
    expect(everything).not.toContain(MEETING_URL);
    expect(everything).not.toContain("siyer-gizli");

    // The pending request, the unverified address and the sessions that are
    // over, cancelled or beyond the horizon got nothing.
    expect(sent.map((m) => m.to)).toEqual([TALEBE_EMAIL]);
    expect(await invitationRow(TALEBE_ID)).toMatchObject({
      sequence: 0,
      cancelledAt: null,
      startsAt: sessionAt,
    });
  });

  it("sends a moved session again as an update of the same event", async () => {
    await approve(TALEBE_ID);
    await settle();
    sent.length = 0;

    const movedTo = new Date(sessionAt.getTime() + DAY);
    await as(MUDERRIS_ID)
      .patch(`/lessons/${sessionId}`)
      .send({ version: await courseVersion(), scheduledAt: movedTo })
      .expect(200);
    await settle();

    expect(sent).toHaveLength(1);
    const { method, ics } = calendarOf(sent[0]);
    expect(method).toBe("REQUEST");
    expect(sent[0].subject).toMatch(/^Updated: /);
    expect(icsProp(ics, "UID")).toBe(invitationUid(sessionId));
    expect(icsProp(ics, "SEQUENCE")).toBe("1");
    expect(icsProp(ics, "DTSTART")).toBe(
      movedTo
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z")
        .replace(/[-:]/g, "")
    );

    // Nothing changed: nothing sent.
    sent.length = 0;
    await sweep();
    expect(sent).toHaveLength(0);
  });

  it("sends a cancellation when the session is cancelled", async () => {
    await approve(TALEBE_ID);
    await settle();
    sent.length = 0;

    await as(MUDERRIS_ID)
      .post(`/lessons/${sessionId}/cancel`)
      .send({ version: await courseVersion(), reason: "Müderris hasta" })
      .expect(200);
    await settle();

    expect(sent).toHaveLength(1);
    const { method, ics } = calendarOf(sent[0]);
    expect(method).toBe("CANCEL");
    expect(icsProp(ics, "METHOD")).toBe("CANCEL");
    expect(icsProp(ics, "STATUS")).toBe("CANCELLED");
    expect(icsProp(ics, "UID")).toBe(invitationUid(sessionId));
    expect(icsProp(ics, "SEQUENCE")).toBe("1");
    expect(JSON.stringify(sent[0])).not.toContain("Müderris hasta");
    expect((await invitationRow(TALEBE_ID))?.cancelledAt).not.toBeNull();

    sent.length = 0;
    await sweep();
    expect(sent).toHaveLength(0);
  });

  it("cancels a removed talebe's invitations", async () => {
    await approve(TALEBE_ID);
    await settle();
    sent.length = 0;

    await as(MUDERRIS_ID)
      .post(`/courses/${courseId}/enrollments/${TALEBE_ID}/remove`)
      .send({ reason: "Celselere katılmadı." })
      .expect(200);
    await settle();

    expect(sent.map((m) => calendarOf(m).method)).toEqual(["CANCEL"]);
  });

  it("cancels the upcoming invitations of a course that turns passive, and sends nothing more for it", async () => {
    await approve(TALEBE_ID);
    await settle();
    sent.length = 0;

    // The course's last müderris post ends: the Pasif kapsamlar rule.
    await db()
      .update(roleAssignments)
      .set({ revokedAt: new Date(), revokedBy: MANAGER_ID })
      .where(eq(roleAssignments.userId, MUDERRIS_ID));
    await sweep();

    expect(sent.map((m) => calendarOf(m).method)).toEqual(["CANCEL"]);

    // A newly approved seat in a passive course is invited to nothing.
    sent.length = 0;
    await approve(PENDING_ID);
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("cancels the invitations of a course whose köşk turns passive: its talebe can no longer open the course", async () => {
    await approve(TALEBE_ID);
    await settle();
    sent.length = 0;

    // The köşk's only nazım post ends: the passive scope the engine closes to a
    // talebe (MDRS-135), though the course still has its müderris.
    await db()
      .update(roleAssignments)
      .set({ revokedAt: new Date(), revokedBy: MANAGER_ID })
      .where(
        and(
          eq(roleAssignments.userId, MANAGER_ID),
          eq(roleAssignments.role, ASSIGNED_ROLES.KOSK_NAZIM)
        )
      );
    await sweep();

    expect(sent.map((m) => calendarOf(m).method)).toEqual(["CANCEL"]);
  });

  it("cancels the invitations of a course that is hidden", async () => {
    await approve(TALEBE_ID);
    await settle();
    sent.length = 0;

    await as(MANAGER_ID).post(`/courses/${courseId}/archive`).expect(200);
    await settle();

    expect(sent.map((m) => calendarOf(m).method)).toEqual(["CANCEL"]);
  });

  describe("opting out (B13)", () => {
    it("shows the setting on GET /me, on by default", async () => {
      const me = await asTalebe().get("/me").expect(200);
      expect(me.body.lessonInvitationEmails).toBe(true);
    });

    it("stops every further invitation, update and cancellation", async () => {
      await approve(TALEBE_ID);
      await settle();
      sent.length = 0;

      const off = await asTalebe()
        .patch("/me")
        .send({ lessonInvitationEmails: false })
        .expect(200);
      expect(off.body.lessonInvitationEmails).toBe(false);

      await as(MUDERRIS_ID)
        .patch(`/lessons/${sessionId}`)
        .send({
          version: await courseVersion(),
          scheduledAt: new Date(sessionAt.getTime() + DAY),
        })
        .expect(200);
      await as(MUDERRIS_ID)
        .post(`/lessons/${sessionId}/cancel`)
        .send({ version: await courseVersion() })
        .expect(200);
      await sweep();
      expect(sent).toHaveLength(0);
    });

    it("sends nothing to a talebe who turned it off before approval", async () => {
      await asTalebe()
        .patch("/me")
        .send({ lessonInvitationEmails: false })
        .expect(200);
      await approve(TALEBE_ID);
      await settle();
      expect(sent).toHaveLength(0);
    });

    it("refuses a null, which would leave the setting undecided", async () => {
      await asTalebe()
        .patch("/me")
        .send({ lessonInvitationEmails: null })
        .expect(400);
    });
  });

  it("sends again on a later round what the server could not take", async () => {
    failNext = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ESOCKET",
    });
    await approve(TALEBE_ID);
    await settle();
    expect(sent).toHaveLength(0);
    // The claim was undone, so nothing claims the message was sent.
    expect(await invitationRow(TALEBE_ID)).toBeNull();

    await sweep();
    expect(sent).toHaveLength(1);
    expect(icsProp(calendarOf(sent[0]).ics, "SEQUENCE")).toBe("0");
  });

  it("sends nothing to a stored address that is not one address", async () => {
    await db()
      .update(users)
      .set({ email: `${TALEBE_EMAIL}, someone-else@example.org` })
      .where(eq(users.id, TALEBE_ID));
    await approve(TALEBE_ID);
    await settle();
    expect(sent).toHaveLength(0);

    await sweep();
    expect(sent).toHaveLength(0);
  });

  it("does not retry an address the server refused for good", async () => {
    failNext = smtpError(
      "RCPT TO",
      "550 5.1.1 The email account that you tried to reach does not exist"
    );
    await approve(TALEBE_ID);
    await settle();
    expect(sent).toHaveLength(0);
    expect(await invitationRow(TALEBE_ID)).not.toBeNull();

    await sweep();
    expect(sent).toHaveLength(0);
  });

  it.each([
    [
      "a relay that denies every recipient",
      "RCPT TO",
      "550 5.7.0 Mail relay denied",
    ],
    [
      "a daily sending limit",
      "RCPT TO",
      "550 5.4.5 Daily SMTP relay limit exceeded",
    ],
    ["a refused sender", "MAIL FROM", "550 5.7.1 Sender rejected"],
    ["a refused message", "DATA", "554 5.7.0 Message rejected"],
    ["a 5xx without an enhanced code", "RCPT TO", "550 No such user"],
  ])("keeps and retries a message lost to %s, a 5xx that is not about the address", async (_, command, response) => {
    failWhen = () => smtpError(command, response);
    await approve(TALEBE_ID);
    await approve(PENDING_ID);
    await settle();
    expect(sent).toHaveLength(0);
    // Nothing is recorded as sent, and the round stopped at the first.
    expect(await invitationRow(TALEBE_ID)).toBeNull();
    expect(await invitationRow(PENDING_ID)).toBeNull();

    failWhen = null;
    await sweep();
    expect(sent.map((m) => m.to).sort()).toEqual(
      [PENDING_EMAIL, TALEBE_EMAIL].sort()
    );
  });

  it("does not let one put-off recipient hold back everyone behind it", async () => {
    failWhen = (options) =>
      options.to === TALEBE_EMAIL
        ? smtpError("RCPT TO", "452 4.2.2 The email account is over quota")
        : null;
    await approve(TALEBE_ID);
    await approve(PENDING_ID);
    await settle();
    await sweep();

    expect(sent.map((m) => m.to)).toEqual([PENDING_EMAIL]);
    expect(await invitationRow(TALEBE_ID)).toBeNull();

    failWhen = null;
    await sweep();
    expect(sent.map((m) => m.to)).toEqual([PENDING_EMAIL, TALEBE_EMAIL]);
  });

  describe("deleting what an invitation is for (MDRS-124)", () => {
    it("cancels the invitations of a deleted course, then forgets them", async () => {
      await approve(TALEBE_ID);
      await settle();
      sent.length = 0;

      await asAdmin().delete(`/courses/${courseId}`).expect(200);
      await settle();

      expect(sent).toHaveLength(1);
      const { method, ics } = calendarOf(sent[0]);
      expect(method).toBe("CANCEL");
      expect(icsProp(ics, "UID")).toBe(invitationUid(sessionId));
      expect(icsProp(ics, "SEQUENCE")).toBe("1");
      // Sent, so the row of a session that is gone is deleted.
      expect(await invitationRow(TALEBE_ID)).toBeNull();

      sent.length = 0;
      await sweep();
      expect(sent).toHaveLength(0);
    });

    it("still cancels a hidden session whose CANCEL had not gone out when it is deleted from the archive", async () => {
      await approve(TALEBE_ID);
      await settle();
      sent.length = 0;

      // Hidden while the server was down: the CANCEL is still owed.
      failWhen = () =>
        Object.assign(new Error("connect ECONNREFUSED"), { code: "ESOCKET" });
      await db()
        .update(lessons)
        .set({ archivedAt: new Date(), archivedBy: MANAGER_ID })
        .where(eq(lessons.id, sessionId));
      await sweep();
      expect(sent).toHaveLength(0);
      expect((await invitationRow(TALEBE_ID))?.cancelledAt).toBeNull();

      failWhen = null;
      await asAdmin().delete(`/archive/session/${sessionId}`).expect(204);
      await settle();

      expect(sent.map((m) => calendarOf(m).method)).toEqual(["CANCEL"]);
      expect(await invitationRow(TALEBE_ID)).toBeNull();
    });

    it("forgets, without a message, the invitation of a deleted session whose time has passed", async () => {
      await approve(TALEBE_ID);
      await settle();
      sent.length = 0;

      await db()
        .update(lessonInvitations)
        .set({ startsAt: new Date(Date.now() - HOUR) })
        .where(eq(lessonInvitations.userId, TALEBE_ID));
      await db()
        .update(lessons)
        .set({ scheduledAt: new Date(Date.now() - HOUR) })
        .where(eq(lessons.id, sessionId));
      await asAdmin().delete(`/courses/${courseId}`).expect(200);
      await settle();

      expect(sent).toHaveLength(0);
      expect(await invitationRow(TALEBE_ID)).toBeNull();
    });
  });
});
