import { AuthGuard } from "@medaris/common";
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  MyPublicProfileResponse,
  PublicProfileResponse,
  UpdatePublicProfileDto,
} from "./dto/public-profile.dto";
import { AuthenticatedUserRequest } from "./interfaces/authenticated-user-request.interface";
import { PublicProfileEnabledGuard } from "./public-profile-enabled.guard";
import { UserProfileService } from "./user-profile.service";

const PROFILE_HIDDEN =
  "The public profile is hidden for everyone for now (PUBLIC_PROFILE_UNAVAILABLE).";

/**
 * Herkese açık profil (MDRS-166). The caller's own routes act on
 * `request.user.sub` only; the route that reads another person needs a
 * signed-in caller and nothing more, because what it returns is already
 * filtered to what its owner chose to show.
 *
 * Hidden for everyone while `PUBLIC_PROFILE_ENABLED` is off (MDRS-141): every
 * route here answers 404 PUBLIC_PROFILE_UNAVAILABLE before it reads or writes
 * anything.
 */
@ApiTags("me")
@ApiBearerAuth()
@UseGuards(AuthGuard, PublicProfileEnabledGuard)
@Controller()
export class ProfileController {
  constructor(private readonly profile: UserProfileService) {}

  @ApiOperation({
    summary: "The caller's public profile, every field and every switch",
    operationId: "getMyPublicProfile",
  })
  @ApiOkResponse({ type: MyPublicProfileResponse })
  @ApiNotFoundResponse({ description: PROFILE_HIDDEN })
  @Get("me/public-profile")
  async getMine(
    @Req() request: AuthenticatedUserRequest
  ): Promise<MyPublicProfileResponse> {
    return this.profile.getMine(request.user);
  }

  @ApiOperation({
    summary: "Change the caller's public profile",
    description:
      "Only the fields sent change. The künye must be non-empty and unique regardless of case.",
    operationId: "updateMyPublicProfile",
  })
  @ApiOkResponse({ type: MyPublicProfileResponse })
  @ApiConflictResponse({ description: "The künye is taken (KUNYE_TAKEN)." })
  @ApiNotFoundResponse({ description: PROFILE_HIDDEN })
  @Patch("me/public-profile")
  async updateMine(
    @Req() request: AuthenticatedUserRequest,
    @Body() dto: UpdatePublicProfileDto
  ): Promise<MyPublicProfileResponse> {
    return this.profile.updateMine(request.user, dto);
  }

  @ApiOperation({
    summary: "Another person's public profile, filtered to what they show",
    operationId: "getUserPublicProfile",
  })
  @ApiOkResponse({ type: PublicProfileResponse })
  @ApiNotFoundResponse({
    description: `${PROFILE_HIDDEN} Otherwise: the person has not chosen a künye yet (PUBLIC_PROFILE_NOT_FOUND).`,
  })
  @Get("users/:id/public-profile")
  async getPublic(
    @Param("id", new ParseUUIDPipe()) id: string
  ): Promise<PublicProfileResponse> {
    return this.profile.readPublic(id);
  }
}
