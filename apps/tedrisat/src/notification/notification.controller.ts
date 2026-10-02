import { AuthGuard } from "@medaris/common";
import {
  BadRequestException,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedUserRequest } from "../user/interfaces/authenticated-user-request.interface";
import {
  NotificationCountsResponse,
  NotificationResponse,
  PaginatedNotificationResponse,
  ReadAllNotificationsResponse,
} from "./dto/notification-response.dto";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  NotificationService,
} from "./notification.service";
import {
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
  NotificationStatus,
  parseNotificationTypes,
} from "./notification-types";

/**
 * The caller's own notifications (MDRS-167, screen tedris/36). Like
 * `MeController`, no `AuthzGuard`: every route is scoped to
 * `request.user.sub` in its query, so another person's notification is
 * indistinguishable from one that does not exist.
 */
@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("notifications")
export class NotificationController {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly notifications: NotificationService) {}

  @ApiOperation({
    summary: "The caller's notifications, newest first",
    operationId: "listNotifications",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: NOTIFICATION_STATUSES,
    description: "`unread` leaves out what the caller has read. Default `all`.",
  })
  @ApiQuery({
    name: "types",
    required: false,
    type: String,
    description: `Comma separated; only these types are listed. Any of ${NOTIFICATION_TYPES.join(", ")}.`,
  })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: `1 to ${MAX_PAGE_SIZE}; default ${DEFAULT_PAGE_SIZE}.`,
  })
  @ApiOkResponse({ type: PaginatedNotificationResponse })
  @ApiBadRequestResponse({
    description:
      "A cursor this server did not issue (INVALID_NOTIFICATION_CURSOR).",
  })
  @Get()
  async list(
    @Req() request: AuthenticatedUserRequest,
    @Query(
      "status",
      new DefaultValuePipe("all"),
      new ParseEnumPipe(NOTIFICATION_STATUSES)
    )
    status: NotificationStatus,
    @Query("types") types: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Query("limit", new DefaultValuePipe(DEFAULT_PAGE_SIZE), ParseIntPipe)
    limit: number
  ): Promise<PaginatedNotificationResponse> {
    const parsed = parseNotificationTypes(types);
    if (parsed === null) {
      throw new BadRequestException({
        code: "INVALID_NOTIFICATION_TYPES",
        message: `types must be a comma separated list of: ${NOTIFICATION_TYPES.join(", ")}`,
      });
    }
    return this.notifications.list(request.user.sub, {
      status,
      types: parsed,
      cursor: cursor || undefined,
      limit,
    });
  }

  // Declared before `:id` routes only for reading order; `POST :id/read`
  // and `GET unread-count` cannot collide.
  @ApiOperation({
    summary: "How many notifications the caller has, and how many are unread",
    description:
      '`unread` is what the bell announces; `total` is the "all" tab\'s count.',
    operationId: "getNotificationCounts",
  })
  @ApiOkResponse({ type: NotificationCountsResponse })
  @Get("unread-count")
  async counts(
    @Req() request: AuthenticatedUserRequest
  ): Promise<NotificationCountsResponse> {
    return this.notifications.counts(request.user.sub);
  }

  @ApiOperation({
    summary: "Mark every unread notification of the caller read",
    operationId: "markAllNotificationsRead",
  })
  @ApiOkResponse({ type: ReadAllNotificationsResponse })
  @Post("read-all")
  @HttpCode(200)
  async readAll(
    @Req() request: AuthenticatedUserRequest
  ): Promise<ReadAllNotificationsResponse> {
    return this.notifications.markAllRead(request.user.sub);
  }

  @ApiOperation({
    summary: "Mark one notification read",
    description: "Idempotent: a notification already read keeps its `readAt`.",
    operationId: "markNotificationRead",
  })
  @ApiOkResponse({ type: NotificationResponse })
  @ApiNotFoundResponse({
    description:
      "No such notification, or it is another person's (NOTIFICATION_NOT_FOUND).",
  })
  @Post(":id/read")
  @HttpCode(200)
  async read(
    @Req() request: AuthenticatedUserRequest,
    @Param("id", ParseUUIDPipe) id: string
  ): Promise<NotificationResponse> {
    return this.notifications.markRead(request.user.sub, id);
  }
}
