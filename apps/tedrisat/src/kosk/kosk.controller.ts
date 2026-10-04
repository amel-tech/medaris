import {
  ASSIGNED_ROLES,
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
  forNew,
  PERMISSIONS,
  SelfGrantGuard,
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
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { maskKoskForAnonymous } from "./anonymous-mask";
import { CreateKoskDto } from "./dto/create-kosk.dto";
import { FollowedKoskCourseResponse } from "./dto/followed-course-response.dto";
import { KoskDecksResponse } from "./dto/kosk-deck-response.dto";
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
import { KoskAdminService } from "./kosk-admin.service";

const MAX_PAGE_SIZE = 50;

const KOSK_LEVELS = {
  ALL: "ALL",
  BEGINNER: "BEGINNER",
  INTERMEDIATE: "INTERMEDIATE",
  ADVANCED: "ADVANCED",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Authorizes a `/kosks/:id` route against that köşk, answering a missing or
 * malformed id as not-found first. Guards run before pipes, so a malformed id
 * would otherwise reach the engine as the PUBLIC sentinel and be a 403. The
 * role resolver answers a missing köşk with 404 on its own since MDRS-43, but
 * SYSTEM_ADMIN bypasses the resolver, so the existence check stays here for
 * the routes whose handlers assume the köşk is there.
 */
export const byExistingKosk: AuthzResolve = async (req, moduleRef) => {
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
    private readonly authz: AuthzService,
    private readonly koskAdmin: KoskAdminService,
    private readonly selfGrant: SelfGrantGuard
  ) {}

  /**
   * Who is changing the managers, for the check under the köşk lock. The
   * başnazım and a Medaris nazımı holding "Köşk nazımlarını yönet" are not
   * managers of the köşk and pass it by right (review M7: the guard let the
   * second in and the repository then refused them).
   */
  private async managerActor(request: AuthorizedRequest, koskId: string) {
    return {
      id: request.user.sub,
      bypass:
        this.authz.isSystemAdmin(request.user) ||
        (await this.authz.can(
          request.user,
          { entity: ENTITIES.KOSK, id: koskId },
          PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE
        )),
    };
  }

  @ApiOperation({
    summary: "Get a paginated list of köşks",
    description:
      "Open to callers with no token (MDRS-122). Lists every köşk except the unlisted ones (`isPrivate`): an unlisted köşk is in no list, for anyone — it is reached by its link. `managedBy=me` narrows the list, and its `total`, to the köşks the caller manages (KOSK_NAZIM, MDRS-108, MDRS-134), unlisted ones included — nizam's köşk list; it needs a token. `madrasahId` narrows it to the köşks that medrese holds a hosting right in (MDRS-134).",
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
  @ApiQuery({
    name: "level",
    required: false,
    enum: ["ALL", "BEGINNER", "INTERMEDIATE", "ADVANCED"],
    description: "Only the köşks of this level (MDRS-159)",
  })
  @ApiQuery({
    name: "field",
    required: false,
    type: String,
    description: "Only the köşks of this ilim alanı, exactly (MDRS-159)",
  })
  @ApiQuery({
    name: "q",
    required: false,
    type: String,
    description:
      "Only the köşks whose name, handle, description or field contain every word (MDRS-159)",
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
    madrasahId?: string,
    @Query("level", new ParseEnumPipe(KOSK_LEVELS, { optional: true }))
    level?: string,
    @Query("field") field?: string,
    @Query("q") q?: string
  ): Promise<PaginatedKoskResponse> {
    const userId = request.user?.sub ?? null;
    if (managedBy === KoskManagedBy.ME && userId === null) {
      throw new AuthzMissingUserError("Sign in to list the köşks you manage");
    }
    const safePage = page < 1 ? 1 : page;
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    const page_ = await this.koskService.findAll(userId, safePage, safeLimit, {
      managedByCaller: managedBy === KoskManagedBy.ME,
      madrasahId,
      level,
      // A repeated query key arrives as an array; only a single value is read.
      field: typeof field === "string" ? field.trim() || undefined : undefined,
      q: typeof q === "string" ? q.slice(0, 100) : undefined,
    });
    return userId === null
      ? { ...page_, items: page_.items.map(maskKoskForAnonymous) }
      : page_;
  }

  @ApiOperation({
    summary: "List the ilim alanı of the listed köşks",
    description:
      "Open to callers with no token. The distinct `field` values of the köşks the public list holds, alphabetical: the chips of Keşfet (MDRS-159).",
    operationId: "getKoskFields",
  })
  @ApiOkResponse({ type: String, isArray: true })
  // Declared before `:id` so `fields` is not read as an id.
  @AuthzPublic()
  @Get("fields")
  async listFields(): Promise<string[]> {
    return this.koskService.listFields();
  }

  @ApiOperation({
    summary: "Courses of the köşks the caller follows",
    description:
      'Published courses of the köşks the caller follows, newest first, leaving out the courses they already applied to or are in (MDRS-165): Ana sayfa\'s "Takip ettiğin köşklerden".',
    operationId: "getFollowedKoskCourses",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "At most this many; 4 by default, 12 at most.",
  })
  @ApiOkResponse({ type: FollowedKoskCourseResponse, isArray: true })
  // Exempt: the rows are chosen by the caller's own `sub` in the query, and no
  // resource is named in the request. Declared before `:id` so `followed` is
  // not read as an id.
  @AuthzExempt()
  @Get("followed/courses")
  async findFollowedCourses(
    @Req() request: AuthorizedRequest,
    @Query("limit", new DefaultValuePipe(4), ParseIntPipe) limit: number
  ): Promise<FollowedKoskCourseResponse[]> {
    return this.koskService.findFollowedCourses(
      request.user.sub,
      Math.min(Math.max(limit, 1), 12)
    );
  }

  /**
   * A hidden köşk (MDRS-174) opens for its nazımları, Medaris yönetimi holding
   * `platform.kosk_edit` and the başnazım only (MDRS-143); for everyone else it
   * is one that does not exist.
   */
  private async assertMayOpenHidden(
    request: PublicRequest,
    id: string
  ): Promise<void> {
    if (
      !(
        request.user &&
        (await this.authz.can(request.user, { entity: ENTITIES.KOSK, id }, [
          PERMISSIONS.KOSK_MANAGE,
          PERMISSIONS.PLATFORM_KOSK_EDIT,
        ]))
      )
    ) {
      throw new KoskNotFoundError(id);
    }
  }

  @ApiOperation({
    summary: "Get a köşk by ID",
    description:
      "Open to callers with no token (MDRS-122), except for an unlisted köşk (`isPrivate`), which answers them with the same 404 as a köşk that does not exist. A signed-in caller opens an unlisted köşk by its link.",
    operationId: "getKoskById",
  })
  @ApiOkResponse({ type: KoskResponse })
  @ApiNotFoundResponse()
  @Authz(PERMISSIONS.KOSK_VIEW, byParam(ENTITIES.KOSK))
  @AuthzPublic()
  @Get(":id")
  async findById(
    @Req() request: PublicRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskResponse> {
    const userId = request.user?.sub ?? null;
    const kosk = await this.koskService.findById(id, userId);
    if (kosk.archivedAt !== null) await this.assertMayOpenHidden(request, id);
    return userId === null ? maskKoskForAnonymous(kosk) : kosk;
  }

  @ApiOperation({
    summary: "Get the köşk's decks (MDRS-159)",
    description:
      "The shared decks the köşk offers its talebe, for a signed-in caller who is a talebe (ENROLLED or COMPLETED), a müderris or a manager of the köşk. For anyone else `accessible` is false and `decks` is empty, so the köşk page can leave the block out; the köşk's existence is never denied to them here, `GET /kosks/:id` answers that. A hidden köşk answers 404 to all but its nazımları, Medaris yönetimi holding `platform.kosk_edit` and the başnazım, as `GET /kosks/:id` does.",
    operationId: "getKoskDecks",
  })
  @ApiOkResponse({ type: KoskDecksResponse })
  @ApiNotFoundResponse()
  @Authz(PERMISSIONS.KOSK_VIEW, byExistingKosk)
  @Get(":id/decks")
  async findDecks(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskDecksResponse> {
    if ((await this.koskService.findVisibility(id))?.hidden) {
      await this.assertMayOpenHidden(request, id);
    }
    return this.koskService.findDecks(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Create a new köşk",
    operationId: "createKosk",
  })
  @ApiCreatedResponse({ type: KoskResponse })
  @ApiForbiddenResponse({
    description:
      "SELF_GRANT_REFUSED: a caller other than SYSTEM_ADMIN named themselves in `managerUserIds` or left it out. Written to the audit log.",
  })
  // SYSTEM_ADMIN only (owner decision, 2026-10-02), replacing MDRS-43's
  // self-service exemption of 2026-09-23. `platform.kosk_create` is no
  // relationship's and no role's default, so only the realm bypass and a Medaris
  // nazımı who was given it pass. Self-service made any caller
  // a köşk manager on demand, and `GET /users?email=` (MDRS-104) trusts
  // "manages a köşk" as its gate, so an open create let anybody grant
  // themselves that lookup.
  @Authz(PERMISSIONS.PLATFORM_KOSK_CREATE, forNew(ENTITIES.KOSK))
  @Post()
  async create(
    @Req() request: AuthenticatedUserRequest,
    @Body() koskDto: CreateKoskDto
  ): Promise<KoskResponse> {
    const ownerId = request.user.sub;
    // With `managerUserIds` this is nizam/10: the başnazım opens the köşk
    // for the nazımları they named and is not one of them. Without it the
    // caller is the köşk's only nazım, which only the başnazım may make
    // himself: `platform.kosk_create` opens a köşk, it does not seat its nazım.
    const { managerUserIds, ...fields } = koskDto;
    await this.selfGrant.assertNotSelf(
      request.user,
      managerUserIds ?? [ownerId],
      { entity: ENTITIES.KOSK, id: "new" },
      { role: ASSIGNED_ROLES.KOSK_NAZIM, always: true },
      managerUserIds ? "kosk.create.nazims" : "kosk.create"
    );
    const created = managerUserIds
      ? await this.koskAdmin.createWithNazims(request.user, koskDto)
      : await this.koskService.create({ ownerId, ...fields });
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
  // the routes MDRS-106/124/126 moved to `@Authz`.
  @Authz(
    [PERMISSIONS.KOSK_MANAGE, PERMISSIONS.PLATFORM_KOSK_EDIT],
    byExistingKosk
  )
  async update(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() koskDto: UpdateKoskDto
  ): Promise<KoskResponse> {
    await this.koskService.update(id, koskDto, request.user.sub, {
      systemAdmin: this.authz.isSystemAdmin(request.user),
    });
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
  @Authz(PERMISSIONS.KOSK_DELETE, byExistingKosk)
  async delete(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<boolean> {
    return this.koskService.delete(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Make a user a manager of the köşk",
    description:
      "Idempotent. Open to the köşk's managers and SYSTEM_ADMIN (MDRS-126).",
    operationId: "addKoskManager",
  })
  @ApiCreatedResponse({ type: KoskResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({
    description:
      "No such köşk, or the user has never signed in (KOSK_MANAGER_UNKNOWN_USER)",
  })
  @Post(":id/managers/:userId")
  @Authz(
    [PERMISSIONS.KOSK_MANAGE, PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE],
    byExistingKosk
  )
  async addManager(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<KoskResponse> {
    // A Medaris nazımı does not make themselves a köşk's nazımı by this route.
    await this.selfGrant.assertNotSelf(
      request.user,
      [userId],
      { entity: ENTITIES.KOSK, id },
      { role: ASSIGNED_ROLES.KOSK_NAZIM },
      "kosk.managers.add"
    );
    await this.koskService.addManager(
      id,
      userId,
      await this.managerActor(request, id)
    );
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
  @Authz(
    [PERMISSIONS.KOSK_MANAGE, PERMISSIONS.PLATFORM_KOSK_NAZIM_MANAGE],
    byExistingKosk
  )
  async removeManager(
    @Req() request: AuthorizedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string
  ): Promise<KoskResponse> {
    await this.koskService.removeManager(
      id,
      userId,
      await this.managerActor(request, id)
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
  @Authz(PERMISSIONS.KOSK_VIEW, byParam(ENTITIES.KOSK))
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
