import {
  AuthGuard,
  Authz,
  AuthzGuard,
  MedarisValidationPipe,
  SCOPES,
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
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import {
  CreateLessonNoteDto,
  LessonNoteResponse,
  UpdateLessonNoteDto,
} from "./dto/lesson-note.dto";
import { LessonNoteService } from "./lesson-note.service";

/**
 * A talebe's private notes on a session's video (MDRS-150).
 *
 * There is no route that returns a note to anyone but its author: the list is
 * the caller's own notes on the session, and every other route names a note
 * the caller wrote. SYSTEM_ADMIN and the course team get no way in either.
 *
 * The guard asks only `VIEW` of the course, which every signed-in caller
 * holds: it is there to answer a missing lesson with 404 before the handler
 * runs. Who may write is `LessonNoteService`'s question (an active
 * enrollment), because the matrix cannot say "enrolled and not staff".
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("lessons/:id/notes")
export class LessonNoteController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly service: LessonNoteService) {}

  @ApiOperation({
    summary: "The caller's own notes on a session",
    description:
      "Only the caller's notes, whoever else wrote one on the session. By `offsetSeconds` ascending, notes without a position last, then oldest first. Never lists anyone else's notes, a SYSTEM_ADMIN's request included (MDRS-150).",
    operationId: "listLessonNotes",
  })
  @ApiOkResponse({ type: [LessonNoteResponse] })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(SCOPES.VIEW, byLessonCourse)
  // Per-user answer; no shared cache may keep it.
  @Header("Cache-Control", "private, no-store")
  @Get()
  list(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<LessonNoteResponse[]> {
    return this.service.list(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Write a note on a session's video",
    description:
      "An enrolled talebe only (ENROLLED or COMPLETED, and not barred). `offsetSeconds` is the player position from the start of the video and may be left out. `body` is Markdown, 1 to 4000 characters after trimming; it is stored as typed and never rendered as HTML.",
    operationId: "createLessonNote",
  })
  @ApiCreatedResponse({ type: LessonNoteResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "LESSON_NOTE_FORBIDDEN" })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(SCOPES.VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Post()
  create(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateLessonNoteDto
  ): Promise<LessonNoteResponse> {
    return this.service.create(id, request.user.sub, dto);
  }

  @ApiOperation({
    summary: "Edit the caller's own note",
    description:
      "A key left out stays as it is; `offsetSeconds: null` clears the position. The same rule as writing one: an enrolled talebe only. 404 for a note the caller did not write, as for one that does not exist.",
    operationId: "updateLessonNote",
  })
  @ApiOkResponse({ type: LessonNoteResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "LESSON_NOTE_FORBIDDEN" })
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, LESSON_NOTE_NOT_FOUND",
  })
  @Authz(SCOPES.VIEW, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Patch(":noteId")
  update(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("noteId", ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateLessonNoteDto
  ): Promise<LessonNoteResponse> {
    return this.service.update(id, noteId, request.user.sub, dto);
  }

  @ApiOperation({
    summary: "Delete the caller's own note",
    description:
      "The note is removed for good; there is no history. 404 for a note the caller did not write, as for one that does not exist.",
    operationId: "deleteLessonNote",
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({
    description: "LESSON_NOT_FOUND, LESSON_NOTE_NOT_FOUND",
  })
  @Authz(SCOPES.VIEW, byLessonCourse)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":noteId")
  remove(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("noteId", ParseUUIDPipe) noteId: string
  ): Promise<void> {
    return this.service.remove(id, noteId, request.user.sub);
  }
}
