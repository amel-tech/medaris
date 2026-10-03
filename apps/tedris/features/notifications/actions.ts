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

export type NotificationFilter = "all" | "unread";

/** One page of the caller's notifications (MDRS-167); the first page is read on the server by the page itself. */
export const loadNotifications = async (
  status: NotificationFilter,
  cursor?: string
): Promise<AuthenticatedActionResult<PaginatedNotificationResponse>> =>
  authenticatedAction((api) =>
    api.notifications.listNotifications({ status, cursor })
  );

export const markNotificationRead = async (
  id: string
): Promise<AuthenticatedActionResult<NotificationResponse>> =>
  authenticatedAction((api) => api.notifications.markNotificationRead({ id }));

export const markAllNotificationsRead = async (): Promise<
  AuthenticatedActionResult<ReadAllNotificationsResponse>
> => authenticatedAction((api) => api.notifications.markAllNotificationsRead());

export const loadNotificationCounts = async (): Promise<
  AuthenticatedActionResult<NotificationCountsResponse>
> => authenticatedAction((api) => api.notifications.getNotificationCounts());
