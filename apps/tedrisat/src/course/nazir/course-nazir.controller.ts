import {
  AuthGuard,
  Authz,
  AuthzGuard,
  ENTITIES,
  PERMISSIONS,
  SelfGrantGuard,
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
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../../user/interfaces/authenticated-user-request.interface";
import { byExistingCourse } from "../course.controller";
import { CourseNazirService } from "./course-nazir.service";
import {
  CourseNazirsResponse,
  CreateCourseNazirDto,
  UpdateCourseNazirDto,
} from "./dto/course-nazir.dto";

/**
 * A course's ders nazırları from the course itself (MDRS-270, nazar's "Ders
 * nazırları"), for a medrese's course as well as a köşk's own.
 * `@Authz(course_nazir.assign)` lets in whoever may appoint here; the service
 * decides from the engine who also gives permissions (only a role's own
 * `permission.grant`), and limits what they give to what they hold.
 */
@ApiTags("courses")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("courses")
export class CourseNazirController {
  constructor(
    private readonly service: CourseNazirService,
    private readonly selfGrant: SelfGrantGuard
  ) {}

  @ApiOperation({
    summary: "The course's ders nazırları and what the caller may do",
    description:
      "nazar 'Ders nazırları'. Needs `course_nazir.assign` on the course. The posts held in the course with their permission codes, end, appointer and date; the catalog; the codes the caller may hand out (empty for one who holds `course_nazir.assign` by a grant: they appoint only); and on each post whether the caller may change or end it.",
    operationId: "getCourseNazirs",
  })
  @ApiOkResponse({ type: CourseNazirsResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/nazirs")
  @Authz(PERMISSIONS.COURSE_NAZIR_ASSIGN, byExistingCourse)
  list(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CourseNazirsResponse> {
    return this.service.list(request.user, id);
  }

  @ApiOperation({
    summary: "Make someone the course's ders nazırı",
    description:
      "nazar 'Ders nazırı ata'. Needs `course_nazir.assign`; giving permissions also needs `permission.grant` through a role (müderris, başmüderris, köşk nazımı) or the başnazım, else 403 PERMISSION_NOT_GIVABLE for any code. The post and the permissions end together at `endsAt`. 403 GRANT_EXCEEDS_GIVER for a permission the caller does not hold here; 403 PERMISSION_NOT_GIVABLE for a köşk nazımı in a medrese course; 403 SELF_GRANT_REFUSED for oneself, SYSTEM_ADMIN excepted; 400 for a code outside the course catalog, a hidden course or an end in the past; 404 COURSE_NAZIR_UNKNOWN_ACCOUNT; 409 COURSE_NAZIR_BARRED for an account an open ban bars from the course. Written to the audit log. Answers the list as it is now.",
    operationId: "createCourseNazir",
  })
  @ApiCreatedResponse({ type: CourseNazirsResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      "COURSE_NAZIR_EXISTS, COURSE_NAZIR_HOLDS_SEAT, COURSE_NAZIR_BARRED",
  })
  @ApiServiceUnavailableResponse({
    description: "KEYCLOAK_ADMIN_UNAVAILABLE: the account could not be checked",
  })
  @Post(":id/nazirs")
  @Authz(PERMISSIONS.COURSE_NAZIR_ASSIGN, byExistingCourse)
  async create(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateCourseNazirDto
  ): Promise<CourseNazirsResponse> {
    // A post one makes for oneself would outlive the seat that let one make
    // it (MDRS-270: "nobody can appoint themselves").
    await this.selfGrant.assertNotSelf(
      request.user,
      [dto.userId],
      { entity: ENTITIES.COURSE, id },
      { always: true },
      "course.nazirs.create"
    );
    return this.service.create(request.user, id, dto);
  }

  @ApiOperation({
    summary: "Change a ders nazırı's permissions and end",
    description:
      "nazar 'İzinleri düzenle'. Only a giver (`permission.grant` through a role, or the başnazım). Replaces the whole set; what stays keeps its giver and date. `endsAt` is required (null: no end), and the post ends when the permissions do. A code given or moved later is held to the caller's own; a row given from above the caller is never lengthened, the extra time is a row of the caller's own beside it. 403 SELF_GRANT_REFUSED for the caller's own post, SYSTEM_ADMIN excepted. Written to the audit log.",
    operationId: "updateCourseNazir",
  })
  @ApiOkResponse({ type: CourseNazirsResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Patch(":id/nazirs/:postId")
  @Authz(PERMISSIONS.COURSE_NAZIR_ASSIGN, byExistingCourse)
  async update(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("postId", ParseUUIDPipe) postId: string,
    @Body() dto: UpdateCourseNazirDto
  ): Promise<CourseNazirsResponse> {
    // Rewriting one's own post is appointing oneself again. An unknown post
    // is the service's 404.
    const holder = await this.service.holderOf(id, postId);
    if (holder) {
      await this.selfGrant.assertNotSelf(
        request.user,
        [holder],
        { entity: ENTITIES.COURSE, id },
        { always: true },
        "course.nazirs.update"
      );
    }
    return this.service.update(request.user, id, postId, dto);
  }

  @ApiOperation({
    summary: "Take a ders nazırı's post and permissions away",
    description:
      "nazar 'Görevden al'. The post and every permission the person holds in the course end at once. One who holds `course_nazir.assign` by a grant ends only the posts they appointed (403 NAZIR_NOT_APPOINTED_BY_YOU); 409 DISMISS_SEAT_HANDED_ON while someone the person appointed still holds their post. Written to the audit log.",
    operationId: "revokeCourseNazir",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "DISMISS_SEAT_HANDED_ON" })
  @Delete(":id/nazirs/:postId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authz(PERMISSIONS.COURSE_NAZIR_ASSIGN, byExistingCourse)
  async revoke(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("postId", ParseUUIDPipe) postId: string
  ): Promise<void> {
    await this.service.revoke(request.user, id, postId);
  }
}
