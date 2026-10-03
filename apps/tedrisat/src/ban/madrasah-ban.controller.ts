import { AuthGuard, Authz, AuthzGuard, SCOPES } from "@medaris/common";
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { BAN_SCOPES, type BanScope } from "../database/schema/ban.schema";
import { byExistingMadrasah } from "../madrasah/madrasah.controller";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { BanService } from "./ban.service";
import { presentMadrasahBan, presentMadrasahBanList } from "./ban-present";
import { BAN_STATUSES, type BanStatus } from "./dto/ban.dto";
import {
  CreateMadrasahBanDto,
  MADRASAH_BAN_SCOPES,
  MadrasahBanListResponse,
  MadrasahBanResponse,
} from "./dto/madrasah-ban.dto";

/**
 * A medrese's bans for its nazırs (MDRS-187, nazir/10 and nazir/11). The
 * medrese's başmüderris and SYSTEM_ADMIN reach these: `MANAGE_MADRASAH` is on
 * the matrix row that the başmüderris resolves to, and a medrese's nazır is
 * not yet mapped to it, so a MEDRESE_NAZIR gets 403 here. Lifting, widening
 * and asking for a permanent ban are `BanController`'s routes by ban id, and
 * `BanService` makes their decision from the roles held. Permission grants
 * (`madrasah.ban`) are not read: `AuthzGuard` does not enforce them.
 */
@ApiTags("bans")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("madrasahs")
export class MadrasahBanController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly bans: BanService) {}

  @ApiOperation({
    summary: "A medrese's bans, open or lifted (Yasaklamalar)",
    description:
      "Newest first, with the counts the tabs show: the medrese-wide bans and the bans on the medrese's courses, hidden ones included. A köşk's own ban of the whole köşk is the köşk's list and is not here. `scope` narrows to the medrese-wide or the course bans, `courseId` to one course's. Each row says what the caller's kademe lets them do: `viewerMayLift`, `viewerMayEscalate`, `viewerMayRequestPermanent`.",
    operationId: "listMadrasahBans",
  })
  @ApiQuery({ name: "status", required: false, enum: BAN_STATUSES })
  @ApiQuery({ name: "scope", required: false, enum: MADRASAH_BAN_SCOPES })
  @ApiQuery({ name: "courseId", required: false, type: String, format: "uuid" })
  @ApiOkResponse({ type: MadrasahBanListResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/bans")
  @Authz(SCOPES.MANAGE_MADRASAH, byExistingMadrasah)
  async list(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query(
      "status",
      new DefaultValuePipe("ACTIVE"),
      new ParseEnumPipe(BAN_STATUSES)
    )
    status: BanStatus,
    @Query(
      "scope",
      new ParseEnumPipe(
        [BAN_SCOPES.COURSE, BAN_SCOPES.MADRASAH] as BanScope[],
        { optional: true }
      )
    )
    scope?: BanScope,
    @Query("courseId", new ParseUUIDPipe({ optional: true })) courseId?: string
  ): Promise<MadrasahBanListResponse> {
    return presentMadrasahBanList(
      await this.bans.listForMadrasah(request.user, id, {
        status,
        scope,
        courseId,
      })
    );
  }

  @ApiOperation({
    summary:
      "Bar a talebe from a course of the medrese, or from all of it (Yasakla)",
    description:
      "Takes effect at once: the talebe cannot apply, apply again or leave, and loses the course's content, in the one course or in every course of the medrese. The ban is the medrese's kademe: a köşk nazımı or Medaris administration lifts it, a müderris does not. Barring someone already barred in that scope returns the standing ban. 404 for a course that is not the medrese's. The reason is kept for those who see and lift bans and never sent to the talebe.",
    operationId: "createMadrasahBan",
  })
  @ApiCreatedResponse({ type: MadrasahBanResponse })
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @ApiNotFoundResponse()
  @Post(":id/bans")
  @Authz(SCOPES.MANAGE_MADRASAH, byExistingMadrasah)
  async create(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateMadrasahBanDto
  ): Promise<MadrasahBanResponse> {
    return presentMadrasahBan(
      await this.bans.createInMadrasah(request.user, id, dto)
    );
  }
}
