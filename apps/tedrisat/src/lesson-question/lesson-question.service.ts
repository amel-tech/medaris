import {
  AuthenticatedUser,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
import { CourseNotFoundError } from "../course/errors/course-not-found.error";
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
 * Whether the caller may reach the course at all is the engine's, through
 * `CourseService`, as for every read of course content: a hidden köşk, a
 * hidden course and a draft are closed (a session in one answers as not there),
 * and a passive scope closes the content to the enrolled talebe too. Who asks
 * is then an active talebe (`mayWriteAsTalebe`: the enrollment, no ban, the
 * content open). Who reads and who answers is one catalogue code,
 * `question.answer`: the müderris holds it in their own course, a ders nazırı
 * when it is given on the İzinler page, and the köşk nazımı and the başmüderris
 * by their role defaults, the başnazım as every code. The engine decides it
 * (`@Authz` on the staff list, `AuthzService.can` when answering).
 *
 * The author reads their own questions whatever has become of their
 * enrollment, so a talebe who was removed or barred still reads the answers
 * they were given (`mayReachOwnWriting`: a passive scope still closes them).
 */
@Injectable()
export class LessonQuestionService {
  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly questions: LessonQuestionRepository,
    private readonly courseService: CourseService,
    private readonly authz: AuthzService
  ) {}

  async ask(
    user: AuthenticatedUser,
    lessonId: string,
    dto: AskLessonQuestionDto
  ): Promise<LessonQuestionResponse> {
    const courseId = await this.courseService.findVisibleLessonCourse(
      lessonId,
      user
    );
    if (!(await this.courseService.mayWriteAsTalebe(user, courseId))) {
      throw new LessonQuestionForbiddenError();
    }
    const id = await this.questions.insert(lessonId, user.sub, dto.body);
    return own((await this.questions.findOne(id)) as ILessonQuestion);
  }

  async listOwn(
    user: AuthenticatedUser,
    courseId: string,
    options: { cursor?: string; limit: number }
  ): Promise<IPage<LessonQuestionResponse>> {
    await this.courseService.getDetail(courseId, user, { read: true });
    if (!(await this.courseService.mayReachOwnWriting(user, courseId))) {
      throw new LessonQuestionForbiddenError();
    }
    const { items, next } = await this.questions.findByAuthor(
      courseId,
      user.sub,
      options.cursor ? decodeQuestionCursor(options.cursor) : null,
      clamp(options.limit)
    );
    return {
      items: items.map(own),
      nextCursor: next ? encodeQuestionCursor(next) : null,
    };
  }

  /**
   * The course's questions, for whoever may answer them. The route has asked
   * `question.answer` already; what is left is that the course is one the
   * caller may see.
   */
  async listForStaff(
    user: AuthenticatedUser,
    courseId: string,
    options: { cursor?: string; limit: number }
  ): Promise<IPage<ILessonQuestion>> {
    await this.courseService.getDetail(courseId, user, { read: true });
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
    user: AuthenticatedUser,
    questionId: string,
    dto: UpdateLessonQuestionDto
  ): Promise<LessonQuestionResponse> {
    const courseId = await this.ownCourse(user, questionId);
    if (!(await this.courseService.mayWriteAsTalebe(user, courseId))) {
      throw new LessonQuestionForbiddenError();
    }
    if (!(await this.questions.updateBody(questionId, user.sub, dto.body))) {
      // Answered, or gone, since the check above.
      const now = await this.questions.findOwnership(questionId);
      throw now?.authorId === user.sub
        ? new LessonQuestionAnsweredError(questionId)
        : new LessonQuestionNotFoundError(questionId);
    }
    return own((await this.questions.findOne(questionId)) as ILessonQuestion);
  }

  /**
   * Deletes the author's own question, its answer with it, whether or not it
   * is answered and whatever has become of their enrollment. 404 for anyone
   * else's.
   */
  async remove(user: AuthenticatedUser, questionId: string): Promise<void> {
    const courseId = await this.ownCourse(user, questionId);
    if (!(await this.courseService.mayReachOwnWriting(user, courseId))) {
      throw new LessonQuestionForbiddenError();
    }
    if (!(await this.questions.remove(questionId, user.sub))) {
      throw new LessonQuestionNotFoundError(questionId);
    }
  }

  /**
   * Sets the answer, replacing an earlier one. 404 both for a question that
   * is not there and for one the caller may not answer (a course they may not
   * see, or no `question.answer` in it), so the question's existence is not
   * confirmed to someone who may not read it.
   */
  async answer(
    user: AuthenticatedUser,
    questionId: string,
    dto: AnswerLessonQuestionDto
  ): Promise<ILessonQuestion> {
    const courseId = await this.questions.findCourseId(questionId);
    if (
      !courseId ||
      !(await this.isVisible(user, courseId)) ||
      !(await this.authz.can(
        user,
        { entity: ENTITIES.COURSE, id: courseId },
        PERMISSIONS.QUESTION_ANSWER
      ))
    ) {
      throw new LessonQuestionNotFoundError(questionId);
    }
    await this.questions.setAnswer(questionId, user.sub, dto.body);
    return (await this.questions.findOne(questionId)) as ILessonQuestion;
  }

  /**
   * The course of a question the caller asked, for a route on the question.
   * Somebody else's question, one that is not there and one in a course the
   * caller may not see are one answer.
   */
  private async ownCourse(
    user: AuthenticatedUser,
    questionId: string
  ): Promise<string> {
    const owner = await this.questions.findOwnership(questionId);
    if (
      !owner ||
      owner.authorId !== user.sub ||
      !(await this.isVisible(user, owner.courseId))
    ) {
      throw new LessonQuestionNotFoundError(questionId);
    }
    return owner.courseId;
  }

  /** Whether `getDetail` shows the course to the caller. */
  private async isVisible(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<boolean> {
    try {
      await this.courseService.getDetail(courseId, user, { read: true });
      return true;
    } catch (error) {
      if (error instanceof CourseNotFoundError) return false;
      throw error;
    }
  }
}
