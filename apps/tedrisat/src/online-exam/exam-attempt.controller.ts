import {
  AuthGuard,
  Authz,
  AuthzGuard,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import {
  ExamAnswerSavedResponse,
  ExamAttemptResponse,
  ExamBriefingResponse,
  ExamClockResponse,
  ExamHolderDto,
  SaveExamAnswerDto,
  ZerothAnswerDto,
  ZerothAnswerResponse,
} from "./dto/exam-attempt.dto";
import { ExamAttemptService } from "./exam-attempt.service";

const NOT_FOUND =
  "EXAM_NOT_FOUND (the celse is not a published online exam, or the caller holds no ENROLLED seat in its course), LESSON_NOT_FOUND";

/**
 * A talebe takes a published online exam (MDRS-299) in tedris, by its celse.
 * Every route asks `course.view` on the celse's course, and the service an
 * ENROLLED seat of the caller's own: to anyone else there is no such exam.
 * Per-user answers; no shared cache may keep them.
 */
@ApiTags("online-exam-attempts")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class ExamAttemptController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: ExamAttemptService) {}

  @ApiOperation({
    summary: "What the talebe reads before the exam",
    description:
      "\"Bilmeniz gerekenler\": the exam's title, course, length and question count, its earliest and latest start and whether it is open now, the team's instructions, the zeroth question with its options and the caller's answer, and where the caller's attempt stands. No question of the exam is sent. An attempt whose time ran out, or whose exam was closed early, is finished on this read.",
    operationId: "getExamBriefing",
  })
  @ApiOkResponse({ type: ExamBriefingResponse })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @Header("Cache-Control", "private, no-store")
  @Get("lessons/:id/online-exam")
  briefing(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) lessonId: string
  ): Promise<ExamBriefingResponse> {
    return this.service.briefing(request.user, lessonId);
  }

  @ApiOperation({
    summary: "Answer the zeroth question",
    description:
      "The caller's choice among the zeroth question's options, none correct and none scored; a second call replaces it until the attempt starts, and it stays after.",
    operationId: "answerZerothQuestion",
  })
  @ApiOkResponse({ type: ZerothAnswerResponse })
  @ApiBadRequestResponse({
    description: "ZEROTH_OPTION_NOT_FOUND, VALIDATION_ERROR",
  })
  @ApiConflictResponse({ description: "EXAM_NOT_OPEN, ZEROTH_ANSWER_LOCKED" })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("lessons/:id/online-exam/zeroth-answer")
  answerZeroth(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) lessonId: string,
    @Body() dto: ZerothAnswerDto
  ): Promise<ZerothAnswerResponse> {
    return this.service.answerZeroth(request.user, lessonId, dto.optionId);
  }

  @ApiOperation({
    summary: "Sınava başla",
    description:
      "Starts the caller's attempt and its clock, between the earliest and the latest start, with the zeroth question answered. The questions, and each question's options, are put in an order of the caller's own; the answer carries them (never which are correct), each question's points and the time left. An attempt in progress is taken over by this page, as resume does.",
    operationId: "startExamAttempt",
  })
  @ApiCreatedResponse({ type: ExamAttemptResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiConflictResponse({
    description: "EXAM_NOT_OPEN, ZEROTH_UNANSWERED, EXAM_ALREADY_TAKEN",
  })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post("lessons/:id/online-exam/attempt")
  start(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) lessonId: string,
    @Body() dto: ExamHolderDto
  ): Promise<ExamAttemptResponse> {
    return this.service.start(request.user, lessonId, dto.holderId);
  }

  @ApiOperation({
    summary: "Go on with an attempt in progress, here",
    description:
      "The same order, every saved answer, the question the talebe was on and the time left. The calling page holds the attempt from now on: the one that held it is told, on its next call, that the exam is open elsewhere (409 ATTEMPT_HELD_ELSEWHERE). Called when the page is opened again and when the connection comes back; the time away is not counted.",
    operationId: "resumeExamAttempt",
  })
  @ApiOkResponse({ type: ExamAttemptResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiNotFoundResponse({ description: `ATTEMPT_NOT_FOUND, ${NOT_FOUND}` })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @HttpCode(HttpStatus.OK)
  @Post("lessons/:id/online-exam/attempt/resume")
  resume(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) lessonId: string,
    @Body() dto: ExamHolderDto
  ): Promise<ExamAttemptResponse> {
    return this.service.resume(request.user, lessonId, dto.holderId);
  }

  @ApiOperation({
    summary: "Save one answer the moment it is chosen",
    description:
      "The options chosen for one question, or that it was skipped, and the question the talebe is on. The last save wins by the page's own count: a save whose seq is not above the stored one writes nothing and is answered with what the server holds (`written: false`).",
    operationId: "saveExamAnswer",
  })
  @ApiOkResponse({ type: ExamAnswerSavedResponse })
  @ApiBadRequestResponse({ description: "ANSWER_INVALID, VALIDATION_ERROR" })
  @ApiConflictResponse({
    description: "ATTEMPT_HELD_ELSEWHERE, ATTEMPT_ENDED",
  })
  @ApiNotFoundResponse({
    description: `ATTEMPT_NOT_FOUND, QUESTION_NOT_FOUND, ${NOT_FOUND}`,
  })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("lessons/:id/online-exam/attempt/answers/:questionId")
  saveAnswer(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) lessonId: string,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() dto: SaveExamAnswerDto
  ): Promise<ExamAnswerSavedResponse> {
    return this.service.saveAnswer(request.user, lessonId, questionId, dto);
  }

  @ApiOperation({
    summary: "Count the time while the page is connected",
    description:
      "The holding page calls it every few seconds; the time since its last call, capped, is added to the time used, so the clock stops while the connection is lost. When nothing is left the attempt finishes by the time, with the answers saved so far, and the answer says FINISHED.",
    operationId: "tickExamClock",
  })
  @ApiOkResponse({ type: ExamClockResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiConflictResponse({ description: "ATTEMPT_HELD_ELSEWHERE" })
  @ApiNotFoundResponse({ description: `ATTEMPT_NOT_FOUND, ${NOT_FOUND}` })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @HttpCode(HttpStatus.OK)
  @Post("lessons/:id/online-exam/attempt/clock")
  tick(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) lessonId: string,
    @Body() dto: ExamHolderDto
  ): Promise<ExamClockResponse> {
    return this.service.tick(request.user, lessonId, dto.holderId);
  }

  @ApiOperation({
    summary: "Count a deliberate switch to another tab or window",
    description:
      "Called by the page when the talebe comes back from another tab or window. The switch is kept with its time for the team; nothing is erased and the attempt goes on where it was.",
    operationId: "recordTabSwitch",
  })
  @ApiOkResponse({ type: ExamAttemptResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiConflictResponse({
    description: "ATTEMPT_HELD_ELSEWHERE, ATTEMPT_ENDED",
  })
  @ApiNotFoundResponse({ description: `ATTEMPT_NOT_FOUND, ${NOT_FOUND}` })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @HttpCode(HttpStatus.OK)
  @Post("lessons/:id/online-exam/attempt/switch")
  recordSwitch(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) lessonId: string,
    @Body() dto: ExamHolderDto
  ): Promise<ExamAttemptResponse> {
    return this.service.recordSwitch(request.user, lessonId, dto.holderId);
  }

  @ApiOperation({
    summary: "Sınavı bitir",
    description:
      "Ends the caller's attempt with the answers saved so far and scores it from the exact points. Only the holding page may end it. An attempt finished meanwhile, by the time or an early close, is answered as it ended.",
    operationId: "finishExamAttempt",
  })
  @ApiOkResponse({ type: ExamAttemptResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiConflictResponse({ description: "ATTEMPT_HELD_ELSEWHERE" })
  @ApiNotFoundResponse({ description: `ATTEMPT_NOT_FOUND, ${NOT_FOUND}` })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @HttpCode(HttpStatus.OK)
  @Post("lessons/:id/online-exam/attempt/finish")
  finish(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) lessonId: string,
    @Body() dto: ExamHolderDto
  ): Promise<ExamAttemptResponse> {
    return this.service.finishAttempt(request.user, lessonId, dto.holderId);
  }
}
