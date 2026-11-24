import { Injectable } from "@nestjs/common";
import { type SQL, sql } from "drizzle-orm";
import type { IAuditEntry } from "../audit/audit.repository";
import { inPersonSql } from "../course/domain/session-access";
import { DatabaseService } from "../database/database.service";
import { isPassiveScope } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { ASSIGNED_ROLES } from "../database/schema/role-assignment.schema";
import type {
  KoskRecordingRowResponse,
  KoskSessionRowResponse,
  KoskSessionTab,
  KoskStudentResponse,
} from "./dto/kosk-lists.dto";

/** What the caller may not be shown of a passive scope's courses (MDRS-136). */
export interface IKoskListFilter {
  /** Leave out the courses whose müderris, köşk nazımı or başmüderris has gone. */
  closePassive: boolean;
}

export interface IPage {
  limit: number;
  offset: number;
}

const asDate = (value: Date | string): Date => new Date(value);

/** Over `c` (course): the course sits in a passive scope (MDRS-136). */
const passiveCourse = sql`(${isPassiveScope(
  ASSIGNED_ROLES.MUDERRIS,
  sql`c.id`
)} or ${isPassiveScope(ASSIGNED_ROLES.KOSK_NAZIM, sql`c.kosk_id`)} or ${isPassiveScope(
  ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
  sql`c.madrasah_id`
)})`;

const openOnly = ({ closePassive }: IKoskListFilter): SQL =>
  closePassive ? sql`and not ${passiveCourse}` : sql``;

/**
 * Over `l` (lesson): the session is not over yet. One with no length is given
 * an hour, as the course's own Celseler gives it, so a session under way
 * stays among the upcoming ones until it ends.
 */
const notOver = sql`l.scheduled_at + make_interval(mins => coalesce(l.duration_minutes, 60)) >= now()`;

/** A search word as an `ilike` pattern, its wildcards taken literally. */
const likeOf = (q: string | undefined): string | null =>
  q?.trim() ? `%${q.trim().replace(/[\\%_]/g, "\\$&")}%` : null;

/**
 * The köşk-wide lists of Nizam's köşk menu (MDRS-211): every course's
 * sessions, talebe and ders kayıtları in one place. Reads only, in raw SQL
 * like the dashboard beside it. None of them hands out a meeting link or a
 * recording's address: those are the course's own pages'.
 */
