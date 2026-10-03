import {
  createServerTedrisatAPIs,
  type NotificationCountsResponse,
  type PaginatedNotificationResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

/**
 * Server-side reads for the notifications page and the header bell. Not a
 * `"use server"` module on purpose: only server components call these, and a
 * browser must not be able to post to them.
 */

const api = async () =>
  createServerTedrisatAPIs(await getAccessToken(), env.TEDRISAT_API_BASE_URL);

export interface NotificationsOverview {
  first: PaginatedNotificationResponse;
  counts: NotificationCountsResponse;
}

/** The first page and both tab counts; null when either read fails, so the page can offer a retry. */
export const getNotificationsOverview =
  async (): Promise<NotificationsOverview | null> => {
    try {
      const { notifications } = await api();
      const [first, counts] = await Promise.all([
        notifications.listNotifications({ status: "all" }),
        notifications.getNotificationCounts(),
      ]);
      return { first, counts };
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return null;
    }
  };

/** The bell's unread count; 0 when it cannot be read — a bell that says nothing beats a broken header. */
export const getUnreadNotificationCount = async (): Promise<number> => {
  try {
    const { notifications } = await api();
    return (await notifications.getNotificationCounts()).unread;
  } catch {
    return 0;
  }
};
