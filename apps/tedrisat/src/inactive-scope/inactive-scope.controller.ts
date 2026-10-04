import { AuthGuard } from "@medaris/common";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  AssignInactiveScopeDto,
  InactiveScopeResponse,
} from "./inactive-scope.dto";
import {
  INACTIVE_SCOPE_TYPES,
  type InactiveScopeType,
} from "./inactive-scope.rules";
import { InactiveScopeService } from "./inactive-scope.service";

/**
 * Pasif kapsamlar (MDRS-172, nizam/14). Like `NizamController` there is no
 * `AuthzGuard`: the engine knows no such entity, and the service decides — the
 * başnazım, or a Medaris nazımı holding "Pasif kapsamları yönet".
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nizam/inactive-scopes")
export class InactiveScopeController {
  constructor(private readonly service: InactiveScopeService) {}

  @ApiOperation({
    summary: "Köşks, medreses and courses with no manager",
    description:
      "nizam/14. Only scopes that once had a manager and have none now, oldest first; hidden ones are left out. `reason` says whether the last term ran out or somebody took it away.",
    operationId: "getInactiveScopes",
  })
  @ApiQuery({
    name: "type",
    required: false,
    enum: INACTIVE_SCOPE_TYPES,
    enumName: "InactiveScopeType",
  })
  @ApiOkResponse({ type: InactiveScopeResponse, isArray: true })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @Get()
  list(
    @Req() request: AuthenticatedUserRequest,
    @Query("type", new ParseEnumPipe(INACTIVE_SCOPE_TYPES, { optional: true }))
    type: InactiveScopeType | undefined
  ): Promise<InactiveScopeResponse[]> {
    return this.service.list(request.user, type);
  }

  @ApiOperation({
    summary: "Give a passive scope its manager",
    description:
      "nizam/14 'Başmüderris ata' / 'Köşk nazımı ata' / 'Müderris ata'. The scope is active again. 404 (INACTIVE_SCOPE_NOT_FOUND) when it has a manager already, is hidden or does not exist. Written to the audit log.",
    operationId: "assignInactiveScope",
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post(":type/:id/assign")
  @HttpCode(HttpStatus.NO_CONTENT)
  async assign(
    @Req() request: AuthenticatedUserRequest,
    @Param("type", new ParseEnumPipe(INACTIVE_SCOPE_TYPES))
    type: InactiveScopeType,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignInactiveScopeDto
  ): Promise<void> {
    await this.service.assign(request.user, type, id, dto);
  }

  @ApiOperation({
    summary: "Record that a passive scope's content was opened",
    description:
      "nizam/14 'İçeriği gör'. Writes one audit row (`inactive_scope.view`) per call; the content itself is the web app's page.",
    operationId: "viewInactiveScope",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post(":type/:id/view")
  @HttpCode(HttpStatus.NO_CONTENT)
  async view(
    @Req() request: AuthenticatedUserRequest,
    @Param("type", new ParseEnumPipe(INACTIVE_SCOPE_TYPES))
    type: InactiveScopeType,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.service.view(request.user, type, id);
  }
}
