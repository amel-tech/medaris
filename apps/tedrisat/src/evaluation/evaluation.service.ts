import type { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
import { EvaluationStatus } from "../course/domain/assignment-kind.enum";
import {
  type EvaluationBoardResponse,
  EvaluationColumnKind,
  type EvaluationMarkResponse,
  type OwnEvaluationResponse,
} from "./dto/evaluation.dto";
import { EvaluationForbiddenError } from "./errors/evaluation-forbidden.error";
import { EvaluationRepository } from "./evaluation.repository";

/**
 * "Değerlendirme" (MDRS-248): the course team marks each talebe on a homework
 * recited to them, "Tam", "Eksik" or "Vermedi" with an optional short note,
 * and the talebe reads their own mark on the session page.
 *
 * The course team is whoever holds `session.manage` on the course (the
 * routes' `@Authz`): the müderris by role, a ders nazırı when given it, the
 * başnazım. The board opens on the course's terms for its page (`getDetail`:
 * a hidden course or a draft is not found); a mark is written on a live
 * session of a course the caller may write to (`findWritableLessonCourse`),
 * to a talebe seated in it. A talebe reads only their own mark, on the terms
 * of their own homework (`mayReachOwnWriting`): nobody else's is reachable
 * through that route, and the course team reads marks on the board.
 */
@Injectable()
export class EvaluationService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: EvaluationRepository,
    private readonly courses: CourseService
  ) {}

  async board(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<EvaluationBoardResponse> {
    await this.courses.getDetail(courseId, user, { read: true });
    const [columns, talebe] = await Promise.all([
      this.repo.listColumns(courseId),
      this.repo.listTalebe(courseId),
    ]);
    const seated = new Set(talebe.map((t) => t.id));
    // A mark of somebody no longer seated stays kept but is not shown.
    const marks = (await this.repo.listMarks(columns)).filter((mark) =>
      seated.has(mark.userId)
    );
    return {
      columns: columns.map((column) => ({
        kind: EvaluationColumnKind.MEMORIZE,
        lessonId: column.lessonId,
        title: column.title,
        weekNumber: column.weekNumber,
        scheduledAt: column.scheduledAt,
        description: column.description,
        fullCount: marks.filter(
          (mark) =>
            mark.lessonId === column.lessonId &&
            mark.status === EvaluationStatus.FULL
        ).length,
      })),
      talebe,
      marks,
    };
  }

  async save(
    user: AuthenticatedUser,
    lessonId: string,
    userId: string,
    status: EvaluationStatus,
    note: string | null
  ): Promise<EvaluationMarkResponse> {
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    return this.repo.save(lessonId, userId, status, note, {
      courseId,
      actorId: user.sub,
    });
  }

  async own(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<OwnEvaluationResponse> {
    const courseId = await this.courses.findVisibleLessonCourse(lessonId, user);
    if (!(await this.courses.mayReachOwnWriting(user, courseId))) {
      throw new EvaluationForbiddenError();
    }
    const mark = await this.repo.findOwn(lessonId, user.sub);
    return {
      status: mark?.status ?? null,
      note: mark?.note ?? null,
      updatedAt: mark?.updatedAt ?? null,
    };
  }
}
