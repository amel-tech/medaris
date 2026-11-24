import { AuthGuard, Authz, AuthzGuard, PERMISSIONS } from "@medaris/common";
import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseEnumPipe,
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
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  KOSK_SESSION_TABS,
  KoskRecordingListResponse,
  KoskSessionListResponse,
  type KoskSessionTab,
  KoskStudentListResponse,
} from "./dto/kosk-lists.dto";
import { byExistingKosk } from "./kosk.controller";
import { KoskListsService } from "./kosk-lists.service";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;
/** Far past any real list; keeps the offset a number Postgres takes. */
const MAX_PAGE = 100_000;

const paging = (page: number, limit: number) => ({
  page: Math.min(Math.max(page, 1), MAX_PAGE),
  limit: Math.min(Math.max(limit, 1), MAX_PAGE_SIZE),
});

/**
 * Celseler, Talebeler and Ders kayıtları for a whole köşk (MDRS-211): the
 * three entries of Nizam's köşk menu that list across every course. Reads
 * only; each row leads to the course's own page, where the work is done.
 * Declared before `KoskController` in the module, like `KoskAdminController`.
 */
@ApiTags("kosks")
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthzGuard)
@Controller("kosks")
export class KoskListsController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly lists: KoskListsService) {}

  @ApiOperation({
    summary: "Every course's live sessions for the köşk (Celseler)",
    description:
      "The live sessions of the köşk's published, shown courses, a page at a time: `tab=UPCOMING` is everything not over yet, soonest first, `tab=PAST` everything that is over, latest first. Cancelled sessions stay listed and say so. No meeting link is sent: that is the course's own Celseler page; `inPerson` is sent only to a caller holding `kosk.manage`. For the köşk's nazımları and the başnazım, and a Medaris nazımı holding `platform.kosk_edit`. A course in a passive scope is left out for everyone but the köşk's nazımları and holders of `platform.inactive_scopes_manage`.",
    operationId: "listKoskSessions",
  })
  @ApiQuery({ name: "tab", required: false, enum: KOSK_SESSION_TABS })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: KoskSessionListResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/sessions")
  @Authz(
    [PERMISSIONS.KOSK_MANAGE, PERMISSIONS.PLATFORM_KOSK_EDIT],
    byExistingKosk
  )
  sessions(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query(
      "tab",
      new DefaultValuePipe("UPCOMING"),
      new ParseEnumPipe(KOSK_SESSION_TABS)
    )
    tab: KoskSessionTab,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    limit: number
  ): Promise<KoskSessionListResponse> {
    return this.lists.sessions(id, request.user, tab, paging(page, limit));
  }

  @ApiOperation({
    summary: "The köşk's talebe, a page at a time (Talebeler)",
    description:
      "Everyone enrolled in, or who completed, a course of the köşk that is not hidden: one row a person, newest first by first enrollment, each with all of their courses in the köşk, and how many applications wait (`pendingCount`). `q` matches the name or the e-mail address. Names and addresses are personal data: for the köşk's nazımları and the başnazım alone (`kosk.manage`; `platform.kosk_edit` does not open it, as it does not open the applicants), and every read is written to `audit_log` as a roster read on the köşk. A course in a passive scope is left out for everyone but the köşk's nazımları and holders of `platform.inactive_scopes_manage`.",
    operationId: "listKoskStudents",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiOkResponse({ type: KoskStudentListResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/students")
  @Authz(PERMISSIONS.KOSK_MANAGE, byExistingKosk)
  students(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    limit: number,
    @Query("q") q?: string
  ): Promise<KoskStudentListResponse> {
    return this.lists.students(
      id,
      request.user,
      // A repeated query key arrives as an array; only a single value is read.
      typeof q === "string" ? q.slice(0, MAX_SEARCH_LENGTH) : undefined,
      paging(page, limit)
    );
  }

  @ApiOperation({
    summary: "Every course's ders kayıtları for the köşk (Ders kayıtları)",
    description:
      "The ders kayıtları of the köşk's shown courses, a page at a time, ordered by course, then the latest week, then the latest session: each with its course, week, session time, source, status and visibility. No address is sent: watching and editing are the course's own page. Which recordings a course shows is decided by its own content rule (visibility, a closed course, a failed upload); this list shows them all, so it is for the köşk's nazımları and the başnazım alone (`kosk.manage`; `platform.kosk_edit` does not open it). A course in a passive scope is left out for everyone but the köşk's nazımları and holders of `platform.inactive_scopes_manage`.",
    operationId: "listKoskRecordings",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: KoskRecordingListResponse })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @Get(":id/recordings")
  @Authz(PERMISSIONS.KOSK_MANAGE, byExistingKosk)
  recordings(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    limit: number
  ): Promise<KoskRecordingListResponse> {
    return this.lists.recordings(id, request.user, paging(page, limit));
  }
}
