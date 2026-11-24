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
  ApiBadRequestResponse,
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
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  PERMANENT_BAN_TABS,
  PermanentBanRequestListResponse,
  type PermanentBanTab,
  RejectPermanentBanRequestDto,
} from "./dto/permanent-ban.dto";
import { PermanentBanService } from "./permanent-ban.service";

/**
 * Kalıcı yasak talepleri (nizam/45, MDRS-194): the Medaris başnazımı, or a
 * Medaris nazımı holding `platform.ban_account`, decides the requests a
 * medrese opened for a ban to be made permanent. No `AuthzGuard`, like
 * `BanController`: the engine has no ban entity, so `PermanentBanService`
 * decides from the catalogue.
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("permanent-ban-requests")
export class PermanentBanController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly requests: PermanentBanService) {}

  @ApiOperation({
    summary: "Permanent ban requests (Karar bekleyen / Karara bağlanan)",
    description:
      "Waiting ones oldest first, decided ones newest first, each with the ban it is about, and both counts. For the başnazım and a Medaris nazımı holding `platform.ban_account`.",
    operationId: "listPermanentBanRequests",
  })
  @ApiQuery({ name: "status", required: false, enum: PERMANENT_BAN_TABS })
  @ApiOkResponse({ type: PermanentBanRequestListResponse })
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @Get()
  list(
    @Req() request: AuthenticatedUserRequest,
    @Query(
      "status",
      new DefaultValuePipe("PENDING"),
      new ParseEnumPipe(PERMANENT_BAN_TABS)
    )
    status: PermanentBanTab
  ): Promise<PermanentBanRequestListResponse> {
    return this.requests.list(request.user, status);
  }

  @ApiOperation({
    summary: "Approve the request (Onayla)",
    description:
      "Bars the person from all of Medaris: a PLATFORM ban is opened beside the ban the request is about, and every köşk, medrese and course refuses them from then on. The sign-in account is not closed. A person already barred from the platform keeps that ban. 409 PERMANENT_BAN_REQUEST_NOT_PENDING when it was decided already, 409 BAN_ALREADY_LIFTED when the ban it is about was lifted meanwhile. Written to the audit log (permanent_ban.approve, and ban.create for the platform ban).",
    operationId: "approvePermanentBanRequest",
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: "BAN_TARGET_INVALID" })
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: "PERMANENT_BAN_REQUEST_NOT_PENDING or BAN_ALREADY_LIFTED",
  })
  @Post(":id/approve")
  @HttpCode(HttpStatus.NO_CONTENT)
  approve(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.requests.approve(request.user, id);
  }

  @ApiOperation({
    summary: "Refuse the request (Reddet)",
    description:
      "The note is required and is read by whoever asked; the ban the request is about stays as it was. 409 PERMANENT_BAN_REQUEST_NOT_PENDING when it was decided already. Written to the audit log (permanent_ban.reject).",
    operationId: "rejectPermanentBanRequest",
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "PERMANENT_BAN_REQUEST_NOT_PENDING" })
  @Post(":id/reject")
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectPermanentBanRequestDto
  ): Promise<void> {
    return this.requests.reject(request.user, id, dto.note);
  }
}
