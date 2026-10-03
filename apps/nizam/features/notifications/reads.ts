import {
  createServerTedrisatAPIs,
  type NotificationCountsResponse,
  type PaginatedNotificationResponse,
} from "@medaris/services/tedrisat";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";
import { NIZAM_TYPES } from "./notification-view";

/**
 * Server-side reads for the Bildirimler page and the shell's bell and badge
 * (MDRS-179). Not a `"use server"` module: only server components call
 * these, and a browser must not be able to post to them.
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
        notifications.listNotifications({
          status: "all",
          types: NIZAM_TYPES.join(","),
        }),
        notifications.getNotificationCounts({ types: NIZAM_TYPES.join(",") }),
      ]);
      return { first, counts };
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return null;
    }
  };

/** The unread count the bell says and the menu badge shows; 0 when it cannot be read — a bell that says nothing beats a broken shell. */
export const getUnreadNotificationCount = async (): Promise<number> => {
  try {
    const { notifications } = await api();
    return (
      await notifications.getNotificationCounts({
        types: NIZAM_TYPES.join(","),
      })
    ).unread;
  } catch {
    return 0;
  }
};
