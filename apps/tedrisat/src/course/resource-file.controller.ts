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
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from "@nestjs/swagger";
import type { Response } from "express";
import { UploadGateInterceptor } from "../storage/upload";
import { byExistingCourse } from "./course.controller";
import {
  CourseResourceFileUploadResponse,
  LessonResourceFileUploadResponse,
  RESOURCE_FILE_UPLOAD_BODY,
  UploadResourceFileDto,
} from "./dto/resource-file.dto";
import type { AuthorizedRequest } from "./interfaces/authorized-request.interface";
import { byLessonCourse } from "./lesson.controller";
import { ResourceFileService } from "./resource-file.service";

const UPLOAD_RULES =
  "The file is the multipart field `file`: at most 25 MB (a body announcing more is refused before it is read, 413 FILE_TOO_LARGE), and a PDF, PNG, JPEG, WebP, Word (docx), Excel (xlsx), PowerPoint (pptx) or plain UTF-8 text file as read from its bytes, whatever its name or claimed type says (415 FILE_TYPE_NOT_ALLOWED: HTML, SVG, a plain ZIP, an executable, a macro-enabled Office file). Its name is sanitised and kept as a label only; it is stored under a key tedrisat makes. The new resource is added last and the course's version is bumped, so an editor holding the old version reloads before its next save could drop the row (MDRS-95); the answer carries the new version. Written to `audit_log` as `resource.file_upload`. Removing the row from the list later removes the file from storage too, as `resource.file_delete`.";

const DOWNLOAD_RULES =
  "Only for a caller who may read the course's content (`course.view_details`: the enrolled talebe, the course team), as for a link's address; read like the course page, so a hidden course or a draft is not found, and the read of anyone who is neither enrolled nor a müderris is written to `audit_log` (MDRS-103). The file is streamed through tedrisat with `Content-Disposition: attachment` and the stored name, the type read at upload, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`; there is no storage address to pass on. 404 RESOURCE_FILE_NOT_FOUND for no such resource, a link, or a file the store no longer has.";

/**
 * Resource files (MDRS-287): uploading a file as a course's or a celse's
 * resource, and downloading it. Listing, renaming, reordering and removing
 * them is the resource lists' own (`PUT /courses/:id`, `PATCH /lessons/:id`).
 */
@ApiTags("resources")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class ResourceFileController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: ResourceFileService) {}

  @ApiOperation({
    summary: "Upload a file as one of the course's resources",
    description: `\`course.edit\`, the permission that edits the course's resources. ${UPLOAD_RULES}`,
    operationId: "uploadCourseResourceFile",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody(RESOURCE_FILE_UPLOAD_BODY)
  @ApiCreatedResponse({ type: CourseResourceFileUploadResponse })
  @ApiBadRequestResponse({
    description: "FILE_REQUIRED: no file, or an empty one; field validation.",
  })
  @ApiForbiddenResponse({ description: "No `course.edit` on the course." })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @ApiPayloadTooLargeResponse({ description: "FILE_TOO_LARGE" })
  @ApiUnsupportedMediaTypeResponse({ description: "FILE_TYPE_NOT_ALLOWED" })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.COURSE_EDIT, byExistingCourse)
  @UseInterceptors(UploadGateInterceptor)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post("courses/:id/resources/files")
  uploadCourseFile(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() fields: UploadResourceFileDto
  ): Promise<CourseResourceFileUploadResponse> {
    return this.service.uploadCourseFile(id, request.user, file, fields);
  }

  @ApiOperation({
    summary: "Download a file of the course's resources",
    description: DOWNLOAD_RULES,
    operationId: "downloadCourseResourceFile",
  })
  @ApiProduces("application/octet-stream")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  @ApiForbiddenResponse({
    description: "The caller may not read the course's content.",
  })
  @ApiNotFoundResponse({
    description: "COURSE_NOT_FOUND, RESOURCE_FILE_NOT_FOUND",
  })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.COURSE_VIEW_DETAILS, byExistingCourse)
  @Get("courses/:id/resources/:resourceId/file")
  downloadCourseFile(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("resourceId", ParseUUIDPipe) resourceId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    return this.service.downloadCourseFile(
      id,
      resourceId,
      request.user,
      response
    );
  }

  @ApiOperation({
    summary: "Upload a file as one of a session's own resources",
    description: `\`session.manage\`, the permission that edits a session's resources (MDRS-286). The session must be live: a hidden one answers LESSON_NOT_FOUND. ${UPLOAD_RULES}`,
    operationId: "uploadLessonResourceFile",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody(RESOURCE_FILE_UPLOAD_BODY)
  @ApiCreatedResponse({ type: LessonResourceFileUploadResponse })
  @ApiBadRequestResponse({
    description: "FILE_REQUIRED: no file, or an empty one; field validation.",
  })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @ApiPayloadTooLargeResponse({ description: "FILE_TOO_LARGE" })
  @ApiUnsupportedMediaTypeResponse({ description: "FILE_TYPE_NOT_ALLOWED" })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @UseInterceptors(UploadGateInterceptor)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post("lessons/:id/resources/files")
  uploadLessonFile(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() fields: UploadResourceFileDto
  ): Promise<LessonResourceFileUploadResponse> {
    return this.service.uploadLessonFile(id, request.user, file, fields);
  }

  @ApiOperation({
    summary: "Download a file of a session's own resources",
    description: `${DOWNLOAD_RULES} The session must be live: a hidden one keeps its resources but serves none (LESSON_NOT_FOUND).`,
    operationId: "downloadLessonResourceFile",
  })
  @ApiProduces("application/octet-stream")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  @ApiForbiddenResponse({
    description: "The caller may not read the course's content.",
  })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, RESOURCE_FILE_NOT_FOUND",
  })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.COURSE_VIEW_DETAILS, byLessonCourse)
  @Get("lessons/:id/resources/:resourceId/file")
  downloadLessonFile(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("resourceId", ParseUUIDPipe) resourceId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    return this.service.downloadLessonFile(
      id,
      resourceId,
      request.user,
      response
    );
  }
}
