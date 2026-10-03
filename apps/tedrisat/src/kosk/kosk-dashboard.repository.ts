import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { kosks } from "../database/schema/kosk.schema";
import { users } from "../database/schema/user.schema";
import type {
  DashboardSessionTab,
  KoskDashboardApplicationResponse,
  KoskDashboardMuderrisResponse,
  KoskDashboardSessionResponse,
} from "./dto/kosk-dashboard.dto";

/** Days "Yaklaşan celse" looks ahead: the design says "Önümüzdeki yedi gün". */
export const UPCOMING_DAYS = 7;
/** Rows of the Geçmiş and İptal edilen tabs. */
export const TAB_ROWS = 20;

export interface IKoskDashboardNumbers {
  courses: number;
  students: number;
  pendingApplications: number;
  upcoming: number;
  past: number;
  cancelled: number;
  missingLink: number;
}

const asDate = (value: Date | string): Date => new Date(value);

/**
 * The reads under a köşk nazımı's home page (MDRS-182, nizam/02): the numbers,
 * the sessions of the tab shown, the newest applications and the müderrisler.
 * Raw SQL, like the overview beside it: each is a few counts and one list.
 * Only live sessions of published, shown courses are the köşk's programme.
 */
@Injectable()
export class KoskDashboardRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async koskName(koskId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ name: kosks.name })
      .from(kosks)
      .where(eq(kosks.id, koskId))
      .limit(1);
    return row?.name ?? null;
  }

  async givenNameOf(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ givenName: users.givenName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.givenName?.trim() || null;
  }

  /** The "live session of the programme" predicate, over `l` (lesson), `w` (week) and `c` (course). */
  private readonly programme = sql`
    c.archived_at is null and c.status = 'PUBLISHED'
    and w.archived_at is null and l.archived_at is null
    and l.type = 'LIVE' and l.scheduled_at is not null`;

  async numbers(koskId: string): Promise<IKoskDashboardNumbers> {
    const result = await this.db.execute<Record<string, string>>(sql`
      select
        (select count(*) from courses c
          where c.kosk_id = ${koskId} and c.archived_at is null) as courses,
        (select count(distinct e.user_id) from enrollments e
           join courses c on c.id = e.course_id
          where c.kosk_id = ${koskId} and c.archived_at is null
            and e.status = 'ENROLLED') as students,
        (select count(*) from enrollments e
           join courses c on c.id = e.course_id
          where c.kosk_id = ${koskId} and c.archived_at is null
            and e.status = 'PENDING') as pending,
        (select count(*) from lessons l
           join course_weeks w on w.id = l.week_id
           join courses c on c.id = w.course_id
          where c.kosk_id = ${koskId} and ${this.programme}
            and l.cancelled_at is null
            and l.scheduled_at >= now()
            and l.scheduled_at < now() + make_interval(days => ${UPCOMING_DAYS})) as upcoming,
        (select count(*) from lessons l
           join course_weeks w on w.id = l.week_id
           join courses c on c.id = w.course_id
          where c.kosk_id = ${koskId} and ${this.programme}
            and l.cancelled_at is null and l.scheduled_at < now()) as past,
        (select count(*) from lessons l
           join course_weeks w on w.id = l.week_id
           join courses c on c.id = w.course_id
          where c.kosk_id = ${koskId} and ${this.programme}
            and l.cancelled_at is not null) as cancelled,
        (select count(*) from lessons l
           join course_weeks w on w.id = l.week_id
           join courses c on c.id = w.course_id
          where c.kosk_id = ${koskId} and ${this.programme}
            and l.cancelled_at is null
            and l.scheduled_at >= now()
            and l.scheduled_at < now() + make_interval(days => ${UPCOMING_DAYS})
            and (l.meeting_url is null or btrim(l.meeting_url) = '')) as missing`);
    const r = result.rows[0] ?? {};
    return {
      courses: Number(r.courses ?? 0),
      students: Number(r.students ?? 0),
      pendingApplications: Number(r.pending ?? 0),
      upcoming: Number(r.upcoming ?? 0),
      past: Number(r.past ?? 0),
      cancelled: Number(r.cancelled ?? 0),
      missingLink: Number(r.missing ?? 0),
    };
  }

  /** The sessions of one tab; `onlyMissingLink` narrows the upcoming ones to those with no link. */
  async sessions(
    koskId: string,
    tab: DashboardSessionTab,
    opts: { onlyMissingLink?: boolean; limit?: number } = {}
  ): Promise<KoskDashboardSessionResponse[]> {
    const where =
      tab === "UPCOMING"
        ? sql`l.cancelled_at is null and l.scheduled_at >= now()
              and l.scheduled_at < now() + make_interval(days => ${UPCOMING_DAYS})
              ${opts.onlyMissingLink ? sql`and (l.meeting_url is null or btrim(l.meeting_url) = '')` : sql``}`
        : tab === "PAST"
          ? sql`l.cancelled_at is null and l.scheduled_at < now()`
          : sql`l.cancelled_at is not null`;
    const order =
      tab === "UPCOMING"
        ? sql`l.scheduled_at asc, l.id`
        : sql`l.scheduled_at desc, l.id`;
    const limit = opts.limit ?? (tab === "UPCOMING" ? 50 : TAB_ROWS);
    const result = await this.db.execute<{
      id: string;
      course_id: string;
      course_title: string;
      course_cover_hue: number;
      week_number: number;
      scheduled_at: Date | string;
      duration_minutes: number | null;
      meeting_url: string | null;
      cancelled: boolean;
      is_makeup: boolean;
      students: string;
      madrasah_name: string | null;
    }>(sql`
      select l.id, c.id as course_id, c.title as course_title,
             c.cover_hue as course_cover_hue, w.week_number,
             l.scheduled_at, l.duration_minutes, l.meeting_url,
             (l.cancelled_at is not null) as cancelled,
             exists (select 1 from lessons o
                      where o.replacement_lesson_id = l.id) as is_makeup,
             (select count(*) from enrollments e
               where e.course_id = c.id and e.status = 'ENROLLED') as students,
             m.name as madrasah_name
        from lessons l
        join course_weeks w on w.id = l.week_id
        join courses c on c.id = w.course_id
        left join madrasahs m on m.id = c.madrasah_id
       where c.kosk_id = ${koskId} and ${this.programme} and ${where}
       order by ${order}
       limit ${limit}`);
    if (result.rows.length === 0) return [];
    const courseIds = [...new Set(result.rows.map((r) => r.course_id))];
    const muderris = await this.db.execute<{
      course_id: string;
      name: string;
      is_imam: boolean;
    }>(sql`
      select cm.course_id, cm.name,
             exists (select 1 from role_assignments ra
                      where ra.role = 'MUDERRIS'
                        and ra.is_imam and ra.revoked_at is null
                        and ra.scope_id = cm.course_id
                        and ra.user_id = cm.user_id) as is_imam
        from course_muderris cm
       where cm.course_id in (${sql.join(
         courseIds.map((id) => sql`${id}`),
         sql`, `
       )})
       order by cm.order_index, cm.id`);
    return result.rows.map((r) => ({
      id: r.id,
      courseId: r.course_id,
      courseTitle: r.course_title,
      courseCoverHue: r.course_cover_hue,
      weekNumber: r.week_number,
      scheduledAt: asDate(r.scheduled_at),
      durationMinutes: r.duration_minutes,
      meetingUrl: r.meeting_url?.trim() ? r.meeting_url : null,
      isMakeup: r.is_makeup,
      studentCount: Number(r.students),
      cancelled: r.cancelled,
      madrasahName: r.madrasah_name,
      muderris: muderris.rows
        .filter((m) => m.course_id === r.course_id)
        .map((m) => ({ name: m.name, isImam: m.is_imam })),
    }));
  }

  async latestApplications(
    koskId: string,
    limit: number
  ): Promise<KoskDashboardApplicationResponse[]> {
    const result = await this.db.execute<{
      user_id: string;
      course_id: string;
      course_title: string;
      student_name: string | null;
      student_email: string | null;
      created_at: Date | string;
    }>(sql`
      select e.user_id, c.id as course_id, c.title as course_title,
             coalesce(e.student_name,
                      nullif(btrim(concat_ws(' ', u.given_name, u.family_name)), '')) as student_name,
             coalesce(e.student_email, u.email) as student_email,
             e.created_at at time zone 'UTC' as created_at
        from enrollments e
        join courses c on c.id = e.course_id
        left join users u on u.id = e.user_id
       where c.kosk_id = ${koskId} and c.archived_at is null
         and e.status = 'PENDING'
       order by e.created_at desc, e.user_id
       limit ${limit}`);
    return result.rows.map((r) => ({
      userId: r.user_id,
      courseId: r.course_id,
      courseTitle: r.course_title,
      studentName: r.student_name,
      studentEmail: r.student_email,
      requestedAt: asDate(r.created_at),
    }));
  }

  async muderris(koskId: string): Promise<KoskDashboardMuderrisResponse[]> {
    const result = await this.db.execute<{
      user_id: string | null;
      name: string;
      courses: string;
      students: string;
      madrasah_name: string | null;
    }>(sql`
      select cm.user_id, min(cm.name) as name,
             count(distinct c.id) as courses,
             (select count(distinct e.user_id) from enrollments e
               where e.status = 'ENROLLED' and e.course_id in (
                 select c2.id from courses c2
                   join course_muderris cm2 on cm2.course_id = c2.id
                  where c2.kosk_id = ${koskId} and c2.archived_at is null
                    and cm2.user_id = cm.user_id)) as students,
             min(m.name) as madrasah_name
        from course_muderris cm
        join courses c on c.id = cm.course_id
        left join madrasahs m on m.id = c.madrasah_id
       where c.kosk_id = ${koskId} and c.archived_at is null
         and cm.user_id is not null
       group by cm.user_id
       order by min(cm.name), cm.user_id`);
    return result.rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      courseCount: Number(r.courses),
      studentCount: Number(r.students),
      madrasahName: r.madrasah_name,
    }));
  }
}
