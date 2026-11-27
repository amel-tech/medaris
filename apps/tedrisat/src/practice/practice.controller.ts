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
  Get,
  Header,
  HttpCode,
  HttpStatus,
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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import {
  PracticeAnswerSavedResponse,
  PracticeAttemptResponse,
  PracticeAttemptSummaryResponse,
  PracticeSetSummaryResponse,
  SavePracticeAnswerDto,
} from "./dto/practice.dto";
import {
  PracticeAttemptNotFoundError,
  PracticeSetNotFoundError,
} from "./errors/practice.errors";
import { PracticeRepository } from "./practice.repository";
import { PracticeService } from "./practice.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/practice-sets/:setId` route against the set's course. A
 * draft, an exam and a malformed id are not found here: guards run before
 * pipes.
 */
export const byPracticeSetCourse: AuthzResolve = async (req, moduleRef) => {
  const setId = typeof req.params.setId === "string" ? req.params.setId : "";
  if (!UUID_REGEX.test(setId)) throw new PracticeSetNotFoundError(setId);
  const courseId = await moduleRef
    .get(PracticeRepository, { strict: false })
    .findSetCourse(setId);
  if (!courseId) throw new PracticeSetNotFoundError(setId);
  return { entity: ENTITIES.COURSE, id: courseId };
};

/**
 * Authorizes a `/practice-attempts/:attemptId` route against the course of
 * the caller's own attempt: anyone else's is not found, before any code is
 * asked.
 */
export const byPracticeAttemptCourse: AuthzResolve = async (req, moduleRef) => {
  const attemptId =
    typeof req.params.attemptId === "string" ? req.params.attemptId : "";
  const userId = req.user?.sub;
  if (!UUID_REGEX.test(attemptId) || !userId) {
    throw new PracticeAttemptNotFoundError(attemptId);
  }
  const courseId = await moduleRef
    .get(PracticeRepository, { strict: false })
    .findAttemptCourse(attemptId, userId);
  if (!courseId) throw new PracticeAttemptNotFoundError(attemptId);
  return { entity: ENTITIES.COURSE, id: courseId };
};

const SET_NOT_FOUND =
  "PRACTICE_SET_NOT_FOUND (a draft, an exam, or a set of a course the caller is no talebe of)";
const ATTEMPT_NOT_FOUND =
  "PRACTICE_ATTEMPT_NOT_FOUND (anyone else's, or of a course the caller is no longer a talebe of)";

/**
 * A talebe's çalışma soruları in tedris (MDRS-248): the published çalışma
 * setleri of their courses, and their attempts at them, as often as they
 * like. The routes of a course, a set or an attempt ask `course.view` on its
 * course, and the service a talebe's seat (`mayWriteAsTalebe`);
 * `my-practice-sets` is scoped to the caller in its query, as Sınavlarım.
 * Per-user answers; no shared cache may keep them.
 */
