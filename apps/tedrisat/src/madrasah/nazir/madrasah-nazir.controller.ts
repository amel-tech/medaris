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
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthorizedRequest } from "../../kosk/interfaces/authorized-request.interface";
import { byExistingMadrasah } from "../madrasah.controller";
import {
  DismissMadrasahNazirDto,
  MadrasahNazirGivenResponse,
  MadrasahNazirResponse,
} from "./dto/madrasah-nazir.dto";
import { MadrasahNazirService } from "./madrasah-nazir.service";

/**
 * The medrese's nazırs (nazir/05, nazir/15): the MEDRESE_NAZIR appointments
 * under `/madrasahs/:id/nazirs`. The medrese's başmüderris and SYSTEM_ADMIN
 * manage them, and so does a Medaris nazımı given `platform.madrasah_nazir_grant`;
 * a nazır of the medrese holds `madrasah.nazir_appoint` only if it was given
 * and is a 403 otherwise, like every other guarded route.
 */
@ApiTags("madrasahs")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("madrasahs")
export class MadrasahNazirController {
  constructor(
    private readonly nazirs: MadrasahNazirService,
    private readonly selfGrant: SelfGrantGuard
  ) {}

  @ApiOperation({
    summary: "The medrese's nazırs (its başmüderris)",
    description:
      'nazir/05\'s table, oldest appointment first. Each with who appointed them and when, the groups and single permissions they hold in this medrese, the earliest end among them, and who gave the permissions. A nazır who holds neither has just been appointed ("henüz izin almadı").',
    operationId: "getMadrasahNazirs",
  })
  @ApiOkResponse({ type: MadrasahNazirResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/nazirs")
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  list(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahNazirResponse[]> {
    return this.nazirs.list(id);
  }

  @ApiOperation({
    summary: "Make a user a nazır of the medrese (its başmüderris)",
    description:
      'nazir/05\'s "Medrese nazırı ata": the person is found with `GET /users/lookup`, which writes the search to the audit log. They are appointed with no permissions. Idempotent. Written to the audit log.',
    operationId: "addMadrasahNazir",
  })
  @ApiCreatedResponse({ type: MadrasahNazirResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post(":id/nazirs/:userId")
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  async addNazir(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<MadrasahNazirResponse> {
    // Nobody appoints themselves a nazır, whatever route let them in.
    await this.selfGrant.assertNotSelf(
      request.user,
      [userId],
      { entity: ENTITIES.MADRASAH, id },
      { always: true },
      "madrasah.nazir.appoint"
    );
    return this.nazirs.appoint(id, userId, request.user.sub);
  }

  @ApiOperation({
    summary: "What a nazır has handed on in the medrese (its başmüderris)",
    description:
      "nazir/15's rows, one per person: the roles and permissions this nazır gave them in the medrese or one of its courses that are still held. Empty when they gave no one anything. 404 (MADRASAH_NAZIR_NOT_FOUND) when the user is not a nazır of the medrese.",
    operationId: "getMadrasahNazirGrants",
  })
  @ApiOkResponse({ type: MadrasahNazirGivenResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/nazirs/:userId/grants")
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  grants(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<MadrasahNazirGivenResponse[]> {
    return this.nazirs.given(id, userId);
  }

  @ApiOperation({
    summary: "Dismiss a nazır of the medrese (its başmüderris)",
    description:
      "nazir/15's \"Görevden al\", in one transaction. `decisions` answers every person `…/grants` lists, once and nobody else: TAKE_OVER leaves what the nazır gave them in place under the caller's name, DROP revokes it. The nazır's own appointment and permissions in the medrese are revoked. Written to the audit log.",
    operationId: "removeMadrasahNazir",
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: "DISMISS_DECISIONS_INCOMPLETE" })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete(":id/nazirs/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  async removeNazir(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: DismissMadrasahNazirDto
  ): Promise<void> {
    await this.nazirs.dismiss(id, userId, request.user.sub, dto.decisions);
  }
}
