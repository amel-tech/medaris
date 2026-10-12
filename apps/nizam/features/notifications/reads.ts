import type {
  NotificationCountsResponse,
  PaginatedNotificationResponse,
} from "@medaris/services/tedrisat";
import { passOnSignIn, tedrisatApi } from "~/lib/tedrisat-api";
import { NIZAM_TYPES } from "./notification-view";

/**
 * Server-side reads for the Bildirimler page and the shell's bell and badge
 * (MDRS-179). Not a `"use server"` module: only server components call
 * these, and a browser must not be able to post to them.
 */
export interface NotificationsOverview {
  first: PaginatedNotificationResponse;
  counts: NotificationCountsResponse;
}

/** The first page and both tab counts; null when either read fails, so the page can offer a retry. */
export const getNotificationsOverview =
  async (): Promise<NotificationsOverview | null> => {
    try {
      const { notifications } = await tedrisatApi();
      const [first, counts] = await Promise.all([
        notifications.listNotifications({
          status: "all",
          types: NIZAM_TYPES.join(","),
        }),
        notifications.getNotificationCounts({ types: NIZAM_TYPES.join(",") }),
      ]);
      return { first, counts };
    } catch (error) {
      await passOnSignIn(error);
      console.error("Error fetching notifications:", error);
      return null;
    }
  };

/** The unread count the bell says and the menu badge shows; 0 when it cannot be read — a bell that says nothing beats a broken shell. */
export const getUnreadNotificationCount = async (): Promise<number> => {
  try {
    const { notifications } = await tedrisatApi();
    return (
      await notifications.getNotificationCounts({
        types: NIZAM_TYPES.join(","),
      })
    ).unread;
  } catch (error) {
    // The shell's read: a refused token is a broken bell too, not a redirect
    // (the shell also wraps the sign-in page).
    await passOnSignIn(error, "fail");
    return 0;
  }
};
