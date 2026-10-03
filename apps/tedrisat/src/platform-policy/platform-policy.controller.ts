import { AuthGuard } from "@medaris/common";
import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  PLATFORM_POLICY_KEYS,
  type PlatformPolicyKey,
} from "../database/schema/platform-policy.schema";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  PlatformPolicyListResponse,
  ScopedPolicyListResponse,
  SetPlatformPolicyDto,
} from "./platform-policy.dto";
import { PlatformPolicyService } from "./platform-policy.service";

/**
 * Platform settings (MDRS-181, nizam/19). No `AuthzGuard`: the matrix has no
 * entity for a policy, so the service decides, the başnazım or a Medaris
 * nazımı holding "Platform politikalarını değiştir".
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nizam")
export class PlatformPolicyController {
  constructor(private readonly policies: PlatformPolicyService) {}

  @ApiOperation({
    summary: "The platform policies and who applies them on their own",
    operationId: "listPlatformPolicies",
  })
  @ApiOkResponse({ type: PlatformPolicyListResponse })
  @ApiForbiddenResponse()
  @Get("platform-policies")
  list(
    @Req() request: AuthenticatedUserRequest
  ): Promise<PlatformPolicyListResponse> {
    return this.policies.list(request.user);
  }

  @ApiOperation({
    summary: "Switch a platform policy on or off",
    description:
      "In force at once and written to the audit trail as `platform_policy.change`. While 'Kayıt her zaman onaylı' is on every enrolment waits for approval; while 'Ders kayıtları herkese açılamaz' is on no recording is shown to people outside the course; a köşk cannot switch either rule off (409 PLATFORM_POLICY_LOCKED).",
    operationId: "setPlatformPolicy",
  })
  @ApiParam({
    name: "key",
    enum: PLATFORM_POLICY_KEYS,
    enumName: "PlatformPolicyKey",
  })
  @ApiOkResponse({ type: PlatformPolicyListResponse })
  @ApiForbiddenResponse()
  @Put("platform-policies/:key")
  set(
    @Req() request: AuthenticatedUserRequest,
    @Param("key", new ParseEnumPipe(PLATFORM_POLICY_KEYS))
    key: PlatformPolicyKey,
    @Body() dto: SetPlatformPolicyDto
  ): Promise<PlatformPolicyListResponse> {
    return this.policies.set(request.user, key, dto.enabled);
  }

  @ApiOperation({
    summary: "The köşks that apply a policy on their own",
    description:
      "'Köşk ve medrese politikaları' of nizam/19. Medreses have no policy settings of their own yet, so only köşks are listed.",
    operationId: "listScopedPolicies",
  })
  @ApiOkResponse({ type: ScopedPolicyListResponse })
  @ApiForbiddenResponse()
  @Get("scoped-policies")
  scoped(
    @Req() request: AuthenticatedUserRequest
  ): Promise<ScopedPolicyListResponse> {
    return this.policies.scoped(request.user);
  }
}
