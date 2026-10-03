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
  ApiBadRequestResponse,
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
import { BanService, type IAllBansList } from "./ban.service";
import { presentBan, presentList, presentMadrasahBan } from "./ban-present";
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
import { BanReasonDto, MadrasahBanResponse } from "./dto/madrasah-ban.dto";

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
      "Only the kademe that placed the ban, or a higher one: a Medaris nazımı's ban is lifted by Medaris administration alone. The reason and the lifter's name are kept with the ban. A medrese's nazır and başmüderris lift bans in the medrese's courses and over the medrese (MDRS-187).",
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

  @ApiOperation({
    summary: "Widen a course ban to the whole medrese (Medreseden de yasakla)",
    description:
      "For an open course ban in a course of a medrese: a second ban beside the first, which stays, barring the talebe from every course of the medrese, present and future. A medrese nazır or above of that medrese; a köşk nazımı or a müderris is not one. The person already barred from the medrese gets that ban back. 409 (BAN_NOT_ESCALATABLE) for any other ban.",
    operationId: "escalateBan",
  })
  @ApiCreatedResponse({ type: MadrasahBanResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: "BAN_ALREADY_LIFTED or BAN_NOT_ESCALATABLE",
  })
  @Post("bans/:banId/escalate")
  escalate(
    @Req() request: AuthenticatedUserRequest,
    @Param("banId", ParseUUIDPipe) banId: string,
    @Body() dto: BanReasonDto
  ): Promise<MadrasahBanResponse> {
    return this.bans
      .escalate(request.user, banId, dto)
      .then(presentMadrasahBan);
  }

  @ApiOperation({
    summary: "Ask for a ban to be made permanent (Kalıcı yasak talebi aç)",
    description:
      "Records the medrese's request, with its reason, for Medaris administration. Nothing is decided here: the ban stands as it was, and deciding the request is a later phase. A medrese nazır or above, on an open ban in a course of the medrese or over the medrese itself that Medaris administration did not place. One request per ban (409 BAN_PERMANENT_REQUEST_EXISTS).",
    operationId: "requestPermanentBan",
  })
  @ApiCreatedResponse({ type: MadrasahBanResponse })
  @ApiBadRequestResponse()
  @ApiForbiddenResponse({ description: "BAN_FORBIDDEN" })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description:
      "BAN_ALREADY_LIFTED, BAN_PERMANENT_REQUEST_INVALID or BAN_PERMANENT_REQUEST_EXISTS",
  })
  @Post("bans/:banId/permanent-request")
  requestPermanent(
    @Req() request: AuthenticatedUserRequest,
    @Param("banId", ParseUUIDPipe) banId: string,
    @Body() dto: BanReasonDto
  ): Promise<MadrasahBanResponse> {
    return this.bans
      .requestPermanent(request.user, banId, dto)
      .then(presentMadrasahBan);
  }
}
