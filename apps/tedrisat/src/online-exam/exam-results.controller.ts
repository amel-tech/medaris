import { AuthGuard, Authz, AuthzGuard, PERMISSIONS } from "@medaris/common";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import {
  OnlineExamClosedResponse,
  OnlineExamResultsResponse,
  TalebeAnswersResponse,
} from "./dto/exam-results.dto";
import { ExamResultsService } from "./exam-results.service";
import { byOnlineExamCourse } from "./online-exam.controller";

const FORBIDDEN = "No `exam.prepare` on the course.";

/**
 * The course team's side of a published online exam on nazar (MDRS-299):
 * its results, read by those who prepare it, and its early close.
 */
@ApiTags("online-exams")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class ExamResultsController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: ExamResultsService) {}

  @ApiOperation({
    summary: "An online exam's results, talebe by talebe",
    description:
      "Every talebe seated in the course: not started, in progress, finished (when, how, the score, right, wrong and blank) or missed once it has closed; each switch to another tab or window with its time; the answer to the zeroth question; the standing in each topic. Over them all: the counts and the average, each topic's and each question's standing, how often each option and each zeroth option was chosen, whether the results are released, and whether the caller may release them (`session.manage`, which `releaseExamResults` asks). A draft has no results (EXAM_NOT_FOUND).",
    operationId: "getOnlineExamResults",
  })
  @ApiOkResponse({ type: OnlineExamResultsResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @Get("online-exams/:examId/results")
  results(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string
  ): Promise<OnlineExamResultsResponse> {
    return this.service.results(examId, request.user);
  }

  @ApiOperation({
    summary: "One talebe's answers on an online exam",
    description:
      "Each question in the exam's order (not the talebe's), with its options, the correct marks, which ones the talebe chose, whether it was skipped, when it was saved, how the answer stands and the points it earned; over them, the talebe's name, how and when the attempt ended, the score, each switch with its time and the zeroth answer. The team reads it before the release too. A talebe not seated in the course, or with no attempt, is ATTEMPT_NOT_FOUND; a draft is EXAM_NOT_FOUND.",
    operationId: "getOnlineExamTalebeAnswers",
  })
  @ApiOkResponse({ type: TalebeAnswersResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND, ATTEMPT_NOT_FOUND" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @Get("online-exams/:examId/results/:userId")
  talebeAnswers(
    @Param("examId", ParseUUIDPipe) examId: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<TalebeAnswersResponse> {
    return this.service.talebeAnswers(examId, userId);
  }

  @ApiOperation({
    summary: "Close an open online exam early",
    description:
      '"Sınavı erken bitir": every attempt in progress ends now with the answers saved so far, is scored and stands in Değerlendirme, and no one starts the exam any more. Refused before it opens (it is taken back to a draft then) and once it has closed. Written to `audit_log` as `online_exam.close`.',
    operationId: "closeOnlineExamEarly",
  })
  @ApiOkResponse({ type: OnlineExamClosedResponse })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({ description: "EXAM_NOT_FOUND" })
  @ApiConflictResponse({ description: "EXAM_NOT_OPEN" })
  @Authz(PERMISSIONS.EXAM_PREPARE, byOnlineExamCourse)
  @HttpCode(HttpStatus.OK)
  @Post("online-exams/:examId/close")
  close(
    @Req() request: AuthorizedRequest,
    @Param("examId", ParseUUIDPipe) examId: string
  ): Promise<OnlineExamClosedResponse> {
    return this.service.close(examId, request.user);
  }
}
