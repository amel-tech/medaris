import { AuthGuard, Authz, AuthzGuard, PERMISSIONS } from "@medaris/common";
import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  PipeTransform,
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
  ARCHIVE_ITEM_TYPES,
  ArchiveItemType,
  DEFAULT_ARCHIVE_PAGE_SIZE,
  MADRASAH_ARCHIVE_ITEM_TYPES,
  MAX_ARCHIVE_PAGE_SIZE,
} from "./archive-types";
import { PaginatedMadrasahArchiveResponse } from "./dto/archive-response.dto";

/** `types=week,session`: a comma-separated list of archive types, none for all. */
class ArchiveTypesPipe
  implements PipeTransform<unknown, ArchiveItemType[] | undefined>
{
  transform(value: unknown): ArchiveItemType[] | undefined {
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const types = value.split(",").map((t) => t.trim());
    const unknown = types.filter(
      (t) => !(ARCHIVE_ITEM_TYPES as readonly string[]).includes(t)
    );
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Validation failed (unknown archive type: ${unknown.join(", ")})`
      );
    }
    return types as ArchiveItemType[];
  }
}

/**
 * A medrese's archive (MDRS-185, nazir/12). `madrasah.course_hide` (or
 * `madrasah.settings_edit`) is the medrese's başmüderris's and SYSTEM_ADMIN's,
 * and a nazır's once given; bringing an item back is
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
  @Authz(
    [PERMISSIONS.MADRASAH_COURSE_HIDE, PERMISSIONS.MADRASAH_SETTINGS_EDIT],
    byExistingMadrasah
  )
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
      counts: result.counts,
    };
  }
}
