import { AuthGuard, Authz, AuthzGuard } from "@medaris/common";
import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { byExistingMadrasah } from "../madrasah/madrasah.controller";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { ArchiveService } from "./archive.service";
import { presentItem } from "./archive-present";
import {
  ArchiveItemType,
  DEFAULT_ARCHIVE_PAGE_SIZE,
  MADRASAH_ARCHIVE_ITEM_TYPES,
  MAX_ARCHIVE_PAGE_SIZE,
} from "./archive-types";
import { ArchiveTypesPipe } from "./archive-types.pipe";
import { PaginatedMadrasahArchiveResponse } from "./dto/archive-response.dto";
import { MADRASAH_ARCHIVE_READ_CODES } from "./hide-codes";

/**
 * A medrese's archive (MDRS-185, nazir/12). Whoever may hide in the medrese or
 * bring something back reads it: `madrasah.course_hide`, `madrasah.hide`,
 * `platform.madrasah_edit` (and `madrasah.settings_edit`, which opened it
 * before). They are the başmüderris's by default, a nazır's once given, and
 * Medaris yönetimi's with the platform code. Bringing an item back is
 * `POST /archive/:type/:id/restore`, which decides by kademe.
 */
@ApiTags("archive")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("madrasahs")
export class MadrasahArchiveController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly archive: ArchiveService) {}

  @ApiOperation({
    summary: "What is hidden in a medrese (its başmüderris)",
    description: `nazir/12's table, newest hidden first: the medrese's hidden courses and the weeks and sessions in them. \`counts\` are the tabs' numbers. Each item says whether the caller may bring it back (\`canRestore\`); a recording has no storage yet, so none is listed.`,
    operationId: "listMadrasahArchive",
  })
  @ApiQuery({
    name: "types",
    required: false,
    type: String,
    description: `Comma-separated, from ${MADRASAH_ARCHIVE_ITEM_TYPES.join(", ")}; default all of them. "Haftalar ve celseler" is \`week,session\`.`,
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: `1 to ${MAX_ARCHIVE_PAGE_SIZE}; default ${DEFAULT_ARCHIVE_PAGE_SIZE}.`,
  })
  @ApiOkResponse({ type: PaginatedMadrasahArchiveResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/archive")
  @Authz(MADRASAH_ARCHIVE_READ_CODES, byExistingMadrasah)
  async list(
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
  ): Promise<PaginatedMadrasahArchiveResponse> {
    const result = await this.archive.listForMadrasah(request.user, id, {
      types,
      page: page < 1 ? 1 : page,
      limit: Math.min(Math.max(limit, 1), MAX_ARCHIVE_PAGE_SIZE),
    });
    return {
      items: result.items.map(presentItem),
      total: result.total,
      page: result.page,
      limit: result.limit,
      madrasah: result.madrasah,
      counts: result.counts,
    };
  }
}
