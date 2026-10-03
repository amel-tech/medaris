import { AuthGuard } from "@medaris/common";
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { RejectReasonDto } from "../deck-review/dto/deck-review.dto";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  ApproveKoskApplicationDto,
  KOSK_APPLICATION_TABS,
  KoskApplicationDetailResponse,
  KoskApplicationListResponse,
  type KoskApplicationTab,
} from "./dto/kosk-application-review.dto";
import { KoskApplicationReviewService } from "./kosk-application-review.service";

/**
 * Köşk başvuruları (MDRS-181, nizam/15). No `AuthzGuard`: the matrix has no
 * entity for an application, so `KoskApplicationReviewService` decides: the
 * başnazım, or a Medaris nazımı holding "Köşk başvurularını karara bağla".
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nizam/kosk-applications")
export class NizamKoskApplicationsController {
  constructor(private readonly review: KoskApplicationReviewService) {}

  @ApiOperation({
    summary: "Köşk applications (Bekleyen / Karara bağlanan)",
    description:
      "Waiting ones oldest first, answered ones newest first, with both tab counts. No contact detail is in the list.",
    operationId: "listKoskApplications",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: KOSK_APPLICATION_TABS,
  })
  @ApiOkResponse({ type: KoskApplicationListResponse })
  @ApiForbiddenResponse()
  @Get()
  list(
    @Req() request: AuthenticatedUserRequest,
    @Query(
      "status",
      new DefaultValuePipe("PENDING"),
      new ParseEnumPipe(KOSK_APPLICATION_TABS)
    )
    status: KoskApplicationTab
  ): Promise<KoskApplicationListResponse> {
    return this.review.list(request.user, status);
  }

  @ApiOperation({
    summary: "One application with the applicant's contact details",
    description:
      "The applicant's e-mail and phone are personal data: every read is written to the audit trail (`kosk_application.contact_read`) before the details are returned.",
    operationId: "getKoskApplication",
  })
  @ApiOkResponse({ type: KoskApplicationDetailResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id")
  detail(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskApplicationDetailResponse> {
    return this.review.detail(request.user, id);
  }

  @ApiOperation({
    summary: "Accept the application with the köşk opened from it (Köşkü aç)",
    description:
      "Open the köşk first (`POST /kosks` with the application's values); this marks the application Kabul edildi and tells the applicant. 409 (KOSK_APPLICATION_DECIDED) when it was answered already.",
    operationId: "approveKoskApplication",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "KOSK_APPLICATION_DECIDED" })
  @Post(":id/approve")
  @HttpCode(HttpStatus.NO_CONTENT)
  approve(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ApproveKoskApplicationDto
  ): Promise<void> {
    return this.review.approve(request.user, id, dto.koskId);
  }

  @ApiOperation({
    summary: "Refuse the application (Reddet)",
    description:
      "The reason is required and goes to the applicant in their notifications. 409 (KOSK_APPLICATION_DECIDED) when it was answered already.",
    operationId: "rejectKoskApplication",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "KOSK_APPLICATION_DECIDED" })
  @Post(":id/reject")
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectReasonDto
  ): Promise<void> {
    return this.review.reject(request.user, id, dto.reason);
  }
}
