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
  Patch,
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
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  CreateKoskGrantDto,
  KoskGrantsResponse,
  UpdateKoskGrantDto,
} from "./dto/kosk-grants.dto";
import { byExistingKosk } from "./kosk.controller";
import { KoskGrantsService } from "./kosk-grants.service";

/**
 * The köşk's İzinler page (MDRS-172, nizam/38): ders nazırları of its
 * medrese-free courses and the course permissions they hold. `@Authz(course_nazir.assign_kosk)`
 * lets a nazım of the köşk and the başnazım in; the service limits what they
 * may give to what they hold themselves.
 */
@ApiTags("kosks")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("kosks")
export class KoskGrantsController {
  constructor(
    private readonly service: KoskGrantsService,
    private readonly selfGrant: SelfGrantGuard
  ) {}

  @ApiOperation({
    summary: "The köşk's ders nazırları and what they may do",
    description:
      "nizam/38. The posts held in the köşk's medrese-free courses with their permission codes, end, giver and date; the courses of the köşk; and the codes the caller may hand out.",
    operationId: "getKoskGrants",
  })
  @ApiOkResponse({ type: KoskGrantsResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/grants")
  @Authz(PERMISSIONS.COURSE_NAZIR_ASSIGN_KOSK, byExistingKosk)
  list(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskGrantsResponse> {
    return this.service.list(request.user, id);
  }

  @ApiOperation({
    summary: "Make someone a ders nazırı and give them permissions",
    description:
      "nizam/38 'Ders nazırı ata'. The post and the permissions end together at `endsAt`. 403 (GRANT_EXCEEDS_GIVER) for a permission the caller does not hold, 400 for a code outside the course catalog, a course that is not the köşk's or belongs to a medrese, or an end in the past; 409 (COURSE_NAZIR_EXISTS) when the person is one already. Written to the audit log. Answers the page as it is now.",
    operationId: "createKoskGrant",
  })
  @ApiCreatedResponse({ type: KoskGrantsResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "COURSE_NAZIR_EXISTS" })
  @Post(":id/grants")
  @Authz(PERMISSIONS.COURSE_NAZIR_ASSIGN_KOSK, byExistingKosk)
  async create(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateKoskGrantDto
  ): Promise<KoskGrantsResponse> {
    // A köşk nazımı already holds every course permission in the köşk; a post
    // they seat themselves in would only outlive their own dismissal.
    await this.selfGrant.assertNotSelf(
      request.user,
      [dto.userId],
      { entity: ENTITIES.KOSK, id },
      { always: true },
      "kosk.grants.create"
    );
    return this.service.create(request.user, id, dto);
  }

  @ApiOperation({
    summary: "Change a ders nazırı's permissions and end",
    description:
      "nizam/38 'İzinleri düzenle'. Replaces the whole set; what stays keeps its giver and date. The post ends when the permissions do. Written to the audit log. 403 (SELF_GRANT_REFUSED) for the caller's own post, SYSTEM_ADMIN excepted.",
    operationId: "updateKoskGrant",
  })
  @ApiOkResponse({ type: KoskGrantsResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Patch(":id/grants/:grantId")
  @Authz(PERMISSIONS.COURSE_NAZIR_ASSIGN_KOSK, byExistingKosk)
  async update(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("grantId", ParseUUIDPipe) grantId: string,
    @Body() dto: UpdateKoskGrantDto
  ): Promise<KoskGrantsResponse> {
    // Rewriting one's own post is seating oneself again: its codes and its end
    // would outlive the köşk seat, as a post made for oneself would. An
    // unknown post is the service's 404.
    const holder = await this.service.holderOf(id, grantId);
    if (holder) {
      await this.selfGrant.assertNotSelf(
        request.user,
        [holder],
        { entity: ENTITIES.KOSK, id },
        { always: true },
        "kosk.grants.update"
      );
    }
    return this.service.update(request.user, id, grantId, dto);
  }

  @ApiOperation({
    summary: "Take a ders nazırı's post and permissions away",
    description:
      "nizam/38 'Görevden al'. The post and every permission the person holds in the course end at once. 409 DISMISS_SEAT_HANDED_ON while someone the person appointed from the course still holds their post. Written to the audit log.",
    operationId: "revokeKoskGrant",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "DISMISS_SEAT_HANDED_ON" })
  @Delete(":id/grants/:grantId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authz(PERMISSIONS.COURSE_NAZIR_ASSIGN_KOSK, byExistingKosk)
  async revoke(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("grantId", ParseUUIDPipe) grantId: string
  ): Promise<void> {
    await this.service.revoke(request.user, id, grantId);
  }
}
