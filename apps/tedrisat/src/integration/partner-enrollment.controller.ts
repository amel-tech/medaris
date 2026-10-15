import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  PartnerCourseResponse,
  PartnerEnrollDto,
  PartnerEnrollmentParams,
  PartnerEnrollmentResponse,
  PartnerUnenrollmentResponse,
} from "./dto/partner-enrollment.dto";
import { PartnerGuard } from "./partner.guard";
import { PartnerEnrollmentService } from "./partner-enrollment.service";
import { IPartnerCaller, PartnerRequest } from "./partner-request";
import { PartnerThrottlerGuard } from "./partner-throttler.guard";

const caller = (request: PartnerRequest): IPartnerCaller => {
  // Set by PartnerGuard, which every route here runs first.
  if (!request.partner) throw new Error("PartnerGuard did not run");
  return request.partner;
};

/**
 * What a partner application calls (partner enrollments): its registrations
 * become course enrollments and its cancellations take them away. Only a
 * partner client's service-account token passes `PartnerGuard`; no person's
 * token does, and no other route accepts a partner's. No `AuthGuard` and no
 * `AuthzGuard` here: the partner holds no role in any scope; what it may do is
 * the code mapping course staff set in nazar, in the köşks the başnazım bound
 * the partner to in nizam.
 */
@ApiTags("integrations")
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description:
    "No token, or one tedrisat does not accept here: wrong signature, issuer, audience or client, expired, or not an access token.",
})
@ApiForbiddenResponse({
  description:
    "The partner client's token lacks the `partner-enrollment` realm role (PARTNER_ROLE_MISSING), or the partner is disabled in nizam (PARTNER_DISABLED).",
})
@ApiTooManyRequestsResponse({
  description:
    "Past the partner's budget for this route (`THROTTLE_PARTNER_LIMIT`, 600 a minute by default); `Retry-After` says when to try again.",
})
@UseGuards(PartnerGuard, PartnerThrottlerGuard)
@Controller("integrations")
export class PartnerEnrollmentController {
  constructor(private readonly enrollments: PartnerEnrollmentService) {}

  @ApiOperation({
    summary:
      "Enrol the person of a registration in the course its code maps to",
    description:
      "Idempotent. Seats the person as an approved, active talebe through the course team's own path (audit log, session invitations, notifications): a new seat, or their waiting request approved. The account must exist, be enabled and have a verified e-mail; it is read from the realm by its id. A registration is bound to its first person: another `userId` for the same `registrationRef` and `courseCode` is refused.",
    operationId: "putPartnerEnrollment",
  })
  @ApiOkResponse({ type: PartnerEnrollmentResponse })
  @ApiBadRequestResponse({
    description:
      "A path segment or `userId` of the wrong shape (VALIDATION_ERROR).",
  })
  @ApiNotFoundResponse({
    description:
      "No course is mapped to this code for this partner in a köşk the partner works with (PARTNER_COURSE_UNKNOWN; a code mapped in a köşk it has been unbound from since reads the same), or the realm has no such enabled account (PARTNER_USER_UNKNOWN). With no partner registered, every route here answers 404.",
  })
  @ApiConflictResponse({
    description:
      "The account's e-mail is not verified (PARTNER_USER_UNVERIFIED); the registration is linked to another person (PARTNER_REGISTRATION_USER_MISMATCH); or tedrisat refused the seat (PARTNER_ENROLLMENT_REFUSED, `context.reason`: BANNED, REMOVED_BY_COURSE_TEAM, COURSE_NOT_PUBLISHED, COURSE_HIDDEN, KOSK_HIDDEN, COURSE_NOT_FOUND or CHANGED).",
  })
  @ApiServiceUnavailableResponse({
    description:
      "The realm's directory is not configured (KEYCLOAK_ADMIN_NOT_CONFIGURED) or did not answer (KEYCLOAK_ADMIN_UNAVAILABLE). Retry later.",
  })
  @Put("enrollments/:registrationRef/:courseCode")
  @HttpCode(HttpStatus.OK)
  enroll(
    @Req() request: PartnerRequest,
    @Param() key: PartnerEnrollmentParams,
    @Body() dto: PartnerEnrollDto
  ): Promise<PartnerEnrollmentResponse> {
    return this.enrollments.enroll(caller(request), key, dto.userId);
  }

  @ApiOperation({
    summary: "Undo what a registration did, and only that",
    description:
      "Idempotent. A seat the registration added is taken away through the course team's own removal path (the talebe is told, with a reason naming the partner); a seat the person holds independently stays. Either way the registration is closed; asking again answers the same. It works for every registration the partner made, also in a köşk it has been unbound from since.",
    operationId: "deletePartnerEnrollment",
  })
  @ApiOkResponse({ type: PartnerUnenrollmentResponse })
  @ApiBadRequestResponse({
    description: "A path segment of the wrong shape (VALIDATION_ERROR).",
  })
  @Delete("enrollments/:registrationRef/:courseCode")
  @HttpCode(HttpStatus.OK)
  unenroll(
    @Req() request: PartnerRequest,
    @Param() key: PartnerEnrollmentParams
  ): Promise<PartnerUnenrollmentResponse> {
    return this.enrollments.unenroll(caller(request), key);
  }

  @ApiOperation({
    summary: "The partner's codes that are mapped to Medaris courses",
    description:
      "For the partner's own admin panel: which of its courses are connected. Only the codes in köşks the partner works with.",
    operationId: "listPartnerCourses",
  })
  @ApiOkResponse({ type: PartnerCourseResponse, isArray: true })
  @Get("courses")
  courses(@Req() request: PartnerRequest): Promise<PartnerCourseResponse[]> {
    return this.enrollments.listCourses(caller(request));
  }
}
