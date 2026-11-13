import type { NotificationResponse } from "@medaris/services/tedrisat";
import { isUuid } from "~/features/courses/courses";

/**
 * What the Bildirimler page decides without a browser: the title a stored
 * notification reads as, where it leads, and the list's transitions. The API
 * stores a type and flat params, never a sentence, so the words come from
 * `nazar.Notifications.types`. The page lists every type, as the bell and the
 * menu badge count every type.
 */

export type TabKey = "all" | "unread";

/** The types this build words; any other (a newer server) reads as "Bildirim". */
export const WORDED_TYPES = [
  "ENROLLMENT_APPROVED",
  "ENROLLMENT_REJECTED",
  "REMOVED_FROM_COURSE",
  "COURSE_ACCESS_REMOVED",
  "SESSION_RESCHEDULED",
  "SESSION_CANCELLED",
  "SESSION_ADDED",
  "RECORDING_ADDED",
  "KOSK_APPLICATION_RESULT",
  "DECK_PUBLISH_RESULT",
  "SUBMISSION_REVIEWED",
  "COURSE_BAN_PLACED",
  "KOSK_BAN_PLACED",
] as const;

const WORDED: ReadonlySet<string> = new Set(WORDED_TYPES);

/** The message key of a row's title, under `nazar.Notifications`. */
export const titleKey = (type: string): string =>
  WORDED.has(type) ? `types.${type}` : "unknownTitle";

/** The values a title takes; a missing `outcome` reads as the cautious "other" branch. */
export const titleValues = (
  n: NotificationResponse
): Record<string, string> => {
  const outcome = n.params.outcome;
  return {
    outcome: typeof outcome === "string" && outcome !== "" ? outcome : "other",
  };
};

const uuidParam = (n: NotificationResponse, key: string): string | null => {
  const value = n.params[key];
  return typeof value === "string" && isUuid(value) ? value : null;
};

/**
 * Where the notification leads, as an address; null when it leads nowhere.
 * Every target the API names (a course, a celse, a deck, a köşk) is a page of
 * Tedris, so the address is on `tedrisUrl`; without it nothing leads anywhere.
 * A ban told to a köşk nazımı is Nizam's and leads nowhere from here. Built
 * only from UUIDs, never from free text.
 */
export const notificationHref = (
  n: NotificationResponse,
  tedrisUrl: string | null
): string | null => {
  if (!tedrisUrl || !n.targetId || !isUuid(n.targetId)) return null;
  if (n.type === "COURSE_BAN_PLACED" || n.type === "KOSK_BAN_PLACED") {
    return null;
  }
  const path = (() => {
    switch (n.targetType) {
      case "COURSE":
        return `/courses/${n.targetId}`;
      case "SESSION": {
        const courseId = uuidParam(n, "courseId");
        return courseId ? `/courses/${courseId}/lessons/${n.targetId}` : null;
      }
      case "DECK":
        return `/decks/${n.targetId}`;
      case "KOSK":
        return `/kosks/${n.targetId}`;
      default:
        return null;
    }
  })();
  return path ? new URL(path, tedrisUrl).toString() : null;
};

/** "3 Eki 2026 21:00", in the viewer's zone. */
export const rowTime = (at: Date, locale: string, timeZone: string): string =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(at);

export interface NotificationsState {
  items: NotificationResponse[];
  nextCursor: string | null;
  /** the caller's unread and total, whatever tab is shown */
  unread: number;
  total: number;
}

/** A new list for the other tab; the counts stay. */
export const replaceList = (
  state: NotificationsState,
  items: NotificationResponse[],
  nextCursor: string | null
): NotificationsState => ({ ...state, items, nextCursor });

/** Appends a page, leaving out rows already shown (a row can move between pages while the list is open). */
export const appendPage = (
  state: NotificationsState,
  items: NotificationResponse[],
  nextCursor: string | null
): NotificationsState => {
  const known = new Set(state.items.map((n) => n.id));
  return {
    ...state,
    items: [...state.items, ...items.filter((n) => !known.has(n.id))],
    nextCursor,
  };
};

/** Marks one row read and lowers the unread count, once; on "Okunmamış" the row leaves the list. */
export const markRead = (
  state: NotificationsState,
  tab: TabKey,
  id: string,
  at: Date
): NotificationsState => {
  const row = state.items.find((n) => n.id === id);
  if (!row || row.readAt !== null) return state;
  return {
    ...state,
    items:
      tab === "unread"
        ? state.items.filter((n) => n.id !== id)
        : state.items.map((n) => (n.id === id ? { ...n, readAt: at } : n)),
    unread: Math.max(state.unread - 1, 0),
  };
};

export const markAllRead = (
  state: NotificationsState,
  tab: TabKey,
  at: Date
): NotificationsState => ({
  ...state,
  items:
    tab === "unread"
      ? []
      : state.items.map((n) => (n.readAt === null ? { ...n, readAt: at } : n)),
  nextCursor: tab === "unread" ? null : state.nextCursor,
  unread: 0,
});
