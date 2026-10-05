import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { CourseStatus } from "../course/domain/course-status.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import { isPassiveScope } from "../database/role-assignments";
import { lessonInvitations } from "../database/schema/lesson-invitation.schema";
import { ASSIGNED_ROLES } from "../database/schema/role-assignment.schema";

/** Where neither the talebe nor a deleted course still names a zone. */
const FALLBACK_TIME_ZONE = "Europe/Istanbul";

/** One message the sweep owes one talebe for one session. */
export interface IInvitationDue {
  lessonId: string;
  userId: string;
  email: string;
  locale: string | null;
  /** The talebe's zone, else the course's; the mail writes the time in it. */
  timeZone: string;
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
  startsAt: Date;
  durationMinutes: number | null;
  /** SEQUENCE of the last message sent, or null when none was. */
  lastSequence: number | null;
  /** The last message sent was a CANCEL (or none was). */
  lastCancelled: boolean;
}

/** What the last message for a pair said, to put back when a send fails. */
export type IInvitationRecord = typeof lessonInvitations.$inferSelect;

type Row = {
  lesson_id: string;
  user_id: string;
  email: string;
  locale: string | null;
  time_zone: string;
  course_id: string;
  course_title: string;
  lesson_title: string;
  starts_at: Date | string;
  duration_minutes: number | null;
  last_sequence: number | null;
  last_cancelled: boolean | null;
};

const toDue = (r: Row): IInvitationDue => ({
  lessonId: r.lesson_id,
  userId: r.user_id,
  email: r.email,
  locale: r.locale,
  timeZone: r.time_zone,
  courseId: r.course_id,
  courseTitle: r.course_title,
  lessonTitle: r.lesson_title,
  // A raw `execute` skips drizzle's column mappers: timestamps arrive as text.
  startsAt: new Date(r.starts_at),
  durationMinutes: r.duration_minutes,
  lastSequence: r.last_sequence,
  lastCancelled: r.last_cancelled ?? true,
});

/**
 * Whether the session `l` of course `c` (week `w`, köşk `k`) is one a seat
 * `e` should hold an invitation for right now (MDRS-121). Written once and
 * used by both passes, so "invite" and "cancel" can never disagree:
 *
 * - the session is ahead, has a time, is not cancelled and is not hidden,
 *   nor is its week;
 * - the course is published, not hidden, in a köşk that is not hidden, and
 *   in no passive scope: not marked so, and neither the course (its müderris),
 *   its köşk (its nazım) nor its medrese (its başmüderris) left without anyone
 *   after it had one. That is the fact the engine reads to close a scope's
 *   content to a talebe (`isPassiveScope`, MDRS-135/MDRS-136), so a talebe who
 *   cannot open the course is not invited to its sessions; a lapsed post
 *   counts as gone without anyone touching the row;
 * - the seat is ENROLLED, and its holder is barred by no open ban on the
 *   course, its köşk or its medrese (MDRS-113).
 */
const SHOULD_HOLD = sql`(
  l.scheduled_at > now()
  and l.cancelled_at is null and l.archived_at is null and w.archived_at is null
  and c.status = ${CourseStatus.PUBLISHED} and c.archived_at is null
  and k.archived_at is null and c.passive_since is null
  and not (
    ${isPassiveScope(ASSIGNED_ROLES.MUDERRIS, sql`c.id`)}
    or ${isPassiveScope(ASSIGNED_ROLES.KOSK_NAZIM, sql`c.kosk_id`)}
    or ${isPassiveScope(ASSIGNED_ROLES.MEDRESE_BASMUDERRIS, sql`c.madrasah_id`)})
  and e.status = ${EnrollmentStatus.ENROLLED}
  and not exists (select 1 from bans b
             where b.user_id = e.user_id and b.lifted_at is null
               and ((b.scope = 'COURSE' and b.course_id = c.id)
                 or (b.scope = 'KOSK' and b.kosk_id = c.kosk_id)
                 or (c.madrasah_id is not null and b.madrasah_id = c.madrasah_id))))`;

/**
 * Who may be e-mailed at all: a verified address, and invitations not turned
 * off on Hesap. An unverified address may belong to someone else, who never
 * asked for Medaris mail.
 */
const MAILABLE = sql`(u.email is not null and u.email_verified and u.lesson_invitation_emails)`;

