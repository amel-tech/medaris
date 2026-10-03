import {
  AuthGuard,
  Authz,
  AuthzGuard,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
} from "@medaris/common";
import {
  Body,
  Controller,
  Delete,
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
import { byExistingKosk } from "../kosk/kosk.controller";
import {
  COURSES_ACTIONS,
  type CoursesAction,
  GrantHostingRightDto,
  HostingRightResponse,
} from "./dto/hosting-right.dto";
import type { GrantedByRole } from "./hosting.repository";
import { HostingService } from "./hosting.service";

/**
 * A köşk's hosting rights (MDRS-170): which medreses may open courses in it.
 * The köşk's nazımları manage them (`EDIT` on the köşk) and so does
 * SYSTEM_ADMIN; anyone else is a 403, a missing köşk a 404.
 */
@ApiTags("kosks")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("kosks")
export class HostingController {
  constructor(
    private readonly hosting: HostingService,
    private readonly authz: AuthzService
  ) {}

  @ApiOperation({
    summary: "The medreses that hold a hosting right in the köşk",
    description:
      "nizam/26. Each with its başmüderris, who granted the right and when, and the medrese's courses here that are not hidden (nizam/27 asks what becomes of them).",
    operationId: "getKoskHostingRights",
  })
  @ApiOkResponse({ type: HostingRightResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/hosting-rights")
  @Authz(
    [PERMISSIONS.KOSK_HOSTING, PERMISSIONS.PLATFORM_HOSTING_GRANT],
    byExistingKosk
  )
  list(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<HostingRightResponse[]> {
    return this.hosting.list(id);
  }

  @ApiOperation({
    summary: "Give a medrese a hosting right in the köşk",
    description:
      "Idempotent. 404 for a medrese that is missing or hidden. Written to the audit log.",
    operationId: "grantKoskHostingRight",
  })
  @ApiCreatedResponse({ type: HostingRightResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post(":id/hosting-rights")
  @Authz(
    [PERMISSIONS.KOSK_HOSTING, PERMISSIONS.PLATFORM_HOSTING_GRANT],
    byExistingKosk
  )
  async grant(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GrantHostingRightDto
  ): Promise<HostingRightResponse> {
    return this.hosting.grant(id, dto.madrasahId, {
      id: request.user.sub,
      role: await this.grantedByRole(request, id),
    });
  }

  /**
   * How the caller was entitled to give the right: the başnazım, the köşk's
   * own nazımı (who holds `kosk.hosting` by role default), or a Medaris nazımı
   * holding `platform.hosting_grant`, who must not be recorded as the köşk's
   * nazımı (review L11).
   */
  private async grantedByRole(
    request: AuthorizedRequest,
    koskId: string
  ): Promise<GrantedByRole> {
    if (this.authz.isSystemAdmin(request.user)) return "SYSTEM_ADMIN";
    return (await this.authz.can(
      request.user,
      { entity: ENTITIES.KOSK, id: koskId },
      PERMISSIONS.KOSK_HOSTING
    ))
      ? "KOSK_NAZIM"
      : "MEDARIS_NAZIM";
  }

  @ApiOperation({
    summary: "Withdraw a medrese's hosting right",
    description:
      "`coursesAction` decides what becomes of the medrese's courses in this köşk: KEEP leaves them as they are, HIDE hides each (they come back from the archive). The medrese can open no new course here. Written to the audit log.",
    operationId: "revokeKoskHostingRight",
  })
  @ApiQuery({
    name: "coursesAction",
    required: true,
    enum: COURSES_ACTIONS,
    enumName: "HostingCoursesAction",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete(":id/hosting-rights/:madrasahId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authz(
    [PERMISSIONS.KOSK_HOSTING, PERMISSIONS.PLATFORM_HOSTING_GRANT],
    byExistingKosk
  )
  async revoke(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("madrasahId", ParseUUIDPipe) madrasahId: string,
    @Query("coursesAction", new ParseEnumPipe(COURSES_ACTIONS))
    coursesAction: CoursesAction
  ): Promise<void> {
    await this.hosting.revoke(id, madrasahId, coursesAction, request.user.sub);
  }
}
