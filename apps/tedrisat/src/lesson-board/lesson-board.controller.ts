import { AuthGuard, Authz, AuthzGuard, PERMISSIONS } from "@medaris/common";
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  type StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
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
import { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import { UploadGateInterceptor } from "../storage/upload";
import {
  BOARD_SCENE_MAX_BYTES,
  LessonBoardFileResponse,
  LessonBoardResponse,
} from "./dto/lesson-board.dto";
import type { IBoardFile, ILessonBoard } from "./lesson-board.repository";
import { LessonBoardService } from "./lesson-board.service";

const WHO_WRITES =
  "Whoever holds `session.manage` on the course: its müderris, its nazırı and the managers above it.";
const WHO_READS =
  "Read by whoever reads the course's content: an enrolled talebe and the course's staff.";

/**
 * A session's board (ders tahtası): the canvas the müderris teaches on, kept
 * so the talebe finds it on the session's page as it was left.
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("lessons/:id/board")
export class LessonBoardController {
  constructor(private readonly service: LessonBoardService) {}

  @ApiOperation({
    summary: "A session's board",
    description: `The scene as it was last saved and the images on it. A session with no board answers with \`scene: null\` and no files, not 404. ${WHO_READS}`,
    operationId: "getLessonBoard",
  })
  @ApiOkResponse({ type: LessonBoardResponse })
  @ApiForbiddenResponse({ description: "No `course.view_details`." })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW_DETAILS, byLessonCourse)
  @Header("Cache-Control", "private, no-store")
  @Get()
  read(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ILessonBoard> {
    return this.service.read(id, request.user);
  }

  @ApiOperation({
    summary: "Save a session's board",
    description: `The scene replaces the one before it. It is sent as the multipart field \`file\` (its JSON, at most ${BOARD_SCENE_MAX_BYTES / (1024 * 1024)} MB), not as a JSON body: a board of handwriting is larger than a JSON body may be. tedrisat keeps the scene's elements and its background and drops the rest of the canvas's state. Every image the scene shows must already be a file of the board (400 LESSON_BOARD_SCENE_INVALID otherwise); the board's files the scene no longer shows are removed, from storage too. ${WHO_WRITES}`,
    operationId: "saveLessonBoard",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @ApiOkResponse({ type: LessonBoardResponse })
  @ApiBadRequestResponse({ description: "LESSON_BOARD_SCENE_INVALID" })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @ApiPayloadTooLargeResponse({ description: "The scene is too large." })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: BOARD_SCENE_MAX_BYTES, files: 1, fields: 0 },
    })
  )
  @HttpCode(HttpStatus.OK)
  @Post()
  save(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined
  ): Promise<ILessonBoard> {
    return this.service.save(id, request.user, file);
  }

  @ApiOperation({
    summary: "Add an image to a session's board",
    description: `The image is the multipart field \`file\` and \`fileKey\` the id the canvas gave it. A PNG, JPEG or WebP as read from its bytes (415 FILE_TYPE_NOT_ALLOWED), at most 25 MB (413 FILE_TOO_LARGE). A key the board already has answers with the file it has: the canvas names an image by its content. It is shown once a scene that names it is saved, and removed when a saved scene no longer does. ${WHO_WRITES}`,
    operationId: "addLessonBoardFile",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        fileKey: { type: "string" },
      },
      required: ["file", "fileKey"],
    },
  })
  @ApiCreatedResponse({ type: LessonBoardFileResponse })
  @ApiBadRequestResponse({
    description:
      "FILE_REQUIRED, LESSON_BOARD_FILE_KEY_INVALID, LESSON_BOARD_FILES_FULL",
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
  @Post("files")
  addFile(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("fileKey") fileKey: unknown
  ): Promise<IBoardFile> {
    return this.service.addFile(id, request.user, fileKey, file);
  }

  @ApiOperation({
    summary: "An image of a session's board",
    description: `The image's bytes. ${WHO_READS}`,
    operationId: "getLessonBoardFile",
  })
  @ApiProduces("application/octet-stream")
  @ApiOkResponse({ description: "The image." })
  @ApiForbiddenResponse({ description: "No `course.view_details`." })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, LESSON_BOARD_FILE_NOT_FOUND",
  })
  @ApiServiceUnavailableResponse({
    description: "STORAGE_NOT_CONFIGURED, STORAGE_UNAVAILABLE",
  })
  @Authz(PERMISSIONS.COURSE_VIEW_DETAILS, byLessonCourse)
  @Get("files/:fileKey")
  download(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("fileKey") fileKey: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    return this.service.download(id, fileKey, request.user, response);
  }
}
