import {
  createServerTedrisatAPIs,
  type NotificationCountsResponse,
  type PaginatedNotificationResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";
import { memberApi } from "~/lib/tedrisat-api";

/**
 * Server-side reads for the notifications page and the header bell. Not a
 * `"use server"` module on purpose: only server components call these, and a
 * browser must not be able to post to them.
 */

export interface NotificationsOverview {
  first: PaginatedNotificationResponse;
  counts: NotificationCountsResponse;
}

/** The first page and both tab counts; null when either read fails, so the page can offer a retry. */
export const getNotificationsOverview =
  async (): Promise<NotificationsOverview | null> => {
    // Outside the `try`: no session is a trip to sign in, not a failed read (A16).
    const { notifications } = await memberApi();
    try {
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

/**
 * The bell's unread count; 0 when it cannot be read — a bell that says nothing
 * beats a broken header. The header draws on every page, a visitor's too, so
 * no session is 0 as well, without a request: never a redirect from here.
 */
export const getUnreadNotificationCount = async (): Promise<number> => {
  const token = await getAccessToken();
  if (!token) return 0;
  try {
    const { notifications } = await createServerTedrisatAPIs(
      token,
      env.TEDRISAT_API_BASE_URL
    );
    return (await notifications.getNotificationCounts()).unread;
  } catch {
    return 0;
  }
};
