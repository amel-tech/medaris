import { AuthGuard, Authz, AuthzGuard, PERMISSIONS } from "@medaris/common";
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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AuthorizedRequest } from "../kosk/interfaces/authorized-request.interface";
import { byExistingMadrasah } from "../madrasah/madrasah.controller";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  APPEAL_TABS,
  AppealCreatedResponse,
  AppealListResponse,
  type AppealTab,
  CreateAppealDto,
  MadrasahAppealRowResponse,
  RejectAppealDto,
} from "./appeal.dto";
import { AppealService } from "./appeal.service";

/**
 * The medrese's İtirazlar (nazar): its course requests a köşk refused, and
 * the appeal it opens against one. `madrasah.appeal_open`: the başmüderris,
 * or a nazır of the medrese who was given it.
 */
@ApiTags("madrasahs")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("madrasahs")
export class MadrasahAppealController {
  constructor(private readonly appeals: AppealService) {}

  @ApiOperation({
    summary: "The medrese's refused course requests and their appeals",
    description:
      "Every course request of the medrese a köşk refused, and every one it appealed (an accepted appeal sends the request back to PENDING), newest first, each with its appeal or null.",
    operationId: "listMadrasahAppeals",
  })
  @ApiOkResponse({ type: MadrasahAppealRowResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/appeals")
  @Authz(PERMISSIONS.MADRASAH_APPEAL_OPEN, byExistingMadrasah)
  list(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahAppealRowResponse[]> {
    return this.appeals.madrasahRows(id);
  }

  @ApiOperation({
    summary: "Appeal a köşk's refusal of the medrese's course request",
    description:
      "Only a REJECTED request of this medrese, once: 409 APPEAL_REQUEST_NOT_REJECTED or APPEAL_EXISTS otherwise; 404 APPEAL_REQUEST_NOT_FOUND for a request that is not the medrese's. Written to the audit log (appeal.create).",
    operationId: "createMadrasahAppeal",
  })
  @ApiCreatedResponse({ type: AppealCreatedResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: "APPEAL_REQUEST_NOT_REJECTED or APPEAL_EXISTS",
  })
  @Post(":id/appeals")
  @Authz(PERMISSIONS.MADRASAH_APPEAL_OPEN, byExistingMadrasah)
  async create(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateAppealDto
  ): Promise<AppealCreatedResponse> {
    return { id: await this.appeals.create(request.user, id, dto) };
  }
}

/**
 * İtirazlar (nizam): the Medaris başnazımı, or a Medaris nazımı holding
 * `platform.appeal_decide`, decides the medreses' appeals. No `AuthzGuard`:
 * the matrix has no entity for an appeal, so `AppealService` decides.
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("appeals")
export class AppealController {
  constructor(private readonly appeals: AppealService) {}

  @ApiOperation({
    summary: "Appeals (Bekleyen / Karara bağlanan)",
    description:
      "Waiting ones oldest first, decided ones newest first, with both tab counts.",
    operationId: "listAppeals",
  })
  @ApiQuery({ name: "status", required: false, enum: APPEAL_TABS })
  @ApiOkResponse({ type: AppealListResponse })
  @ApiForbiddenResponse()
  @Get()
  list(
    @Req() request: AuthenticatedUserRequest,
    @Query(
      "status",
      new DefaultValuePipe("PENDING"),
      new ParseEnumPipe(APPEAL_TABS)
    )
    status: AppealTab
  ): Promise<AppealListResponse> {
    return this.appeals.list(request.user, status);
  }

  @ApiOperation({
    summary: "Accept the appeal (Kabul et)",
    description:
      "The course request goes back to PENDING and the köşk decides it again. 409 APPEAL_NOT_PENDING when it was decided already. Written to the audit log (appeal.accept).",
    operationId: "acceptAppeal",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "APPEAL_NOT_PENDING" })
  @Post(":id/accept")
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.appeals.accept(request.user, id);
  }

  @ApiOperation({
    summary: "Refuse the appeal (Reddet)",
    description:
      "The decision note is required; the request stays refused. 409 APPEAL_NOT_PENDING when it was decided already. Written to the audit log (appeal.reject).",
    operationId: "rejectAppeal",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "APPEAL_NOT_PENDING" })
  @Post(":id/reject")
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectAppealDto
  ): Promise<void> {
    return this.appeals.reject(request.user, id, dto.note);
  }
}
