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
import { BanService, type IBanList, type IBanView } from "./ban.service";
import {
  BAN_STATUSES,
  BanListResponse,
  BanResponse,
  type BanStatus,
  CreateBanDto,
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
