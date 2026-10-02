"use server";

import type {
  NotificationCountsResponse,
  NotificationResponse,
  PaginatedNotificationResponse,
  ReadAllNotificationsResponse,
} from "@medaris/services/tedrisat";
import {
  type AuthenticatedActionResult,
  authenticatedAction,
} from "~/lib/authenticated-action";
import { NIZAM_TYPES } from "./notification-view";

export type NotificationFilter = "all" | "unread";

/** One page of the caller's notifications, `types` narrowing it to some kinds; the first page is read on the server by the page itself. */
export const loadNotifications = async (
  status: NotificationFilter,
  types: string[],
  cursor?: string
): Promise<AuthenticatedActionResult<PaginatedNotificationResponse>> =>
  authenticatedAction((api) =>
    api.notifications.listNotifications({
      status,
      types: types.length > 0 ? types.join(",") : undefined,
      cursor,
    })
  );

export const markNotificationRead = async (
  id: string
): Promise<AuthenticatedActionResult<NotificationResponse>> =>
  authenticatedAction((api) => api.notifications.markNotificationRead({ id }));

export const markAllNotificationsRead = async (): Promise<
  AuthenticatedActionResult<ReadAllNotificationsResponse>
> =>
  authenticatedAction((api) =>
    api.notifications.markAllNotificationsRead({ types: NIZAM_TYPES.join(",") })
  );

export const loadNotificationCounts = async (): Promise<
  AuthenticatedActionResult<NotificationCountsResponse>
> =>
  authenticatedAction((api) =>
    api.notifications.getNotificationCounts({ types: NIZAM_TYPES.join(",") })
  );
