import { AuthGuard } from "@medaris/common";
import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { AssignmentService } from "./assignment.service";
import {
  MyAssignmentsResponse,
  MyEffectivePermissionsResponse,
  MyGrantsResponse,
  MyPermissionsResponse,
  MyRolesResponse,
} from "./dto/assignment-response.dto";

/**
 * What the caller holds and may do (MDRS-169). Like `MeController`, no
 * `AuthzGuard`: every route reads `request.user.sub`'s own rows and nothing
 * else, so there is no resource to authorize.
 */
@ApiTags("me")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("me")
export class MeAssignmentsController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly assignments: AssignmentService) {}

  @ApiOperation({
    summary: "The roles the caller holds, each with its scope",
    description:
      "Held roles only: revoked and expired rows are left out. A course carries its status, köşk, medrese and enrolled count.",
    operationId: "getMyAssignments",
  })
  @ApiOkResponse({ type: MyAssignmentsResponse })
  @Get("assignments")
  assignmentsOf(
    @Req() request: AuthenticatedUserRequest
  ): Promise<MyAssignmentsResponse> {
    return this.assignments.myAssignments(request.user);
  }

  @ApiOperation({
    summary: "Which roles the caller holds, and in how many scopes",
    operationId: "getMyRoles",
  })
  @ApiOkResponse({ type: MyRolesResponse })
  @Get("roles")
  roles(@Req() request: AuthenticatedUserRequest): Promise<MyRolesResponse> {
    return this.assignments.myRoles(request.user);
  }

  @ApiOperation({
    summary: "The permissions and permission groups given to the caller",
    operationId: "getMyGrants",
  })
  @ApiOkResponse({ type: MyGrantsResponse })
  @Get("grants")
  grants(@Req() request: AuthenticatedUserRequest): Promise<MyGrantsResponse> {
    return this.assignments.myGrants(request.user);
  }

  @ApiOperation({
    summary: "Every permission code the caller holds in any scope",
    operationId: "getMyPermissions",
  })
  @ApiOkResponse({ type: MyPermissionsResponse })
  @Get("permissions")
  permissions(
    @Req() request: AuthenticatedUserRequest
  ): Promise<MyPermissionsResponse> {
    return this.assignments.myPermissions(request.user);
  }

  @ApiOperation({
    summary: "The caller's permissions by role and scope",
    description:
      "Role defaults plus grants, grouped by role: the courses a müderris teaches are one group. Scopes where only a grant is held form a group with a null role.",
    operationId: "getMyEffectivePermissions",
  })
  @ApiOkResponse({ type: MyEffectivePermissionsResponse })
  @Get("effective-permissions")
  effectivePermissions(
    @Req() request: AuthenticatedUserRequest
  ): Promise<MyEffectivePermissionsResponse> {
    return this.assignments.myEffectivePermissions(request.user);
  }
}
