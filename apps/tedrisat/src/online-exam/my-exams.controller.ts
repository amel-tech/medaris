import { AuthGuard, Authz, AuthzGuard, PERMISSIONS } from "@medaris/common";
import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import { MyExamResponse, MyExamResultResponse } from "./dto/my-exams.dto";
import { MyExamsService } from "./my-exams.service";

/**
 * A talebe's own exams in tedris (MDRS-299, `graphs/tedris/exams/mine` and
 * `result`). "Sınavlarım" has no AuthzGuard, like Programım: it is scoped to
 * `request.user.sub` in its query, so it cannot be pointed at another
 * person's courses. The screen of one exam is guarded like the take routes.
 */
@ApiTags("my-exams")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class MyExamsController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: MyExamsService) {}

  @ApiOperation({
    summary: "Sınavlarım: every exam of the caller's courses",
    description:
      "The exams of the courses where the caller holds an ENROLLED or COMPLETED seat, written, oral and online: the open and coming ones first, soonest first, then the past ones, latest first. Each says where it stands for the caller; a score only once the course team released the results. A draft online exam is not listed, and neither is a cancelled or hidden celse, nor a course the caller left.",
    operationId: "listMyExams",
  })
  @ApiOkResponse({ type: MyExamResponse, isArray: true })
  @Header("Cache-Control", "private, no-store")
  @Get("me/exams")
  list(@Req() request: AuthorizedRequest): Promise<MyExamResponse[]> {
    return this.service.list(request.user.sub);
  }

  @ApiOperation({
    summary: "The caller's own screen of a past online exam",
    description:
      "Before the release: that the exam was taken, when and how it ended. After it: the score out of 100, the right, wrong and blank counts, the standing in each of the exam's topics and across the course's released exams, as percentages. Once the exam has also closed for everyone (closed early, or past its latest start with no attempt in progress): every question in the caller's own order, with their answer, the correct options and the points got. Only the caller's own attempt; an ENROLLED or COMPLETED seat.",
    operationId: "getMyExamResult",
  })
  @ApiOkResponse({ type: MyExamResultResponse })
  @ApiNotFoundResponse({
    description:
      "ATTEMPT_NOT_FOUND (the caller did not take the exam), EXAM_NOT_FOUND (the celse is not a published online exam, or the caller holds no seat in its course), LESSON_NOT_FOUND",
  })
  @UseGuards(AuthzGuard)
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @Header("Cache-Control", "private, no-store")
  @Get("lessons/:id/online-exam/my-result")
  result(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) lessonId: string
  ): Promise<MyExamResultResponse> {
    return this.service.result(request.user, lessonId);
  }
}