@Injectable()
export class LessonInvitationRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * Pairs owed a REQUEST: the session should be in the talebe's calendar and
   * the last message did not put it there as it is now — none was sent, the
   * last one was a CANCEL, or the time, the length or a title has changed
   * since. A first invitation is only sent once the session is within
   * `horizonDays`; an update to one already sent is sent whenever it is due.
   * Soonest session first, at most `limit`.
   */
  async findRequestsDue(
    horizonDays: number,
    limit: number
  ): Promise<IInvitationDue[]> {
    const result = await this.db.execute<Row>(sql`
      select l.id as lesson_id, e.user_id, u.email, u.locale,
             coalesce(u.time_zone, c.time_zone) as time_zone,
             c.id as course_id, c.title as course_title, l.title as lesson_title,
             l.scheduled_at as starts_at, l.duration_minutes,
             inv.sequence as last_sequence,
             (inv.lesson_id is null or inv.cancelled_at is not null) as last_cancelled
        from lessons l
        join course_weeks w on w.id = l.week_id
        join courses c on c.id = w.course_id
        join kosks k on k.id = c.kosk_id
        join enrollments e on e.course_id = c.id
        join users u on u.id = e.user_id
        left join lesson_invitations inv
               on inv.lesson_id = l.id and inv.user_id = e.user_id
       where ${SHOULD_HOLD} and ${MAILABLE}
         and (
           ((inv.lesson_id is null or inv.cancelled_at is not null)
             and l.scheduled_at < now() + make_interval(days => ${horizonDays}))
           or (inv.lesson_id is not null and inv.cancelled_at is null
             and (inv.starts_at <> l.scheduled_at
               or inv.duration_minutes is distinct from l.duration_minutes
               or inv.course_title <> c.title
               or inv.lesson_title <> l.title)))
       order by l.scheduled_at, l.id, e.user_id
       limit ${limit}`);
    return result.rows.map(toDue);
  }

  /**
   * Pairs owed a CANCEL: an invitation that still stands for a time not yet
   * come, whose session should no longer be in the talebe's calendar — or no
   * longer exists: the session, its week, its course or its köşk was deleted
   * (MDRS-124), which the outer joins read as "should not hold". The CANCEL
   * repeats what the invitation said, which is what is returned. A talebe who
   * turned invitations off is sent nothing, a cancellation included. At most
   * `limit`.
   */
  async findCancellationsDue(limit: number): Promise<IInvitationDue[]> {
    const result = await this.db.execute<Row>(sql`
      select inv.lesson_id, inv.user_id, u.email, u.locale,
             coalesce(u.time_zone, c.time_zone, ${FALLBACK_TIME_ZONE}) as time_zone,
             inv.course_id, inv.course_title, inv.lesson_title,
             inv.starts_at, inv.duration_minutes,
             inv.sequence as last_sequence, false as last_cancelled
        from lesson_invitations inv
        join users u on u.id = inv.user_id
        left join lessons l on l.id = inv.lesson_id
        left join course_weeks w on w.id = l.week_id
        left join courses c on c.id = w.course_id
        left join kosks k on k.id = c.kosk_id
        left join enrollments e
               on e.course_id = c.id and e.user_id = inv.user_id
       where inv.cancelled_at is null and inv.starts_at > now()
         and ${MAILABLE}
         and not coalesce(${SHOULD_HOLD}, false)
       order by inv.starts_at, inv.lesson_id, inv.user_id
       limit ${limit}`);
    return result.rows.map(toDue);
  }

  /**
   * Deletes the invitations whose session no longer exists once nothing is
   * left to send for them: the CANCEL went out, or the time it named has
   * passed. Until then the row is what the sweep sends the CANCEL from.
   */
  async pruneOrphans(): Promise<number> {
    const result = await this.db.execute(sql`
      delete from lesson_invitations inv
       where (inv.cancelled_at is not null or inv.starts_at <= now())
         and not exists (select 1 from lessons l where l.id = inv.lesson_id)`);
    return result.rowCount ?? 0;
  }

  async find(
    lessonId: string,
    userId: string
  ): Promise<IInvitationRecord | null> {
    const [row] = await this.db
      .select()
      .from(lessonInvitations)
      .where(
        and(
          eq(lessonInvitations.lessonId, lessonId),
          eq(lessonInvitations.userId, userId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Records the REQUEST about to be sent and returns its SEQUENCE, or null
   * when another sweep got there first (the row's SEQUENCE is no longer the
   * one read). Written before the send, so two tedrisat instances never send
   * the same message; `restore` puts the row back if the send then fails.
   */
  async claimRequest(due: IInvitationDue): Promise<number | null> {
    const values = {
      lessonId: due.lessonId,
      courseId: due.courseId,
      userId: due.userId,
      startsAt: due.startsAt,
      durationMinutes: due.durationMinutes,
      courseTitle: due.courseTitle,
      lessonTitle: due.lessonTitle,
      cancelledAt: null,
    };
    if (due.lastSequence === null) {
      const rows = await this.db
        .insert(lessonInvitations)
        .values({ ...values, sequence: 0 })
        .onConflictDoNothing()
        .returning({ sequence: lessonInvitations.sequence });
      return rows[0]?.sequence ?? null;
    }
    const rows = await this.db
      .update(lessonInvitations)
      .set({
        ...values,
        sequence: due.lastSequence + 1,
        updatedAt: new Date(),
      })
      .where(this.unchanged(due.lessonId, due.userId, due.lastSequence))
      .returning({ sequence: lessonInvitations.sequence });
    return rows[0]?.sequence ?? null;
  }

  /** As `claimRequest`, for a CANCEL: the row keeps what it said and is marked cancelled. */
  async claimCancel(due: IInvitationDue): Promise<number | null> {
    if (due.lastSequence === null) return null;
    const rows = await this.db
      .update(lessonInvitations)
      .set({
        sequence: due.lastSequence + 1,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(this.unchanged(due.lessonId, due.userId, due.lastSequence))
      .returning({ sequence: lessonInvitations.sequence });
    return rows[0]?.sequence ?? null;
  }

  /**
   * Undoes a claim whose message was not sent: the row as it was, or no row
   * when there was none. Only while the row still holds the claimed SEQUENCE.
   */
  async restore(
    lessonId: string,
    userId: string,
    claimed: number,
    previous: IInvitationRecord | null
  ): Promise<void> {
    if (!previous) {
      await this.db
        .delete(lessonInvitations)
        .where(this.unchanged(lessonId, userId, claimed));
      return;
    }
    await this.db
      .update(lessonInvitations)
      .set({
        sequence: previous.sequence,
        startsAt: previous.startsAt,
        durationMinutes: previous.durationMinutes,
        courseTitle: previous.courseTitle,
        lessonTitle: previous.lessonTitle,
        cancelledAt: previous.cancelledAt,
        updatedAt: previous.updatedAt,
      })
      .where(this.unchanged(lessonId, userId, claimed));
  }

  private unchanged(lessonId: string, userId: string, sequence: number) {
    return and(
      eq(lessonInvitations.lessonId, lessonId),
      eq(lessonInvitations.userId, userId),
      eq(lessonInvitations.sequence, sequence)
    );
  }
}
