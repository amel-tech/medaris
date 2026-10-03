import { Injectable, Logger } from "@nestjs/common";
import { NotificationService } from "../notification/notification.service";
import type {
  NotificationInput,
  NotificationParams,
} from "../notification/notification-types";
import type { ILessonMutation } from "./course.repository.interface";
import {
  CourseNotificationRepository,
  type ICourseNotificationContext,
} from "./course-notification.repository";

/**
 * Tells talebe what the course team did to their enrolment or their sessions
 * (MDRS-213): the producers of the course types in `notification-types.ts`.
 * `CourseService` calls one method per transition, after the write has
 * succeeded.
 *
 * Like every producer, a notification that cannot be written never undoes the
 * change: the failure is logged and the write stands. Nobody is told of their
 * own action, and session news goes to the active seats (ENROLLED) alone.
 *
 * The rows carry no sentence. `params` hold what tedris words them from
 * (`tedris.NotificationsPage.types`): `courseTitle`, `source` (the köşk),
 * `reason`, the session times as ISO strings, and `courseId` for a SESSION
 * target, which tedris needs to build the session's link.
 */
@Injectable()
export class CourseNotifier {
  private readonly logger = new Logger(CourseNotifier.name);

  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: CourseNotificationRepository,
    private readonly notifications: NotificationService
  ) {}

  /** A request approved, or a revoked seat given back. */
  enrollmentApproved(
    courseId: string,
    studentId: string,
    actorId?: string
  ): Promise<void> {
    return this.tellTalebe(
      "ENROLLMENT_APPROVED",
      courseId,
      studentId,
      actorId,
      {}
    );
  }

  /** A request refused, with the team's reason when they wrote one. */
  enrollmentRejected(
    courseId: string,
    studentId: string,
    actorId?: string,
    reason?: string | null
  ): Promise<void> {
    return this.tellTalebe(
      "ENROLLMENT_REJECTED",
      courseId,
      studentId,
      actorId,
      reason ? { reason } : {}
    );
  }

  /** An active seat taken away by the team; the reason is required there. */
  removedFromCourse(
    courseId: string,
    studentId: string,
    actorId: string,
    reason: string
  ): Promise<void> {
    return this.tellTalebe(
      "REMOVED_FROM_COURSE",
      courseId,
      studentId,
      actorId,
      { reason }
    );
  }

  /** The session start as it stood before a write that may move it. */
  async sessionStartBefore(lessonId: string): Promise<Date | null> {
    try {
      return await this.repo.findSessionStart(lessonId);
    } catch (error) {
      this.logger.error(`Could not read session ${lessonId}`, error);
      return null;
    }
  }

  /**
   * A session moved from one time to another. A session given its first time,
   * one whose time was cleared, a cancelled one and one moved into the past
   * are not news to the talebe.
   */
  async sessionRescheduled(
    previousAt: Date | null,
    session: ILessonMutation,
    actorId?: string
  ): Promise<void> {
    const sessionAt = session.scheduledAt;
    if (!previousAt || !sessionAt || session.cancelledAt) return;
    if (previousAt.getTime() === sessionAt.getTime()) return;
    if (hasEnded(session, new Date())) return;
    await this.tellSeats("SESSION_RESCHEDULED", session, actorId, {
      sessionAt: sessionAt.toISOString(),
      previousAt: previousAt.toISOString(),
    });
  }

  /** A session cancelled before it ended; one with no time is not news. */
  async sessionCancelled(
    session: ILessonMutation,
    actorId?: string
  ): Promise<void> {
    if (!session.scheduledAt || hasEnded(session, new Date())) return;
    await this.tellSeats("SESSION_CANCELLED", session, actorId, {
      sessionAt: session.scheduledAt.toISOString(),
    });
  }

  private async tellTalebe(
    type: NotificationInput["type"],
    courseId: string,
    studentId: string,
    actorId: string | undefined,
    extra: NotificationParams
  ): Promise<void> {
    if (studentId === actorId) return;
    try {
      const course = await this.repo.findCourse(courseId);
      if (!course) return;
      await this.notifications.notify({
        userId: studentId,
        type,
        targetType: "COURSE",
        targetId: courseId,
        params: { ...courseParams(course), ...extra },
      });
    } catch (error) {
      this.logger.error(`Could not notify of ${type} in ${courseId}`, error);
    }
  }

  private async tellSeats(
    type: NotificationInput["type"],
    session: ILessonMutation,
    actorId: string | undefined,
    extra: NotificationParams
  ): Promise<void> {
    try {
      const course = await this.repo.findSessionCourse(session.id);
      if (!course) return;
      const recipients = (
        await this.repo.findSeatHolders(course.courseId)
      ).filter((id) => id !== actorId);
      if (recipients.length === 0) return;
      const params = {
        ...courseParams(course),
        courseId: course.courseId,
        ...extra,
      };
      await this.notifications.notify(
        ...recipients.map((userId) => ({
          userId,
          type,
          targetType: "SESSION" as const,
          targetId: session.id,
          params,
        }))
      );
    } catch (error) {
      this.logger.error(
        `Could not notify of ${type} for session ${session.id}`,
        error
      );
    }
  }
}

const courseParams = (
  course: ICourseNotificationContext
): NotificationParams => ({
  courseTitle: course.courseTitle,
  ...(course.koskName ? { source: course.koskName } : {}),
});

/** Over by `now`: its start plus its length, or its start when it has none. */
const hasEnded = (
  session: Pick<ILessonMutation, "scheduledAt" | "durationMinutes">,
  now: Date
): boolean =>
  session.scheduledAt !== null &&
  session.scheduledAt.getTime() + (session.durationMinutes ?? 0) * 60_000 <=
    now.getTime();
