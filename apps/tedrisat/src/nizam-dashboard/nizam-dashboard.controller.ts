import { AuthGuard } from "@medaris/common";
import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { NizamDashboardResponse } from "./dto/nizam-dashboard.dto";
import { NizamDashboardService } from "./nizam-dashboard.service";

/**
 * The Medaris home page (MDRS-182, nizam/01 and 05). No `AuthzGuard`: the
 * catalogue has no entity for the platform, and `NizamDashboardService` decides
 * (the başnazım, or a Medaris nazımı: the page asks for the role, no code opens
 * it, and what it shows is cut to the platform permissions the viewer holds).
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nizam/dashboard")
export class NizamDashboardController {
  constructor(private readonly dashboard: NizamDashboardService) {}

  @ApiOperation({
    summary: "The Medaris başnazımı's and Medaris nazımı's home page",
    description:
      "One read for the whole page: the greeting's name, what waits for a decision, the platform numbers and the newest rows of each queue. A Medaris nazımı gets the same page cut down to what their permissions open: a count or a list they may not see is null. Anyone else is refused.",
    operationId: "getNizamDashboard",
  })
  @ApiOkResponse({ type: NizamDashboardResponse })
  @ApiForbiddenResponse()
  @Get()
  get(
    @Req() request: AuthenticatedUserRequest
  ): Promise<NizamDashboardResponse> {
    return this.dashboard.get(request.user);
  }
}
