import {
  AuthGuard,
  Authz,
  AuthzGuard,
  type AuthzResolve,
  byParam,
  ENTITIES,
  MedarisValidationPipe,
  PERMISSIONS,
} from "@medaris/common";
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { byExistingCourse } from "../course/course.controller";
import { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import {
  AnswerLessonQuestionDto,
  AskLessonQuestionDto,
  CourseQuestionResponse,
  LessonQuestionResponse,
  PaginatedCourseQuestionResponse,
  PaginatedLessonQuestionResponse,
  UpdateLessonQuestionDto,
} from "./dto/lesson-question.dto";
import { LessonQuestionNotFoundError } from "./errors/lesson-question-not-found.error";
import { LessonQuestionRepository } from "./lesson-question.repository";
import {
  DEFAULT_PAGE_SIZE,
  LessonQuestionService,
  MAX_PAGE_SIZE,
} from "./lesson-question.service";

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

const CURSOR_QUERY = {
  name: "cursor",
  required: false,
  type: String,
  description: "`nextCursor` of the previous page; left out for the first.",
} as const;

const LIMIT_QUERY = {
  name: "limit",
  required: false,
  type: Number,
  description: `1 to ${MAX_PAGE_SIZE}, larger values are lowered to it; default ${DEFAULT_PAGE_SIZE}.`,
} as const;

/**
 * A talebe's questions to the course staff (MDRS-150).
 *
 * A question is read by its author and by whoever holds `question.answer` in
 * the course; no other talebe and no other user reads it. The staff list asks
 * `question.answer` of the course in its `@Authz`; every other route asks only
 * `course.view`, which every signed-in caller holds, to answer a missing
 * course, session or question with 404 (and a course of a hidden köşk with
 * that course's 404) before the handler runs. `LessonQuestionService` asks the
 * rest of the engine, as every read of course content does: a hidden course,
 * a draft and a passive scope close it, and who may ask is an active talebe
 * (an enrollment, no ban, the content open). Answering asks `question.answer`
 * there and not in the `@Authz`, because a refusal must read as "no such
 * question" (404) and not confirm that the question exists.
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
      "An enrolled talebe only (ENROLLED or COMPLETED, and not barred), and only while the course's content is open: a passive scope closes it. `body` is Markdown, 1 to 4000 characters after trimming; it is stored as typed and never rendered as HTML. Only the author and the people who may answer see it. No notification is sent.",
    operationId: "askLessonQuestion",
  })
  @ApiCreatedResponse({ type: LessonQuestionResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "LESSON_QUESTION_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post("lessons/:id/questions")
  ask(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AskLessonQuestionDto
  ): Promise<LessonQuestionResponse> {
    return this.service.ask(request.user, id, dto);
  }

  @ApiOperation({
    summary: "The caller's own questions in a course, with their answers",
    description:
      "Only the questions the caller asked, newest first, whoever else asked on the course and whatever has become of the caller's enrollment, while the course is open: a course in a passive scope is closed to everyone but platform management and its köşk's nazımı (403 LESSON_QUESTION_FORBIDDEN), and a hidden course or a draft is not found. One page at a time: pass `nextCursor` as `cursor` for the next. What the author's Sorularım tab reads.",
    operationId: "listMyCourseQuestions",
  })
  @ApiQuery(CURSOR_QUERY)
  @ApiQuery(LIMIT_QUERY)
  @ApiOkResponse({ type: PaginatedLessonQuestionResponse })
  @ApiBadRequestResponse({
    description:
      "A cursor this server did not issue (INVALID_QUESTION_CURSOR).",
  })
  @ApiForbiddenResponse({ description: "LESSON_QUESTION_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byParam(ENTITIES.COURSE))
  // Per-user answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/questions/mine")
  listOwn(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit", new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    limit: number
  ): Promise<PaginatedLessonQuestionResponse> {
    return this.service.listOwn(request.user, id, {
      cursor: cursor || undefined,
      limit,
    });
  }

  @ApiOperation({
    summary: "The course's questions, for the people who answer them",
    description:
      "Every question asked in the course, those still waiting first and oldest first, with who asked, one page at a time: pass `nextCursor` as `cursor` for the next. `question.answer`: the müderris by default, a ders nazırı when given it, and the catalogue's other holders (the köşk nazımı through `course.manage_all`, the başnazım). 403 for anyone else, a talebe included.",
    operationId: "listCourseQuestions",
  })
  @ApiQuery(CURSOR_QUERY)
  @ApiQuery(LIMIT_QUERY)
  @ApiOkResponse({ type: PaginatedCourseQuestionResponse })
  @ApiBadRequestResponse({
    description:
      "A cursor this server did not issue (INVALID_QUESTION_CURSOR).",
  })
  @ApiForbiddenResponse({ description: "AUTHZ_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.QUESTION_ANSWER, byExistingCourse)
  // Per-user authorization decided this answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/questions")
  list(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit", new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    limit: number
  ): Promise<PaginatedCourseQuestionResponse> {
    return this.service.listForStaff(request.user, id, {
      cursor: cursor || undefined,
      limit,
    });
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
  @Authz(PERMISSIONS.COURSE_VIEW, byQuestionCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("questions/:questionId/answer")
  answer(
    @Req() request: AuthorizedRequest,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() dto: AnswerLessonQuestionDto
  ): Promise<CourseQuestionResponse> {
    return this.service.answer(request.user, questionId, dto);
  }

  @ApiOperation({
    summary: "Edit the caller's own question",
    description:
      "While nobody has answered it: the answer belongs to the question as it was asked, so an answered question is 409. The same rule as asking otherwise: an enrolled talebe only, and `body` is Markdown, 1 to 4000 characters after trimming. 404 for a question the caller did not ask, the staff's included, as for one that does not exist.",
    operationId: "updateLessonQuestion",
  })
  @ApiOkResponse({ type: LessonQuestionResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "LESSON_QUESTION_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_QUESTION_NOT_FOUND" })
  @ApiConflictResponse({ description: "LESSON_QUESTION_ANSWERED" })
  @Authz(PERMISSIONS.COURSE_VIEW, byQuestionCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Patch("questions/:questionId")
  update(
    @Req() request: AuthorizedRequest,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() dto: UpdateLessonQuestionDto
  ): Promise<LessonQuestionResponse> {
    return this.service.update(request.user, questionId, dto);
  }

  @ApiOperation({
    summary: "Delete the caller's own question",
    description:
      "At any time, whether or not it is answered; the answer goes with it and there is no history. Needs no enrollment, so a talebe who was removed can still delete what they asked while the course is open; a passive scope closes it (403). 404 for a question the caller did not ask, the staff's included, as for one that does not exist.",
    operationId: "deleteLessonQuestion",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: "LESSON_QUESTION_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_QUESTION_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byQuestionCourse)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("questions/:questionId")
  remove(
    @Req() request: AuthorizedRequest,
    @Param("questionId", ParseUUIDPipe) questionId: string
  ): Promise<void> {
    return this.service.remove(request.user, questionId);
  }
}
