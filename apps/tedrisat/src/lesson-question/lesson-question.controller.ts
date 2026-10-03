import {
  AuthGuard,
  Authz,
  AuthzGuard,
  type AuthzResolve,
  byParam,
  ENTITIES,
  MedarisValidationPipe,
  SCOPES,
} from "@medaris/common";
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import {
  AnswerLessonQuestionDto,
  AskLessonQuestionDto,
  CourseQuestionResponse,
  LessonQuestionResponse,
} from "./dto/lesson-question.dto";
import { LessonQuestionNotFoundError } from "./errors/lesson-question-not-found.error";
import { LessonQuestionRepository } from "./lesson-question.repository";
import { LessonQuestionService } from "./lesson-question.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes `/questions/:questionId` against the question's course, and
 * answers a missing or malformed id as not-found before the handler runs.
 */
const byQuestionCourse: AuthzResolve = async (req, moduleRef) => {
  const questionId =
    typeof req.params.questionId === "string" ? req.params.questionId : "";
  const courseId = UUID_REGEX.test(questionId)
    ? await moduleRef
        .get(LessonQuestionRepository, { strict: false })
        .findCourseId(questionId)
    : null;
  if (!courseId) throw new LessonQuestionNotFoundError(questionId);
  return { entity: ENTITIES.COURSE, id: courseId };
};

/**
 * A talebe's questions to the course staff (MDRS-150).
 *
 * A question is read by its author and by whoever holds `question.answer` in
 * the course; no other talebe and no other user reads it. The guard asks only
 * `VIEW` of the course, which every signed-in caller holds: it is there to
 * answer a missing course, session or question with 404 before the handler
 * runs. Who may ask is `LessonQuestionService`'s question (an active
 * enrollment), and who may read or answer is the permission catalogue's,
 * asked there by code, because the route matrix has no row for a ders nazırı.
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class LessonQuestionController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: LessonQuestionService) {}

  @ApiOperation({
    summary: "Ask the course staff a question on a session",
    description:
      "An enrolled talebe only (ENROLLED or COMPLETED, and not barred). `body` is Markdown, 1 to 4000 characters after trimming; it is stored as typed and never rendered as HTML. Only the author and the people who may answer see it. No notification is sent.",
    operationId: "askLessonQuestion",
  })
  @ApiCreatedResponse({ type: LessonQuestionResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "LESSON_QUESTION_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(SCOPES.VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post("lessons/:id/questions")
  ask(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AskLessonQuestionDto
  ): Promise<LessonQuestionResponse> {
    return this.service.ask(id, request.user.sub, dto);
  }

  @ApiOperation({
    summary: "The caller's own questions in a course, with their answers",
    description:
      "Only the questions the caller asked, newest first, whoever else asked on the course and whatever has become of the caller's enrollment. What the author's Sorularım tab reads.",
    operationId: "listMyCourseQuestions",
  })
  @ApiOkResponse({ type: [LessonQuestionResponse] })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(SCOPES.VIEW, byParam(ENTITIES.COURSE))
  // Per-user answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/questions/mine")
  listOwn(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<LessonQuestionResponse[]> {
    return this.service.listOwn(id, request.user.sub);
  }

  @ApiOperation({
    summary: "The course's questions, for the people who answer them",
    description:
      "Every question asked in the course, those still waiting first and oldest first, with who asked. `question.answer`: the müderris by default, a ders nazırı when given it, and the catalogue's other holders (the köşk nazımı through `course.manage_all`, the başnazım). 403 for anyone else, a talebe included.",
    operationId: "listCourseQuestions",
  })
  @ApiOkResponse({ type: [CourseQuestionResponse] })
  @ApiForbiddenResponse({ description: "AUTHZ_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(SCOPES.VIEW, byParam(ENTITIES.COURSE))
  // Per-user authorization decided this answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/questions")
  list(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseQuestionResponse[]> {
    return this.service.listForStaff(id, request.user);
  }

  @ApiOperation({
    summary: "Answer a question, or replace the answer",
    description:
      "`question.answer`. Answering again replaces the earlier answer; there is no history. `body` is Markdown, 1 to 4000 characters after trimming. 404 for a question that does not exist and for one in a course where the caller may not answer, so its existence is not confirmed to them. No notification is sent.",
    operationId: "answerLessonQuestion",
  })
  @ApiOkResponse({ type: CourseQuestionResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiNotFoundResponse({ description: "LESSON_QUESTION_NOT_FOUND" })
  @Authz(SCOPES.VIEW, byQuestionCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("questions/:questionId/answer")
  answer(
    @Req() request: AuthorizedRequest,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() dto: AnswerLessonQuestionDto
  ): Promise<CourseQuestionResponse> {
    return this.service.answer(questionId, request.user, dto);
  }
}
