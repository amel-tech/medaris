import {
  AuthGuard,
  Authz,
  AuthzGuard,
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
  Put,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { LiveStreamResponse, SetLiveStreamDto } from "./dto/live-stream.dto";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";
import { byLessonCourse } from "./lesson.controller";
import { LiveStreamService } from "./live-stream.service";

/**
 * A session's live stream link, for the course staff (MDRS-228, nizam 56).
 *
 * The guard asks only `VIEW` of the course, which every signed-in caller
 * holds: it is there to answer a missing course or lesson with 404 before the
 * handler runs. The decision is `session.live_link`, asked by
 * `LiveStreamService` through the permission catalogue, because the route
 * matrix cannot express a permission given to a ders nazırı (see the
 * service). Anyone without it gets 403.
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class LiveStreamController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: LiveStreamService) {}

  @ApiOperation({
    summary: "The course's live stream links, for its staff",
    description:
      "Every session of the course that has a live stream link, in programme order: what nizam's Celseler page shows the staff. `session.live_link` (the müderris and the köşk nazımı by default, a ders nazırı when given it); 403 for anyone else, so the link never reaches a caller who may not set it. The talebe reads the link from `GET /courses/:courseId/sessions/:sessionId`, and only while the session is live (MDRS-162).",
    operationId: "listCourseLiveStreams",
  })
  @ApiOkResponse({ type: [LiveStreamResponse] })
  @ApiForbiddenResponse({ description: "AUTHZ_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(SCOPES.VIEW, byParam(ENTITIES.COURSE))
  // Per-user authorization decided this answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/live-streams")
  list(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<LiveStreamResponse[]> {
    return this.service.list(id, request.user);
  }

  @ApiOperation({
    summary: "Set, change or clear a session's live stream link",
    description:
      "`session.live_link` (the müderris and the köşk nazımı by default, a ders nazırı when given it). A YouTube video link in any of its usual forms, the YouTube Studio link included, is stored as `https://www.youtube.com/live/<id>`; `null` clears it. Only a LIVE session takes one, and not once it is cancelled. Does not change the course version. Written to `audit_log` as `lesson.live_stream_set` or `lesson.live_stream_clear`.",
    operationId: "setLessonLiveStream",
  })
  @ApiOkResponse({ type: LiveStreamResponse })
  @ApiBadRequestResponse({
    description:
      "Field validation, or not a YouTube video link (LIVE_STREAM_URL_INVALID, with `problem`: not-https, not-youtube, channel, no-video, invalid, too-long, empty).",
  })
  @ApiForbiddenResponse({ description: "AUTHZ_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @ApiConflictResponse({
    description:
      "The session is not a live one (LESSON_NOT_LIVE) or is cancelled (LESSON_CANCELLED).",
  })
  @Authz(SCOPES.VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("lessons/:id/live-stream")
  set(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetLiveStreamDto
  ): Promise<LiveStreamResponse> {
    return this.service.set(id, dto.liveStreamUrl, request.user);
  }
}
