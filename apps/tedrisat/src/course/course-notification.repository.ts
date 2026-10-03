import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  courses,
  courseWeeks,
  enrollments,
  lessons,
} from "../database/schema/course.schema";
import { kosks } from "../database/schema/kosk.schema";
import { EnrollmentStatus } from "./domain/enrollment-status.enum";

/** The words a course notification is filled from (MDRS-213). */
export interface ICourseNotificationContext {
  courseId: string;
  courseTitle: string;
  koskName: string | null;
}

/**
 * The reads `CourseNotifier` needs and `CourseRepository` has no use for:
 * a course's title and köşk, and who sits in it now. Kept apart so the
 * notification producers add no method to the course repository.
 */
@Injectable()
export class CourseNotificationRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async findCourse(
    courseId: string
  ): Promise<ICourseNotificationContext | null> {
    const [row] = await this.db
      .select({
        courseId: courses.id,
        courseTitle: courses.title,
        koskName: kosks.name,
      })
      .from(courses)
      .leftJoin(kosks, eq(kosks.id, courses.koskId))
      .where(eq(courses.id, courseId))
      .limit(1);
    return row ?? null;
  }

  /** The course a session belongs to, archived or not. */
  async findSessionCourse(
    lessonId: string
  ): Promise<ICourseNotificationContext | null> {
    const [row] = await this.db
      .select({
        courseId: courses.id,
        courseTitle: courses.title,
        koskName: kosks.name,
      })
      .from(lessons)
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .innerJoin(courses, eq(courses.id, courseWeeks.courseId))
      .leftJoin(kosks, eq(kosks.id, courses.koskId))
      .where(eq(lessons.id, lessonId))
      .limit(1);
    return row ?? null;
  }

  /** When a session is set to start, read before a write that may move it. */
  async findSessionStart(lessonId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ scheduledAt: lessons.scheduledAt })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    return row?.scheduledAt ?? null;
  }

  /**
   * The talebe who hold an active seat: ENROLLED only. A request is not a
   * seat, a completion has finished the course, and a revoked seat is out.
   */
  async findSeatHolders(courseId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: enrollments.userId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseId, courseId),
          eq(enrollments.status, EnrollmentStatus.ENROLLED)
        )
      );
    return rows.map((r) => r.userId);
  }
}
