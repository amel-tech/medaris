import { AuthGuard } from "@medaris/common";
import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { CreateKoskApplicationDto } from "./dto/create-kosk-application.dto";
import { KoskApplicationResponse } from "./dto/kosk-application-response.dto";
import { KoskApplicationService } from "./kosk-application.service";

/** Köşk açma başvurusu (MDRS-166). Any signed-in caller may apply: there is no resource to authorize. */
@ApiTags("kosk-applications")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("kosk-applications")
export class KoskApplicationController {
  constructor(private readonly applications: KoskApplicationService) {}

  @ApiOperation({
    summary: "Apply to open a köşk",
    description: "The application waits as PENDING for Medaris management.",
    operationId: "createKoskApplication",
  })
  @ApiCreatedResponse({ type: KoskApplicationResponse })
  @Post()
  async create(
    @Req() request: AuthenticatedUserRequest,
    @Body() dto: CreateKoskApplicationDto
  ): Promise<KoskApplicationResponse> {
    return this.applications.create(request.user.sub, dto);
  }
}
