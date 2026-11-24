import { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
import type { RecordLessonViewDto } from "./dto/lesson-view.dto";
import { LessonViewForbiddenError } from "./errors/lesson-view-forbidden.error";
import {
  type ILessonView,
  LessonViewRepository,
} from "./lesson-view.repository";

/**
 * How far a talebe has watched each celse (MDRS-248). The customer: "hangi
 * dersi nereye kadar seyrettim, dersi tamamladım mı gibi veriler görünmüyor".
 *
 * Whose records they are is the repository's, which never reads one without
 * its talebe. Whether the caller may reach the course is the engine's, through
 * `CourseService`, as for notes: a course they may not see answers as one that
 * is not there, and its content must be open to them. Writing takes an active
 * talebe on top (`mayWriteAsTalebe`); reading one's own takes an open course
 * (`mayReachOwnWriting`), so a talebe who was removed still sees how far they
 * got.
 */
@Injectable()
export class LessonViewService {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(
    private readonly views: LessonViewRepository,
    private readonly courseService: CourseService
  ) {}

  async record(
    user: AuthenticatedUser,
    lessonId: string,
    dto: RecordLessonViewDto
  ): Promise<ILessonView> {
    const courseId = await this.courseService.findVisibleLessonCourse(
      lessonId,
      user
    );
    if (!(await this.courseService.mayWriteAsTalebe(user, courseId))) {
      throw new LessonViewForbiddenError();
    }
    return this.views.record(user.sub, lessonId, courseId, {
      positionSeconds: dto.positionSeconds,
      durationSeconds: dto.durationSeconds,
      ended: dto.ended,
    });
  }

  async listForCourse(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<ILessonView[]> {
    // A course the caller may not see is not found, before anything is read.
    await this.courseService.getDetail(courseId, user, { read: true });
    if (!(await this.courseService.mayReachOwnWriting(user, courseId))) {
      throw new LessonViewForbiddenError();
    }
    return this.views.findByCourse(user.sub, courseId);
  }
}
