import { AuthGuard } from "@medaris/common";
import {
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
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { ArchiveService } from "./archive.service";
import { presentPage } from "./archive-present";
import {
  ARCHIVE_ITEM_TYPES,
  ArchiveItemType,
  DEFAULT_ARCHIVE_PAGE_SIZE,
  MAX_ARCHIVE_PAGE_SIZE,
} from "./archive-types";
import {
  ArchiveImpactResponse,
  ArchiveRestoreResponse,
  ArchiveScopesResponse,
  PaginatedArchiveResponse,
} from "./dto/archive-response.dto";

const typePipe = new ParseEnumPipe(ARCHIVE_ITEM_TYPES, { optional: true });
const requiredTypePipe = new ParseEnumPipe(ARCHIVE_ITEM_TYPES);

const clampPage = (page: number) => (page < 1 ? 1 : page);
const clampLimit = (limit: number) =>
  Math.min(Math.max(limit, 1), MAX_ARCHIVE_PAGE_SIZE);

/**
 * The archive of hidden things (MDRS-173, screens nizam/28 and nizam/29).
 * Like `NizamController`, no `AuthzGuard`: the engine has no archive entity,
 * so `ArchiveService` makes the one decision every route shares — the Medaris
 * başnazımı (SYSTEM_ADMIN), or for a köşk's own contents, a manager of it.
 */
@ApiTags("archive")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ArchiveController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly archive: ArchiveService) {}

  @ApiOperation({
    summary: "What is hidden in a köşk",
    description:
      "Newest hidden first: the köşk's courses, weeks, sessions and decks, and the same of the medrese courses it hosts. A köşk manager or SYSTEM_ADMIN. There is no delete here; the başnazım deletes from the platform archive.",
    operationId: "listKoskArchive",
  })
  @ApiQuery({ name: "type", required: false, enum: ARCHIVE_ITEM_TYPES })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: `1 to ${MAX_ARCHIVE_PAGE_SIZE}; default ${DEFAULT_ARCHIVE_PAGE_SIZE}.`,
  })
  @ApiOkResponse({ type: PaginatedArchiveResponse })
  @ApiForbiddenResponse({ description: "Not a manager of this köşk." })
  @ApiNotFoundResponse()
  @Get("kosks/:id/archive")
  async listKosk(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("type", typePipe) type?: ArchiveItemType,
    @Query("q") q?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query(
      "limit",
      new DefaultValuePipe(DEFAULT_ARCHIVE_PAGE_SIZE),
      ParseIntPipe
    )
    limit = DEFAULT_ARCHIVE_PAGE_SIZE
  ): Promise<PaginatedArchiveResponse> {
    return presentPage(
      await this.archive.listForKosk(request.user, id, {
        type,
        q: q?.trim() || undefined,
        page: clampPage(page),
        limit: clampLimit(limit),
      })
    );
  }

  @ApiOperation({
    summary: "What is hidden on the whole platform",
    description:
      "Newest hidden first, across every köşk and medrese. The Medaris başnazımı (SYSTEM_ADMIN) only.",
    operationId: "listArchive",
  })
  @ApiQuery({ name: "koskId", required: false, type: String, format: "uuid" })
  @ApiQuery({
    name: "madrasahId",
    required: false,
    type: String,
    format: "uuid",
  })
  @ApiQuery({ name: "type", required: false, enum: ARCHIVE_ITEM_TYPES })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: PaginatedArchiveResponse })
  @ApiForbiddenResponse({ description: "Not the başnazım." })
  @Get("archive")
  async listPlatform(
    @Req() request: AuthenticatedUserRequest,
    @Query("koskId", new ParseUUIDPipe({ optional: true })) koskId?: string,
    @Query("madrasahId", new ParseUUIDPipe({ optional: true }))
    madrasahId?: string,
    @Query("type", typePipe) type?: ArchiveItemType,
    @Query("q") q?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query(
      "limit",
      new DefaultValuePipe(DEFAULT_ARCHIVE_PAGE_SIZE),
      ParseIntPipe
    )
    limit = DEFAULT_ARCHIVE_PAGE_SIZE
  ): Promise<PaginatedArchiveResponse> {
    return presentPage(
      await this.archive.listForPlatform(request.user, {
        koskId,
        madrasahId,
        type,
        q: q?.trim() || undefined,
        page: clampPage(page),
        limit: clampLimit(limit),
      })
    );
  }

  @ApiOperation({
    summary: "The köşks and medreses that hold something hidden",
    description:
      "Options for the platform archive's scope filter. SYSTEM_ADMIN only.",
    operationId: "getArchiveScopes",
  })
  @ApiOkResponse({ type: ArchiveScopesResponse })
  @ApiForbiddenResponse()
  @Get("archive/scopes")
  scopes(
    @Req() request: AuthenticatedUserRequest
  ): Promise<ArchiveScopesResponse> {
    return this.archive.scopes(request.user);
  }

  @ApiOperation({
    summary: "Bring a hidden item back (Geri al)",
    description:
      "By kademe, as the bans are lifted (MDRS-135): the level that hid an item, or any level above it, brings it back. The ladder is course < medrese < köşk < platform; a hide records the level its hider acted at, and one recorded by nobody counts as the lowest level that could have hidden it. A köşk manager restores courses, weeks, sessions and decks of their köşk, a medrese's başmüderris what sits in their medrese, SYSTEM_ADMIN anything; a lower level than the one that hid it answers 403 (ARCHIVE_RESTORE_LEVEL) naming both. A week or session whose parent is still hidden answers 409 (ARCHIVE_PARENT_HIDDEN).",
    operationId: "restoreArchiveItem",
  })
  @ApiOkResponse({ type: ArchiveRestoreResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "ARCHIVE_PARENT_HIDDEN" })
  @Post("archive/:type/:id/restore")
  @HttpCode(HttpStatus.OK)
  restore(
    @Req() request: AuthenticatedUserRequest,
    @Param("type", requiredTypePipe) type: ArchiveItemType,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ArchiveRestoreResponse> {
    return this.archive.restore(request.user, type, id);
  }

  @ApiOperation({
    summary: "What deleting a hidden item for real would take with it",
    description: "The counts the confirmation shows. SYSTEM_ADMIN only.",
    operationId: "getArchiveImpact",
  })
  @ApiOkResponse({ type: ArchiveImpactResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get("archive/:type/:id/impact")
  impact(
    @Req() request: AuthenticatedUserRequest,
    @Param("type", requiredTypePipe) type: ArchiveItemType,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<ArchiveImpactResponse> {
    return this.archive.impact(request.user, type, id);
  }

  @ApiOperation({
    summary: "Delete a hidden item for real (Kalıcı olarak sil)",
    description:
      "The item and everything under it, in one transaction, with an audit entry that names the caller. Only a hidden item can be deleted. SYSTEM_ADMIN only; irreversible.",
    operationId: "deleteArchiveItem",
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Delete("archive/:type/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() request: AuthenticatedUserRequest,
    @Param("type", requiredTypePipe) type: ArchiveItemType,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.archive.delete(request.user, type, id);
  }
}
