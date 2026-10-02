import { AuthGuard } from "@medaris/common";
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
import { BAN_SCOPES, type BanScope } from "../database/schema/ban.schema";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  BanService,
  type IAllBansList,
  type IBanList,
  type IBanView,
} from "./ban.service";
import {
  AllBansListResponse,
  BAN_LIST_LIMIT_MAX,
  BAN_STATUSES,
  BanListResponse,
  BanResponse,
  type BanStatus,
  CreateBanDto,
  ExtendBanDto,
  LiftBanDto,
} from "./dto/ban.dto";

const person = (p: {
  id: string;
  name: string | null;
  email: string | null;
}) => ({
  id: p.id,
  name: p.name,
  email: p.email,
});

export const presentBan = (b: IBanView): BanResponse => ({
  id: b.id,
  user: person(b.user),
  scope: b.scope,
  koskId: b.koskId,
  koskName: b.koskName,
  courseId: b.courseId,
  courseTitle: b.courseTitle,
  madrasahName: b.madrasahName,
  extendedFromCourseId: b.extendedFromCourseId,
  extendedFromCourseTitle: b.extendedFromCourseTitle,
  reason: b.reason,
  bannedBy: person(b.bannerPerson),
  bannedRole: b.bannedRole,
  createdAt: b.createdAt,
  liftedAt: b.liftedAt,
  liftedBy: b.lifterPerson ? person(b.lifterPerson) : null,
  liftReason: b.liftReason,
  viewerMayLift: b.viewerMayLift,
  viewerMayExtend: b.viewerMayExtend,
});

const presentList = (list: IBanList): BanListResponse => ({
  items: list.items.map(presentBan),
  activeCount: list.activeCount,
  liftedCount: list.liftedCount,
  recentCount: list.recentCount,
});

const presentAll = (list: IAllBansList): AllBansListResponse => ({
  ...presentList(list),
  total: list.total,
});

/**
 * Bans (MDRS-177, screens nizam/41 and nizam/42). Like `ArchiveController`,
 * no `AuthzGuard`: the matrix has no ban entity, and `BanService` makes the
 * one decision every route shares, the kademe rule.
 *
 * The reason of a ban is returned here, to people who place and lift bans,
 * and nowhere a talebe reads: no course, enrollment or profile response of
 * theirs carries it.
 */
@ApiTags("bans")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class BanController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly bans: BanService) {}

  @ApiOperation({
    summary: "Bar a talebe from a course or its köşk (Yasakla)",
    description:
      "Takes effect at once: the talebe cannot enroll, apply again or leave, and loses the course's content. A COURSE ban is the course's müderris's and above; a KOSK ban, placed from this course, is the köşk nazımı's and above. Barring someone already barred in that scope returns the standing ban. The reason is kept for those who see and lift bans and never sent to the talebe.",
    operationId: "createBan",
  })
  @ApiCreatedResponse({ type: BanResponse })
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @ApiNotFoundResponse()
  @Post("courses/:courseId/bans")
  create(
    @Req() request: AuthenticatedUserRequest,
    @Param("courseId", ParseUUIDPipe) courseId: string,
    @Body() dto: CreateBanDto
  ): Promise<BanResponse> {
    return this.bans.create(request.user, courseId, dto).then(presentBan);
  }

  @ApiOperation({
    summary: "A köşk's bans, open or lifted (Yasaklamalar)",
    description:
      "Newest first, with the counts the tabs show. The köşk's nazım and above. Each row says whether the caller's kademe reaches the ban's (`viewerMayLift`).",
    operationId: "listKoskBans",
  })
  @ApiQuery({ name: "status", required: false, enum: BAN_STATUSES })
  @ApiOkResponse({ type: BanListResponse })
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @ApiNotFoundResponse()
  @Get("kosks/:koskId/bans")
  async listKosk(
    @Req() request: AuthenticatedUserRequest,
    @Param("koskId", ParseUUIDPipe) koskId: string,
    @Query(
      "status",
      new DefaultValuePipe("ACTIVE"),
      new ParseEnumPipe(BAN_STATUSES)
    )
    status: BanStatus
  ): Promise<BanListResponse> {
    return presentList(
      await this.bans.listForKosk(request.user, koskId, status)
    );
  }

  @ApiOperation({
    summary: "Every ban of every köşk, open or lifted (Medaris Yasaklamalar)",
    description:
      "Newest first, one page at a time, with platform-wide counts for the tabs. Medaris administration only: the başnazım and the Medaris nazımı. `q` matches the person's name or e-mail; `scope` keeps one scope.",
    operationId: "listAllBans",
  })
  @ApiQuery({ name: "status", required: false, enum: BAN_STATUSES })
  @ApiQuery({
    name: "scope",
    required: false,
    enum: Object.values(BAN_SCOPES),
  })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiOkResponse({ type: AllBansListResponse })
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @Get("bans")
  async listAll(
    @Req() request: AuthenticatedUserRequest,
    @Query(
      "status",
      new DefaultValuePipe("ACTIVE"),
      new ParseEnumPipe(BAN_STATUSES)
    )
    status: BanStatus,
    @Query(
      "scope",
      new ParseEnumPipe(Object.values(BAN_SCOPES), { optional: true })
    )
    scope?: BanScope,
    @Query("q") q?: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset = 0
  ): Promise<AllBansListResponse> {
    return presentAll(
      await this.bans.listAll(request.user, {
        status,
        scope,
        // A repeated query key arrives as an array; only a single value is read.
        q: typeof q === "string" ? q.slice(0, 100) : undefined,
        limit: Math.min(Math.max(limit, 1), BAN_LIST_LIMIT_MAX),
        offset: Math.max(offset, 0),
      })
    );
  }

  @ApiOperation({
    summary: "Widen a course ban to the whole köşk (Yasağı genişlet)",
    description:
      "Opens a KOSK ban for the same person with its own reason and leaves the course ban standing; the audit row says `ban.extend`. The köşk's nazım and above. A person already barred from the köşk gets the standing ban back.",
    operationId: "extendBan",
  })
  @ApiOkResponse({ type: BanResponse })
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "BAN_ALREADY_LIFTED" })
  @Post("bans/:banId/extend")
  @HttpCode(HttpStatus.OK)
  extend(
    @Req() request: AuthenticatedUserRequest,
    @Param("banId", ParseUUIDPipe) banId: string,
    @Body() dto: ExtendBanDto
  ): Promise<BanResponse> {
    return this.bans.extend(request.user, banId, dto).then(presentBan);
  }

  @ApiOperation({
    summary: "Lift a ban with a reason (Yasağı kaldır)",
    description:
      "Only the kademe that placed the ban, or a higher one: a Medaris nazımı's ban is lifted by Medaris administration alone. The reason and the lifter's name are kept with the ban.",
    operationId: "liftBan",
  })
  @ApiOkResponse({ type: BanResponse })
  @ApiForbiddenResponse({ description: "BAN_LIFT_FORBIDDEN" })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "BAN_ALREADY_LIFTED" })
  @Post("bans/:banId/lift")
  @HttpCode(HttpStatus.OK)
  lift(
    @Req() request: AuthenticatedUserRequest,
    @Param("banId", ParseUUIDPipe) banId: string,
    @Body() dto: LiftBanDto
  ): Promise<BanResponse> {
    return this.bans.lift(request.user, banId, dto).then(presentBan);
  }
}
