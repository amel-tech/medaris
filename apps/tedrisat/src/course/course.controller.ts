import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  AuthzMissingUserError,
  AuthzPublic,
  type AuthzResolve,
  byParam,
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
import { CourseBadgeCountsResponse } from "./dto/course-badge-counts-response.dto";
import {
  CourseDetailResponse,
  CourseSummaryResponse,
  EnrolledCourseResponse,
  EnrollmentResponse,
  PendingEnrollmentResponse,
  RosterEnrollmentResponse,
} from "./dto/course-response.dto";
import { CreateCourseDto } from "./dto/create-course.dto";
import {
  RemoveEnrollmentDto,
  SetEnrollmentStatusDto,
} from "./dto/enrollment-actions.dto";
import { ReplaceCourseDto } from "./dto/replace-course.dto";
import { UpdateCourseDto } from "./dto/update-course.dto";
import { UpdateProgressDto } from "./dto/update-progress.dto";
import { CourseNotFoundError } from "./errors/course-not-found.error";
import {
  AuthorizedRequest,
  PublicRequest,
} from "./interfaces/authorized-request.interface";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/courses/:id` route against that course, answering a missing
 * or malformed id as not-found first. Guards run before pipes, so a malformed
 * id would otherwise reach the matrix as the PUBLIC sentinel and an
 * admin-only route would answer 403. The role resolver 404s a missing course
 * on its own since MDRS-43, but SYSTEM_ADMIN bypasses the resolver, so the
 * existence check stays here (the same reason as `byExistingKosk`). Hidden
 * courses count as existing: restoring one is the point.
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
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @ApiOperation({
    summary: "List the courses that belong to a köşk",
    description:
      "Open to callers with no token (MDRS-122): the köşk's published courses, with no enrollment. An unlisted köşk answers them 404, as `GET /kosks/:id` does. `archived=true` needs a token.",
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
  // Authorized against the parent köşk, not the courses: the list has no
  // single resource of its own, and `VIEW` on a köşk is what decides whether
  // its shelf of courses is visible at all.
  // Anonymous callers are decided against the köşk too (MDRS-122):
  // `resolveAnonymous` 404s an unlisted köşk, so its shelf is not reachable
  // by its id either.
  @Authz(SCOPES.VIEW, byParam(ENTITIES.KOSK, "koskId"))
  @AuthzPublic()
  @Get("kosks/:koskId/courses")
  async findByKosk(
    @Req() request: PublicRequest,
    @Param("koskId", ParseUUIDPipe) koskId: string,
    @Query("archived", new DefaultValuePipe(false), ParseBoolPipe)
    archived: boolean
  ): Promise<CourseSummaryResponse[]> {
    if (archived && !request.user) {
      throw new AuthzMissingUserError("Sign in to see the köşk's archive");
    }
    return this.courseService.findSummariesByKosk(
      koskId,
      request.user ?? null,
      archived
    );
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
    return this.courseService.create(koskId, request.user, courseDto);
  }

  @ApiOperation({
    summary: "List the courses the current talebe is enrolled in",
    description:
      "Enrolled and completed courses, oldest enrollment first, each with its next standing session. `includePending=true` adds the requests still waiting for approval (MDRS-159), marked by `enrollment.status`.",
    operationId: "getEnrolledCourses",
  })
  @ApiQuery({ name: "includePending", required: false, type: Boolean })
  @ApiOkResponse({ type: EnrolledCourseResponse, isArray: true })
  // Exempt: no resource in the request. The rows are the caller's own
  // enrollments, selected by `sub`, so there is nothing for a scope to name.
  @AuthzExempt()
  @Get("courses/enrolled")
  async findEnrolled(
    @Req() request: AuthorizedRequest,
    @Query("includePending", new DefaultValuePipe(false), ParseBoolPipe)
    includePending: boolean
  ): Promise<EnrolledCourseResponse[]> {
    return this.courseService.findEnrolledCourses(
      request.user.sub,
      includePending
    );
  }

  @ApiOperation({
    summary: "Get a course with its syllabus, müderris and resources",
    description:
      "Anyone may read the course page, with or without a token (MDRS-122): its description and programme (week and lesson titles, types, schedule, length, müderris). Lesson content — `meetingUrl`, `agenda`, `kaynak` and resource `url` — is sent only to a caller holding `view_details` (the enrolled talebe, the müderris, the köşk manager); for everyone else, PENDING included, those keys are absent and `contentLocked` is true. A content read by anyone who is neither enrolled nor a müderris of the course is recorded in `audit_log` (MDRS-103). A caller with no token gets the same filtered body, and 404 for a draft, a hidden course, or any course of an unlisted köşk.",
    operationId: "getCourseById",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse()
  // The page is public, the lessons are not (the owner's decision of 26
  // September, recorded on MDRS-43; MDRS-103). `VIEW` is on the COURSE
  // PUBLIC row since MDRS-103, so this no longer needs an exemption, and the
  // content is filtered by `VIEW_DETAILS` inside `viewDetail`. DRAFT and
  // hidden courses stay not-found to non-managers inside `getDetail`.
  //
  // `@AuthzPublic()` (MDRS-122): a caller with no token is decided by
  // `resolveAnonymous`, and `present` hands them `withoutContent` unchanged —
  // there is no second filter for the anonymous case.
  @Authz(SCOPES.VIEW, byParam(ENTITIES.COURSE))
  @AuthzPublic()
  @Get("courses/:id")
  async findById(
    @Req() request: PublicRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseDetailResponse> {
    return this.courseService.viewDetail(id, request.user ?? null);
  }

  @ApiOperation({
    summary: "Update a course",
    operationId: "updateCourse",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse()
  // The köşk manager and the course's müderrisler (MDRS-105): `EDIT` is on
  // both rows, and nothing in the service narrows it any more.
  @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE))
  @Patch("courses/:id")
  async update(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() courseDto: UpdateCourseDto
  ): Promise<CourseDetailResponse> {
    await this.courseService.update(id, request.user, courseDto);
    return this.courseService.viewDetail(id, request.user, { audit: false });
  }

  @ApiOperation({
    summary:
      "Replace a course, including its full syllabus, müderris and resources",
    operationId: "replaceCourse",
  })
  @ApiOkResponse({ type: CourseDetailResponse })
  @ApiNotFoundResponse({
    description:
      "No such course, or a müderris row links an account that has never signed in (MUDERRIS_UNKNOWN_USER).",
  })
  @ApiForbiddenResponse({
    description:
      "No `edit` on the course, or the save changes the müderris list without `assign_muderris` — a müderris may save the course but not change who teaches it (MUDERRIS_ASSIGNMENT_FORBIDDEN).",
  })
  @ApiConflictResponse({
    description:
      "The course changed since `version` was loaded (COURSE_VERSION_CONFLICT).",
  })
  // `EDIT` lets the köşk manager and the course's müderrisler save it
  // (MDRS-105). The müderris list inside the payload is `ASSIGN_MUDERRIS`,
  // the köşk manager's alone, and `CourseService.replace` checks that part.
  @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE))
  @Put("courses/:id")
  @UsePipes(new MedarisValidationPipe({ transform: true }))
  async replace(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() courseDto: ReplaceCourseDto
  ): Promise<CourseDetailResponse> {
    return this.courseService.replace(id, request.user, courseDto);
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
  @Authz(SCOPES.ARCHIVE, byExistingCourse)
  async archive(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseDetailResponse> {
    await this.courseService.archive(id, request.user.sub);
    return this.courseService.viewDetail(id, request.user, { audit: false });
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
  @Authz(SCOPES.ARCHIVE, byExistingCourse)
  async restore(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseDetailResponse> {
    await this.courseService.restore(id);
    return this.courseService.viewDetail(id, request.user, { audit: false });
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
    summary: "List a course's enrollments — requests, talebe and completions",
    description:
      "For the course team: the köşk manager and the course's müderrisler (MDRS-105). Requests first, then active seats, then completions.",
    operationId: "getCourseEnrollments",
  })
  @ApiOkResponse({ type: RosterEnrollmentResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Authz(SCOPES.MANAGE_ENROLLMENTS, byParam(ENTITIES.COURSE))
  @Get("courses/:id/enrollments")
  async enrollments(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<RosterEnrollmentResponse[]> {
    return this.courseService.findEnrollments(id);
  }

  @ApiOperation({
    summary: "Get the counts behind the nazır portal's course menu badges",
    description:
      "For the course team (MDRS-183): the live sessions still ahead that have no meeting link — cancelled and hidden ones are not counted — and the pending enrollment requests.",
    operationId: "getCourseBadgeCounts",
  })
  @ApiOkResponse({ type: CourseBadgeCountsResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  // `MANAGE_ENROLLMENTS` is the scope of the roster this count summarises, and
  // the köşk manager and the müderrisler hold it (MDRS-105); nobody below the
  // course team does.
  @Authz(SCOPES.MANAGE_ENROLLMENTS, byExistingCourse)
  @Get("courses/:id/badge-counts")
  async badgeCounts(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseBadgeCountsResponse> {
    return this.courseService.getBadgeCounts(id);
  }

  @ApiOperation({
    summary: "Approve a pending enrollment (course team)",
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
  @ApiConflictResponse({
    description:
      "The enrollment is completed; reopen it instead (ENROLLMENT_STATE_CONFLICT).",
  })
  // `MANAGE_ENROLLMENTS` is the köşk manager's and the müderris' (MDRS-105);
  // the köşk-owner check the service used to add on top is gone.
  @Authz(SCOPES.MANAGE_ENROLLMENTS, byParam(ENTITIES.COURSE))
  @Post("courses/:id/enrollments/:userId/approve")
  async approveEnrollment(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<EnrollmentResponse> {
    return this.courseService.approveEnrollment(id, userId);
  }

  @ApiOperation({
    summary: "Reject a pending enrollment, deleting it (course team)",
    operationId: "rejectEnrollment",
  })
  @ApiOkResponse({ type: Boolean })
  @ApiNotFoundResponse()
  // Same scope as approve: the matrix does not distinguish granting a seat
  // from refusing one.
  @Authz(SCOPES.MANAGE_ENROLLMENTS, byParam(ENTITIES.COURSE))
  @Delete("courses/:id/enrollments/:userId")
  async rejectEnrollment(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<boolean> {
    return this.courseService.rejectEnrollment(id, userId);
  }

  @ApiOperation({
    summary: "Complete a talebe's enrollment, or reopen it (course team)",
    description:
      "Only the course team completes a course for a talebe (MDRS-105, decision of 1 October); `PUT /courses/:id/progress` no longer can.",
    operationId: "setEnrollmentStatus",
  })
  @ApiOkResponse({ type: EnrollmentResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      "The enrollment is still a pending request; approve it first (ENROLLMENT_STATE_CONFLICT).",
  })
  @Authz(SCOPES.MANAGE_ENROLLMENTS, byParam(ENTITIES.COURSE))
  @Patch("courses/:id/enrollments/:userId")
  async setEnrollmentStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SetEnrollmentStatusDto
  ): Promise<EnrollmentResponse> {
    return this.courseService.setEnrollmentStatus(id, userId, dto.status);
  }

  @ApiOperation({
    summary: "Take a talebe out of a course, with a reason (course team)",
    description:
      "Deletes the enrollment and keeps the reason in the audit log (MDRS-105). It is not a ban: the talebe may apply again. Only an active seat — reject a request, reopen a completion first.",
    operationId: "removeEnrollment",
  })
  @ApiOkResponse({ type: Boolean })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      "The enrollment is a pending request or a completion (ENROLLMENT_STATE_CONFLICT).",
  })
  @Authz(SCOPES.MANAGE_ENROLLMENTS, byParam(ENTITIES.COURSE))
  @Post("courses/:id/enrollments/:userId/remove")
  @HttpCode(HttpStatus.OK)
  async removeEnrollment(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: RemoveEnrollmentDto
  ): Promise<boolean> {
    return this.courseService.removeEnrollment(
      id,
      request.user.sub,
      userId,
      dto.reason
    );
  }

  @ApiOperation({
    summary:
      "Leave a course, or withdraw a request still awaiting approval (the current talebe)",
    description:
      "Deletes the caller's own enrollment; they may apply again (MDRS-105). A completed course is not left (ENROLLMENT_STATE_CONFLICT).",
    operationId: "leaveCourse",
  })
  @ApiOkResponse({ type: Boolean })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: "The enrollment is completed (ENROLLMENT_STATE_CONFLICT).",
  })
  // The caller's own row, selected by `sub`. `VIEW` is on every COURSE row,
  // PENDING and PUBLIC included, so this only says "the course exists and
  // the caller may see it is there"; the service 404s a caller with no
  // enrollment. `ENROLL` would not do: it is on PUBLIC only.
  @Authz(SCOPES.VIEW, byParam(ENTITIES.COURSE))
  @Delete("courses/:id/enrollment")
  async leave(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<boolean> {
    return this.courseService.leave(request.user.sub, id);
  }

  @ApiOperation({
    summary: "Update the current talebe's progress in a course",
    description:
      "Records progress only. Reaching 100 does not complete the course, and `status` is refused unless it is the current one (MDRS-105): the course team completes a course.",
    operationId: "updateCourseProgress",
  })
  @ApiOkResponse({ type: EnrollmentResponse })
  @ApiForbiddenResponse({
    description:
      "`status` would change the enrollment's status (ENROLLMENT_STATUS_FORBIDDEN).",
  })
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
