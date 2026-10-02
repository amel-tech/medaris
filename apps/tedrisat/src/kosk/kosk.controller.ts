import {
  AuthGuard,
  Authz,
  AuthzGuard,
  type AuthzResolve,
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
  ApiForbiddenResponse,
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
import { KoskNotFoundError } from "./errors/kosk-not-found.error";
import { AuthorizedRequest } from "./interfaces/authorized-request.interface";
import { KoskService } from "./kosk.service";

const MAX_PAGE_SIZE = 50;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/kosks/:id` route against that köşk, answering a missing or
 * malformed id as not-found first. Guards run before pipes, and the role
 * resolver reads a missing köşk as PUBLIC, so without this a PATCH to a köşk
 * that does not exist would be a 403 instead of the 404 it was before the
 * route moved to `@Authz`.
 */
const byExistingKosk: AuthzResolve = async (req, moduleRef) => {
  const koskId = typeof req.params.id === "string" ? req.params.id : "";
  if (
    !UUID_REGEX.test(koskId) ||
    !(await moduleRef.get(KoskService, { strict: false }).exists(koskId))
  ) {
    throw new KoskNotFoundError(koskId);
  }
  return { entity: ENTITIES.KOSK, id: koskId };
};

@ApiTags("kosks")
@ApiBearerAuth()
@UseGuards(AuthGuard)
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
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Patch(":id")
  // Method-level, not class-level: most handlers here still check ownership
  // in `KoskService` and have not moved to `@Authz`. This one and
  // `leaveMadrasah` have, so that a nazır of the köşk's medrese gets `EDIT`
  // from the matrix (MDRS-106).
  @UseGuards(AuthzGuard)
  @Authz(SCOPES.EDIT, byExistingKosk)
  async update(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() koskDto: UpdateKoskDto
  ): Promise<KoskResponse> {
    await this.koskService.update(id, koskDto);
    return this.koskService.findById(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Detach a köşk from its medrese",
    description:
      "The köşk's own way out of a medrese: its manager (or a nazır of that medrese) makes it standalone again.",
    operationId: "leaveMadrasah",
  })
  @ApiOkResponse({ type: KoskResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete(":id/madrasah")
  @UseGuards(AuthzGuard)
  @Authz(SCOPES.EDIT, byExistingKosk)
  async leaveMadrasah(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskResponse> {
    await this.koskService.leaveMadrasah(id);
    return this.koskService.findById(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Delete a köşk for real (SYSTEM_ADMIN only)",
    description:
      "Removes the köşk, its followers, and every course with its weeks, lessons, müderris, resources and enrollments, in one transaction, and records an audit entry. Köşk managers cannot delete (MDRS-124).",
    operationId: "deleteKosk",
  })
  @ApiOkResponse({ type: Boolean })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete(":id")
  @UseGuards(AuthzGuard)
  @Authz(SCOPES.DELETE, byExistingKosk)
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
  @Delete(":id/follow")
  async unfollow(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<boolean> {
    return this.koskService.unfollow(request.user.sub, id);
  }
}
