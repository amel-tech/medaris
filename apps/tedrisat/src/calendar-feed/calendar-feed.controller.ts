import { Controller, Get, Header, Param, StreamableFile } from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CalendarFeedService } from "./calendar-feed.service";

/**
 * The route's per-address budget, raised above the shared default.
 *
 * Every read arrives through tedris-web, so one address carries every
 * subscriber's calendar app; the shared 100 a minute would start refusing
 * real feeds at a few thousand hourly subscribers. What this bounds is one
 * client trying made-up tokens. A single feed has its own, much lower limit,
 * counted per resolved token in `CalendarFeedService` (`FeedPollLimiter`).
 */
export const CALENDAR_FEED_THROTTLE = { limit: 600, ttl: 60_000 };

/**
 * `GET /calendar/<token>.ics` (MDRS-120). No `AuthGuard`: a calendar app
 * cannot sign in, so the secret in the URL is the credential. The answer
 * holds course and session titles and times, links to the session pages,
 * and never a meeting link.
 */
@ApiTags("calendar")
@Controller("calendar")
export class CalendarFeedController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly feeds: CalendarFeedService) {}

  @ApiOperation({
    summary: "A personal calendar feed for Apple Calendar and Google Calendar",
    description:
      "Every session of every course the feed's owner is enrolled in, teaches or manages, from 30 days back to 180 days ahead. Removed sessions carry `STATUS:CANCELLED`; UIDs and SEQUENCE are those of `GET /lessons/:id/calendar.ics` (MDRS-117). No meeting links.",
    operationId: "getCalendarFeed",
  })
  @ApiProduces("text/calendar")
  @ApiOkResponse({ schema: { type: "string" } })
  @ApiNotFoundResponse({
    description:
      "No feed has this URL: never issued, or replaced (CALENDAR_FEED_NOT_FOUND).",
  })
  @ApiTooManyRequestsResponse()
  @ApiServiceUnavailableResponse({
    description:
      "TEDRIS_WEB_URL is not configured on this server (CALENDAR_NOT_CONFIGURED).",
  })
  @Get(":file")
  @Throttle({ default: CALENDAR_FEED_THROTTLE })
  // The URL is the credential; no shared cache may keep what it returned.
  @Header("Cache-Control", "private, no-store")
  @Header("X-Robots-Tag", "noindex")
  async feed(@Param("file") file: string): Promise<StreamableFile> {
    const ics = await this.feeds.feed(file);
    return new StreamableFile(Buffer.from(ics, "utf8"), {
      type: "text/calendar; charset=utf-8",
      disposition: 'inline; filename="medaris.ics"',
    });
  }
}
