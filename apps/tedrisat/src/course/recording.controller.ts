import {
  AuthGuard,
  Authz,
  AuthzGuard,
  type AuthzResolve,
  ENTITIES,
  MedarisValidationPipe,
  SCOPES,
} from "@medaris/common";
import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { RecordingResponse } from "./dto/recording-response.dto";
import {
  CreateRecordingDto,
  UpdateRecordingDto,
} from "./dto/recording-write.dto";
import { RecordingNotFoundError } from "./errors/recording-not-found.error";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";
import { byLessonCourse } from "./lesson.controller";
import { RecordingRepository } from "./recording.repository";
import { RecordingService } from "./recording.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/recordings/:id` route against the recording's course. A
 * malformed or unknown id is answered as not-found before the handler runs,
 * as `byLessonCourse` does for a lesson.
 */
const byRecordingCourse: AuthzResolve = async (req, moduleRef) => {
  const recordingId = typeof req.params.id === "string" ? req.params.id : "";
  if (!UUID_REGEX.test(recordingId)) {
    throw new RecordingNotFoundError(recordingId);
  }
  const courseId = await moduleRef
    .get(RecordingRepository, { strict: false })
    .findRecordingCourseId(recordingId);
  if (!courseId) throw new RecordingNotFoundError(recordingId);
  return { entity: ENTITIES.COURSE, id: courseId };
};

/**
 * Adding and changing a session's recording link (MDRS-247). The guard asks
 * only `VIEW` of the course, to answer a missing lesson or recording with 404
 * before the handler runs; the decision is `recording.manage`, asked by
 * `RecordingService` through the permission catalogue (see the service).
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class RecordingController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: RecordingService) {}

  @ApiOperation({
    summary: "Add a session's recording by pasting its link",
    description:
      "`recording.manage` (the müderris and the köşk nazımı by default, a ders nazırı when given it). The recording is READY at once; its provider is read off the link's host and nothing is uploaded or called. A session holds one recording (409 RECORDING_EXISTS: change that one). A YouTube link must be PUBLIC (400 RECORDING_YOUTUBE_PUBLIC_ONLY). Written to `audit_log` as `recording.add`. Does not change the course version.",
    operationId: "createLessonRecording",
  })
  @ApiCreatedResponse({ type: RecordingResponse })
  @ApiBadRequestResponse({
    description:
      "Field validation, or a YouTube link that is not PUBLIC (RECORDING_YOUTUBE_PUBLIC_ONLY).",
  })
  @ApiForbiddenResponse({ description: "AUTHZ_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @ApiConflictResponse({
    description:
      "The session already has a recording (RECORDING_EXISTS) or is cancelled (LESSON_CANCELLED).",
  })
  @Authz(SCOPES.VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post("lessons/:id/recordings")
  add(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateRecordingDto
  ): Promise<RecordingResponse> {
    return this.service.add(id, dto, request.user);
  }

  @ApiOperation({
    summary: "Rename a recording, replace its link, or change who may watch it",
    description:
      "`recording.manage`. Only the keys sent change. A new link is READY and its provider is read again; a YouTube recording must stay PUBLIC. Written to `audit_log` as `recording.update`. Does not change the course version.",
    operationId: "updateRecording",
  })
  @ApiOkResponse({ type: RecordingResponse })
  @ApiBadRequestResponse({
    description:
      "Field validation, or a change that leaves a YouTube recording ENROLLED (RECORDING_YOUTUBE_PUBLIC_ONLY).",
  })
  @ApiForbiddenResponse({ description: "AUTHZ_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "RECORDING_NOT_FOUND" })
  @Authz(SCOPES.VIEW, byRecordingCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Patch("recordings/:id")
  change(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecordingDto
  ): Promise<RecordingResponse> {
    return this.service.change(id, dto, request.user);
  }
}
