import { AuthGuard } from "@medaris/common";
import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import { ScheduleSessionResponse } from "./dto/schedule-session-response.dto";
import {
  DEFAULT_UPCOMING,
  MAX_UPCOMING,
  ScheduleService,
} from "./schedule.service";
import { MAX_WINDOW_DAYS } from "./schedule-window";

/**
 * The caller's own schedule (MDRS-163, screens tedris/21 and 44). Like
 * `MeController`, no `AuthzGuard`: every route is scoped to `request.user.sub`
 * in its query, so it cannot be pointed at another person's courses.
 */
@ApiTags("sessions")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ScheduleController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly schedule: ScheduleService) {}

  @ApiOperation({
    summary: "The live sessions of the caller's enrolled courses in a window",
    description: `Programım. Only courses the caller is ENROLLED in: a pending request, a completed course and a barred talebe's course are left out. Starts in \`[from, to)\`, soonest first. A cancelled session is kept with \`status: CANCELLED\`; a hidden one is not here. \`meetingUrl\` is null for a cancelled or finished session.`,
    operationId: "listMySessions",
  })
  @ApiQuery({
    name: "from",
    required: true,
    type: String,
    description:
      "ISO 8601 date or date-time with an offset. A bare date is UTC midnight.",
  })
  @ApiQuery({
    name: "to",
    required: true,
    type: String,
    description: `Exclusive end; after \`from\`, at most ${MAX_WINDOW_DAYS} days later.`,
  })
  @ApiOkResponse({ type: ScheduleSessionResponse, isArray: true })
  @ApiBadRequestResponse({
    description: "A missing or malformed window (INVALID_SCHEDULE_WINDOW).",
  })
  @Get("sessions")
  @Header("Cache-Control", "private, no-store")
  async list(
    @Req() request: AuthenticatedUserRequest,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined
  ): Promise<ScheduleSessionResponse[]> {
    return this.schedule.list(request.user.sub, from, to);
  }

  @ApiOperation({
    summary: "The caller's next live sessions",
    description:
      'The phone menu\'s "Sıradaki celse" card and its list. Sessions running now or still ahead, cancelled ones skipped, soonest first.',
    operationId: "listMyUpcomingLessons",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: `1 to ${MAX_UPCOMING}; default ${DEFAULT_UPCOMING}.`,
  })
  @ApiOkResponse({ type: ScheduleSessionResponse, isArray: true })
  @Get("me/upcoming-lessons")
  @Header("Cache-Control", "private, no-store")
  async upcoming(
    @Req() request: AuthenticatedUserRequest,
    @Query("limit", new DefaultValuePipe(DEFAULT_UPCOMING), ParseIntPipe)
    limit: number
  ): Promise<ScheduleSessionResponse[]> {
    return this.schedule.upcoming(request.user.sub, limit);
  }
}
