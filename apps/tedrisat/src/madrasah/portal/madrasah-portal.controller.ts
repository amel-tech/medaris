import { AuthGuard, Authz, AuthzGuard, PERMISSIONS } from "@medaris/common";
import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { EnrollmentStatus } from "../../course/domain/enrollment-status.enum";
import { AuthenticatedUserRequest } from "../../user/interfaces/authenticated-user-request.interface";
import { byExistingMadrasah } from "../madrasah.controller";
import {
  MadrasahDashboardResponse,
  MadrasahStudentsResponse,
} from "./dto/madrasah-portal.dto";
import { MadrasahPortalService } from "./madrasah-portal.service";

const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;
const STUDENT_STATES = [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED];

/**
 * The nazır portal's talebe list (nazir/10) and Pano (nazir/01), under
 * `/madrasahs/:id`. The medrese's başmüderris and SYSTEM_ADMIN call these by
 * role default, and a nazır of the medrese once given `madrasah.students_view`;
 * a nazır with no grant gets 403.
 */
@ApiTags("madrasahs")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("madrasahs")
export class MadrasahPortalController {
  constructor(private readonly portal: MadrasahPortalService) {}

  @ApiOperation({
    summary: "The medrese's talebe, a page at a time (its başmüderris)",
    description:
      "nazir/10: everyone enrolled in, or who completed, a course of the medrese that is not hidden — derived from the enrollments, never stored; a talebe's courses outside the medrese are not here. Newest first by first enrollment, 10 a page by default. `q` matches the name or the e-mail address, `courseId` keeps the talebe who attend or finished that course and `status` those holding an enrollment in that state (in that course when it is given); each row still lists all of the talebe's courses in the medrese.",
    operationId: "getMadrasahStudents",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "courseId", required: false, type: String, format: "uuid" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: STUDENT_STATES,
  })
  @ApiOkResponse({ type: MadrasahStudentsResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/students")
  @Authz(PERMISSIONS.MADRASAH_STUDENTS_VIEW, byExistingMadrasah)
  students(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query("q") q?: string,
    @Query("courseId", new ParseUUIDPipe({ optional: true }))
    courseId?: string,
    @Query("status", new ParseEnumPipe(STUDENT_STATES, { optional: true }))
    status?: EnrollmentStatus.ENROLLED | EnrollmentStatus.COMPLETED
  ): Promise<MadrasahStudentsResponse> {
    const safePage = page < 1 ? 1 : page;
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    return this.portal
      .students(
        id,
        {
          // A repeated query key arrives as an array; only a single value is read.
          q: typeof q === "string" ? q.slice(0, MAX_SEARCH_LENGTH) : undefined,
          courseId,
          status,
        },
        safePage,
        safeLimit
      )
      .then(({ items, total }) => ({
        items: items.map((s) => ({
          userId: s.userId,
          name: s.name,
          email: s.email,
          firstEnrolledAt: s.firstEnrolledAt,
          ongoingCourses: s.ongoing,
          completedCourses: s.completed,
        })),
        total,
        page: safePage,
        limit: safeLimit,
      }));
  }

  @ApiOperation({
    summary: "What the medrese's Pano shows (its başmüderris)",
    description:
      "nazir/01 in one read: the medrese's nazır and course counts, the köşks it holds a hosting right in, its live sessions in the next 7 days, and its pending applications (newest 50, with the whole count). The scope cards of the courses the caller teaches come from `GET /me/assignments`, and the greeting's name from `GET /me`. Each pending application says whether the caller may decide it (`viewerMayDecide`): the course routes that approve and reject answer the course team, the köşk's nazım and the başnazım alone.",
    operationId: "getMadrasahDashboard",
  })
  @ApiOkResponse({ type: MadrasahDashboardResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/dashboard")
  @Authz(PERMISSIONS.MADRASAH_STUDENTS_VIEW, byExistingMadrasah)
  dashboard(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahDashboardResponse> {
    return this.portal.dashboard(request.user, id);
  }
}
