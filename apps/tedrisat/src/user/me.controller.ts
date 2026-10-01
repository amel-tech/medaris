import { AuthGuard } from "@medaris/common";
import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { MeResponse } from "./dto/me-response.dto";
import { UpdateMeDto } from "./dto/update-me.dto";
import { AuthenticatedUserRequest } from "./interfaces/authenticated-user-request.interface";
import { UserService } from "./user.service";

/**
 * The caller's own record (MDRS-104). No `AuthzGuard`: every route acts on
 * `request.user.sub` and nothing else, so there is no resource to authorize.
 */
@ApiTags("me")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("me")
export class MeController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({
    summary: "Get the caller's profile and a summary of their roles",
    operationId: "getMe",
  })
  @ApiOkResponse({ type: MeResponse })
  @Get()
  async getMe(@Req() request: AuthenticatedUserRequest): Promise<MeResponse> {
    return this.userService.getMe(request.user);
  }

  @ApiOperation({
    summary: "Set the caller's time zone and locale",
    operationId: "updateMe",
  })
  @ApiOkResponse({ type: MeResponse })
  @Patch()
  async updateMe(
    @Req() request: AuthenticatedUserRequest,
    @Body() dto: UpdateMeDto
  ): Promise<MeResponse> {
    return this.userService.updateMe(request.user, dto);
  }
}
