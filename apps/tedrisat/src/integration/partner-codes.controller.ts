import { AuthGuard, Authz, AuthzGuard, PERMISSIONS } from "@medaris/common";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiTags,
} from "@nestjs/swagger";
import { byExistingCourse } from "../course/course.controller";
import { AuthorizedRequest } from "../course/interfaces/authorized-request.interface";
import {
  AddPartnerCodeDto,
  CoursePartnerCodesResponse,
  PartnerCodeParams,
  PartnerCodeResponse,
} from "./dto/partner-codes.dto";
import { PartnerCodesService } from "./partner-codes.service";

/**
 * "Ortak uygulama kodları" (partner enrollments): course staff map a partner
 * application's codes to the course, in nazar's course settings. Mapping
 * decides who enters the course, so it is its own permission,
 * `course.partner_codes`: the köşk nazımı's and the başnazım's, not the
 * müderris'. Only the course's partners are offered and accepted: the enabled
 * ones the başnazım bound to the course's köşk. These are ordinary routes
 * behind `AuthGuard`; a partner's token is refused on every one of them.
 */
@ApiTags("courses")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class PartnerCodesController {
  constructor(private readonly codes: PartnerCodesService) {}

  @ApiOperation({
    summary: "A course's partner codes",
    description:
      "The course's partner applications, each with its codes mapped to this course: the enabled partners bound to the köşk the course is held in. Empty when the köşk has none, and nazar then shows no partner section.",
    operationId: "getCoursePartnerCodes",
  })
  @ApiOkResponse({ type: CoursePartnerCodesResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Authz(PERMISSIONS.COURSE_PARTNER_CODES, byExistingCourse)
  @Get("courses/:id/partner-codes")
  async courseCodes(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<CoursePartnerCodesResponse> {
    return { partners: await this.codes.courseCodes(id) };
  }

  @ApiOperation({
    summary: "Map a partner application's code to the course",
    description:
      "Adding a code the course has already changes nothing. Written to the audit log as `course.partner_code_add`.",
    operationId: "addCoursePartnerCode",
  })
  @ApiCreatedResponse({ type: PartnerCodeResponse })
  @ApiBadRequestResponse({
    description:
      "The code is not lower-case letters, digits and hyphens, at most 64, starting with a letter or digit (VALIDATION_ERROR).",
  })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({
    description:
      "No such course, or the partner is not one of the course's: not registered, disabled, or not bound to the course's köşk (PARTNER_UNKNOWN, the same for each).",
  })
  @ApiConflictResponse({
    description:
      "The code is mapped to another course already (PARTNER_CODE_TAKEN). Which one is not said.",
  })
  @Authz(PERMISSIONS.COURSE_PARTNER_CODES, byExistingCourse)
  @Post("courses/:id/partner-codes")
  addCode(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddPartnerCodeDto
  ): Promise<PartnerCodeResponse> {
    return this.codes.addCode(id, dto.partner, dto.code, request.user.sub);
  }

  @ApiOperation({
    summary: "Take a partner application's code off the course",
    description:
      "The people it enrolled stay; the partner's later cancellations still reach them. A code the course does not have is no error. Written to the audit log as `course.partner_code_remove`.",
    operationId: "removeCoursePartnerCode",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({
    description:
      "No such course, or the partner is not one of the course's (PARTNER_UNKNOWN), as for adding.",
  })
  @Authz(PERMISSIONS.COURSE_PARTNER_CODES, byExistingCourse)
  @Delete("courses/:id/partner-codes/:partner/:code")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCode(
    @Req() request: AuthorizedRequest,
    @Param() params: PartnerCodeParams
  ): Promise<void> {
    await this.codes.removeCode(
      params.id,
      params.partner,
      params.code,
      request.user.sub
    );
  }
}
