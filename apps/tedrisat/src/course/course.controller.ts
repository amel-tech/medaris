import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  byParam,
  ENTITIES,
  MedarisValidationPipe,
  SCOPES,
} from "@medaris/common";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CourseService } from "./course.service";
import {
  CourseDetailResponse,
  CourseSummaryResponse,
  EnrolledCourseResponse,
  EnrollmentResponse,
  PendingEnrollmentResponse,
} from "./dto/course-response.dto";
import { CreateCourseDto } from "./dto/create-course.dto";
import { UpdateCourseDto } from "./dto/update-course.dto";
import { UpdateProgressDto } from "./dto/update-progress.dto";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";

@ApiTags("courses")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @ApiOperation({
    summary: "List the courses that belong to a köşk",
    operationId: "getCoursesByKosk",
  })
  @ApiOkResponse({ type: CourseSummaryResponse, isArray: true })
  @ApiNotFoundResponse()
  // Authorized against the parent köşk, not the courses: the list has no
  // single resource of its own, and `VIEW` on a köşk is what decides whether
  // its shelf of courses is visible at all.
  @Authz(SCOPES.VIEW, byParam(ENTITIES.KOSK, "koskId"))
  @Get("kosks/:koskId/courses")
  async findByKosk(
    @Req() request: AuthorizedRequest,
    @Param("koskId", ParseUUIDPipe) koskId: string
  ): Promise<CourseSummaryResponse[]> {
    return this.courseService.findSummariesByKosk(koskId, request.user.sub);
  }

  @ApiOperation({
    summary: "Create a new course under a köşk",
    operationId: "createCourse",
  })
  @ApiCreatedResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse()
  // A course that does not exist yet is authorized against its parent köşk —
  // `MANAGE_COURSES` sits on the köşk's KOSK_MANAGER row and on no other, so
  // only the köşk's owner may open a course under it.
  @Authz(SCOPES.MANAGE_COURSES, byParam(ENTITIES.KOSK, "koskId"))
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
  // Exempt: no resource in the request. The rows are the caller's own
  // enrollments, selected by `sub`, so there is nothing for a scope to name.
  @AuthzExempt()
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
  // TODO(MDRS-43 · open decision): exempt as a PLACEHOLDER, not as a verdict.
  //
  // `@Authz(VIEW, byParam(COURSE))` is the obvious annotation and it would
  // change behaviour: the COURSE matrix gives its PUBLIC row `[ENROLL]` and
  // nothing else, so a caller with no relationship to the course — today the
  // common case, and the one tedris's course landing page is built for — would
  // start getting 403 on the page that carries the "Kayıt ol" button. Plan
  // §4.1 does read that way (VIEW starts at PENDING, VIEW_DETAILS at
  // ENROLLED), so the choice is between honouring the matrix and keeping an
  // unauthenticated-browse flow that exists in the product today. That is a
  // product decision, not a mechanical mapping, so it is not made here.
  @AuthzExempt()
  @Get("courses/:id")
  async findById(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseDetailResponse> {
    return this.courseService.getDetail(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Update a course",
    operationId: "updateCourse",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse()
  @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE))
  @Patch("courses/:id")
  async update(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() courseDto: UpdateCourseDto
  ): Promise<CourseDetailResponse> {
    await this.courseService.update(id, request.user.sub, courseDto);
    return this.courseService.getDetail(id, request.user.sub);
  }

  @ApiOperation({
    summary:
      "Replace a course, including its full syllabus, müderris and resources",
    operationId: "replaceCourse",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse()
  @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE))
  @Put("courses/:id")
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async replace(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() courseDto: CreateCourseDto
  ): Promise<CourseDetailResponse> {
    return this.courseService.replace(id, request.user.sub, courseDto);
  }

  @ApiOperation({
    summary: "Delete a course",
    operationId: "deleteCourse",
  })
  @ApiOkResponse({ type: Boolean })
  @ApiNotFoundResponse()
  @Authz(SCOPES.DELETE, byParam(ENTITIES.COURSE))
  @Delete("courses/:id")
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
  // `ENROLL` is the one scope on the COURSE PUBLIC row: any authenticated
  // caller may ask to join a course that exists. Whether the request lands as
  // ENROLLED or PENDING is `requires_approval`'s business, not the matrix's.
  @Authz(SCOPES.ENROLL, byParam(ENTITIES.COURSE))
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
    return this.courseService.enroll(user.sub, id, {
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
  // Köşk-scoped, so it authorizes on the köşk: `MANAGE_ENROLLMENTS` lives on
  // the COURSE row and there is no course in this request. `MANAGE_COURSES` is
  // the KOSK row's owner-only scope and the closest true statement — the
  // service still narrows to the köşk's owner.
  @Authz(SCOPES.MANAGE_COURSES, byParam(ENTITIES.KOSK, "koskId"))
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
  @Authz(SCOPES.MANAGE_ENROLLMENTS, byParam(ENTITIES.COURSE))
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
  // Same scope as approve: the matrix does not distinguish granting a seat
  // from refusing one. `MANAGE_ENROLLMENTS` reaches MUDERRIS as well as
  // KOSK_MANAGER, and `CourseService` still restricts both routes to the
  // köşk's owner — the guard is the outer fence, not the whole rule.
  @Authz(SCOPES.MANAGE_ENROLLMENTS, byParam(ENTITIES.COURSE))
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
  // The matrix has no "record progress" scope, and the real requirement is
  // that the caller hold an active enrollment. `VIEW_DETAILS` is exactly that
  // line — ENROLLED, MUDERRIS and KOSK_MANAGER carry it, PENDING and PUBLIC do
  // not — so it is the honest way to say it with the scopes that exist.
  // `CourseService.updateProgress` remains the precise check: it 404s a
  // missing or still-pending enrollment rather than silently promoting it.
  @Authz(SCOPES.VIEW_DETAILS, byParam(ENTITIES.COURSE))
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
