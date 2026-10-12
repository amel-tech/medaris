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
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  ApiNoContentResponse,
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
import type { ILessonAssignment } from "./domain/lesson-assignment";
import {
  LessonAssignmentResponse,
  SaveLessonAssignmentDto,
} from "./dto/lesson-assignment.dto";
import type { AuthorizedRequest } from "./interfaces/authorized-request.interface";
import { byLessonCourse } from "./lesson.controller";
import { LessonAssignmentService } from "./lesson-assignment.service";

const WHO_WRITES =
  "`session.manage`, the permission that edits the session's resources, on a live session of a course the caller may write to: a hidden session answers LESSON_NOT_FOUND. The course's version is not bumped: the homework is not part of `PUT /courses/:id`.";

/**
 * The homework the course team sets on a celse, apart from its resources:
 * "Bu celsenin ödevi var" with an optional description and its own files.
 * The course read (`GET /courses/:id`) and the session read carry it to
 * whoever may read the course's content.
 */
@ApiTags("lesson-assignments")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class LessonAssignmentController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: LessonAssignmentService) {}

  @ApiOperation({
    summary: "Set a session's homework, or change its description",
    description: `Gives the session homework if it has none ("Bu celsenin ödevi var"), written to \`audit_log\` as \`lesson_assignment.create\`; otherwise changes its description (\`lesson_assignment.update\`; a save that changes nothing writes nothing). The audit row carries the description's length, not its text. ${WHO_WRITES}`,
    operationId: "saveLessonAssignment",
  })
  @ApiOkResponse({ type: LessonAssignmentResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("lessons/:id/assignment")
  save(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveLessonAssignmentDto
  ): Promise<ILessonAssignment> {
    return this.service.save(id, request.user, dto.description ?? null);
  }

  @ApiOperation({
    summary: "Take a session's homework off",
    description: `The description and every file go, the files from storage too, written to \`audit_log\` as \`lesson_assignment.delete\` with what went. The talebe's submissions on the session stay. ${WHO_WRITES}`,
    operationId: "deleteLessonAssignment",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, LESSON_ASSIGNMENT_NOT_FOUND",
  })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("lessons/:id/assignment")
  remove(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.service.remove(id, request.user);
  }

  @ApiOperation({
    summary: "Add a file to a session's homework",
    description: `The session must have homework (LESSON_ASSIGNMENT_NOT_FOUND otherwise). The file is the multipart field \`file\`, held to a resource file's rules: at most 25 MB (413 FILE_TOO_LARGE) and a PDF, PNG, JPEG, WebP, Word (docx), Excel (xlsx), PowerPoint (pptx) or plain UTF-8 text file as read from its bytes (415 FILE_TYPE_NOT_ALLOWED). Its name is sanitised and kept as a label; it is stored under a key tedrisat makes, never as one of the session's resources. Written to \`audit_log\` as \`lesson_assignment.file_upload\`. ${WHO_WRITES}`,
    operationId: "addLessonAssignmentFile",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @ApiCreatedResponse({ type: LessonAssignmentResponse })
  @ApiBadRequestResponse({ description: "FILE_REQUIRED" })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, LESSON_ASSIGNMENT_NOT_FOUND",
  })
  @ApiPayloadTooLargeResponse({ description: "FILE_TOO_LARGE" })
  @ApiUnsupportedMediaTypeResponse({ description: "FILE_TYPE_NOT_ALLOWED" })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @UseInterceptors(UploadGateInterceptor)
  @Post("lessons/:id/assignment/files")
  addFile(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined
  ): Promise<ILessonAssignment> {
    return this.service.addFile(id, request.user, file);
  }

  @ApiOperation({
    summary: "Remove a file from a session's homework",
    description: `The file goes from storage too, written to \`audit_log\` as \`lesson_assignment.file_delete\`. ${WHO_WRITES}`,
    operationId: "deleteLessonAssignmentFile",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, LESSON_ASSIGNMENT_FILE_NOT_FOUND",
  })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("lessons/:id/assignment/files/:fileId")
  removeFile(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string
  ): Promise<void> {
    return this.service.removeFile(id, request.user, fileId);
  }

  @ApiOperation({
    summary: "Download a file of a session's homework",
    description:
      "Only for a caller who may read the course's content (`course.view_details`: the enrolled talebe, the course team), as for a session resource's file; read like the course page, so a hidden course or a draft is not found, and the read of anyone who is neither enrolled nor a müderris is written to `audit_log` (MDRS-103). A hidden session serves none (LESSON_NOT_FOUND). Streamed through tedrisat with `Content-Disposition: attachment` and the stored name, the type read at upload, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.",
    operationId: "downloadLessonAssignmentFile",
  })
  @ApiProduces("application/octet-stream")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  @ApiForbiddenResponse({
    description: "The caller may not read the course's content.",
  })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, LESSON_ASSIGNMENT_FILE_NOT_FOUND",
  })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.COURSE_VIEW_DETAILS, byLessonCourse)
  @Get("lessons/:id/assignment/files/:fileId")
  download(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    return this.service.download(id, fileId, request.user, response);
  }
}
