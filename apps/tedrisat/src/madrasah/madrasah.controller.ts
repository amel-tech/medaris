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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AuthorizedRequest } from "../kosk/interfaces/authorized-request.interface";
import { CreateMadrasahDto } from "./dto/create-madrasah.dto";
import { MadrasahResponse } from "./dto/madrasah-response.dto";
import { PaginatedMadrasahResponse } from "./dto/paginated-madrasah-response.dto";
import { UpdateMadrasahDto } from "./dto/update-madrasah.dto";
import { MadrasahNotFoundError } from "./errors/madrasah-not-found.error";
import { MadrasahService } from "./madrasah.service";

const MAX_PAGE_SIZE = 50;

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
 * reading is open to anyone signed in, creating and deleting are
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
    operationId: "getAllMadrasahs",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: PaginatedMadrasahResponse })
  @Get()
  @Authz(SCOPES.VIEW, anyMadrasah)
  async findAll(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(12), ParseIntPipe) limit: number
  ): Promise<PaginatedMadrasahResponse> {
    const safePage = page < 1 ? 1 : page;
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    return this.madrasahService.findAll(safePage, safeLimit);
  }

  @ApiOperation({
    summary: "Get a medrese by ID",
    operationId: "getMadrasahById",
  })
  @ApiOkResponse({ type: MadrasahResponse })
  @ApiNotFoundResponse()
  @Get(":id")
  @Authz(SCOPES.VIEW, byExistingMadrasah)
  async findById(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<MadrasahResponse> {
    return this.madrasahService.findById(id);
  }

  @ApiOperation({
    summary: "Create a medrese (SYSTEM_ADMIN only)",
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
    return this.madrasahService.create({
      ...dto,
      createdBy: request.user.sub,
    });
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
