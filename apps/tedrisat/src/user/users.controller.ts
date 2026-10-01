import { AuthGuard } from "@medaris/common";
import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { FindUserByEmailQuery } from "./dto/find-user-by-email.query";
import { UserSummaryResponse } from "./dto/user-summary-response.dto";
import { AuthenticatedUserRequest } from "./interfaces/authenticated-user-request.interface";
import { UserService } from "./user.service";

/**
 * Finding a person to assign (MDRS-104). The permission is "is the caller a
 * platform admin or a köşk manager at all", which is not a role on one
 * resource and so does not fit the `@Authz` matrix; `UserService` checks it.
 */
@ApiTags("users")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({
    summary: "Find a user by exact e-mail address",
    description:
      "Returns zero or one user. Callable by SYSTEM_ADMIN and köşk managers.",
    operationId: "findUserByEmail",
  })
  @ApiOkResponse({ type: [UserSummaryResponse] })
  @ApiForbiddenResponse()
  @Get()
  async findByEmail(
    @Req() request: AuthenticatedUserRequest,
    @Query() query: FindUserByEmailQuery
  ): Promise<UserSummaryResponse[]> {
    return this.userService.findByEmail(request.user, query.email);
  }
}
