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
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from "@nestjs/swagger";
import type { Response } from "express";
import { byExistingCourse } from "../course/course.controller";
import type { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import { UploadGateInterceptor } from "../storage/upload";
import {
  CourseSubmissionsResponse,
  LessonSubmissionResponse,
  MySubmissionsResponse,
  OwnSubmissionResponse,
  SaveSubmissionNoteDto,
} from "./dto/lesson-submission.dto";
import { LessonSubmissionService } from "./lesson-submission.service";

const WHO_WRITES =
  "A talebe enrolled in the course (ENROLLED or COMPLETED, not barred) while its content is open, on a live session: anyone else is 403 SUBMISSION_FORBIDDEN, a hidden session 404. There is no deadline.";

const DOWNLOAD_HEADERS =
  "Streamed through tedrisat with `Content-Disposition: attachment` and the stored name, the type read at upload, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`; there is no storage address to pass on.";

/**
 * A talebe's homework on a celse (MDRS-290): their own, through the session.
 * The guard asks only `course.view` of the course, which every signed-in
 * caller holds, so that a missing session is 404 before the handler runs;
 * `LessonSubmissionService` decides the rest: an active talebe to write, the
 * course open to them to read their own, and only their own.
 */
@ApiTags("submissions")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class LessonSubmissionController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: LessonSubmissionService) {}

  @ApiOperation({
    summary: "The caller's own homework on a session",
    description:
      "Only the caller's own, null while they have handed nothing in, with the limits a new file must keep. A talebe who was removed or barred still reads theirs while the course is open; a course in a passive scope is closed (403 SUBMISSION_FORBIDDEN), and a hidden course is as not found as a session that is not there.",
    operationId: "getMySubmission",
  })
  @ApiOkResponse({ type: OwnSubmissionResponse })
  @ApiForbiddenResponse({ description: "SUBMISSION_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  // Per-user answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("lessons/:id/submission")
  own(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<OwnSubmissionResponse> {
    return this.service.own(request.user, id);
  }

  @ApiOperation({
    summary: "The sessions of a course the caller handed homework in on",
    description:
      "Only the caller's own: each live session of the course where their homework holds a note or a file, with when they last changed it, for the course page to mark a session's homework as handed in or not. Read on the terms of `GET /lessons/:id/submission`: a course in a passive scope is closed (403 SUBMISSION_FORBIDDEN), and a hidden course is not found. Empty for anyone who handed nothing in.",
    operationId: "listMySubmissions",
  })
  @ApiOkResponse({ type: MySubmissionsResponse })
  @ApiForbiddenResponse({ description: "SUBMISSION_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byExistingCourse)
  // Per-user answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/my-submissions")
  ownForCourse(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MySubmissionsResponse> {
    return this.service.listOwnForCourse(request.user, id);
  }

  @ApiOperation({
    summary: "Write the note of the caller's homework on a session",
    description: `Makes the homework if there is none yet. ${WHO_WRITES}`,
    operationId: "saveMySubmissionNote",
  })
  @ApiOkResponse({ type: LessonSubmissionResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "SUBMISSION_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put("lessons/:id/submission")
  saveNote(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveSubmissionNoteDto
  ): Promise<LessonSubmissionResponse> {
    return this.service.saveNote(request.user, id, dto.note ?? null);
  }

  @ApiOperation({
    summary: "Add a file to the caller's homework on a session",
    description: `Makes the homework if there is none yet; at most 5 files (409 SUBMISSION_FILE_LIMIT). The file is the multipart field \`file\`: at most 25 MB (413 FILE_TOO_LARGE) and a PDF, PNG, JPEG, WebP, Word (docx), Excel (xlsx), PowerPoint (pptx) or plain UTF-8 text file as read from its bytes (415 FILE_TYPE_NOT_ALLOWED). Its name is sanitised and kept as a label; it is stored under a key tedrisat makes. Written to \`audit_log\` as \`submission.file_upload\`. ${WHO_WRITES}`,
    operationId: "addMySubmissionFile",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @ApiCreatedResponse({ type: LessonSubmissionResponse })
  @ApiBadRequestResponse({ description: "FILE_REQUIRED" })
  @ApiForbiddenResponse({ description: "SUBMISSION_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @ApiConflictResponse({ description: "SUBMISSION_FILE_LIMIT" })
  @ApiPayloadTooLargeResponse({ description: "FILE_TOO_LARGE" })
  @ApiUnsupportedMediaTypeResponse({ description: "FILE_TYPE_NOT_ALLOWED" })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @UseInterceptors(UploadGateInterceptor)
  @Post("lessons/:id/submission/files")
  addFile(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined
  ): Promise<LessonSubmissionResponse> {
    return this.service.addFile(request.user, id, file);
  }

  @ApiOperation({
    summary: "Remove a file from the caller's homework on a session",
    description: `The file is removed from storage too, and the removal written to \`audit_log\` as \`submission.file_delete\`. Another talebe's file is 403 SUBMISSION_FORBIDDEN. ${WHO_WRITES}`,
    operationId: "deleteMySubmissionFile",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: "SUBMISSION_FORBIDDEN" })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, SUBMISSION_FILE_NOT_FOUND",
  })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("lessons/:id/submission/files/:fileId")
  removeFile(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string
  ): Promise<void> {
    return this.service.removeFile(request.user, id, fileId);
  }

  @ApiOperation({
    summary: "Download a file of the caller's own homework",
    description: `Only the talebe who handed it in, while the course is open to them: another talebe's file, or one asked for by staff here, is 403 SUBMISSION_FORBIDDEN (staff read homework through \`GET /courses/:id/submissions/files/:fileId\`). ${DOWNLOAD_HEADERS}`,
    operationId: "downloadMySubmissionFile",
  })
  @ApiProduces("application/octet-stream")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  @ApiForbiddenResponse({ description: "SUBMISSION_FORBIDDEN" })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, SUBMISSION_FILE_NOT_FOUND",
  })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.COURSE_VIEW, byLessonCourse)
  @Get("lessons/:id/submission/files/:fileId")
  downloadOwn(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    return this.service.downloadOwn(request.user, id, fileId, response);
  }
}

/**
 * The course's homework for its staff (MDRS-290, nazar's "Ödevler"):
 * `submission.read` on the course, the müderris's and the köşk nazımı's and
 * başmüderris's by role, a ders nazırı's when given it, the başnazım's by the
 * realm bypass.
 */
@ApiTags("submissions")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class CourseSubmissionsController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: LessonSubmissionService) {}

  @ApiOperation({
    summary: "The homework handed in on the course's sessions",
    description:
      "`submission.read`: everyone's homework on the course's live sessions, with who handed it in, when they last changed it, the note and the files, by programme order and the latest change first within a session. Beside it, for every live session, whether the course team set homework on it and how many enrolled talebe handed in (`sessions`), and how many talebe are enrolled (`talebeCount`): \"N / M teslim\". `lessonId` narrows both to one session. A hidden course or a draft is not found, as on its page.",
    operationId: "listCourseSubmissions",
  })
  @ApiQuery({
    name: "lessonId",
    required: false,
    type: String,
    format: "uuid",
    description: "Only this session's homework.",
  })
  @ApiOkResponse({ type: CourseSubmissionsResponse })
  @ApiForbiddenResponse({ description: "No `submission.read` on the course." })
  @ApiNotFoundResponse({ description: "COURSE_NOT_FOUND" })
  @Authz(PERMISSIONS.SUBMISSION_READ, byExistingCourse)
  @Header("Cache-Control", "private, no-store")
  @Get("courses/:id/submissions")
  list(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("lessonId", new ParseUUIDPipe({ optional: true }))
    lessonId: string | undefined
  ): Promise<CourseSubmissionsResponse> {
    return this.service.listForCourse(request.user, id, lessonId);
  }

  @ApiOperation({
    summary: "Download a file of a talebe's homework, as the course's staff",
    description: `\`submission.read\` on the course. Written to \`audit_log\` as \`submission.file_download\` before the file is sent, naming the talebe and the file. ${DOWNLOAD_HEADERS}`,
    operationId: "downloadCourseSubmissionFile",
  })
  @ApiProduces("application/octet-stream")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  @ApiForbiddenResponse({ description: "No `submission.read` on the course." })
  @ApiNotFoundResponse({
    description: "COURSE_NOT_FOUND, SUBMISSION_FILE_NOT_FOUND",
  })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.SUBMISSION_READ, byExistingCourse)
  @Get("courses/:id/submissions/files/:fileId")
  download(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    return this.service.downloadForStaff(request.user, id, fileId, response);
  }
}
