import { AuthGuard } from "@medaris/common";
import {
  Controller,
  Get,
  Header,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { AuditPageQuery, AuditPageResponse, AuditQuery } from "./audit.dto";
import { AuditService } from "./audit.service";

/**
 * The audit trail (MDRS-181, nizam/17). Read-only by construction: this
 * controller has no route that writes, updates or deletes. No `AuthzGuard`:
 * the engine has no entity for it, so `AuditService` decides, the başnazım or a
 * Medaris nazımı holding "Denetim kaydını oku", and everyone else is a 403.
 */
@ApiTags("nizam")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("nizam/audit-log")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @ApiOperation({
    summary: "The audit trail, newest first",
    description:
      "Filters combine. Fifty records a page; pass `nextCursor` as `cursor` for the older ones. Köşk nazımları, başmüderrisler and everyone else get 403.",
    operationId: "listAuditLog",
  })
  @ApiOkResponse({ type: AuditPageResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @Get()
  list(
    @Req() request: AuthenticatedUserRequest,
    @Query() query: AuditPageQuery
  ): Promise<AuditPageResponse> {
    const { cursor, ...filter } = query;
    return this.audit.list(request.user, filter, cursor);
  }

  @ApiOperation({
    summary: "The filtered records as a CSV file",
    description:
      "The same filters as the list, without paging (at most 10 000 records). The export is itself written to the trail as `audit.export`.",
    operationId: "exportAuditLog",
  })
  @ApiOkResponse({ type: StreamableFile })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse()
  @Header("Cache-Control", "private, no-store")
  @Get("export")
  async export(
    @Req() request: AuthenticatedUserRequest,
    @Query() query: AuditQuery
  ): Promise<StreamableFile> {
    const csv = await this.audit.export(request.user, query);
    return new StreamableFile(Buffer.from(`﻿${csv}`, "utf8"), {
      type: "text/csv; charset=utf-8",
      disposition: 'attachment; filename="denetim-kaydi.csv"',
    });
  }
}
