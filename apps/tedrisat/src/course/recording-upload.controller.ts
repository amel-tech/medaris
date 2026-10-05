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
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  RecordingUploadResponse,
  StartRecordingUploadDto,
} from "./dto/recording-upload.dto";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";
import { byLessonCourse } from "./lesson.controller";
import { RecordingUploadService } from "./recording-upload.service";

/**
 * Uploading a session's recording to Bunny Stream (MDRS-116, part A).
 *
 * The decision is `recording.upload` on the lesson's course, asked in the
 * route's `@Authz` (the müderris and the köşk nazımı hold it by default, a ders
 * nazırı through a grant): a missing lesson is 404, anyone without it — a
 * talebe included — gets 403, both before the handler and before the library's
 * configuration is looked at.
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class RecordingUploadController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: RecordingUploadService) {}

  @ApiOperation({
    summary: "Start uploading a session's recording to Bunny Stream",
    description:
      "`recording.upload` (the müderris and the köşk nazımı by default, a ders nazırı when given it). Creates the video in the Medaris Bunny Stream library, records it as the session's recording with `provider` BUNNY and `status` PROCESSING, and returns what the browser needs for a TUS upload straight to Bunny; the file never passes through this API. The signature expires 24 hours later. A session that already has a recording is refused with 409, unless that recording is a Bunny upload that FAILED, which this one replaces. Written to `audit_log` as `recording.upload_start`. The recording becomes READY or FAILED when the encoding poll sees Bunny finish.",
    operationId: "startRecordingUpload",
  })
  @ApiCreatedResponse({ type: RecordingUploadResponse })
  @ApiBadRequestResponse({ description: "Field validation." })
  @ApiForbiddenResponse({ description: "AUTHZ_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @ApiConflictResponse({ description: "RECORDING_EXISTS" })
  @ApiServiceUnavailableResponse({
    description:
      "BUNNY_STREAM_NOT_CONFIGURED (the library is not set on this server) or BUNNY_STREAM_UNAVAILABLE (Bunny did not answer).",
  })
  @Authz(PERMISSIONS.RECORDING_UPLOAD, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  // The signature is for this caller's upload only; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Post("lessons/:id/recordings/uploads")
  start(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: StartRecordingUploadDto
  ): Promise<RecordingUploadResponse> {
    return this.service.start(id, dto, request.user);
  }

  @ApiOperation({
    summary: "Sign a session's Bunny upload again, to resume it",
    description:
      "`recording.upload`, as for starting one. Returns the same video's TUS values so an interrupted upload continues where it stopped. The expiry is the upload's original one: signing again never extends it. 409 once the upload is no longer PROCESSING or its lifetime has passed (RECORDING_UPLOAD_CLOSED, with `reason`).",
    operationId: "resignRecordingUpload",
  })
  @ApiOkResponse({ type: RecordingUploadResponse })
  @ApiForbiddenResponse({ description: "AUTHZ_FORBIDDEN" })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND or RECORDING_UPLOAD_NOT_FOUND",
  })
  @ApiConflictResponse({ description: "RECORDING_UPLOAD_CLOSED" })
  @ApiServiceUnavailableResponse({ description: "BUNNY_STREAM_NOT_CONFIGURED" })
  @Authz(PERMISSIONS.RECORDING_UPLOAD, byLessonCourse)
  @Header("Cache-Control", "private, no-store")
  @HttpCode(HttpStatus.OK)
  @Post("lessons/:id/recordings/uploads/:videoId/signature")
  resign(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("videoId", ParseUUIDPipe) videoId: string
  ): Promise<RecordingUploadResponse> {
    return this.service.resign(id, videoId, request.user);
  }
}
