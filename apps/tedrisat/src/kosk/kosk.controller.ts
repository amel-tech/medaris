import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  AuthzMissingUserError,
  AuthzPublic,
  type AuthzResolve,
  AuthzService,
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
  ParseEnumPipe,
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
import { CreateKoskDto } from "./dto/create-kosk.dto";
import { KoskManagedBy } from "./dto/kosk-managed-by.enum";
import { KoskResponse } from "./dto/kosk-response.dto";
import { PaginatedKoskResponse } from "./dto/paginated-kosk-response.dto";
import { UpdateKoskDto } from "./dto/update-kosk.dto";
import { KoskNotFoundError } from "./errors/kosk-not-found.error";
import {
  AuthorizedRequest,
  PublicRequest,
} from "./interfaces/authorized-request.interface";
import { KoskService } from "./kosk.service";

const MAX_PAGE_SIZE = 50;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/kosks/:id` route against that köşk, answering a missing or
 * malformed id as not-found first. Guards run before pipes, so a malformed id
 * would otherwise reach the matrix as the PUBLIC sentinel and be a 403. The
 * role resolver answers a missing köşk with 404 on its own since MDRS-43, but
 * SYSTEM_ADMIN bypasses the resolver, so the existence check stays here for
 * the routes whose handlers assume the köşk is there.
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
@UseGuards(AuthGuard, AuthzGuard)
@Controller("kosks")
export class KoskController {
  constructor(
    private readonly koskService: KoskService,
    private readonly authz: AuthzService
  ) {}

  /** Who is changing the managers, for the check under the köşk lock. */
  private managerActor(request: AuthorizedRequest) {
    return {
      id: request.user.sub,
      bypass: this.authz.isSystemAdmin(request.user),
    };
  }

  @ApiOperation({
    summary: "Get a paginated list of köşks",
    description:
      "Open to callers with no token (MDRS-122). Lists every köşk except the unlisted ones (`isPrivate`): an unlisted köşk is in no list, for anyone — it is reached by its link. `managedBy=me` narrows the list, and its `total`, to the köşks the caller manages (`kosk_managers`, MDRS-108), unlisted ones included — nizam's köşk list; it needs a token. `madrasahId` narrows it to the köşks affiliated with that medrese.",
    operationId: "getAllKosks",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({
    name: "managedBy",
    required: false,
    enum: KoskManagedBy,
    enumName: "KoskManagedBy",
    description: "Only the köşks the caller manages (MDRS-108)",
  })
  @ApiQuery({
    name: "madrasahId",
    required: false,
    type: String,
    format: "uuid",
    description: "Only the köşks affiliated with this medrese (MDRS-122)",
  })
  @ApiOkResponse({ type: PaginatedKoskResponse })
  // No `@Authz`: a paginated list has no single resource to authorize. The
  // visibility rule lives in the query, which is the only place it can live
  // for a list: `KoskRepository.listWhere` leaves unlisted köşks out of
  // every listing but the manager's own (MDRS-122). `@AuthzPublic()` opens the
  // list to a caller with no token; `managedBy=me` only ever narrows the list
  // to the caller's own rows, so it needs a caller and nothing more.
  @AuthzPublic()
  @Get()
  async findAll(
    @Req() request: PublicRequest,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Query("managedBy", new ParseEnumPipe(KoskManagedBy, { optional: true }))
    managedBy?: KoskManagedBy,
    @Query("madrasahId", new ParseUUIDPipe({ optional: true }))
    madrasahId?: string
  ): Promise<PaginatedKoskResponse> {
    const userId = request.user?.sub ?? null;
    if (managedBy === KoskManagedBy.ME && userId === null) {
      throw new AuthzMissingUserError("Sign in to list the köşks you manage");
    }
    const safePage = page < 1 ? 1 : page;
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    return this.koskService.findAll(userId, safePage, safeLimit, {
      managedByCaller: managedBy === KoskManagedBy.ME,
      madrasahId,
    });
  }

  @ApiOperation({
    summary: "Get a köşk by ID",
    description:
      "Open to callers with no token (MDRS-122), except for an unlisted köşk (`isPrivate`), which answers them with the same 404 as a köşk that does not exist. A signed-in caller opens an unlisted köşk by its link.",
    operationId: "getKoskById",
  })
  @ApiOkResponse({ type: KoskResponse })
  @ApiNotFoundResponse()
  @Authz(SCOPES.VIEW, byParam(ENTITIES.KOSK))
  @AuthzPublic()
  @Get(":id")
  async findById(
    @Req() request: PublicRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskResponse> {
    return this.koskService.findById(id, request.user?.sub ?? null);
  }

  @ApiOperation({
    summary: "Create a new köşk",
    operationId: "createKosk",
  })
  @ApiCreatedResponse({ type: KoskResponse })
  // Exempt by product decision (MDRS-43, 2026-09-23): any authenticated user
  // may open a köşk and becomes its KOSK_MANAGER; opening dersler inside it
  // stays with that owner (`MANAGE_COURSES`). Self-service is kept on purpose
  // for now and may be narrowed later.
  //
  // The matrix still says otherwise: `CREATE_KOSK` is on NO kosk row, so
  // köşk creation there is SYSTEM_ADMIN only, through the realm bypass. That
  // is why this route is exempt rather than `@Authz(CREATE_KOSK, forNew(KOSK))`
  // — the decorator would 403 every ordinary caller. Narrowing later means
  // swapping in that decorator and hiding nizam's "Yeni Köşk" from non-admins.
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
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Patch(":id")
  // `byExistingKosk`, not `byParam`: a malformed or unknown id is a 404 on
  // the routes MDRS-106/124/126 moved to `@Authz`; a nazır of the köşk's
  // medrese gets `EDIT` from the matrix (MDRS-106).
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
  @Authz(SCOPES.DELETE, byExistingKosk)
  async delete(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<boolean> {
    return this.koskService.delete(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Make a user a manager of the köşk",
    description:
      "Idempotent. Open to the köşk's managers and SYSTEM_ADMIN — not to a nazır of its medrese (MDRS-126).",
    operationId: "addKoskManager",
  })
  @ApiCreatedResponse({ type: KoskResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({
    description:
      "No such köşk, or the user has never signed in (KOSK_MANAGER_UNKNOWN_USER)",
  })
  @Post(":id/managers/:userId")
  @Authz(SCOPES.MANAGE_KOSK_MANAGERS, byExistingKosk)
  async addManager(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<KoskResponse> {
    await this.koskService.addManager(id, userId, this.managerActor(request));
    return this.koskService.findById(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Remove a manager from the köşk",
    description:
      "The last manager cannot be removed (409 KOSK_LAST_MANAGER). A manager may remove themselves while another remains (MDRS-126).",
    operationId: "removeKoskManager",
  })
  @ApiOkResponse({ type: KoskResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({
    description: "No such köşk, or the user is not one of its managers",
  })
  @ApiConflictResponse({
    description: "The user is the köşk's last manager (KOSK_LAST_MANAGER)",
  })
  @Delete(":id/managers/:userId")
  @Authz(SCOPES.MANAGE_KOSK_MANAGERS, byExistingKosk)
  async removeManager(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<KoskResponse> {
    await this.koskService.removeManager(
      id,
      userId,
      this.managerActor(request)
    );
    return this.koskService.findById(id, request.user.sub);
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
