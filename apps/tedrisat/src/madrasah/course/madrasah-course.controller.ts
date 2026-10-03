import {
  ASSIGNED_ROLES,
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
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  ApiTags,
} from "@nestjs/swagger";
import { AuthorizedRequest } from "../../kosk/interfaces/authorized-request.interface";
import { MadrasahCourseListItemResponse } from "../dto/madrasah-settings.dto";
import { byExistingMadrasah } from "../madrasah.controller";
import {
  CreateOffsiteCourseRequestDto,
  MadrasahCourseKoskResponse,
  OffsiteCourseRequestResponse,
  OpenMadrasahCourseDto,
  SetMadrasahCourseMuderrisDto,
} from "./dto/madrasah-course.dto";
import { MadrasahCourseService } from "./madrasah-course.service";

/**
 * The medrese's own courses (nazir/07, 08, 17, 18) under
 * `/madrasahs/:id/courses`, and its requests for a course outside it (nazir/09)
 * under `/madrasahs/:id/offsite-course-requests`; the list itself is
 * `GET /madrasahs/:id/courses` on
 * `MadrasahController`. The medrese's başmüderris and SYSTEM_ADMIN call these;
 * a nazır of the medrese holds the permission of each route only if it was
 * given (`madrasah.course_open`, `madrasah.muderris_manage`,
 * `madrasah.course_hide`, `madrasah.offsite_course_request`); a köşk's nazım
 * and a course's müderris hold none of them, so they get 403.
 */
@ApiTags("madrasahs")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("madrasahs")
export class MadrasahCourseController {
  constructor(
    private readonly courses: MadrasahCourseService,
    private readonly selfGrant: SelfGrantGuard
  ) {}

