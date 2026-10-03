import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  SCOPES,
} from "@medaris/common";
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
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
import {
  AddKoskNazimsDto,
  KOSK_LISTING_FILTERS,
  KOSK_STATUS_FILTERS,
  KoskDirectoryItemResponse,
  KoskDirectoryResponse,
  type KoskListingFilter,
  KoskNazimResponse,
  type KoskStatusFilter,
} from "./dto/kosk-admin.dto";
import { KOSK_LEVELS, type KoskLevel } from "./dto/kosk-field-rules";
import {
  KoskCourseRosterResponse,
  KoskOverviewResponse,
} from "./dto/kosk-overview.dto";
import { byExistingKosk } from "./kosk.controller";
import { KoskAdminService } from "./kosk-admin.service";

const MAX_PAGE_SIZE = 50;
const MAX_TEXT_LENGTH = 100;

/**
 * The köşk screens of the Medaris yönetimi (MDRS-174). Declared before
 * `KoskController` in the module so that `GET /kosks/directory` is matched
 * before `GET /kosks/:id` reads "directory" as an id.
 */
@ApiTags("kosks")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("kosks")
export class KoskAdminController {
  constructor(private readonly admin: KoskAdminService) {}

  @ApiOperation({
    summary: "Every köşk for the table of nizam/09",
    description:
      "Hidden and passive köşks too, each with its nazımları and course count, the per-status counts the tabs show and the fields the Alan chips offer. The Medaris başnazımı (SYSTEM_ADMIN) sees every köşk; a köşk nazımı only their own; anyone else is refused.",
    operationId: "getKoskDirectory",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: KOSK_STATUS_FILTERS,
    enumName: "KoskStatusFilter",
  })
  @ApiQuery({
    name: "level",
    required: false,
    enum: KOSK_LEVELS,
    enumName: "KoskLevel",
  })
  @ApiQuery({ name: "field", required: false, type: String })
  @ApiQuery({
    name: "listing",
    required: false,
    enum: KOSK_LISTING_FILTERS,
    enumName: "KoskListingFilter",
    description: "Görünürlük: LISTED, UNLISTED (Listelenmeyen) or ALL",
  })
  @ApiQuery({
    name: "q",
    required: false,
    type: String,
    description: "Part of the köşk's name, its short name or a nazım's name",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: `1 to ${MAX_PAGE_SIZE}; default 12.`,
  })
  @ApiOkResponse({ type: KoskDirectoryResponse })
  @ApiForbiddenResponse()
  // Exempt: who may see which rows is the service's decision (`scopeOf`) — a
  // table has no single köşk for the matrix to judge.
  @AuthzExempt()
  @Get("directory")
  directory(
    @Req() request: AuthenticatedUserRequest,
    @Query(
      "status",
      new DefaultValuePipe("ALL"),
      new ParseEnumPipe(KOSK_STATUS_FILTERS)
    )
    status: KoskStatusFilter,
    @Query("level", new ParseEnumPipe(KOSK_LEVELS, { optional: true }))
    level: KoskLevel | undefined,
    @Query("field") field: string | undefined,
    @Query(
      "listing",
      new DefaultValuePipe("ALL"),
      new ParseEnumPipe(KOSK_LISTING_FILTERS)
    )
    listing: KoskListingFilter,
    @Query("q") q: string | undefined,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(12), ParseIntPipe) limit: number
  ): Promise<KoskDirectoryResponse> {
    return this.admin.directory(request.user, {
      status,
      level,
      // A repeated query key arrives as an array; only a single value is read.
      field:
        typeof field === "string"
          ? field.trim().slice(0, MAX_TEXT_LENGTH) || undefined
          : undefined,
      listing,
      q: typeof q === "string" ? q.slice(0, MAX_TEXT_LENGTH) : undefined,
      page: page < 1 ? 1 : page,
      limit: Math.min(Math.max(limit, 1), MAX_PAGE_SIZE),
    });
  }

  @ApiOperation({
    summary: "The Medaris yönetimi's page of one köşk (numbers and facts)",
    description:
      "nizam/20. Course counts by status, the talebe enrolled (hidden courses left out), waiting applications, the nazımları held now and the medreses with a hosting right. For the köşk's nazımları and the başnazım.",
    operationId: "getKoskOverview",
  })
  @ApiOkResponse({ type: KoskOverviewResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/overview")
  @Authz(SCOPES.EDIT, byExistingKosk)
  overview(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskOverviewResponse> {
    return this.admin.overview(id);
  }

  @ApiOperation({
    summary: "Every course of the köşk for the Dersler table",
    description:
      "nizam/23 and 20. Hidden courses too, newest first, each with its müderrisler (the imam flagged), talebe, waiting applications and bans, plus the counts the tabs show.",
    operationId: "getKoskCourseRoster",
  })
  @ApiOkResponse({ type: KoskCourseRosterResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/course-roster")
  @Authz(SCOPES.EDIT, byExistingKosk)
  courseRoster(
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskCourseRosterResponse> {
    return this.admin.courseRoster(id);
  }

  @ApiOperation({
    summary: "Take a köşk out of service (Köşkü pasife al, SYSTEM_ADMIN only)",
    description:
      "nizam/20. The köşk becomes passive and its nazımları are taken off the post; nothing is hidden or deleted, and adding a nazım makes it active again. 409 (KOSK_ALREADY_PASSIVE) when it is passive already. Written to the audit log, naming the nazımları removed.",
    operationId: "deactivateKosk",
  })
  @ApiOkResponse({ type: KoskDirectoryItemResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "KOSK_ALREADY_PASSIVE" })
  // Exempt: SYSTEM_ADMIN's, checked by the service, like adding nazımları.
  @AuthzExempt()
  @Post(":id/deactivate")
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskDirectoryItemResponse> {
    return this.admin.deactivate(request.user, id);
  }

  @ApiOperation({
    summary: "The köşk's nazımları with who gave each post and when",
    description:
      "nizam/25. The köşk's nazımları and the Medaris başnazımı read it; nobody changes the list from here.",
    operationId: "getKoskNazims",
  })
  @ApiOkResponse({ type: KoskNazimResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/nazims")
  @Authz(SCOPES.EDIT, byExistingKosk)
  listNazims(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskNazimResponse[]> {
    return this.admin.listNazims(request.user, id);
  }

  @ApiOperation({
    summary: "Make people the köşk's nazımları (SYSTEM_ADMIN only)",
    description:
      "nizam/21. Accounts found by e-mail, with an optional end of the post. All or nothing: someone who is a nazım already refuses the whole call with 409 (KOSK_NAZIM_EXISTS). A passive köşk is active again. One audit entry per person. Answers the köşk's nazımları as they are now.",
    operationId: "addKoskNazims",
  })
  @ApiCreatedResponse({ type: KoskNazimResponse, isArray: true })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse({
    description: "No such köşk, or an account the directory does not know",
  })
  @ApiConflictResponse({ description: "KOSK_NAZIM_EXISTS" })
  // Exempt: the matrix has no "appoint a köşk nazımı" scope — a köşk's own
  // nazımları may add managers by `POST /kosks/:id/managers/:userId`, while
  // this screen is the Medaris yönetimi's, so the service asks for SYSTEM_ADMIN.
  @AuthzExempt()
  @Post(":id/nazims")
  addNazims(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddKoskNazimsDto
  ): Promise<KoskNazimResponse[]> {
    return this.admin.addNazims(request.user, id, dto);
  }

  @ApiOperation({
    summary: "Hide a köşk (Köşkü gizle)",
    description:
      "Nothing is deleted: the köşk and its courses leave every list, and nobody but its nazımları and the başnazım can open it. The başnazım brings it back (`POST /kosks/:id/restore`) or deletes it from the archive. 409 (KOSK_ALREADY_HIDDEN) when it is hidden already. Written to the audit log.",
    operationId: "hideKosk",
  })
  @ApiOkResponse({ type: KoskDirectoryItemResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "KOSK_ALREADY_HIDDEN" })
  @Post(":id/hide")
  @HttpCode(HttpStatus.OK)
  @Authz(SCOPES.EDIT, byExistingKosk)
  hide(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskDirectoryItemResponse> {
    return this.admin.hide(id, request.user.sub);
  }

  @ApiOperation({
    summary: "Bring a hidden köşk back (SYSTEM_ADMIN only)",
    description:
      'nizam/09 "Geri al". 409 (KOSK_NOT_HIDDEN) when it is not hidden. Written to the audit log.',
    operationId: "restoreKosk",
  })
  @ApiOkResponse({ type: KoskDirectoryItemResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "KOSK_NOT_HIDDEN" })
  // Exempt: SYSTEM_ADMIN's, checked by the service — the same decision the
  // archive makes for a köşk (`archive/kosk/:id/restore`).
  @AuthzExempt()
  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  restore(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<KoskDirectoryItemResponse> {
    return this.admin.restore(request.user, id);
  }
}
