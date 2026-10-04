import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Tx } from "../course/course-purge";
import { DatabaseService } from "../database/database.service";
import { holdsIn } from "../database/role-assignments";
import {
  ASSIGNED_ROLES,
  type AssignedRole,
  roleAssignments,
} from "../database/schema/role-assignment.schema";
import { PassivationImpactChangedError } from "./errors";
import {
  confirmationMatches,
  type IImpactCourse,
  type IImpactSession,
  type IPassivationImpact,
  PASSIVATION_SESSION_WINDOW_DAYS,
  type PassivationScopeType,
  presentImpact,
} from "./passivation-impact";

const MANAGER_ROLE: Record<PassivationScopeType, AssignedRole> = {
  KOSK: ASSIGNED_ROLES.KOSK_NAZIM,
  MADRASAH: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
};

/** The table and the column the scope's own row is read from. */
const SCOPE_TABLE = {
  KOSK: { table: sql`kosks`, courseColumn: sql`c.kosk_id` },
  MADRASAH: { table: sql`madrasahs`, courseColumn: sql`c.madrasah_id` },
} as const;

/** The database or a transaction on it: the call re-measures under its row lock. */
type Exec = Pick<DatabaseService["db"], "execute"> | Tx;

@Injectable()
export class PassivationImpactRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /**
   * What passivating the scope takes along, or null when there is no such
   * scope. The courses below are every one that is not hidden: a köşk's
   * includes the courses of medreses it hosts, a medrese's includes its courses
   * in every köşk, because the engine closes both through the chain
   * (course, medrese, köşk).
   *
   * "Held" is read by the helper the engine's passive test and `revokeRole`
   * use, so the people counted as leaving are the people revoked.
   */
  async measure(
    scope: { type: PassivationScopeType; id: string },
    exec: Exec = this.db,
    now: Date = new Date()
  ): Promise<IPassivationImpact | null> {
    const id = scope.id.toLowerCase();
    const { table, courseColumn } = SCOPE_TABLE[scope.type];
    const role = MANAGER_ROLE[scope.type];

    const [row] = (
      await exec.execute<{
        name: string;
        passive: boolean;
        ever_managed: boolean;
      }>(sql`
        select s.name, s.passive_since is not null as passive,
               exists (select 1 from ${roleAssignments}
                        where ${roleAssignments.role} = ${role}
                          and ${roleAssignments.scopeId} = s.id) as ever_managed
          from ${table} s where s.id = ${id}`)
    ).rows;
    if (!row) return null;

    const staff = await exec.execute<{ user_id: string }>(sql`
      select ${roleAssignments.userId}::text as user_id from ${roleAssignments}
       where ${holdsIn(role, sql`${id}::uuid`)}
       order by ${roleAssignments.userId}`);

    const courseRows = await exec.execute<{
      id: string;
      title: string;
      status: string;
      kosk_name: string;
      live_muderris: boolean;
      enrolled: string;
      completed: string;
    }>(sql`
      select c.id, c.title, c.status, k.name as kosk_name,
             exists (select 1 from ${roleAssignments}
                      where ${holdsIn(ASSIGNED_ROLES.MUDERRIS, sql`c.id`)}) as live_muderris,
             (select count(*) from enrollments e
               where e.course_id = c.id and e.status = 'ENROLLED') as enrolled,
             (select count(*) from enrollments e
               where e.course_id = c.id and e.status = 'COMPLETED') as completed
        from courses c
        join kosks k on k.id = c.kosk_id
       where ${courseColumn} = ${id} and c.archived_at is null
       order by c.id`);

    const [students] = (
      await exec.execute<{ enrolled: string; completed: string }>(sql`
        select count(distinct e.user_id) filter (where e.status = 'ENROLLED') as enrolled,
               count(distinct e.user_id) filter (where e.status = 'COMPLETED') as completed
          from enrollments e
          join courses c on c.id = e.course_id
         where ${courseColumn} = ${id} and c.archived_at is null`)
    ).rows;

    // The predicate of the schedule and the calendar: a draft's sessions never
    // reach a talebe, a cancelled or hidden one is not held.
    const sessionRows = await exec.execute<{
      id: string;
      title: string;
      course_title: string;
      scheduled_at: Date | string;
    }>(sql`
      select l.id, l.title, c.title as course_title, l.scheduled_at
        from lessons l
        join course_weeks w on w.id = l.week_id
        join courses c on c.id = w.course_id
       where ${courseColumn} = ${id}
         and l.type = 'LIVE'
         and l.archived_at is null and w.archived_at is null
         and c.archived_at is null and c.status = 'PUBLISHED'
         and l.cancelled_at is null
         and l.scheduled_at >= ${now.toISOString()}::timestamptz
         and l.scheduled_at < ${now.toISOString()}::timestamptz
                              + make_interval(days => ${PASSIVATION_SESSION_WINDOW_DAYS})
       order by l.scheduled_at, l.id`);

    const courses: IImpactCourse[] = courseRows.rows.map((c) => ({
      id: c.id,
      title: c.title,
      koskName: c.kosk_name,
      status: c.status,
      liveMuderris: c.live_muderris,
      enrolled: Number(c.enrolled),
      completed: Number(c.completed),
    }));
    const items: IImpactSession[] = sessionRows.rows.map((s) => ({
      id: s.id,
      title: s.title,
      courseTitle: s.course_title,
      scheduledAt: new Date(s.scheduled_at),
    }));

    return {
      scope: { type: scope.type, id, name: row.name },
      alreadyPassive: row.passive,
      closesContent: row.ever_managed,
      staffIds: staff.rows.map((s) => s.user_id),
      courses,
      students: {
        enrolled: Number(students?.enrolled ?? 0),
        completed: Number(students?.completed ?? 0),
      },
      sessions: { windowDays: PASSIVATION_SESSION_WINDOW_DAYS, items },
    };
  }

  /**
   * The impact the person confirmed, measured again inside the passivating
   * transaction, under the scope's row lock. A token that is not the one these
   * numbers give, or was made for another caller, writes nothing: the fresh
   * preview comes back in the error. What enrols between this read and the
   * commit is not caught; locking the courses to catch it would block
   * enrolments for the length of an admin transaction.
   */
  async confirmed(
    tx: Tx,
    scope: { type: PassivationScopeType; id: string },
    actorId: string,
    posted: string
  ): Promise<IPassivationImpact> {
    const impact = await this.measure(scope, tx);
    if (!impact)
      throw new Error(`Passivation scope ${scope.id} vanished under its lock`);
    if (!confirmationMatches(impact, actorId, posted)) {
      throw new PassivationImpactChangedError(presentImpact(impact, actorId));
    }
    return impact;
  }
}
