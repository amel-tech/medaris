import { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { PERMISSIONS } from "../assignment/permission-catalog";
import { ActiveTalebeService } from "../course/active-talebe.service";
import { CourseRepository } from "../course/course.repository";
import { CourseAccessService } from "../course/course-access.service";
import { LessonNotFoundError } from "../course/errors/lesson-not-found.error";
import type {
  AnswerLessonQuestionDto,
  AskLessonQuestionDto,
  LessonQuestionResponse,
  UpdateLessonQuestionDto,
} from "./dto/lesson-question.dto";
import { LessonQuestionAnsweredError } from "./errors/lesson-question-answered.error";
import { LessonQuestionForbiddenError } from "./errors/lesson-question-forbidden.error";
import { LessonQuestionNotFoundError } from "./errors/lesson-question-not-found.error";
import {
  type ILessonQuestion,
  LessonQuestionRepository,
} from "./lesson-question.repository";
import {
  decodeQuestionCursor,
  encodeQuestionCursor,
} from "./lesson-question-cursor";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

/** A page of questions with the cursor of the next one, null on the last. */
export interface IPage<T> {
  items: T[];
  nextCursor: string | null;
}

const clamp = (limit: number) => Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);

/** A question as its author reads it: without the author's own name. */
const own = ({ author: _author, ...question }: ILessonQuestion) =>
  question satisfies LessonQuestionResponse;

/**
 * A talebe's questions to the course staff (MDRS-150).
 *
 * Who asks is an active talebe of the session's course
 * (`ActiveTalebeService`). Who reads and who answers is one permission,
 * `question.answer`, asked by code (`CourseAccessService`): the müderris holds
 * it in their own course, a ders vekili holds it when it is given on the
 * İzinler page, and the catalogue's other holders (the köşk nazımı through
 * `course.manage_all`, the başnazım) hold it as they hold every course code.
 * The author reads their own questions whatever has become of their
 * enrollment, so a talebe who was removed or barred still reads the answers
 * they were given.
 */
@Injectable()
export class LessonQuestionService {
  // All four must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly questions: LessonQuestionRepository,
    private readonly courseRepo: CourseRepository,
    private readonly talebe: ActiveTalebeService,
    private readonly access: CourseAccessService
  ) {}

  async ask(
    lessonId: string,
    userId: string,
    dto: AskLessonQuestionDto
  ): Promise<LessonQuestionResponse> {
    const courseId = await this.courseRepo.findLessonCourseId(lessonId);
    if (!courseId) throw new LessonNotFoundError(lessonId);
    if (!(await this.talebe.isActive(userId, courseId))) {
      throw new LessonQuestionForbiddenError();
    }
    const id = await this.questions.insert(lessonId, userId, dto.body);
    return own((await this.questions.findOne(id)) as ILessonQuestion);
  }

  async listOwn(
    courseId: string,
    userId: string,
    options: { cursor?: string; limit: number }
  ): Promise<IPage<LessonQuestionResponse>> {
    const { items, next } = await this.questions.findByAuthor(
      courseId,
      userId,
      options.cursor ? decodeQuestionCursor(options.cursor) : null,
      clamp(options.limit)
    );
    return {
      items: items.map(own),
      nextCursor: next ? encodeQuestionCursor(next) : null,
    };
  }

  /** The course's questions, for whoever may answer them; 403 for anyone else. */
  async listForStaff(
    courseId: string,
    user: AuthenticatedUser,
    options: { cursor?: string; limit: number }
  ): Promise<IPage<ILessonQuestion>> {
    await this.access.assert(user, courseId, PERMISSIONS.QUESTION_ANSWER);
    const { items, next } = await this.questions.findByCourse(
      courseId,
      options.cursor ? decodeQuestionCursor(options.cursor) : null,
      clamp(options.limit)
    );
    return { items, nextCursor: next ? encodeQuestionCursor(next) : null };
  }

  /**
   * Rewrites the author's own question while it is unanswered. 404 for a
   * question somebody else asked, the staff's included, as for one that is not
   * there. The author must still be enrolled, as when asking; an answered
   * question is 409, because the answer belongs to the question as asked.
   */
  async update(
    questionId: string,
    userId: string,
    dto: UpdateLessonQuestionDto
  ): Promise<LessonQuestionResponse> {
    const owner = await this.questions.findOwnership(questionId);
    if (!owner || owner.authorId !== userId) {
      throw new LessonQuestionNotFoundError(questionId);
    }
    if (!(await this.talebe.isActive(userId, owner.courseId))) {
      throw new LessonQuestionForbiddenError();
    }
    if (!(await this.questions.updateBody(questionId, userId, dto.body))) {
      // Answered, or gone, since the check above.
      const now = await this.questions.findOwnership(questionId);
      throw now?.authorId === userId
        ? new LessonQuestionAnsweredError(questionId)
        : new LessonQuestionNotFoundError(questionId);
    }
    return own((await this.questions.findOne(questionId)) as ILessonQuestion);
  }

  /**
   * Deletes the author's own question, its answer with it, at any time and
   * whatever has become of their enrollment. 404 for anyone else's.
   */
  async remove(questionId: string, userId: string): Promise<void> {
    if (!(await this.questions.remove(questionId, userId))) {
      throw new LessonQuestionNotFoundError(questionId);
    }
  }

  /**
   * Sets the answer, replacing an earlier one. 404 both for a question that
   * is not there and for one the caller may not answer, so the question's
   * existence is not confirmed to someone who may not read it.
   */
  async answer(
    questionId: string,
    user: AuthenticatedUser,
    dto: AnswerLessonQuestionDto
  ): Promise<ILessonQuestion> {
    const courseId = await this.questions.findCourseId(questionId);
    if (
      !courseId ||
      !(await this.access.holds(user, courseId, PERMISSIONS.QUESTION_ANSWER))
    ) {
      throw new LessonQuestionNotFoundError(questionId);
    }
    await this.questions.setAnswer(questionId, user.sub, dto.body);
    return (await this.questions.findOne(questionId)) as ILessonQuestion;
  }
}
