import type { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
import { CourseNotifier } from "../course/course-notifier";
import type {
  ExamReleaseResponse,
  ExamResultResponse,
  MadrasahExamSummaryResponse,
  MyGradesResponse,
} from "./dto/exam.dto";
import { GradesForbiddenError } from "./errors/grades-forbidden.error";
import { ExamRepository } from "./exam.repository";

/**
 * Exams (MDRS-248, "Ara sınav"): the course team enters each talebe's score
 * or "Girmedi" on "Değerlendirme" and opens the results with "Sonuçları
 * talebelere aç"; a talebe reads their own on "Notlarım", a score only once
 * opened; a medrese's nazır reads how its courses' exams went.
 *
 * The course team is whoever holds `session.manage` on the course (the
 * routes' `@Authz`). A result is written on a live exam celse of a course the
 * caller may write to (`findWritableLessonCourse`), for a talebe seated in
 * it. A talebe reads only their own, on the terms of their own homework
 * (`mayReachOwnWriting`).
 */
@Injectable()
export class ExamService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: ExamRepository,
    private readonly courses: CourseService,
    private readonly notifier: CourseNotifier
  ) {}

  async saveResult(
    user: AuthenticatedUser,
    lessonId: string,
    userId: string,
    entry: { score?: number | null; absent?: boolean }
  ): Promise<ExamResultResponse> {
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    // "Girmedi" keeps no score, whatever was sent with it.
    const absent = entry.absent === true;
    return this.repo.saveResult(
      lessonId,
      userId,
      { score: absent ? null : (entry.score ?? null), absent },
      { courseId, actorId: user.sub }
    );
  }

  async release(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<ExamReleaseResponse> {
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    const released = await this.repo.release(lessonId, {
      courseId,
      actorId: user.sub,
    });
    if (released.newly) {
      await this.notifier.examResultsReleased(
        lessonId,
        released.scheduledAt,
        user.sub
      );
    }
    return { lessonId, resultsReleasedAt: released.resultsReleasedAt };
  }

  async myGrades(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<MyGradesResponse> {
    // A hidden course or a draft is not found here as on its page.
    await this.courses.getDetail(courseId, user, { read: true });
    const contentOpen = await this.courses.contentIsOpen(user, courseId);
    if (
      !contentOpen &&
      !(await this.courses.mayReachOwnWriting(user, courseId))
    ) {
      throw new GradesForbiddenError();
    }
    // Which sessions are exams or carry homework is content: a caller it is
    // closed to (a stranger, a removed or barred talebe) reads only their own
    // released results and given marks.
    return this.repo.myGrades(courseId, user.sub, { contentOpen });
  }

  madrasahSummary(madrasahId: string): Promise<MadrasahExamSummaryResponse[]> {
    return this.repo.madrasahSummary(madrasahId);
  }
}
