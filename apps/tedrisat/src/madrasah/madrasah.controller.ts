import {
  AuthGuard,
  Authz,
  AuthzGuard,
  AuthzPublic,
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
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { PublicRequest } from "../course/interfaces/authorized-request.interface";
import { AuthorizedRequest } from "../kosk/interfaces/authorized-request.interface";
import { maskMadrasahForAnonymous } from "./anonymous-mask";
import { CreateMadrasahDto } from "./dto/create-madrasah.dto";
import {
  MADRASAH_STATUS_FILTERS,
  MadrasahDirectoryItemResponse,
  MadrasahDirectoryResponse,
  type MadrasahStatusFilter,
} from "./dto/madrasah-directory-response.dto";
import { MadrasahExploreResponse } from "./dto/madrasah-explore-response.dto";
import { MadrasahOverviewResponse } from "./dto/madrasah-overview-response.dto";
import { MadrasahResponse } from "./dto/madrasah-response.dto";
import { PaginatedMadrasahResponse } from "./dto/paginated-madrasah-response.dto";
import { SetHeadMuderrisDto } from "./dto/set-head-muderris.dto";
import { UpdateMadrasahDto } from "./dto/update-madrasah.dto";
import { MadrasahNotFoundError } from "./errors/madrasah-not-found.error";
import { MadrasahService } from "./madrasah.service";

const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;

const EXPLORE_LEVELS = {
  ALL: "ALL",
  BEGINNER: "BEGINNER",
  INTERMEDIATE: "INTERMEDIATE",
  ADVANCED: "ADVANCED",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/madrasahs/:id…` route against that medrese, answering a
 * missing or malformed id as not-found first. Guards run before pipes, and
 * the role resolver reads a missing medrese as PUBLIC — which would turn
 * every restricted route on an unknown id into a 403 instead of a 404.
 */
const byExistingMadrasah: AuthzResolve = async (req, moduleRef) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (
    !UUID_REGEX.test(id) ||
    !(await moduleRef.get(MadrasahService, { strict: false }).exists(id))
  ) {
    throw new MadrasahNotFoundError(id);
  }
  return { entity: ENTITIES.MADRASAH, id };
};

/**
 * No particular medrese: the list and the create route. The resolver reads a
 * non-UUID id as PUBLIC, which grants `VIEW` and nothing that creates —
 * `CREATE_MADRASAH` is on no matrix row, so only SYSTEM_ADMIN's realm bypass
 * passes it.
 */
const anyMadrasah: AuthzResolve = () => ({
  entity: ENTITIES.MADRASAH,
  id: "any",
});

/**
 * The medrese layer (MDRS-106, ADR-003). Every handler carries `@Authz`:
 * reading is open to anyone, with or without a token (MDRS-122), creating and deleting are
 * SYSTEM_ADMIN's, the rest belongs to the medrese's nazırs.
 */
@ApiTags("madrasahs")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("madrasahs")
export class MadrasahController {
  constructor(private readonly madrasahService: MadrasahService) {}

  @ApiOperation({
    summary: "Get a paginated list of medreses",
    description: "Open to callers with no token (MDRS-122).",
    operationId: "getAllMadrasahs",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: PaginatedMadrasahResponse })
  @Get()
  @Authz(SCOPES.VIEW, anyMadrasah)
  @AuthzPublic()
  async findAll(
    @Req() request: PublicRequest,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(12), ParseIntPipe) limit: number
  ): Promise<PaginatedMadrasahResponse> {
    const safePage = page < 1 ? 1 : page;
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    const result = await this.madrasahService.findAll(safePage, safeLimit);
    return request.user
      ? result
      : { ...result, items: result.items.map(maskMadrasahForAnonymous) };
  }

  @ApiOperation({
    summary: "Get the medreses Keşfet lists",
    description:
      "Open to callers with no token (MDRS-122). Each medrese with its başmüderris's name and its listed courses (published, in a köşk the public list holds), by name. `level` and `field` keep the medreses with a listed course in a köşk of that level or ilim alanı; `q` matches the name, handle or description, or the başmüderris's name. Not paginated (MDRS-159).",
    operationId: "exploreMadrasahs",
  })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({
    name: "level",
    required: false,
    enum: ["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"],
  })
  @ApiQuery({ name: "field", required: false, type: String })
  @ApiQuery({
    name: "madrasahId",
    required: false,
    type: String,
    format: "uuid",
  })
  @ApiOkResponse({ type: MadrasahExploreResponse, isArray: true })
  // Declared before `:id` so `explore` is not read as an id.
  @Get("explore")
  @Authz(SCOPES.VIEW, anyMadrasah)
  @AuthzPublic()
  async explore(
    @Query("q") q?: string,
    @Query("level", new ParseEnumPipe(EXPLORE_LEVELS, { optional: true }))
    level?: string,
    @Query("field") field?: string,
    @Query("madrasahId", new ParseUUIDPipe({ optional: true }))
    madrasahId?: string
  ): Promise<MadrasahExploreResponse[]> {
    return this.madrasahService.findExplore({
      // A repeated query key arrives as an array; only a single value is read.
      q: typeof q === "string" ? q.slice(0, 100) : undefined,
      level,
      field: typeof field === "string" ? field.trim() || undefined : undefined,
      madrasahId,
    });
  }

  @ApiOperation({
    summary: "Every medrese for the platform's table (SYSTEM_ADMIN only)",
    description:
      "nizam/07: hidden and passive medreses too, each with its başmüderris, course count and hosting köşks, and the per-status counts the tabs show. The open list above leaves hidden medreses out; this one is the başnazım's.",
    operationId: "getMadrasahDirectory",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: MADRASAH_STATUS_FILTERS,
    enumName: "MadrasahStatusFilter",
  })
  @ApiQuery({
    name: "q",
    required: false,
    type: String,
    description: "Part of the medrese's name, its handle or its başmüderris",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: MadrasahDirectoryResponse })
  @ApiForbiddenResponse()
  @Get("directory")
  @Authz(SCOPES.CREATE_MADRASAH, anyMadrasah)
  async directory(
    @Query(
      "status",
      new DefaultValuePipe("ALL"),
      new ParseEnumPipe(MADRASAH_STATUS_FILTERS)
    )
    status: MadrasahStatusFilter,
    @Query("q") q: string | undefined,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(25), ParseIntPipe) limit: number
  ): Promise<MadrasahDirectoryResponse> {
    const safePage = page < 1 ? 1 : page;
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    return this.madrasahService.directory(
      // A repeated query key arrives as an array; only a single value is read.
      {
        status,
        q: typeof q === "string" ? q.slice(0, MAX_SEARCH_LENGTH) : undefined,
      },
      safePage,
      safeLimit
    );
  }

  @ApiOperation({
    summary: "Get a medrese by ID",
    description: "Open to callers with no token (MDRS-122).",
    operationId: "getMadrasahById",
  })
  @ApiOkResponse({ type: MadrasahResponse })
  @ApiNotFoundResponse()
  @Get(":id")
  @Authz(SCOPES.VIEW, byExistingMadrasah)
  @AuthzPublic()
  async findById(
    @Req() request: PublicRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahResponse> {
    const madrasah = await this.madrasahService.findOpenById(id);
    return request.user ? madrasah : maskMadrasahForAnonymous(madrasah);
  }

  @ApiOperation({
    summary: "Get what a medrese's page shows",
    description:
      "Open to callers with no token (MDRS-122). The medrese's published courses in listed köşks, each with its müderrisler, the caller's own enrollment state and the next session (never the meeting link); the köşks those courses are in; and the başmüderris.",
    operationId: "getMadrasahOverview",
  })
  @ApiOkResponse({ type: MadrasahOverviewResponse })
  @ApiNotFoundResponse()
  @Get(":id/overview")
  @Authz(SCOPES.VIEW, byExistingMadrasah)
  @AuthzPublic()
  async findOverview(
    @Req() request: PublicRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahOverviewResponse> {
    return this.madrasahService.findOverview(id, request.user?.sub ?? null);
  }

  @ApiOperation({
    summary: "Open a medrese with its başmüderris (SYSTEM_ADMIN only)",
    description:
      "The medrese and the başmüderris's grant are written together. Without a `handle` one is made from the name.",
    operationId: "createMadrasah",
  })
  @ApiCreatedResponse({ type: MadrasahResponse })
  @ApiForbiddenResponse()
  @ApiConflictResponse({ description: "The handle is taken" })
  @Post()
  @Authz(SCOPES.CREATE_MADRASAH, anyMadrasah)
  async create(
    @Req() request: AuthorizedRequest,
    @Body() dto: CreateMadrasahDto
  ): Promise<MadrasahResponse> {
    return this.madrasahService.open({
      ...dto,
      createdBy: request.user.sub,
    });
  }

  @ApiOperation({
    summary: "Make a user the medrese's başmüderris (SYSTEM_ADMIN only)",
    description:
      "Replaces whoever heads it: their grants are revoked, not deleted. A passive medrese is active again. Written to the audit log.",
    operationId: "setMadrasahHeadMuderris",
  })
  @ApiOkResponse({ type: MadrasahDirectoryItemResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Put(":id/head-muderris")
  @Authz(SCOPES.CREATE_MADRASAH, byExistingMadrasah)
  async setHeadMuderris(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetHeadMuderrisDto
  ): Promise<MadrasahDirectoryItemResponse> {
    return this.madrasahService.setHeadMuderris(
      id,
      dto.userId,
      request.user.sub
    );
  }

  @ApiOperation({
    summary: "Bring a hidden medrese back (SYSTEM_ADMIN only)",
    description: "409 (MADRASAH_NOT_HIDDEN) when it is not hidden.",
    operationId: "restoreMadrasah",
  })
  @ApiOkResponse({ type: MadrasahDirectoryItemResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "MADRASAH_NOT_HIDDEN" })
  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  @Authz(SCOPES.CREATE_MADRASAH, byExistingMadrasah)
  async restore(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahDirectoryItemResponse> {
    return this.madrasahService.restore(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Update a medrese (its nazırs)",
    operationId: "updateMadrasah",
  })
  @ApiOkResponse({ type: MadrasahResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "The handle is taken" })
  @Patch(":id")
  @Authz(SCOPES.EDIT, byExistingMadrasah)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateMadrasahDto
  ): Promise<MadrasahResponse> {
    return this.madrasahService.update(id, dto);
  }

  @ApiOperation({
    summary: "Delete a medrese (SYSTEM_ADMIN only)",
    description:
      "Its nazır list and hosting rights go with it; its courses stay in their köşks with no medrese. Nazırs cannot delete (MDRS-124).",
    operationId: "deleteMadrasah",
  })
  @ApiOkResponse({ type: Boolean })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete(":id")
  @Authz(SCOPES.DELETE, byExistingMadrasah)
  async delete(@Param("id", ParseUUIDPipe) id: string): Promise<boolean> {
    return this.madrasahService.delete(id);
  }

  @ApiOperation({
    summary: "Make a user a nazır of the medrese",
    operationId: "addMadrasahNazir",
  })
  @ApiCreatedResponse({ type: MadrasahResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Post(":id/nazirs/:userId")
  @Authz(SCOPES.INVITE_NAZIR, byExistingMadrasah)
  async addNazir(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<MadrasahResponse> {
    return this.madrasahService.addNazir(id, userId, request.user.sub);
  }

  @ApiOperation({
    summary: "Remove a nazır from the medrese",
    operationId: "removeMadrasahNazir",
  })
  @ApiOkResponse({ type: MadrasahResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete(":id/nazirs/:userId")
  @Authz(SCOPES.REMOVE_NAZIR, byExistingMadrasah)
  async removeNazir(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<MadrasahResponse> {
    return this.madrasahService.removeNazir(id, userId, request.user.sub);
  }
}
