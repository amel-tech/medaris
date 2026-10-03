import { AuthGuard } from "@medaris/common";
import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { ChiefNazimResponse } from "./dto/assignment-response.dto";
import { UserDirectoryService } from "./user-directory.service";

@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nizam")
export class NizamController {
  constructor(private readonly directory: UserDirectoryService) {}

  @ApiOperation({
    summary: "The name of the Medaris başnazımı",
    description:
      "Any signed-in caller: the 'no access' screen names who to ask. `displayName` is null when nobody holds the role or the directory cannot be reached.",
    operationId: "getChiefNazim",
  })
  @ApiOkResponse({ type: ChiefNazimResponse })
  @Get("chief-nazim")
  async chiefNazim(): Promise<ChiefNazimResponse> {
    return { displayName: await this.directory.chiefNazimName() };
  }
}
