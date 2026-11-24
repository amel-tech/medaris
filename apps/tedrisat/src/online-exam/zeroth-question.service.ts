import type { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
import {
  type CourseZerothQuestionResponse,
  type MadrasahZerothQuestionResponse,
  ZerothQuestionSource,
  type ZerothQuestionText,
} from "./dto/zeroth-question.dto";
import {
  type IMadrasahZerothQuestion,
  type IZerothQuestion,
  ZerothQuestionRepository,
} from "./zeroth-question.repository";

const answer = (
  question: IMadrasahZerothQuestion | null
): MadrasahZerothQuestionResponse => ({
  text: question?.text ?? "",
  options: question?.options ?? [],
  updatedAt: question?.updatedAt.toISOString() ?? null,
});

const textOf = (
  question: IMadrasahZerothQuestion | null
): ZerothQuestionText | null =>
  question
    ? {
        text: question.text,
        options: question.options,
        updatedAt: question.updatedAt.toISOString(),
      }
    : null;

/**
 * A medrese's zeroth question (MDRS-299). The owner, 22 Nov 2026, relaying
 * the medrese: the same question for every exam of a term ("vize"), changed
 * for the next ("final"). A change reaches only the exams published after
 * it: publishing copies the question into the exam. The routes' resolver
 * answers an unknown medrese as not found before this runs.
 */
@Injectable()
export class ZerothQuestionService {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(
    private readonly repo: ZerothQuestionRepository,
    private readonly courses: CourseService
  ) {}

  async get(madrasahId: string): Promise<MadrasahZerothQuestionResponse> {
    return answer(await this.repo.findForMadrasah(madrasahId));
  }

  async save(
    madrasahId: string,
    input: IZerothQuestion,
    actorId: string
  ): Promise<MadrasahZerothQuestionResponse> {
    return answer(await this.repo.replace(madrasahId, input, actorId));
  }

  /**
   * A course's zeroth question (the owner, 22 Nov 2026: "ders özelinde
   * sıfırıncı soru mümkün olsun, medreseninki default olur ders özelinde
   * değişebilir"): its own if it has one, else its medrese's. A course the
   * caller may not see is not found.
   */
  async getForCourse(
    courseId: string,
    user: AuthenticatedUser
  ): Promise<CourseZerothQuestionResponse> {
    await this.courses.getDetail(courseId, user);
    const { own, madrasah, inMadrasah } =
      await this.repo.findForCourseOrMadrasah(courseId);
    return {
      own: textOf(own),
      madrasah: textOf(madrasah),
      applies: own
        ? ZerothQuestionSource.COURSE
        : madrasah
          ? ZerothQuestionSource.MADRASAH
          : ZerothQuestionSource.NONE,
      inMadrasah,
    };
  }

  /** Gives the course a question of its own, which its exams ask from the next one published. */
  async saveForCourse(
    courseId: string,
    input: IZerothQuestion,
    user: AuthenticatedUser
  ): Promise<CourseZerothQuestionResponse> {
    await this.courses.getDetail(courseId, user);
    await this.repo.replaceForCourse(courseId, input, user.sub);
    return this.getForCourse(courseId, user);
  }

  /** Takes the course's own question off: its exams ask the medrese's again. */
  async removeForCourse(
    courseId: string,
    user: AuthenticatedUser
  ): Promise<CourseZerothQuestionResponse> {
    await this.courses.getDetail(courseId, user);
    await this.repo.removeForCourse(courseId, user.sub);
    return this.getForCourse(courseId, user);
  }
}
