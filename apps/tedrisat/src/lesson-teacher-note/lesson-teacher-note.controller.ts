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
import { CourseService } from "../course/course.service";
import { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import { byLessonCourse } from "../course/lesson.controller";
import {
  LessonTeacherNoteResponse,
  SaveLessonTeacherNoteDto,
  TEACHER_NOTE_MAX,
} from "./dto/lesson-teacher-note.dto";
import {
  type ILessonTeacherNote,
  LessonTeacherNoteRepository,
} from "./lesson-teacher-note.repository";

/**
 * A session's note (ders notu): the Markdown text the müderris writes for the
 * session, which the talebe reads on the session's page.
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("lessons/:id/teacher-note")
export class LessonTeacherNoteController {
  constructor(
    private readonly courses: CourseService,
    private readonly notes: LessonTeacherNoteRepository
  ) {}

  @ApiOperation({
    summary: "A session's note from its müderris",
    description:
      "The note as it was last saved. A session with no note answers with `body: null`, not 404. Read by whoever reads the course's content: an enrolled talebe and the course's staff.",
    operationId: "getLessonTeacherNote",
  })
  @ApiOkResponse({ type: LessonTeacherNoteResponse })
  @ApiForbiddenResponse({ description: "No `course.view_details`." })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(PERMISSIONS.COURSE_VIEW_DETAILS, byLessonCourse)
  @Header("Cache-Control", "private, no-store")
  @Get()
  async read(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ILessonTeacherNote> {
    await this.courses.findVisibleLessonCourse(id, request.user);
    return this.notes.find(id);
  }

  @ApiOperation({
    summary: "Write a session's note",
    description: `The text replaces the one before it; there is no history. At most ${TEACHER_NOTE_MAX} characters. A body that is null, left out or only whitespace removes the note. Whoever holds \`session.manage\` on the course: its müderris, its nazırı and the managers above it.`,
    operationId: "saveLessonTeacherNote",
  })
  @ApiOkResponse({ type: LessonTeacherNoteResponse })
  @ApiBadRequestResponse({ description: "Field validation" })
  @ApiForbiddenResponse({ description: "No `session.manage` on the course." })
  @ApiNotFoundResponse({ description: "LESSON_NOT_FOUND" })
  @Authz(PERMISSIONS.SESSION_MANAGE, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  @Put()
  async save(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SaveLessonTeacherNoteDto
  ): Promise<ILessonTeacherNote> {
    await this.courses.findWritableLessonCourse(id, request.user);
    if (dto.body) {
      await this.notes.save(id, request.user.sub, dto.body);
    } else {
      await this.notes.remove(id);
    }
    return this.notes.find(id);
  }
}
