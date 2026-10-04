import {
  AuthGuard,
  Authz,
  AuthzExempt,
  AuthzGuard,
  byParam,
  ENTITIES,
} from "@medaris/common";
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
import { byExistingKosk } from "../kosk/kosk.controller";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { ArchiveService } from "./archive.service";
import { presentPage } from "./archive-present";
import {
  ARCHIVE_ITEM_TYPES,
  ArchiveItemType,
  COURSE_ARCHIVE_ITEM_TYPES,
  DEFAULT_ARCHIVE_PAGE_SIZE,
  MAX_ARCHIVE_PAGE_SIZE,
} from "./archive-types";
import { ArchiveTypesPipe } from "./archive-types.pipe";
import {
  ArchiveImpactResponse,
  ArchiveRestoreResponse,
  ArchiveScopesResponse,
  PaginatedArchiveResponse,
  PaginatedCourseArchiveResponse,
} from "./dto/archive-response.dto";
import {
  COURSE_ARCHIVE_READ_CODES,
  KOSK_ARCHIVE_READ_CODES,
} from "./hide-codes";

const typePipe = new ParseEnumPipe(ARCHIVE_ITEM_TYPES, { optional: true });
const requiredTypePipe = new ParseEnumPipe(ARCHIVE_ITEM_TYPES);

const clampPage = (page: number) => (page < 1 ? 1 : page);
const clampLimit = (limit: number) =>
  Math.min(Math.max(limit, 1), MAX_ARCHIVE_PAGE_SIZE);

/**
 * The archive of hidden things (MDRS-173, screens nizam/28 and nizam/29).
 *
 * Reading a köşk's or a course's archive is an `@Authz` on its route. The
 * platform-wide reads and the real delete are the başnazım's (the service
 * refuses anyone else), and a restore is decided per item by the kademe: which
 * catalogue codes count depends on what the item is, so it is `@AuthzExempt`
 * on purpose, as `POST /kosks/:id/restore` is.
 */
@ApiTags("archive")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller()
export class ArchiveController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly archive: ArchiveService) {}

  @ApiOperation({
    summary: "What is hidden in a köşk",
    description:
      "Newest hidden first: the köşk's courses, weeks, sessions and decks, and the same of the medrese courses it hosts. A köşk manager (`kosk.manage`), a Medaris nazımı holding `platform.kosk_edit`, or SYSTEM_ADMIN. Each item says whether the caller may bring it back (`canRestore`): false for what was hidden at a level above theirs. There is no delete here; the başnazım deletes from the platform archive.",
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
  @Authz(KOSK_ARCHIVE_READ_CODES, byExistingKosk)
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
    summary: "What is hidden in a course (its team)",
    description:
      "Newest hidden first: the course's hidden weeks and sessions, for the course team (`week.hide`: the müderrisler, the köşk's nazımları and the başmüderris of a medrese course by default, a ders nazırı once given). A session is listed only while its week is shown. Each item says whether the caller may bring it back (`canRestore`).",
    operationId: "listCourseArchive",
  })
  @ApiQuery({
    name: "types",
    required: false,
    type: String,
    description: `Comma-separated, from ${COURSE_ARCHIVE_ITEM_TYPES.join(", ")}; default both.`,
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: `1 to ${MAX_ARCHIVE_PAGE_SIZE}; default ${DEFAULT_ARCHIVE_PAGE_SIZE}.`,
  })
  @ApiOkResponse({ type: PaginatedCourseArchiveResponse })
  @ApiForbiddenResponse({ description: "Not on this course's team." })
  @ApiNotFoundResponse()
  @Get("courses/:id/archive")
  @Authz(COURSE_ARCHIVE_READ_CODES, byParam(ENTITIES.COURSE))
  async listCourse(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("types", new ArchiveTypesPipe()) types?: ArchiveItemType[],
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query(
      "limit",
      new DefaultValuePipe(DEFAULT_ARCHIVE_PAGE_SIZE),
      ParseIntPipe
    )
    limit = DEFAULT_ARCHIVE_PAGE_SIZE
  ): Promise<PaginatedCourseArchiveResponse> {
    const result = await this.archive.listForCourse(request.user, id, {
      types,
      page: clampPage(page),
      limit: clampLimit(limit),
    });
    return { ...presentPage(result), counts: result.counts };
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
  @AuthzExempt()
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
  @AuthzExempt()
  scopes(
    @Req() request: AuthenticatedUserRequest
  ): Promise<ArchiveScopesResponse> {
    return this.archive.scopes(request.user);
  }

  @ApiOperation({
    summary: "Bring a hidden item back (Geri al)",
    description:
      "By kademe, as the bans are lifted (MDRS-135): the level that hid an item, or any level above it, brings it back. The ladder is course < medrese < köşk < platform; a hide records the level its hider acted at, and one recorded by nobody counts as the lowest level that could have hidden it. A course, and the weeks and sessions in one, are restored at the level the caller acts at on the course, exactly as `POST /courses/:id/archive` records it: the köşk's nazımı (`course.hide`), the başmüderris or a nazır given `madrasah.course_hide`, platform management (`platform.course_hide`); a week or a session also at the course's own level, by whoever does its session work (`week.hide` or `session.manage`), and a week that brings no session back also by its editor (`course.edit`), which is where they hide them. A deck is its köşk nazımı's; SYSTEM_ADMIN restores anything. Every restore is written to the audit log as `<type>.restore` with the level. Someone who acts at no level there answers 403 (ARCHIVE_FORBIDDEN); a lower level than the one that hid it answers 403 (ARCHIVE_RESTORE_LEVEL) naming both, compared under the row lock. A course, week or session whose parent is still hidden answers 409 (ARCHIVE_PARENT_HIDDEN); one of a hidden köşk answers 404 to everyone but the people above the köşk.",
    operationId: "restoreArchiveItem",
  })
  @ApiOkResponse({ type: ArchiveRestoreResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "ARCHIVE_PARENT_HIDDEN" })
  @Post("archive/:type/:id/restore")
  @HttpCode(HttpStatus.OK)
  @AuthzExempt()
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
  @AuthzExempt()
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
  @AuthzExempt()
  async remove(
    @Req() request: AuthenticatedUserRequest,
    @Param("type", requiredTypePipe) type: ArchiveItemType,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.archive.delete(request.user, type, id);
  }
}
