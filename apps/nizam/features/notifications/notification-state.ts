import type {
  NotificationCountsResponse,
  NotificationResponse,
} from "@medaris/services/tedrisat";

/**
 * The page's list state as pure transitions, so the optimistic updates and
 * their rollbacks can be tested without a browser (nizam 37, 46, MDRS-179).
 * One list is held, the one the chosen tab and type chip describe, plus the
 * two tab counts; every transition keeps them consistent. The counts are the
 * caller's totals and do not follow the chip: the tabs read "Tümü 9 /
 * Okunmamış 3" whatever kind is shown.
 */

export type TabKey = "all" | "unread";

export interface NotificationsState {
  items: NotificationResponse[];
  nextCursor: string | null;
  counts: NotificationCountsResponse;
}

export const initialState = (
  items: NotificationResponse[],
  nextCursor: string | null,
  counts: NotificationCountsResponse
): NotificationsState => ({ items, nextCursor, counts });

/** A new list for another tab or chip; the counts stay. */
export const replaceList = (
  state: NotificationsState,
  items: NotificationResponse[],
  nextCursor: string | null
): NotificationsState => ({ ...state, items, nextCursor });

/** Appends a page, leaving out rows the list already holds (a row can move between pages while the list is open). */
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

/**
 * Marks one row read and lowers the unread count — once, however often it is
 * called. On the "Okunmamış" tab the row leaves the list.
 */
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
    counts: { ...state.counts, unread: Math.max(state.counts.unread - 1, 0) },
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
  counts: { ...state.counts, unread: 0 },
});

/**
 * Undoes an optimistic read the API refused. On the list the read was made on
 * the state goes back to `before`. If another tab or chip was chosen since,
 * the list on screen is the server's own and stays; only the counts, which a
 * swap keeps, go back to what they were before the read lowered them.
 */
export const rollBack = (
  current: NotificationsState,
  before: NotificationsState,
  sameList: boolean
): NotificationsState =>
  sameList ? before : { ...current, counts: before.counts };
