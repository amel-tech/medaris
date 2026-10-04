import { AuthGuard, Authz, AuthzGuard, PERMISSIONS } from "@medaris/common";
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
import { DeletePermissionGroupDto } from "../../assignment/admin/dto/permission-admin.dto";
import { AuthenticatedUserRequest } from "../../user/interfaces/authenticated-user-request.interface";
import { byExistingMadrasah } from "../madrasah.controller";
import { MadrasahNazirResponse } from "./dto/madrasah-nazir.dto";
import {
  CreateMadrasahPermissionGroupDto,
  MadrasahNazirPermissionsResponse,
  MadrasahPermissionCatalogResponse,
  MadrasahPermissionGroupResponse,
  SetMadrasahNazirPermissionsDto,
  UpdateMadrasahPermissionGroupDto,
} from "./dto/madrasah-permission.dto";
import { MadrasahPermissionService } from "./madrasah-permission.service";

/**
 * What a medrese's nazırs are given (MDRS-185; nazir/06 and nazir/16): the
 * permission dictionary, the medrese's permission groups and one nazır's
 * permissions. `madrasah.nazir_appoint` (or the Medaris nazımı's
 * `platform.madrasah_nazir_grant`) is the medrese's başmüderris's and
 * SYSTEM_ADMIN's, the same people who see the roster; giving is checked again
 * in the service. A grant is read like any other permission: it is what a
 * nazır holds in the medrese, and nothing beyond it.
 */
@ApiTags("madrasahs")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("madrasahs")
export class MadrasahPermissionController {
  constructor(private readonly permissions: MadrasahPermissionService) {}

  @ApiOperation({
    summary: "The permission dictionary of a medrese (its başmüderris)",
    description:
      "nazir/06 and nazir/16's checkboxes: the medrese's own permissions and the course permissions, codes only (the sentences are the web app's), and which of them the caller may give.",
    operationId: "getMadrasahPermissions",
  })
  @ApiOkResponse({ type: MadrasahPermissionCatalogResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/permissions")
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  catalog(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahPermissionCatalogResponse> {
    return this.permissions.catalog(request.user, id);
  }

  @ApiOperation({
    summary: "The medrese's permission groups (its başmüderris)",
    description:
      "nazir/05's group cards and nazir/06's \"Hazır izin grubu\" list, oldest first: each with its permissions and how many people hold it. Only this medrese's own groups.",
    operationId: "getMadrasahPermissionGroups",
  })
  @ApiOkResponse({ type: MadrasahPermissionGroupResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/permission-groups")
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  groups(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahPermissionGroupResponse[]> {
    return this.permissions.listGroups(id);
  }

  @ApiOperation({
    summary: "Define a permission group of the medrese (its başmüderris)",
    description:
      "nazir/16. The name is not blank and not used by another live group of this medrese, whatever its case; at least one permission, all from the scope's section of the dictionary. Written to the audit log.",
    operationId: "createMadrasahPermissionGroup",
  })
  @ApiCreatedResponse({ type: MadrasahPermissionGroupResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "PERMISSION_GROUP_NAME_TAKEN" })
  @Post(":id/permission-groups")
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  createGroup(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateMadrasahPermissionGroupDto
  ): Promise<MadrasahPermissionGroupResponse> {
    return this.permissions.createGroup(request.user, id, dto);
  }

  @ApiOperation({
    summary: "Rename a permission group or change its permissions",
    description:
      "nazir/16. Only what is sent changes. Changing the permissions while people hold the group needs `usersPolicy` (USERS_POLICY_REQUIRED otherwise): they keep what it gave them as single permissions, or lose it; either way they no longer hold the group. Written to the audit log.",
    operationId: "updateMadrasahPermissionGroup",
  })
  @ApiOkResponse({ type: MadrasahPermissionGroupResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "PERMISSION_GROUP_NAME_TAKEN" })
  @Patch(":id/permission-groups/:groupId")
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  updateGroup(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateMadrasahPermissionGroupDto
  ): Promise<MadrasahPermissionGroupResponse> {
    return this.permissions.updateGroup(request.user, id, groupId, dto);
  }

  @ApiOperation({
    summary: "Delete a permission group of the medrese",
    description:
      "nazir/16. While people hold the group, `usersPolicy` is required (USERS_POLICY_REQUIRED otherwise): `keep` turns its permissions into single ones for each of them, `revoke` takes them away. Written to the audit log.",
    operationId: "deleteMadrasahPermissionGroup",
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete(":id/permission-groups/:groupId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  async deleteGroup(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    // A DELETE may carry no body at all: a group nobody holds needs no answer.
    @Body() dto?: DeletePermissionGroupDto
  ): Promise<void> {
    await this.permissions.deleteGroup(
      request.user,
      id,
      groupId,
      dto?.usersPolicy
    );
  }

  @ApiOperation({
    summary: "What a nazır was given, as nazir/06 opens it (its başmüderris)",
    description:
      "The state `PUT` writes: the group, the single permissions on top of it, the courses they are limited to (null: every course) and the earliest end. 404 (MADRASAH_NAZIR_NOT_FOUND) when the user is not a nazır of the medrese.",
    operationId: "getMadrasahNazirPermissions",
  })
  @ApiOkResponse({ type: MadrasahNazirPermissionsResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/nazirs/:userId/permissions")
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  nazirPermissions(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<MadrasahNazirPermissionsResponse> {
    return this.permissions.getNazirPermissions(id, userId);
  }

  @ApiOperation({
    summary: "Give a nazır their permissions (its başmüderris)",
    description:
      "nazir/06's Kaydet. Replaces what the nazır held in the medrese and its courses with the group, the single permissions and the courses sent; what stays keeps its giver and date. Answers the nazır's row of the roster. Only the medrese's başmüderris and the başnazım give (PERMISSION_NOT_GIVABLE otherwise); the nazır cannot hand on what they were given. Written to the audit log. Permissions are records: nothing the API decides reads them yet.",
    operationId: "setMadrasahNazirPermissions",
  })
  @ApiOkResponse({ type: MadrasahNazirResponse })
  @ApiBadRequestResponse({
    description:
      "PERMISSION_UNKNOWN, NAZIR_COURSE_SCOPE_INVALID or GRANT_EXPIRY_INVALID",
  })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Put(":id/nazirs/:userId/permissions")
  @Authz(
    [
      PERMISSIONS.MADRASAH_NAZIR_APPOINT,
      PERMISSIONS.PLATFORM_MADRASAH_NAZIR_GRANT,
    ],
    byExistingMadrasah
  )
  setNazirPermissions(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SetMadrasahNazirPermissionsDto
  ): Promise<MadrasahNazirResponse> {
    return this.permissions.setNazirPermissions(request.user, id, userId, dto);
  }
}
