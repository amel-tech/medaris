import { AuthGuard } from "@medaris/common";
import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  ZerothAnswerCountsResponse,
  ZerothAnswersQuery,
  ZerothQuestionExamsResponse,
} from "./dto/zeroth-answers.dto";
import { ZerothAnswersService } from "./zeroth-answers.service";

const FORBIDDEN =
  "`exam.zeroth_read` is held neither in the platform scope nor in the köşk asked for (a köşk nazımı holds it in their köşk).";

/**
 * nizam's "Sıfırıncı soru cevapları" (MDRS-299): how the zeroth question of
 * the online exams was answered, in aggregate. Read-only. No `AuthzGuard`:
 * "in the platform or in some köşk of mine" is no single resource, so
 * `ZerothAnswersService` decides, as the audit trail's service does.
 *
 * No name, no user id and no single answer is ever sent; every count is sent
 * as it is.
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nizam/exam-zeroth-answers")
export class ZerothAnswersController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: ZerothAnswersService) {}

  @ApiOperation({
    summary: "How the zeroth questions were answered, in aggregate",
    description:
      "The zeroth questions of the published online exams whose celse falls in the span and the place, the same words with the same options counted together: how many exams asked each, how many talebe answered and how many chose each option, every count as it is. Written to `audit_log` as `exam.zeroth_read`.",
    operationId: "listZerothAnswerCounts",
  })
  @ApiOkResponse({ type: ZerothAnswerCountsResponse })
  @ApiBadRequestResponse({
    description:
      "VALIDATION_ERROR: a span with no end, or one that ends before it starts",
  })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @Get()
  counts(
    @Req() request: AuthenticatedUserRequest,
    @Query() query: ZerothAnswersQuery
  ): Promise<ZerothAnswerCountsResponse> {
    return this.service.counts(request.user, query);
  }

  @ApiOperation({
    summary: "The exams that asked one zeroth question, each with its counts",
    description:
      "A row per exam, newest first, with a count per option, and the combined counts as their sums, which are the list's. Every count as it is. Written to `audit_log` as `exam.zeroth_read`.",
    operationId: "getZerothQuestionExams",
  })
  @ApiOkResponse({ type: ZerothQuestionExamsResponse })
  @ApiBadRequestResponse({ description: "VALIDATION_ERROR" })
  @ApiForbiddenResponse({ description: FORBIDDEN })
  @ApiNotFoundResponse({
    description:
      "ZEROTH_QUESTION_NOT_FOUND: no exam in the span and the place asked it",
  })
  @Get(":questionKey")
  questionExams(
    @Req() request: AuthenticatedUserRequest,
    @Param("questionKey") questionKey: string,
    @Query() query: ZerothAnswersQuery
  ): Promise<ZerothQuestionExamsResponse> {
    return this.service.questionExams(request.user, questionKey, query);
  }
}
