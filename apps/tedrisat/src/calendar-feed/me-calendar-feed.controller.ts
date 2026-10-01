import { AuthGuard } from "@medaris/common";
import {
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { CalendarFeedService } from "./calendar-feed.service";
import {
  CalendarFeedLinkResponse,
  CalendarFeedStatusResponse,
} from "./dto/calendar-feed-response.dto";

/**
 * The caller's own calendar-feed URL (MDRS-120, screen B11). Like
 * `MeController`, no `AuthzGuard`: both routes act on `request.user.sub`
 * and nothing else.
 */
@ApiTags("me")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("me/calendar-feed")
export class MeCalendarFeedController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly feeds: CalendarFeedService) {}

  @ApiOperation({
    summary: "Whether the caller has a calendar-feed URL",
    operationId: "getMyCalendarFeed",
  })
  @ApiOkResponse({ type: CalendarFeedStatusResponse })
  @Get()
  async status(
    @Req() request: AuthenticatedUserRequest
  ): Promise<CalendarFeedStatusResponse> {
    return this.feeds.status(request.user.sub);
  }

  @ApiOperation({
    summary: "Issue a new calendar-feed URL; the previous one stops working",
    description:
      "The URL is returned this once — only a hash of its secret is stored. The previous URL answers 404 from now on.",
    operationId: "regenerateMyCalendarFeed",
  })
  @ApiOkResponse({ type: CalendarFeedLinkResponse })
  @ApiServiceUnavailableResponse({
    description:
      "TEDRIS_WEB_URL is not configured on this server (CALENDAR_NOT_CONFIGURED).",
  })
  @Post()
  @HttpCode(200)
  async regenerate(
    @Req() request: AuthenticatedUserRequest
  ): Promise<CalendarFeedLinkResponse> {
    return this.feeds.regenerate(request.user.sub);
  }
}
