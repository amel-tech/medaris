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
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { byExistingCourse } from "../course/course.controller";
import { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import { LessonViewResponse, RecordLessonViewDto } from "./dto/lesson-view.dto";
import { LessonViewService } from "./lesson-view.service";

/**
 * How far a talebe has watched each celse (MDRS-248): the watch page's player
 * reports where it is, and the course page and the watch page read it back
 * as "İzlendi" or "Kaldığın yer". There is no route that returns one talebe's
 * record to anyone else, the course team and SYSTEM_ADMIN included.
 *
 * The guard asks only `course.view` of the course, which answers a missing
 * lesson or course with 404 before the handler runs; the rest is
 * `LessonViewService`'s, as for notes (MDRS-150).
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class LessonViewController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: LessonViewService) {}

  @ApiOperation({
    summary: "Record how far the caller has watched a celse",
    description:
      "Sent by the watch page's player while it plays. An enrolled talebe only (ENROLLED or COMPLETED, and not barred), while the course's content is open. The first report that ends the video or reaches nine tenths of it marks the celse watched, and the mark stays; that report also works the enrollment's `progress` out again, as the share of the course's celses watched (hidden and cancelled ones left out).",
    operationId: "recordLessonView",
  })
  @ApiOkResponse({ type: LessonViewResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "LESSON_VIEW_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("lessons/:id/view")
  record(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RecordLessonViewDto
  ): Promise<LessonViewResponse> {
    return this.service.record(request.user, id, dto);
  }

  @ApiOperation({
    summary: "The caller's watch records on a course's celses",
    description:
      "Only the caller's own, one per celse they have played; a celse never played has none. Hidden celses are left out. A talebe who was removed still reads theirs while the course is open; a course in a passive scope is closed (403 LESSON_VIEW_FORBIDDEN), and a course the caller may not see is not found.",
    operationId: "listMyLessonViews",
  })
  @ApiOkResponse({ type: [LessonViewResponse] })
  @ApiForbiddenResponse({ description: "LESSON_VIEW_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byExistingCourse)
  // Per-user answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/lesson-views")
  list(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<LessonViewResponse[]> {
    return this.service.listForCourse(request.user, id);
  }
}