  @ApiOperation({
    summary: "The köşks the medrese may open courses in (its başmüderris)",
    description:
      "nazir/07's \"Ders açabileceğiniz köşkler\" and nazir/08's köşk choice: the köşks that hold a hosting right for the medrese, by name, each with its ilim alanı and how many courses the medrese has there. A köşk that is hidden is not listed.",
    operationId: "getMadrasahHostingKosks",
  })
  @ApiOkResponse({ type: MadrasahCourseKoskResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/hosting-kosks")
  @Authz(PERMISSIONS.MADRASAH_COURSE_OPEN, byExistingMadrasah)
  hostingKosks(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahCourseKoskResponse[]> {
    return this.courses.hostingKosks(id);
  }

  @ApiOperation({
    summary: "Open a course of the medrese (its başmüderris)",
    description:
      'nazir/08\'s "Dersi aç". The course is a DRAFT in a köşk the medrese holds a hosting right in, with its müderrisler and imam; a lone müderris is the imam, with several `imamUserId` is required. The medrese\'s policies are applied on the server: "Kayıt her zaman onaylı" makes the course wait for approval and "Kapalı ders zorunlu" makes it closed, whatever is sent. The müderrisler are found with `GET /users/lookup`; one the app and the realm do not know is a 404 (MUDERRIS_UNKNOWN_USER). 403 (HOSTING_RIGHT_REQUIRED) when the köşk gave the medrese no right. Written to the audit log.',
    operationId: "openMadrasahCourse",
  })
  @ApiCreatedResponse({ type: MadrasahCourseListItemResponse })
  @ApiBadRequestResponse({
    description:
      "COURSE_IMAM_REQUIRED, COURSE_IMAM_NOT_LISTED or MUDERRIS_DUPLICATE_USER",
  })
  @ApiForbiddenResponse({ description: "HOSTING_RIGHT_REQUIRED" })
  @ApiNotFoundResponse({ description: "Also MUDERRIS_UNKNOWN_USER" })
  @Post(":id/courses")
  @Authz(PERMISSIONS.MADRASAH_COURSE_OPEN, byExistingMadrasah)
  async open(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: OpenMadrasahCourseDto
  ): Promise<MadrasahCourseListItemResponse> {
    // Naming yourself müderris is for someone who already holds every course
    // permission in the medrese (its başmüderris), not for a grantee.
    await this.selfGrant.assertNotSelf(
      request.user,
      dto.muderrisUserIds,
      { entity: ENTITIES.MADRASAH, id },
      { role: ASSIGNED_ROLES.MUDERRIS },
      "madrasah.course.open"
    );
    return this.courses.open(id, dto, request.user.sub);
  }

  @ApiOperation({
    summary: "Replace a course's müderrisler (its başmüderris)",
    description:
      "nazir/17's \"Kaydet\", in one transaction: the müderrisler listed are the course's müderrisler and `imamUserId` is its imam; an account that leaves the list loses its MUDERRIS role. A müderris shown by name alone, with no account, is left as it is. A köşk's nazım cannot do this. The course's version moves, so an editor that opened it earlier gets 409 on save. Written to the audit log. 404 (MADRASAH_COURSE_NOT_FOUND) for a course that is not the medrese's or is hidden.",
    operationId: "setMadrasahCourseMuderris",
  })
  @ApiOkResponse({ type: MadrasahCourseListItemResponse })
  @ApiBadRequestResponse({
    description:
      "COURSE_IMAM_REQUIRED, COURSE_IMAM_NOT_LISTED or MUDERRIS_DUPLICATE_USER",
  })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({
    description: "MADRASAH_COURSE_NOT_FOUND or MUDERRIS_UNKNOWN_USER",
  })
  @Put(":id/courses/:courseId/muderrises")
  @Authz(PERMISSIONS.MADRASAH_MUDERRIS_MANAGE, byExistingMadrasah)
  async setMuderris(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("courseId", ParseUUIDPipe) courseId: string,
    @Body() dto: SetMadrasahCourseMuderrisDto
  ): Promise<MadrasahCourseListItemResponse> {
    await this.selfGrant.assertNotSelf(
      request.user,
      dto.muderrisUserIds,
      { entity: ENTITIES.MADRASAH, id },
      { role: ASSIGNED_ROLES.MUDERRIS },
      "madrasah.course.muderris"
    );
    return this.courses.setMuderris(id, courseId, dto, request.user.sub);
  }

  @ApiOperation({
    summary: "Hide a course of the medrese (its başmüderris)",
    description:
      "nazir/18's \"Gizle\". The course leaves the medrese's list, the köşk's page, the talebe's calendar and every search; nothing is deleted, and it is listed in the medrese's archive, where `POST /archive/course/:id/restore` brings it back by kademe. 409 (MADRASAH_COURSE_ALREADY_HIDDEN) when it is hidden. Written to the audit log.",
    operationId: "hideMadrasahCourse",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({ description: "MADRASAH_COURSE_NOT_FOUND" })
  @ApiConflictResponse({ description: "MADRASAH_COURSE_ALREADY_HIDDEN" })
  @Post(":id/courses/:courseId/hide")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authz(PERMISSIONS.MADRASAH_COURSE_HIDE, byExistingMadrasah)
  async hide(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("courseId", ParseUUIDPipe) courseId: string
  ): Promise<void> {
    await this.courses.hide(id, courseId, request.user.sub);
  }

  @ApiOperation({
    summary:
      "Ask a köşk to open a course outside the medrese (its başmüderris)",
    description:
      "nazir/09's \"Talebi gönder\": the köşk, a suggested name and the reason, kept with the medrese that sent them. It creates no course and adds nothing to the medrese's list: the köşk's nazım reads the request and, on accepting it, opens the course, which stays a köşk course. The request is PENDING until then. Any köşk that is not hidden, whether or not the medrese holds a hosting right there. Written to the audit log.",
    operationId: "requestOffsiteCourse",
  })
  @ApiCreatedResponse({ type: OffsiteCourseRequestResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({ description: "The medrese or the köşk" })
  @Post(":id/offsite-course-requests")
  @Authz(PERMISSIONS.MADRASAH_OFFSITE_COURSE_REQUEST, byExistingMadrasah)
  requestOffsite(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateOffsiteCourseRequestDto
  ): Promise<OffsiteCourseRequestResponse> {
    return this.courses.requestOffsiteCourse(id, dto, request.user.sub);
  }

  @ApiOperation({
    summary: "The medrese's requests for a course outside it (its başmüderris)",
    description:
      "Newest first, each with its köşk, its sender and its status. The köşk side's list of requests it received is the köşk nazımı's own screen (nizam/39), not this one.",
    operationId: "getOffsiteCourseRequests",
  })
  @ApiOkResponse({ type: OffsiteCourseRequestResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/offsite-course-requests")
  @Authz(PERMISSIONS.MADRASAH_OFFSITE_COURSE_REQUEST, byExistingMadrasah)
  offsiteRequests(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<OffsiteCourseRequestResponse[]> {
    return this.courses.offsiteRequests(id);
  }
}
