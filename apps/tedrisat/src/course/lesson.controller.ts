import {
  AuthGuard,
  Authz,
  AuthzGuard,
  type AuthzResolve,
  byParam,
  ENTITIES,
  MedarisValidationPipe,
  SCOPES,
} from "@medaris/common";
import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CourseRepository } from "./course.repository";
import { CourseService } from "./course.service";
import { LessonMutationResponse } from "./dto/course-response.dto";
import { CreateWeekLessonDto } from "./dto/create-lesson.dto";
import { UpdateLessonDto } from "./dto/update-lesson.dto";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/lessons/:id` route against the lesson's parent course.
 *
 * Guards run before pipes, so `ParseUUIDPipe` has not seen `:id` yet: a
 * malformed id is answered here as not-found rather than reaching Postgres
 * as a uuid cast error (22P02). The lookup includes archived lessons so that
 * a non-editor gets the same 403 whether or not the lesson is still live.
 */
const byLessonCourse: AuthzResolve = async (req, moduleRef) => {
  const lessonId = typeof req.params.id === "string" ? req.params.id : "";
  if (!UUID_REGEX.test(lessonId)) throw new LessonNotFoundError(lessonId);
  const courseId = await moduleRef
    .get(CourseRepository, { strict: false })
    .findLessonCourseId(lessonId);
  if (!courseId) throw new LessonNotFoundError(lessonId);
  return { entity: ENTITIES.COURSE, id: courseId };
};

/**
 * Session-level syllabus writes (MDRS-95), so that a routine edit — add one
 * session, move it to next week, drop it — no longer has to round-trip the
 * whole course through `PUT /courses/:id`. All three bump the course
 * version, so a whole-course save loaded before them is refused with 409
 * rather than silently undoing them.
 */
@ApiTags("lessons")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class LessonController {
  constructor(private readonly courseService: CourseService) {}

  @ApiOperation({
    summary: "Add a lesson to the end of a week",
    operationId: "createLesson",
  })
  @ApiCreatedResponse({ type: LessonMutationResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post("courses/:courseId/weeks/:weekId/lessons")
  @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE, "courseId"))
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async create(
    @Param("courseId", ParseUUIDPipe) courseId: string,
    @Param("weekId", ParseUUIDPipe) weekId: string,
    @Body() dto: CreateWeekLessonDto
  ): Promise<LessonMutationResponse> {
    return this.courseService.createLesson(courseId, weekId, dto);
  }

  @ApiOperation({
    summary: "Update a lesson; a new weekId moves it and keeps its id",
    operationId: "updateLesson",
  })
  @ApiOkResponse({ type: LessonMutationResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      "The course changed since `version` was loaded (COURSE_VERSION_CONFLICT).",
  })
  @Patch("lessons/:id")
  @Authz(SCOPES.EDIT, byLessonCourse)
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLessonDto
  ): Promise<LessonMutationResponse> {
    const { version, ...changes } = dto;
    return this.courseService.updateLesson(id, version, changes);
  }

  @ApiOperation({
    summary: "Remove a lesson from the course; it is archived, never deleted",
    operationId: "archiveLesson",
  })
  @ApiOkResponse({ type: LessonMutationResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete("lessons/:id")
  @Authz(SCOPES.EDIT, byLessonCourse)
  async archive(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<LessonMutationResponse> {
    return this.courseService.archiveLesson(id);
  }
}
