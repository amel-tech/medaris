import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  byParam,
  ENTITIES,
  SCOPES,
} from "@medaris/common";
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { CreateKoskDto } from "./dto/create-kosk.dto";
import { KoskResponse } from "./dto/kosk-response.dto";
import { PaginatedKoskResponse } from "./dto/paginated-kosk-response.dto";
import { UpdateKoskDto } from "./dto/update-kosk.dto";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";
import { KoskService } from "./kosk.service";

const MAX_PAGE_SIZE = 50;

@ApiTags("kosks")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("kosks")
export class KoskController {
  constructor(private readonly koskService: KoskService) {}

  @ApiOperation({
    summary: "Get a paginated list of köşks",
    operationId: "getAllKosks",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: PaginatedKoskResponse })
  // Exempt: a paginated list has no single resource to authorize. Note what
  // this does NOT do — `kosks.is_private` is still not applied to the listing,
  // and the matrix cannot apply it either, because the KOSK PUBLIC row grants
  // `VIEW` unconditionally. Enforcing that column is its own change; the
  // MDRS-43 brief supersedes it and this task does not smuggle it in.
  @AuthzExempt()
  @Get()
  async findAll(
    @Req() request: AuthorizedRequest,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(12), ParseIntPipe) limit: number
  ): Promise<PaginatedKoskResponse> {
    const safePage = page < 1 ? 1 : page;
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    return this.koskService.findAll(request.user.sub, safePage, safeLimit);
  }

  @ApiOperation({
    summary: "Get a köşk by ID",
    operationId: "getKoskById",
  })
  @ApiOkResponse({ type: KoskResponse })
  @ApiNotFoundResponse()
  @Authz(SCOPES.VIEW, byParam(ENTITIES.KOSK))
  @Get(":id")
  async findById(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskResponse> {
    return this.koskService.findById(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Create a new köşk",
    operationId: "createKosk",
  })
  @ApiCreatedResponse({ type: KoskResponse })
  // TODO(MDRS-43 · open decision): exempt as a PLACEHOLDER, not as a verdict.
  //
  // `CREATE_KOSK` is deliberately on NO kosk matrix row — `auth-matrix.ts`
  // says so above the PUBLIC row, and `TedrisatRoleResolver.resolveKoskRole`
  // repeats the warning — because köşk creation is meant to be SYSTEM_ADMIN
  // only, through the realm bypass. So `@Authz(CREATE_KOSK, forNew(KOSK))`
  // here would 403 every ordinary caller, and today ordinary callers open
  // köşks. The two ways out are opposite decisions: apply the matrix and lose
  // self-service köşks, or keep self-service and leave this route exempt with
  // that written down. Neither is a mapping question, so neither is made here.
  @AuthzExempt()
  @Post()
  async create(
    @Req() request: AuthorizedRequest,
    @Body() koskDto: CreateKoskDto
  ): Promise<KoskResponse> {
    const ownerId = request.user.sub;
    const created = await this.koskService.create({ ownerId, ...koskDto });
    return this.koskService.findById(created.id, ownerId);
  }

  @ApiOperation({
    summary: "Update a köşk",
    operationId: "updateKosk",
  })
  @ApiOkResponse({ type: KoskResponse })
  @ApiNotFoundResponse()
  @Authz(SCOPES.EDIT, byParam(ENTITIES.KOSK))
  @Patch(":id")
  async update(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() koskDto: UpdateKoskDto
  ): Promise<KoskResponse> {
    await this.koskService.update(id, request.user.sub, koskDto);
    return this.koskService.findById(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Delete a köşk",
    operationId: "deleteKosk",
  })
  @ApiOkResponse({ type: Boolean })
  @ApiNotFoundResponse()
  @Authz(SCOPES.DELETE, byParam(ENTITIES.KOSK))
  @Delete(":id")
  async delete(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<boolean> {
    return this.koskService.delete(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Follow a köşk as the current talebe",
    operationId: "followKosk",
  })
  @ApiCreatedResponse({ type: Boolean })
  @ApiNotFoundResponse()
  // Following is a read affordance: you may subscribe to a köşk you may see.
  @Authz(SCOPES.VIEW, byParam(ENTITIES.KOSK))
  @Post(":id/follow")
  async follow(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<boolean> {
    return this.koskService.follow(request.user.sub, id);
  }

  @ApiOperation({
    summary: "Unfollow a köşk",
    operationId: "unfollowKosk",
  })
  @ApiOkResponse({ type: Boolean })
  // Exempt, unlike `follow`: this deletes the caller's own `kosk_followers`
  // row, and leaving must not depend on still being allowed in. Same reasoning
  // as `FlashcardDeckController.removeFromUserCollection`.
  @AuthzExempt()
  @Delete(":id/follow")
  async unfollow(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<boolean> {
    return this.koskService.unfollow(request.user.sub, id);
  }
}
