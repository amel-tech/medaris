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
} from "./dto/lesson-question.dto";
import { LessonQuestionForbiddenError } from "./errors/lesson-question-forbidden.error";
import { LessonQuestionNotFoundError } from "./errors/lesson-question-not-found.error";
import {
  type ILessonQuestion,
  LessonQuestionRepository,
} from "./lesson-question.repository";

/** A question as its author reads it: without the author's own name. */
const own = ({ author: _author, ...question }: ILessonQuestion) =>
  question satisfies LessonQuestionResponse;

/**
 * A talebe's questions to the course staff (MDRS-150).
 *
 * Who asks is an active talebe of the session's course
 * (`ActiveTalebeService`). Who reads and who answers is one permission,
 * `question.answer`, asked by code (`CourseAccessService`): the müderris holds
 * it in their own course, a ders nazırı holds it when it is given on the
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
    userId: string
  ): Promise<LessonQuestionResponse[]> {
    return (await this.questions.findByAuthor(courseId, userId)).map(own);
  }

  /** The course's questions, for whoever may answer them; 403 for anyone else. */
  async listForStaff(
    courseId: string,
    user: AuthenticatedUser
  ): Promise<ILessonQuestion[]> {
    await this.access.assert(user, courseId, PERMISSIONS.QUESTION_ANSWER);
    return this.questions.findByCourse(courseId);
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