@ApiTags("practice")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class PracticeController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: PracticeService) {}

  @ApiOperation({
    summary: "The course's çalışma setleri, for its talebe",
    description:
      "Each published set of the course, the latest published first, with its question count (its complete questions), how many times the caller finished it, the percentage of their latest finish and the attempt they have in progress. A draft is not listed.",
    operationId: "listPracticeSets",
  })
  @ApiOkResponse({ type: [PracticeSetSummaryResponse] })
  @ApiForbiddenResponse({
    description:
      "PRACTICE_FORBIDDEN (not a talebe of the course: not enrolled, barred, or its content closed)",
  })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @UseGuards(AuthzGuard)
  @Authz(PERMISSIONS.COURSE_VIEW, byParam(ENTITIES.COURSE, "id"))
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/practice-sets")
  listCourseSets(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) courseId: string
  ): Promise<PracticeSetSummaryResponse[]> {
    return this.service.listCourseSets(request.user, courseId);
  }

  @ApiOperation({
    summary: "Çalışma setlerim: the sets of every course of the caller",
    description:
      "The published sets of the courses where the caller holds an ENROLLED or COMPLETED seat and may write as a talebe, each with its course's title and the caller's standing on it, as `listPracticeSets` gives them.",
    operationId: "listMyPracticeSets",
  })
  @ApiOkResponse({ type: [PracticeSetSummaryResponse] })
  @Header("Cache-Control", "private, no-store")
  @Get("my-practice-sets")
  listMySets(
    @Req() request: AuthorizedRequest
  ): Promise<PracticeSetSummaryResponse[]> {
    return this.service.listMySets(request.user);
  }

  @ApiOperation({
    summary: "Start a çalışma seti",
    description:
      "Starts an attempt: the set's complete questions, and each one's options, in an order of this attempt's own, with no clock. An attempt in progress is returned instead, as it stands. Nothing says which options are correct until the attempt is finished.",
    operationId: "startPracticeAttempt",
  })
  @ApiCreatedResponse({ type: PracticeAttemptResponse })
  @ApiNotFoundResponse({ description: SET_NOT_FOUND })
  @UseGuards(AuthzGuard)
  @Authz(PERMISSIONS.COURSE_VIEW, byPracticeSetCourse)
  @Header("Cache-Control", "private, no-store")
  @Post("practice-sets/:setId/attempts")
  start(
    @Req() request: AuthorizedRequest,
    @Param("setId", ParseUUIDPipe) setId: string
  ): Promise<PracticeAttemptResponse> {
    return this.service.start(request.user, setId);
  }

  @ApiOperation({
    summary: "The caller's attempts at a çalışma seti",
    description:
      "Every attempt of the caller's own at the set, the latest started first, each with its counts and percentage once finished.",
    operationId: "listPracticeAttempts",
  })
  @ApiOkResponse({ type: [PracticeAttemptSummaryResponse] })
  @ApiNotFoundResponse({ description: SET_NOT_FOUND })
  @UseGuards(AuthzGuard)
  @Authz(PERMISSIONS.COURSE_VIEW, byPracticeSetCourse)
  @Header("Cache-Control", "private, no-store")
  @Get("practice-sets/:setId/attempts")
  listAttempts(
    @Req() request: AuthorizedRequest,
    @Param("setId", ParseUUIDPipe) setId: string
  ): Promise<PracticeAttemptSummaryResponse[]> {
    return this.service.listAttempts(request.user, setId);
  }

  @ApiOperation({
    summary: "One of the caller's attempts",
    description:
      "In progress: the questions and their options in the attempt's order and the options chosen, and nothing that says which are correct. Finished: each question's options with `correct`, its outcome (CORRECT, WRONG, BLANK) and the part it got, and the counts and the percentage (every question weighs the same).",
    operationId: "getPracticeAttempt",
  })
  @ApiOkResponse({ type: PracticeAttemptResponse })
  @ApiNotFoundResponse({ description: ATTEMPT_NOT_FOUND })
  @UseGuards(AuthzGuard)
  @Authz(PERMISSIONS.COURSE_VIEW, byPracticeAttemptCourse)
  @Header("Cache-Control", "private, no-store")
  @Get("practice-attempts/:attemptId")
  get(
    @Req() request: AuthorizedRequest,
    @Param("attemptId", ParseUUIDPipe) attemptId: string
  ): Promise<PracticeAttemptResponse> {
    return this.service.get(request.user, attemptId);
  }

  @ApiOperation({
    summary: "Answer a question of an attempt",
    description:
      "Saved the moment it is chosen, replacing the answer before; none clears it. The question becomes the one the attempt goes on from.",
    operationId: "savePracticeAnswer",
  })
  @ApiOkResponse({ type: PracticeAnswerSavedResponse })
  @ApiBadRequestResponse({
    description: "PRACTICE_ANSWER_INVALID, VALIDATION_ERROR",
  })
  @ApiNotFoundResponse({
    description: `${ATTEMPT_NOT_FOUND}, PRACTICE_QUESTION_NOT_FOUND`,
  })
  @ApiConflictResponse({ description: "PRACTICE_ATTEMPT_FINISHED" })
  @UseGuards(AuthzGuard)
  @Authz(PERMISSIONS.COURSE_VIEW, byPracticeAttemptCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("practice-attempts/:attemptId/answers/:questionId")
  saveAnswer(
    @Req() request: AuthorizedRequest,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() dto: SavePracticeAnswerDto
  ): Promise<PracticeAnswerSavedResponse> {
    return this.service.saveAnswer(
      request.user,
      attemptId,
      questionId,
      dto.optionIds
    );
  }

  @ApiOperation({
    summary: "Finish an attempt",
    description:
      '"Bitir": the attempt ends with the answers saved, and the answer is the finished attempt with the correct options, each question\'s outcome and the counts and percentage. Finishing a finished attempt changes nothing. Starting the set again then begins a new attempt.',
    operationId: "finishPracticeAttempt",
  })
  @ApiOkResponse({ type: PracticeAttemptResponse })
  @ApiNotFoundResponse({ description: ATTEMPT_NOT_FOUND })
  @UseGuards(AuthzGuard)
  @Authz(PERMISSIONS.COURSE_VIEW, byPracticeAttemptCourse)
  @HttpCode(HttpStatus.OK)
  @Post("practice-attempts/:attemptId/finish")
  finish(
    @Req() request: AuthorizedRequest,
    @Param("attemptId", ParseUUIDPipe) attemptId: string
  ): Promise<PracticeAttemptResponse> {
    return this.service.finish(request.user, attemptId);
  }
}
