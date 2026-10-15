import { AuthGuard } from "@medaris/common";
import {
  Body,
  Controller,
  Get,
  Param,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  CreatePartnerDto,
  PartnerAdminListResponse,
  PartnerAdminResponse,
  PartnerClientParams,
  SetPartnerKosksDto,
  UpdatePartnerDto,
} from "./dto/partner-admin.dto";
import { PartnerAdminService } from "./partner-admin.service";

/**
 * "Ortak uygulamalar" (nizam): the partner registry, kept by the başnazım.
 * No `AuthzGuard`, as on the platform settings: there is no entity to decide
 * on, so the service does, `platform.partner_manage` (the başnazım by bypass,
 * a Medaris nazımı only when granted it). Every write is in the audit log.
 */
@ApiTags("nizam")
@ApiBearerAuth()
@ApiForbiddenResponse({
  description:
    "Neither the başnazım nor a Medaris nazımı holding platform.partner_manage.",
})
@UseGuards(AuthGuard)
@Controller("nizam/partner-applications")
export class PartnerAdminController {
  constructor(private readonly partners: PartnerAdminService) {}

  @ApiOperation({
    summary: "The partner applications, with their köşks",
    description:
      "Every registered partner, enabled or not, with the köşks it works with, and every köşk to pick from.",
    operationId: "listPartnerApplications",
  })
  @ApiOkResponse({ type: PartnerAdminListResponse })
  @Get()
  list(
    @Req() request: AuthenticatedUserRequest
  ): Promise<PartnerAdminListResponse> {
    return this.partners.list(request.user);
  }

  @ApiOperation({
    summary: "Register a partner application",
    description:
      "Enabled, and bound to no köşk until köşks are chosen. Its token is accepted on `/integrations/*` from then on, and refused on every other route. Written to the audit log as `integration_partner.create`.",
    operationId: "createPartnerApplication",
  })
  @ApiCreatedResponse({ type: PartnerAdminResponse })
  @ApiBadRequestResponse({
    description:
      "A client id that is not letters, digits, `.`, `_` and `-`, or a blank name or one longer than 100 (VALIDATION_ERROR).",
  })
  @ApiConflictResponse({
    description:
      "The client id is registered already (PARTNER_EXISTS), or is one of the front-ends in KEYCLOAK_ALLOWED_CLIENTS (PARTNER_FRONT_END_CLIENT).",
  })
  @Post()
  create(
    @Req() request: AuthenticatedUserRequest,
    @Body() dto: CreatePartnerDto
  ): Promise<PartnerAdminResponse> {
    return this.partners.create(request.user, dto);
  }

  @ApiOperation({
    summary: "Rename, disable or enable a partner application",
    description:
      "A disabled partner's token is refused on `/integrations/*` with 403 PARTNER_DISABLED, and stays refused everywhere else; its codes are offered in no course. Written to the audit log as `integration_partner.rename`, `.disable` or `.enable`.",
    operationId: "updatePartnerApplication",
  })
  @ApiOkResponse({ type: PartnerAdminResponse })
  @ApiBadRequestResponse({ description: "A blank or too long name." })
  @ApiNotFoundResponse({ description: "No such partner (PARTNER_UNKNOWN)." })
  @Patch(":clientId")
  update(
    @Req() request: AuthenticatedUserRequest,
    @Param() params: PartnerClientParams,
    @Body() dto: UpdatePartnerDto
  ): Promise<PartnerAdminResponse> {
    return this.partners.update(request.user, params.clientId, dto);
  }

  @ApiOperation({
    summary: "Choose the köşks a partner application works with",
    description:
      "The köşks named are bound, the others unbound. Unbinding a köşk takes the partner's codes off that köşk's courses (each written to the audit log as `course.partner_code_remove`), and binding it again brings none back; what its registrations did stays, and their cancellations still reach the seats they made. Written to the audit log under each köşk as `integration_partner.kosk_bind` or `.kosk_unbind`.",
    operationId: "setPartnerApplicationKosks",
  })
  @ApiOkResponse({ type: PartnerAdminResponse })
  @ApiNotFoundResponse({
    description: "No such partner (PARTNER_UNKNOWN), or köşk (KOSK_NOT_FOUND).",
  })
  @Put(":clientId/kosks")
  setKosks(
    @Req() request: AuthenticatedUserRequest,
    @Param() params: PartnerClientParams,
    @Body() dto: SetPartnerKosksDto
  ): Promise<PartnerAdminResponse> {
    return this.partners.setKosks(request.user, params.clientId, dto.koskIds);
  }
}