@Injectable()
export class KoskListsRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Live sessions of the köşk's published, shown courses, over `l`, `w` and `c`. */
  private programme(koskId: string, filter: IKoskListFilter): SQL {
    return sql`c.kosk_id = ${koskId}
      and c.archived_at is null and c.status = 'PUBLISHED'
      and w.archived_at is null and l.archived_at is null
      and l.type = 'LIVE' and l.scheduled_at is not null ${openOnly(filter)}`;
  }

  async sessionCounts(
    koskId: string,
    filter: IKoskListFilter
  ): Promise<{ upcoming: number; past: number }> {
    const result = await this.db.execute<{
      upcoming: string;
      past: string;
    }>(sql`
      select count(*) filter (where ${notOver}) as upcoming,
             count(*) filter (where not ${notOver}) as past
        from lessons l
        join course_weeks w on w.id = l.week_id
        join courses c on c.id = w.course_id
       where ${this.programme(koskId, filter)}`);
    const [row] = result.rows;
    return {
      upcoming: Number(row?.upcoming ?? 0),
      past: Number(row?.past ?? 0),
    };
  }

  /** A page of one tab: the upcoming ones soonest first, the past ones latest first. */
  async sessions(
    koskId: string,
    tab: KoskSessionTab,
    filter: IKoskListFilter,
    page: IPage
  ): Promise<KoskSessionRowResponse[]> {
    const result = await this.db.execute<{
      id: string;
      title: string;
      course_id: string;
      course_title: string;
      madrasah_name: string | null;
      week_number: number;
      scheduled_at: Date | string;
      duration_minutes: number | null;
      cancelled: boolean;
      in_person: boolean;
    }>(sql`
      select l.id, l.title, c.id as course_id, c.title as course_title,
             m.name as madrasah_name, w.week_number, l.scheduled_at,
             l.duration_minutes, (l.cancelled_at is not null) as cancelled,
             ${inPersonSql({
               lessonInPerson: sql`l.in_person`,
               courseInPerson: sql`c.in_person`,
             })} as in_person
        from lessons l
        join course_weeks w on w.id = l.week_id
        join courses c on c.id = w.course_id
        left join madrasahs m on m.id = c.madrasah_id
       where ${this.programme(koskId, filter)}
         and ${tab === "UPCOMING" ? notOver : sql`not ${notOver}`}
       order by ${
         tab === "UPCOMING"
           ? sql`l.scheduled_at asc, l.id`
           : sql`l.scheduled_at desc, l.id`
       }
       limit ${page.limit} offset ${page.offset}`);
    return result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      courseId: r.course_id,
      courseTitle: r.course_title,
      madrasahName: r.madrasah_name,
      weekNumber: r.week_number,
      scheduledAt: asDate(r.scheduled_at),
      durationMinutes: r.duration_minutes,
      cancelled: r.cancelled,
      inPerson: r.in_person,
    }));
  }

  /**
   * The seats that make someone a talebe of the köşk: an enrolled or
   * completed one in a course of the köşk that is not hidden. Named `s`.
   */
  private seats(koskId: string, filter: IKoskListFilter): SQL {
    return sql`
      select e.user_id, c.id as course_id, c.title as course_title,
             e.status::text as status,
             e.created_at at time zone 'UTC' as created_at,
             coalesce(nullif(btrim(concat_ws(' ', u.given_name, u.family_name)), ''),
                      e.student_name) as name,
             coalesce(u.email, e.student_email) as email,
             e.student_name as seat_name, e.student_email as seat_email
        from enrollments e
        join courses c on c.id = e.course_id
        left join users u on u.id = e.user_id
       where c.kosk_id = ${koskId} and c.archived_at is null
         and e.status in ('ENROLLED', 'COMPLETED') ${openOnly(filter)}`;
  }

  /**
   * The köşk's talebe, a page of them: one row a person, newest first by
   * their first enrollment in the köşk, each with all of their courses there.
   * `q` picks the talebe by name or e-mail address: the account's, or the
   * ones the seat was taken with, which is what a course's roster shows.
   */
  async students(
    koskId: string,
    filter: IKoskListFilter & { q?: string },
    page: IPage
  ): Promise<{ items: KoskStudentResponse[]; total: number }> {
    const like = likeOf(filter.q);
    const picked = sql`
      select s.user_id, min(s.created_at) as first_at,
             max(s.name) as name, max(s.email) as email
        from (${this.seats(koskId, filter)}) s
       group by s.user_id
      ${
        like
          ? sql`having bool_or(s.name ilike ${like} or s.email ilike ${like}
                  or s.seat_name ilike ${like} or s.seat_email ilike ${like})`
          : sql``
      }`;
    const [count, people] = await Promise.all([
      this.db.execute<{ n: string }>(
        sql`select count(*) as n from (${picked}) p`
      ),
      this.db.execute<{
        user_id: string;
        first_at: Date | string;
        name: string | null;
        email: string | null;
      }>(sql`
        select p.user_id, p.first_at, p.name, p.email from (${picked}) p
         order by p.first_at desc, p.user_id
         limit ${page.limit} offset ${page.offset}`),
    ]);
    const total = Number(count.rows[0]?.n ?? 0);
    if (people.rows.length === 0) return { items: [], total };

    const courses = await this.db.execute<{
      user_id: string;
      course_id: string;
      course_title: string;
      status: string;
    }>(sql`
      select s.user_id, s.course_id, s.course_title, s.status
        from (${this.seats(koskId, filter)}) s
       where s.user_id in (${sql.join(
         people.rows.map((p) => sql`${p.user_id}`),
         sql`, `
       )})
       order by s.course_title, s.course_id`);
    return {
      total,
      items: people.rows.map((p) => ({
        userId: p.user_id,
        name: p.name,
        email: p.email,
        firstEnrolledAt: asDate(p.first_at),
        courses: courses.rows
          .filter((c) => c.user_id === p.user_id)
          .map((c) => ({
            id: c.course_id,
            title: c.course_title,
            status: c.status,
          })),
      })),
    };
  }

  /** Applications waiting in the köşk's shown courses. */
  async pendingCount(koskId: string, filter: IKoskListFilter): Promise<number> {
    const result = await this.db.execute<{ n: string }>(sql`
      select count(*) as n
        from enrollments e
        join courses c on c.id = e.course_id
       where c.kosk_id = ${koskId} and c.archived_at is null
         and e.status = 'PENDING' ${openOnly(filter)}`);
    return Number(result.rows[0]?.n ?? 0);
  }

  /** Over `r`, `l`, `w` and `c`: the ders kayıtları of the köşk's shown courses. */
  private recorded(koskId: string, filter: IKoskListFilter): SQL {
    return sql`
        from lesson_recordings r
        join lessons l on l.id = r.lesson_id
        join course_weeks w on w.id = l.week_id
        join courses c on c.id = w.course_id
       where c.kosk_id = ${koskId} and c.archived_at is null
         and w.archived_at is null and l.archived_at is null ${openOnly(filter)}`;
  }

  /**
   * The köşk's ders kayıtları, a page of them, in the order the page groups
   * them: by course, then the latest week first, then the latest session.
   */
  async recordings(
    koskId: string,
    filter: IKoskListFilter,
    page: IPage
  ): Promise<{ items: KoskRecordingRowResponse[]; total: number }> {
    const [count, rows] = await Promise.all([
      this.db.execute<{ n: string }>(
        sql`select count(*) as n ${this.recorded(koskId, filter)}`
      ),
      this.db.execute<{
        id: string;
        title: string;
        lesson_id: string;
        course_id: string;
        course_title: string;
        week_number: number;
        week_title: string;
        session_at: Date | string | null;
        duration_minutes: number | null;
        provider: string;
        status: string;
        visibility: string;
      }>(sql`
        select r.id, r.title, l.id as lesson_id, c.id as course_id,
               c.title as course_title, w.week_number, w.title as week_title,
               coalesce(l.scheduled_at, r.recorded_at) as session_at,
               r.duration_minutes, r.provider::text as provider,
               r.status::text as status, r.visibility::text as visibility
        ${this.recorded(koskId, filter)}
         order by c.title, c.id, w.week_number desc,
                  coalesce(l.scheduled_at, r.recorded_at) desc nulls last, r.id
         limit ${page.limit} offset ${page.offset}`),
    ]);
    return {
      total: Number(count.rows[0]?.n ?? 0),
      items: rows.rows.map((r) => ({
        id: r.id,
        title: r.title,
        lessonId: r.lesson_id,
        courseId: r.course_id,
        courseTitle: r.course_title,
        weekNumber: r.week_number,
        weekTitle: r.week_title,
        sessionAt: r.session_at ? asDate(r.session_at) : null,
        durationMinutes: r.duration_minutes,
        provider: r.provider,
        status: r.status,
        visibility: r.visibility,
      })),
    };
  }

  /** The reads that go on the record. */
  async record(entry: IAuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      details: entry.details ?? {},
    });
  }
}
