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
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
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
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { CourseRepository } from "./course.repository";
import { CourseService } from "./course.service";
import {
  CourseDetailResponse,
  CourseSummaryResponse,
  EnrolledCourseResponse,
  EnrollmentResponse,
  PendingEnrollmentResponse,
} from "./dto/course-response.dto";
import { CreateCourseDto } from "./dto/create-course.dto";
import { ReplaceCourseDto } from "./dto/replace-course.dto";
import { UpdateCourseDto } from "./dto/update-course.dto";
import { UpdateProgressDto } from "./dto/update-progress.dto";
import { CourseNotFoundError } from "./errors/course-not-found.error";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/courses/:id` route against that course, answering a missing
 * or malformed id as not-found first. Guards run before pipes, and the role
 * resolver reads a missing course as PUBLIC, so without this an admin-only
 * route would answer 403 for a course that does not exist (the same reason as
 * `byExistingKosk`). Hidden courses count as existing: restoring one is the
 * point.
 */
const byExistingCourse: AuthzResolve = async (req, moduleRef) => {
  const courseId = typeof req.params.id === "string" ? req.params.id : "";
  if (
    !UUID_REGEX.test(courseId) ||
    (await moduleRef
      .get(CourseRepository, { strict: false })
      .findKoskId(courseId)) === null
  ) {
    throw new CourseNotFoundError(courseId);
  }
  return { entity: ENTITIES.COURSE, id: courseId };
};

@ApiTags("courses")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @ApiOperation({
    summary: "List the courses that belong to a köşk",
    operationId: "getCoursesByKosk",
  })
  @ApiQuery({
    name: "archived",
    required: false,
    type: Boolean,
    description:
      "true lists the köşk's hidden courses instead (the Arşiv view) — köşk manager and SYSTEM_ADMIN only.",
  })
  @ApiOkResponse({ type: CourseSummaryResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get("kosks/:koskId/courses")
  async findByKosk(
    @Req() request: AuthorizedRequest,
    @Param("koskId", ParseUUIDPipe) koskId: string,
    @Query("archived", new DefaultValuePipe(false), ParseBoolPipe)
    archived: boolean
  ): Promise<CourseSummaryResponse[]> {
    return this.courseService.findSummariesByKosk(
      koskId,
      request.user,
      archived
    );
  }

  @ApiOperation({
    summary: "Create a new course under a köşk",
    operationId: "createCourse",
  })
  @ApiCreatedResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse()
  @Post("kosks/:koskId/courses")
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async create(
    @Req() request: AuthorizedRequest,
    @Param("koskId", ParseUUIDPipe) koskId: string,
    @Body() courseDto: CreateCourseDto
  ): Promise<CourseDetailResponse> {
    return this.courseService.create(koskId, request.user.sub, courseDto);
  }

  @ApiOperation({
    summary: "List the courses the current talebe is enrolled in",
    operationId: "getEnrolledCourses",
  })
  @ApiOkResponse({ type: EnrolledCourseResponse, isArray: true })
  @Get("courses/enrolled")
  async findEnrolled(
    @Req() request: AuthorizedRequest
  ): Promise<EnrolledCourseResponse[]> {
    return this.courseService.findEnrolledCourses(request.user.sub);
  }

  @ApiOperation({
    summary: "Get a course with its full syllabus, müderris and resources",
    operationId: "getCourseById",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse()
  @Get("courses/:id")
  async findById(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseDetailResponse> {
    return this.courseService.getDetail(id, request.user);
  }

  @ApiOperation({
    summary: "Update a course",
    operationId: "updateCourse",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse()
  @Patch("courses/:id")
  async update(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() courseDto: UpdateCourseDto
  ): Promise<CourseDetailResponse> {
    await this.courseService.update(id, request.user.sub, courseDto);
    return this.courseService.getDetail(id, request.user);
  }

  @ApiOperation({
    summary:
      "Replace a course, including its full syllabus, müderris and resources",
    operationId: "replaceCourse",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      "The course changed since `version` was loaded (COURSE_VERSION_CONFLICT).",
  })
  @Put("courses/:id")
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async replace(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() courseDto: ReplaceCourseDto
  ): Promise<CourseDetailResponse> {
    return this.courseService.replace(id, request.user.sub, courseDto);
  }

  @ApiOperation({
    summary: "Hide a course (Gizle)",
    description:
      "The köşk manager's way to take a course down: nothing is deleted, every list leaves it out, and it answers 404 to everyone but the köşk manager and SYSTEM_ADMIN until it is restored (MDRS-124).",
    operationId: "archiveCourse",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post("courses/:id/archive")
  @HttpCode(HttpStatus.OK)
  // Method-level, like `KoskController`: most handlers here still check
  // ownership in `CourseService` and have not moved to `@Authz`.
  @UseGuards(AuthzGuard)
  @Authz(SCOPES.ARCHIVE, byExistingCourse)
  async archive(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseDetailResponse> {
    await this.courseService.archive(id, request.user.sub);
    return this.courseService.getDetail(id, request.user);
  }

  @ApiOperation({
    summary: "Restore a hidden course (Geri al)",
    operationId: "restoreCourse",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post("courses/:id/restore")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthzGuard)
  @Authz(SCOPES.ARCHIVE, byExistingCourse)
  async restore(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseDetailResponse> {
    await this.courseService.restore(id);
    return this.courseService.getDetail(id, request.user);
  }

  @ApiOperation({
    summary: "Delete a course for real (SYSTEM_ADMIN only)",
    description:
      "Removes the course and its weeks, lessons, müderris, resources and enrollments in one transaction and records an audit entry. Everyone else hides instead (MDRS-124).",
    operationId: "deleteCourse",
  })
  @ApiOkResponse({ type: Boolean })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete("courses/:id")
  @UseGuards(AuthzGuard)
  @Authz(SCOPES.DELETE, byExistingCourse)
  async delete(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<boolean> {
    return this.courseService.delete(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Enroll the current talebe in a course",
    operationId: "enrollInCourse",
  })
  @ApiCreatedResponse({ type: EnrollmentResponse })
  @ApiNotFoundResponse()
  @Post("courses/:id/enroll")
  async enroll(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<EnrollmentResponse> {
    const { user } = request;
    const name =
      user.name ??
      [user.given_name, user.family_name].filter(Boolean).join(" ").trim() ??
      user.preferred_username;
    return this.courseService.enroll(user, id, {
      name: name || user.preferred_username || null,
      email: user.email ?? null,
    });
  }

  @ApiOperation({
    summary: "List pending enrollment requests for a köşk (owner only)",
    operationId: "getPendingEnrollments",
  })
  @ApiOkResponse({ type: PendingEnrollmentResponse, isArray: true })
  @ApiNotFoundResponse()
  @Get("kosks/:koskId/enrollments/pending")
  async pendingEnrollments(
    @Req() request: AuthorizedRequest,
    @Param("koskId", ParseUUIDPipe) koskId: string
  ): Promise<PendingEnrollmentResponse[]> {
    return this.courseService.findPendingEnrollments(koskId, request.user.sub);
  }

  @ApiOperation({
    summary: "Approve a pending enrollment (köşk owner only)",
    operationId: "approveEnrollment",
  })
  // 201, not 200: this is a plain @Post with no @HttpCode, so Nest answers
  // 201 — asserted twice in test/e2e/course.e2e.spec.ts (:516 and :608) — and
  // every other @Post in this controller documents itself the same way. The
  // @ApiOkResponse this replaced changed only the document, so MDRS-58's
  // regeneration published a 200 the route never returns (MDRS-58). Moving the
  // route to 200 instead would be a wire change for every caller; see the
  // follow-up in docs/migration/mdrs-58-tedrisat-spec-exporter.md.
  @ApiCreatedResponse({ type: EnrollmentResponse })
  @ApiNotFoundResponse()
  @Post("courses/:id/enrollments/:userId/approve")
  async approveEnrollment(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<EnrollmentResponse> {
    return this.courseService.approveEnrollment(id, request.user.sub, userId);
  }

  @ApiOperation({
    summary: "Reject a pending enrollment, deleting it (köşk owner only)",
    operationId: "rejectEnrollment",
  })
  @ApiOkResponse({ type: Boolean })
  @ApiNotFoundResponse()
  @Delete("courses/:id/enrollments/:userId")
  async rejectEnrollment(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<boolean> {
    return this.courseService.rejectEnrollment(id, request.user.sub, userId);
  }

  @ApiOperation({
    summary: "Update the current talebe's progress in a course",
    operationId: "updateCourseProgress",
  })
  @ApiOkResponse({ type: EnrollmentResponse })
  @Put("courses/:id/progress")
  async updateProgress(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgressDto
  ): Promise<EnrollmentResponse> {
    return this.courseService.updateProgress(
      request.user.sub,
      id,
      dto.progress,
      dto.status
    );
  }
}
