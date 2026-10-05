import { AuthGuard } from "@medaris/common";
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
  Put,
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
import { AuthenticatedUserRequest } from "../../user/interfaces/authenticated-user-request.interface";
import {
  AppointMedarisNazimDto,
  CreatePermissionGroupDto,
  DeletePermissionGroupDto,
  DismissMedarisNazimDto,
  GivenItemResponse,
  GroupUserResponse,
  MedarisNazimResponse,
  PermissionCatalogResponse,
  PermissionGroupResponse,
  SetNazimGrantsDto,
  UpdatePermissionGroupDto,
} from "./dto/permission-admin.dto";
import { PermissionAdminService } from "./permission-admin.service";

/**
 * Medaris nazımları, the permission catalog and the permission groups
 * (MDRS-171; screens nizam/11, 12 and 13). Like `NizamController` there is no
 * `AuthzGuard`: the engine knows no such entity, and `PermissionAdminService`
 * makes the one decision every route shares — only the SYSTEM_ADMIN realm role
 * passes.
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nizam")
export class PermissionAdminController {
  constructor(private readonly service: PermissionAdminService) {}

  @ApiOperation({
    summary: "The permission catalog (SYSTEM_ADMIN only)",
    description:
      "nizam/12 and 13: the platform's permissions in their five sections and the course permissions a course-scoped group may carry. Codes only; the sentences under them are the web app's.",
    operationId: "getPermissionCatalog",
  })
  @ApiOkResponse({ type: PermissionCatalogResponse })
  @ApiForbiddenResponse()
  @Get("permissions")
  catalog(@Req() request: AuthenticatedUserRequest) {
    return this.service.catalog(request.user);
  }

  // ---- Medaris nazımları -------------------------------------------------

  @ApiOperation({
    summary: "The Medaris nazımları in office (SYSTEM_ADMIN only)",
    description:
      "nizam/11. Held appointments only, in the order they were made; one whose end has passed is not listed. Each carries its groups and single platform permissions.",
    operationId: "getMedarisNazims",
  })
  @ApiOkResponse({ type: MedarisNazimResponse, isArray: true })
  @ApiForbiddenResponse()
  @Get("medaris-nazims")
  list(@Req() request: AuthenticatedUserRequest) {
    return this.service.listNazims(request.user);
  }

  @ApiOperation({
    summary: "Appoint a Medaris nazımı and give them their permissions",
    description:
      "nizam/12. The appointment and the permissions end together at `expiresAt`. Written to the audit log.",
    operationId: "appointMedarisNazim",
  })
  @ApiCreatedResponse({ type: MedarisNazimResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiConflictResponse({ description: "Already a Medaris nazımı" })
  @Post("medaris-nazims")
  appoint(
    @Req() request: AuthenticatedUserRequest,
    @Body() dto: AppointMedarisNazimDto
  ) {
    return this.service.appoint(request.user, dto);
  }

  @ApiOperation({
    summary: "Set a Medaris nazımı's platform permissions",
    description:
      "nizam/12. Replaces the group and the single permissions with the ones sent; what stays keeps its giver and date. The end may not be after the appointment's. Written to the audit log.",
    operationId: "setMedarisNazimGrants",
  })
  @ApiOkResponse({ type: MedarisNazimResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Put("medaris-nazims/:userId/grants")
  setGrants(
    @Req() request: AuthenticatedUserRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SetNazimGrantsDto
  ) {
    return this.service.setGrants(request.user, userId, dto);
  }

  @ApiOperation({
    summary: "What a Medaris nazımı has handed on",
    description:
      "nizam/11's dismissal question: the roles and permissions this person gave that are still held, the ones they gave themselves included (`to` is the person), and the groups they defined or changed. Only the rows given to others take an answer; the self-made ones go with the dismissal.",
    operationId: "getMedarisNazimGiven",
  })
  @ApiOkResponse({ type: GivenItemResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get("medaris-nazims/:userId/given")
  given(
    @Req() request: AuthenticatedUserRequest,
    @Param("userId", ParseUUIDPipe) userId: string
  ) {
    return this.service.given(request.user, userId);
  }

  @ApiOperation({
    summary: "Dismiss a Medaris nazımı",
    description:
      "nizam/11. `decisions` answers every role and grant `…/given` lists as given to someone else: TAKE_OVER leaves the right in place under the başnazım's name, DROP revokes it, and a seat dropped takes with it what its holder was given in its scope. What the person gave themselves is revoked and takes no answer (a TAKE_OVER for it is refused with DISMISS_DECISIONS_INCOMPLETE). The appointment and the platform permissions are revoked. Written to the audit log.",
    operationId: "dismissMedarisNazim",
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete("medaris-nazims/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(
    @Req() request: AuthenticatedUserRequest,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: DismissMedarisNazimDto
  ): Promise<void> {
    await this.service.dismiss(request.user, userId, dto);
  }

  // ---- groups ------------------------------------------------------------

  @ApiOperation({
    summary: "The permission groups (SYSTEM_ADMIN only)",
    description:
      "nizam/13. The platform's groups and the course groups, each with its permissions and how many people hold it.",
    operationId: "getPermissionGroups",
  })
  @ApiOkResponse({ type: PermissionGroupResponse, isArray: true })
  @ApiForbiddenResponse()
  @Get("permission-groups")
  groups(@Req() request: AuthenticatedUserRequest) {
    return this.service.listGroups(request.user);
  }

  @ApiOperation({
    summary: "Create a permission group",
    description:
      "nizam/13. The name is not blank and not used by another live group, whatever its case. Written to the audit log.",
    operationId: "createPermissionGroup",
  })
  @ApiCreatedResponse({ type: PermissionGroupResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiConflictResponse({ description: "The name is taken" })
  @Post("permission-groups")
  createGroup(
    @Req() request: AuthenticatedUserRequest,
    @Body() dto: CreatePermissionGroupDto
  ) {
    return this.service.createGroup(request.user, dto);
  }

  @ApiOperation({
    summary: "Rename a permission group or change its permissions",
    description:
      "nizam/13. Changing the permissions while people hold the group needs `usersPolicy`: they keep what it gave them as single permissions, or lose it; either way they no longer hold the group. Written to the audit log.",
    operationId: "updatePermissionGroup",
  })
  @ApiOkResponse({ type: PermissionGroupResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "The name is taken" })
  @Put("permission-groups/:id")
  updateGroup(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionGroupDto
  ) {
    return this.service.updateGroup(request.user, id, dto);
  }

  @ApiOperation({
    summary: "Delete a permission group",
    description:
      "nizam/13. While people hold the group, `usersPolicy` is required: `keep` turns its permissions into single ones for each of them, `revoke` takes them away. Written to the audit log.",
    operationId: "deletePermissionGroup",
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete("permission-groups/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroup(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DeletePermissionGroupDto
  ): Promise<void> {
    await this.service.deleteGroup(request.user, id, dto.usersPolicy);
  }

  @ApiOperation({
    summary: "The people who hold a permission group",
    operationId: "getPermissionGroupUsers",
  })
  @ApiOkResponse({ type: GroupUserResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get("permission-groups/:id/users")
  groupUsers(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.service.groupUsers(request.user, id);
  }
}
