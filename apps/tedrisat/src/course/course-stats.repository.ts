import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

export interface ICourseStats {
  enrolledCount: number;
  pendingCount: number;
  completedCount: number;
  weekCount: number;
  startedWeekCount: number;
}

/**
 * The numbers of the course overview (nizam/53). Counts only: the lessons and
 * the programme come from `GET /courses/:id`. Kept apart from
 * `CourseRepository` so that this read does not widen the repository
 * interface every unit test fakes.
 */
@Injectable()
export class CourseStatsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * `startedWeekCount` is the weeks of the programme that have begun: at least
   * one of their live lessons is dated at or before `now`. A week without a
   * dated lesson has not begun.
   */
  async stats(courseId: string, now: Date): Promise<ICourseStats> {
    const [row] = (
      await this.databaseService.db.execute<{
        enrolled: string;
        pending: string;
        completed: string;
        weeks: string;
        started: string;
      }>(sql`
        select
          (select count(*) from enrollments e
            where e.course_id = ${courseId} and e.status = 'ENROLLED') as enrolled,
          (select count(*) from enrollments e
            where e.course_id = ${courseId} and e.status = 'PENDING') as pending,
          (select count(*) from enrollments e
            where e.course_id = ${courseId} and e.status = 'COMPLETED') as completed,
          (select count(*) from course_weeks w
            where w.course_id = ${courseId} and w.archived_at is null) as weeks,
          (select count(*) from course_weeks w
            where w.course_id = ${courseId} and w.archived_at is null
              and exists (select 1 from lessons l
                           where l.week_id = w.id and l.archived_at is null
                             and l.scheduled_at is not null
                             and l.scheduled_at <= ${now.toISOString()}::timestamptz)) as started`)
    ).rows;
    return {
      enrolledCount: Number(row?.enrolled ?? 0),
      pendingCount: Number(row?.pending ?? 0),
      completedCount: Number(row?.completed ?? 0),
      weekCount: Number(row?.weeks ?? 0),
      startedWeekCount: Number(row?.started ?? 0),
    };
  }
}
