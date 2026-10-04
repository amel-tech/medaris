import {
  AuthGuard,
  Authz,
  AuthzGuard,
  AuthzService,
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
import { SCOPE_TYPES } from "../../database/schema/role-assignment.schema";
import { AuthorizedRequest } from "../../kosk/interfaces/authorized-request.interface";
import { byExistingMadrasah } from "../madrasah.controller";
import {
  DismissMadrasahNazirDto,
  MadrasahNazirGivenResponse,
  MadrasahNazirResponse,
} from "./dto/madrasah-nazir.dto";
import { madrasahAuthorityOf } from "./madrasah-authority";
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
    private readonly selfGrant: SelfGrantGuard,
    private readonly authz: AuthzService
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
    // The level the caller acts at, for the audit row and the başnazım's list,
    // the same one the permission routes record: a nazır given the permission
    // appoints as the medrese.
    const authority =
      (await madrasahAuthorityOf(this.authz, request.user, id)) ??
      SCOPE_TYPES.MADRASAH;
    return this.nazirs.appoint(id, userId, request.user.sub, authority);
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
      "nazir/15's \"Görevden al\", in one transaction. `decisions` answers every person `…/grants` lists, once and nobody else: TAKE_OVER leaves what the nazır gave them in place under the caller's name, DROP revokes it, and a seat dropped takes with it what its holder was given in its scope. The nazır's own appointment and permissions in the medrese are revoked. The başmüderris and the platform dismiss any nazır; a nazır holding `madrasah.nazir_appoint` only one they appointed (403 NAZIR_NOT_APPOINTED_BY_YOU otherwise). Written to the audit log.",
    operationId: "removeMadrasahNazir",
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: "DISMISS_DECISIONS_INCOMPLETE" })
  @ApiForbiddenResponse({
    description: "Not allowed, or NAZIR_NOT_APPOINTED_BY_YOU",
  })
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
    // The başmüderris and the platform dismiss any nazır of the medrese; a
    // nazır let in by a grant of `madrasah.nazir_appoint` only the ones they
    // seated (owner, d-1004-28 "kendi atadıklarını").
    const manages =
      (await madrasahAuthorityOf(this.authz, request.user, id)) !== null;
    // Taking over what the nazır gave oneself makes it a row one gave oneself
    // (owner, d-1004: no self-grant on any path).
    await this.selfGrant.assertNotSelf(
      request.user,
      dto.decisions.flatMap((d) =>
        d.action === "TAKE_OVER" ? [d.userId] : []
      ),
      { entity: ENTITIES.MADRASAH, id },
      { always: true },
      "madrasah.nazir.dismiss.take_over"
    );
    await this.nazirs.dismiss(id, userId, request.user.sub, dto.decisions, {
      appointedBy: manages ? undefined : request.user.sub,
    });
  }
}
