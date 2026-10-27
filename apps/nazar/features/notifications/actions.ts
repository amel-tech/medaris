"use server";

import type {
  NotificationResponse,
  PaginatedNotificationResponse,
  ReadAllNotificationsResponse,
} from "@medaris/services/tedrisat";
import {
  type ActionOutcome,
  authenticatedAction,
  outcomeOf,
} from "~/lib/authenticated-action";
import type { TabKey } from "./notifications";

/**
 * A page of the caller's notifications (`GET /notifications`): the first one
 * of a tab, or the one after `cursor`. Every type, as the bell counts them.
 */
export async function loadNotifications(
  status: TabKey,
  cursor?: string
): Promise<ActionOutcome<PaginatedNotificationResponse>> {
  const result = await authenticatedAction((api) =>
    api.notifications.listNotifications({ status, cursor })
  );
  if (!result.success)
    console.error("Error reading notifications:", result.error);
  return outcomeOf(result);
}

/** Marks one of the caller's notifications read. */
export async function markNotificationRead(
  id: string
): Promise<ActionOutcome<NotificationResponse>> {
  const result = await authenticatedAction((api) =>
    api.notifications.markNotificationRead({ id })
  );
  if (!result.success)
    console.error("Error marking a notification read:", result.error);
  return outcomeOf(result);
}

/** "Tümünü okundu say": every unread notification of the caller. */
export async function markAllNotificationsRead(): Promise<
  ActionOutcome<ReadAllNotificationsResponse>
> {
  const result = await authenticatedAction((api) =>
    api.notifications.markAllNotificationsRead({})
  );
  if (!result.success)
    console.error("Error marking all notifications read:", result.error);
  return outcomeOf(result);
}
